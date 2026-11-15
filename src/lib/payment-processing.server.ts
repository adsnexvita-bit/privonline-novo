import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { verifyPixCharge, type PaymentProvider } from "./payment-provider.server";
import { grantOrderAccess } from "./admin-orders.functions";

export type PaymentConfirmationSource =
  "webhook" | "polling" | "api_reconciliation" | "manual_reconciliation";

type OrderPaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded" | "chargeback";

type ProcessPaymentInput = {
  provider: PaymentProvider;
  transactionId: string;
  confirmationSource: PaymentConfirmationSource;
  dryRun?: boolean;
};

export type ProcessPaymentResult = {
  ok: true;
  orderId: string;
  status: OrderPaymentStatus;
  gatewayStatus: string;
  transitionedToPaid: boolean;
  alreadyPaid: boolean;
};

function mayTransition(current: OrderPaymentStatus, next: OrderPaymentStatus) {
  if (current === next) return false;
  if (current === "refunded" || current === "chargeback") return false;
  if (current === "paid") return next === "refunded" || next === "chargeback";
  return true;
}

async function notifyApprovedSale(supabaseAdmin: SupabaseClient<Database>, orderId: string) {
  try {
    const { notifyAdminsAboutApprovedSale } = await import("./admin-push.server");
    await notifyAdminsAboutApprovedSale(supabaseAdmin, orderId);
  } catch (reason) {
    console.error("payment:error", {
      orderId,
      stage: "admin_push",
      message: reason instanceof Error ? reason.message : String(reason),
    });
  }
}

/**
 * The single order-payment finalizer used by webhooks, API reconciliation and
 * verified manual actions. The incoming webhook body is never payment proof:
 * the provider API is queried again and both transaction id and amount must
 * match the order before any state or access changes.
 */
export async function processPaymentConfirmation(
  supabaseAdmin: SupabaseClient<Database>,
  input: ProcessPaymentInput,
): Promise<ProcessPaymentResult> {
  const transactionId = input.transactionId.trim();
  if (!transactionId) throw new Error("Identificador da transação ausente.");

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id,total_amount,payment_status,payment_provider,paid_at,transaction_identifier")
    .eq("transaction_identifier", transactionId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error("Pedido não encontrado para a transação informada.");

  const orderId = String(order.id);
  if (order.transaction_identifier !== transactionId) {
    throw new Error("A transação consultada diverge do pedido.");
  }
  if (order.payment_provider !== "syncpay" && order.payment_provider !== "pushinpay" && order.payment_provider !== "onpay") {
    throw new Error("A operadora do pedido não é suportada.");
  }
  const orderProvider = order.payment_provider;
  if (orderProvider !== input.provider) {
    throw new Error("A operadora da transação diverge do pedido.");
  }

  const currentStatus = order.payment_status as OrderPaymentStatus;
  let effectiveStatus = currentStatus;
  let transitionedToPaid = false;
  const checkedAt = new Date().toISOString();
  let verified: Awaited<ReturnType<typeof verifyPixCharge>>;
  try {
    verified = await verifyPixCharge(orderProvider, transactionId, Number(order.total_amount));
  } catch (reason) {
    if (!input.dryRun && currentStatus !== "paid") {
      await supabaseAdmin
        .from("orders")
        .update({ payment_last_checked_at: checkedAt })
        .eq("id", orderId)
        .eq("transaction_identifier", transactionId)
        .eq("payment_status", currentStatus);
    }
    throw reason;
  }

  if (input.dryRun) {
    return {
      ok: true,
      orderId,
      status: verified.status,
      gatewayStatus: verified.gatewayStatus,
      transitionedToPaid: false,
      alreadyPaid: currentStatus === "paid",
    };
  }

  if (mayTransition(currentStatus, verified.status)) {
    const patch: Database["public"]["Tables"]["orders"]["Update"] = {
      payment_status: verified.status,
      payment_last_checked_at: checkedAt,
    };
    if (verified.status === "paid") {
      patch.paid_at = verified.transactionDate ?? new Date().toISOString();
      patch.payment_confirmed_by = input.confirmationSource;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("orders")
      .update(patch)
      .eq("id", orderId)
      .eq("transaction_identifier", transactionId)
      .eq("payment_status", currentStatus)
      .select("id,payment_status")
      .maybeSingle();
    if (updateError) throw updateError;
    transitionedToPaid = updated?.payment_status === "paid";
    if (updated?.payment_status) {
      effectiveStatus = updated.payment_status as OrderPaymentStatus;
    } else {
      const { data: latest, error: latestError } = await supabaseAdmin
        .from("orders")
        .select("payment_status")
        .eq("id", orderId)
        .eq("transaction_identifier", transactionId)
        .maybeSingle();
      if (latestError) throw latestError;
      if (latest?.payment_status) effectiveStatus = latest.payment_status as OrderPaymentStatus;
    }
  } else if (currentStatus !== "paid") {
    const { error: checkedError } = await supabaseAdmin
      .from("orders")
      .update({ payment_last_checked_at: checkedAt })
      .eq("id", orderId)
      .eq("transaction_identifier", transactionId)
      .eq("payment_status", currentStatus);
    if (checkedError) throw checkedError;
  }

  const paid = effectiveStatus === "paid";
  if (transitionedToPaid) {
    await grantOrderAccess(supabaseAdmin, orderId);
    await notifyApprovedSale(supabaseAdmin, orderId);
  } else if (currentStatus === "paid") {
    // Repair only the critical entitlement after a previous partial failure.
    // Marketing and notifications are separately deduplicated/reconciled.
    await grantOrderAccess(supabaseAdmin, orderId);
  }

  console.info("payment:confirmation", {
    orderId,
    transactionId,
    provider: orderProvider,
    paymentConfirmedBy: input.confirmationSource,
    checkedAt,
    gatewayStatus: verified.gatewayStatus,
    status: verified.status,
    transitionedToPaid,
  });

  return {
    ok: true,
    orderId,
    status: effectiveStatus,
    gatewayStatus: verified.gatewayStatus,
    transitionedToPaid,
    alreadyPaid: paid && !transitionedToPaid,
  };
}
