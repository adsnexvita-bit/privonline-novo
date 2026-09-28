import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { findOrCreateCustomerByPhone } from "./customer-identity.server";

const VALID_STATUSES = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "refunded",
  "chargeback",
] as const;
type OrderStatus = (typeof VALID_STATUSES)[number];

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data } = await supabase
    .from("admin_users")
    .select("id, is_active")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!data || !data.is_active) throw new Error("Acesso restrito a administradores.");
  return data.id as string;
}

async function admin(): Promise<SupabaseClient<Database>> {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin;
}

export async function grantOrderAccess(supabaseAdmin: SupabaseClient<Database>, orderId: string) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select(
      "customer_id, payment_status, paid_at, checkout_phone, checkout_name, message_opt_in, promotion_id, plan_offer_id, plan_id",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order || order.payment_status !== "paid") {
    throw new Error("Pedido pago não encontrado para liberação.");
  }
  let customerId = order.customer_id;
  if (!customerId) {
    if (!order.checkout_phone) throw new Error("Pedido pago sem telefone.");
    console.info("account:find_by_phone", { orderId });
    const customer = await findOrCreateCustomerByPhone(supabaseAdmin, {
      phone: order.checkout_phone,
      name: order.checkout_name ?? undefined,
      messageOptIn: order.message_opt_in,
    });
    customerId = customer.id;
    const { error: linkError } = await supabaseAdmin
      .from("orders")
      .update({ customer_id: customerId })
      .eq("id", orderId)
      .is("customer_id", null);
    if (linkError) throw linkError;
    console.info("account:create_after_payment", { orderId, customerId });
  }
  const { data: items, error: itemsError } = await supabaseAdmin
    .from("order_items")
    .select("model_id")
    .eq("order_id", orderId);
  if (itemsError) throw itemsError;

  let durationDays: number | null = null;
  if (order.promotion_id) {
    const { data } = await supabaseAdmin
      .from("promotions")
      .select("duration_days")
      .eq("id", order.promotion_id)
      .maybeSingle();
    durationDays = data?.duration_days ?? null;
  } else if (order.plan_offer_id) {
    const { data } = await supabaseAdmin
      .from("plan_offers")
      .select("duration_days")
      .eq("id", order.plan_offer_id)
      .maybeSingle();
    durationDays = data?.duration_days ?? null;
  } else if (order.plan_id) {
    const { data } = await supabaseAdmin
      .from("plans")
      .select("duration_days")
      .eq("id", order.plan_id)
      .maybeSingle();
    durationDays = data?.duration_days ?? null;
  }
  const expiresAt =
    durationDays == null ? null : new Date(Date.now() + durationDays * 86_400_000).toISOString();

  for (const item of items ?? []) {
    const { data: existing } = await supabaseAdmin
      .from("customer_access")
      .select("id, order_id, plan_id")
      .eq("customer_id", customerId)
      .eq("model_id", item.model_id)
      .eq("access_status", "active")
      .maybeSingle();
    if (existing) {
      // Idempotent retries must not restart an access period. They also must
      // not let an older paid order overwrite a later renewal.
      if (existing.order_id === orderId) {
        if (existing.plan_id !== order.plan_id) {
          const { error } = await supabaseAdmin
            .from("customer_access")
            .update({ plan_id: order.plan_id })
            .eq("id", existing.id);
          if (error) throw error;
        }
        continue;
      }
      if (existing.order_id) {
        const { data: existingOrder, error: existingOrderError } = await supabaseAdmin
          .from("orders")
          .select("paid_at")
          .eq("id", existing.order_id)
          .maybeSingle();
        if (existingOrderError) throw existingOrderError;
        const currentPaidAt = order.paid_at ? new Date(order.paid_at).getTime() : 0;
        const existingPaidAt = existingOrder?.paid_at
          ? new Date(existingOrder.paid_at).getTime()
          : 0;
        if (existingPaidAt >= currentPaidAt) continue;
      }
      const { error } = await supabaseAdmin
        .from("customer_access")
        .update({
          order_id: orderId,
          plan_id: order.plan_id,
          granted_at: new Date().toISOString(),
          expires_at: expiresAt,
          revoked_at: null,
          revocation_reason: null,
        })
        .eq("id", existing.id);
      if (error) throw error;
      continue;
    }
    const { error } = await supabaseAdmin.from("customer_access").insert({
      customer_id: customerId,
      model_id: item.model_id,
      order_id: orderId,
      plan_id: order.plan_id,
      access_status: "active",
      expires_at: expiresAt,
    });
    if (error) throw error;
    console.info("access:grant", { orderId, customerId, modelId: item.model_id });
  }
}

export const reconcilePendingPaymentsAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { dryRun?: boolean; limit?: number }) => ({
    dryRun: raw?.dryRun !== false,
    limit: Math.min(25, Math.max(1, Math.trunc(Number(raw?.limit ?? 10)))),
  }))
  .handler(async ({ data, context }) => {
    const adminId = await assertAdmin(context.supabase, context.userId);
    const supabaseAdmin = await admin();
    const { reconcileRecentPayments } = await import("./payment-reconciliation.server");
    const result = await reconcileRecentPayments(supabaseAdmin, {
      dryRun: data.dryRun,
      hours: 24 * 365,
      limit: data.limit,
    });
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: adminId,
      action: data.dryRun ? "payment.reconciliation.dry_run" : "payment.reconciliation.run",
      entity_type: "payment_reconciliation",
      details: { dryRun: data.dryRun, limit: data.limit, ...result },
    });
    return result;
  });

export const auditPendingSyncPayBatchAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (raw: {
      cutoffCreatedAt?: string;
      cursorId?: string | null;
      limit?: number;
      concurrency?: number;
    }) => {
      const cutoffCreatedAt = new Date(String(raw?.cutoffCreatedAt ?? ""));
      if (!Number.isFinite(cutoffCreatedAt.getTime())) throw new Error("Cutoff inválido.");
      return {
        cutoffCreatedAt: cutoffCreatedAt.toISOString(),
        cursorId: String(raw?.cursorId ?? "").trim() || null,
        limit: Math.min(25, Math.max(1, Math.trunc(Number(raw?.limit ?? 25)))),
        concurrency: Math.min(6, Math.max(1, Math.trunc(Number(raw?.concurrency ?? 6)))),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const adminId = await assertAdmin(context.supabase, context.userId);
    const supabaseAdmin = await admin();
    const { data: recentBatches, error: recentBatchesError } = await supabaseAdmin
      .from("admin_audit_logs")
      .select("details")
      .eq("action", "payment.historical_audit.batch")
      .order("created_at", { ascending: false })
      .limit(100);
    if (recentBatchesError) throw recentBatchesError;
    const existing = (recentBatches ?? []).find((row) => {
      const details = row.details;
      return (
        details &&
        typeof details === "object" &&
        !Array.isArray(details) &&
        details.cutoffCreatedAt === data.cutoffCreatedAt &&
        (details.startCursorId ?? null) === data.cursorId
      );
    });
    if (
      existing?.details &&
      typeof existing.details === "object" &&
      !Array.isArray(existing.details)
    ) {
      return existing.details;
    }
    const { auditPendingSyncPayBatch } = await import("./syncpay-backfill-audit.server");
    const result = await auditPendingSyncPayBatch(supabaseAdmin, data);
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: adminId,
      action: "payment.historical_audit.batch",
      entity_type: "payment_reconciliation",
      details: {
        ...result,
        recoverable: result.recoverable.map((item) => ({
          orderId: item.orderId,
          transactionId: item.transactionId,
          providerStatus: item.providerStatus,
        })),
      },
    });
    return result;
  });

export const getPendingSyncPayAuditCheckpointAsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const supabaseAdmin = await admin();
    const { data, error } = await supabaseAdmin
      .from("admin_audit_logs")
      .select("created_at,details")
      .eq("action", "payment.historical_audit.batch")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const latest = data?.[0];
    if (!latest || Date.now() - new Date(latest.created_at).getTime() > 60 * 60 * 1_000)
      return null;
    const latestDetails = latest.details;
    if (!latestDetails || typeof latestDetails !== "object" || Array.isArray(latestDetails)) {
      return null;
    }
    const cutoffCreatedAt = String(latestDetails.cutoffCreatedAt ?? "");
    const nextCursorId = latestDetails.nextCursorId;
    if (!cutoffCreatedAt || typeof nextCursorId !== "string" || !nextCursorId) return null;
    const batches = (data ?? [])
      .map((row) => row.details)
      .filter(
        (details) =>
          details &&
          typeof details === "object" &&
          !Array.isArray(details) &&
          details.cutoffCreatedAt === cutoffCreatedAt,
      );
    const sum = (key: string) =>
      batches.reduce((total, details) => total + Number(details[key] ?? 0), 0);
    return {
      cutoffCreatedAt,
      nextCursorId,
      snapshotPending: Math.max(...batches.map((details) => Number(details.eligiblePending ?? 0))),
      totals: {
        audited: sum("audited"),
        pendingReal: sum("pendingReal"),
        completed: sum("completed"),
        paidOut: sum("paidOut"),
        notFound: sum("notFound"),
        apiErrors: sum("apiErrors"),
        unauthorized: sum("unauthorized"),
        rateLimited: sum("rateLimited"),
        amountMismatch: sum("amountMismatch"),
        transactionMismatch: sum("transactionMismatch"),
        otherInconsistencies: sum("otherInconsistencies"),
        recoverable: batches.reduce(
          (total, details) =>
            total + (Array.isArray(details.recoverable) ? details.recoverable.length : 0),
          0,
        ),
      },
    };
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { orderId: string; status: OrderStatus }) => {
    if (!raw?.orderId) throw new Error("orderId obrigatório.");
    if (!VALID_STATUSES.includes(raw?.status)) throw new Error("Status inválido.");
    return { orderId: String(raw.orderId), status: raw.status };
  })
  .handler(async ({ data, context }) => {
    const adminId = await assertAdmin(context.supabase, context.userId);
    const supabaseAdmin = await admin();

    if (data.status === "paid") {
      const { data: order, error: orderError } = await supabaseAdmin
        .from("orders")
        .select("transaction_identifier, total_amount, payment_provider, payment_status")
        .eq("id", data.orderId)
        .maybeSingle();
      if (orderError || !order?.transaction_identifier) {
        throw new Error("Pedido sem transação Pix vinculada.");
      }
      const provider = order.payment_provider === "pushinpay" || order.payment_provider === "onpay" ? order.payment_provider : "syncpay";
      const { processPaymentConfirmation } = await import("./payment-processing.server");
      const result = await processPaymentConfirmation(supabaseAdmin, {
        provider,
        transactionId: String(order.transaction_identifier),
        confirmationSource: "manual_reconciliation",
      });
      if (result.status !== "paid") {
        throw new Error(
          `A operadora ainda não confirmou este pagamento (status: ${result.gatewayStatus}).`,
        );
      }
    } else {
      const { error } = await supabaseAdmin
        .from("orders")
        .update({ payment_status: data.status })
        .eq("id", data.orderId);
      if (error) throw new Error(error.message ?? "Falha ao atualizar pedido.");
    }

    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: adminId,
      action: `order.status.${data.status}`,
      target_type: "order",
      target_id: data.orderId,
      metadata: { status: data.status },
    });

    return { ok: true, status: data.status };
  });

export const reprocessWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { eventId: string }) => {
    if (!raw?.eventId) throw new Error("eventId obrigatório.");
    return { eventId: String(raw.eventId) };
  })
  .handler(async ({ data, context }) => {
    const adminId = await assertAdmin(context.supabase, context.userId);
    const supabaseAdmin = await admin();

    const { data: evt, error } = await supabaseAdmin
      .from("webhook_events")
      .select("*")
      .eq("id", data.eventId)
      .maybeSingle();
    if (error || !evt) throw new Error("Evento não encontrado.");

    const result =
      evt.provider === "syncpay"
        ? await (async () => {
            const { processStoredSyncPayWebhook } = await import("./syncpay-webhook.server");
            return processStoredSyncPayWebhook(supabaseAdmin, evt);
          })()
        : evt.provider === "onpay"
          ? await (async () => {
              const { processStoredOnPayWebhook } = await import("./onpay-webhook.server");
              return processStoredOnPayWebhook(supabaseAdmin, evt);
            })()
        : await processWebhookEvent(evt);

    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: adminId,
      action: "webhook.reprocess",
      target_type: "webhook_event",
      target_id: data.eventId,
      metadata: { result: result.ok ? "processed" : "failed", note: result.note ?? null },
    });

    return result;
  });

// Shared processor — trusts only the authenticated transaction lookup, never
// the status claimed by the incoming webhook body.
export async function processWebhookEvent(
  evt: Record<string, unknown>,
): Promise<{ ok: boolean; note?: string }> {
  const supabaseAdmin = await admin();
  const eventId = String(evt.id);
  const provider = evt.provider === "pushinpay" || evt.provider === "onpay" ? evt.provider : "syncpay";
  const txn = evt.transaction_identifier ? String(evt.transaction_identifier) : null;
  const attempts = Number(evt.attempts ?? 0) + 1;

  try {
    if (!txn) {
      await supabaseAdmin
        .from("webhook_events")
        .update({
          processing_status: "failed",
          error_message: "Sem transaction_identifier.",
          processed_at: new Date().toISOString(),
          attempts,
        })
        .eq("id", eventId);
      return { ok: false, note: "sem transação" };
    }

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, transaction_identifier, total_amount, payment_status, payment_provider")
      .eq("transaction_identifier", txn)
      .maybeSingle();
    if (!order) {
      await supabaseAdmin
        .from("webhook_events")
        .update({
          processing_status: "failed",
          error_message: `Pedido com transação ${txn} não encontrado.`,
          processed_at: new Date().toISOString(),
          attempts,
        })
        .eq("id", eventId);
      return { ok: false, note: "pedido não encontrado" };
    }
    console.info("payment:matched_order", { orderId: order.id, provider });
    if (order.transaction_identifier && order.transaction_identifier !== txn) {
      throw new Error("O identificador do webhook diverge do pedido.");
    }
    const orderProvider = order.payment_provider === "pushinpay" || order.payment_provider === "onpay" ? order.payment_provider : "syncpay";
    if (provider !== orderProvider) throw new Error("A operadora do webhook diverge do pedido.");

    const { processPaymentConfirmation } = await import("./payment-processing.server");
    const processed = await processPaymentConfirmation(supabaseAdmin, {
      provider: orderProvider,
      transactionId: txn,
      confirmationSource: "webhook",
    });

    await supabaseAdmin
      .from("webhook_events")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        error_message: null,
        attempts,
      })
      .eq("id", eventId);

    return {
      ok: true,
      note: `${provider === "pushinpay" ? "Pushin Pay" : provider === "onpay" ? "ONPAY" : "SyncPay"} ${processed.gatewayStatus} → ${processed.status}`,
    };
  } catch (err) {
    await supabaseAdmin
      .from("webhook_events")
      .update({
        processing_status: "failed",
        error_message: err instanceof Error ? err.message : "Erro desconhecido",
        processed_at: new Date().toISOString(),
        attempts,
      })
      .eq("id", eventId);
    return { ok: false, note: err instanceof Error ? err.message : "erro" };
  }
}
