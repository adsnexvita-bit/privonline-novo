import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { grantOrderAccess } from "./admin-orders.functions";
import { processPaymentConfirmation } from "./payment-processing.server";
import { processStoredSyncPayWebhook } from "./syncpay-webhook.server";
import { processStoredOnPayWebhook } from "./onpay-webhook.server";
import type { PaymentProvider } from "./payment-provider.server";

const DEFAULT_LOOKBACK_HOURS = 24 * 30;
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;
const PROVIDER_CONCURRENCY = 6;
const WEBHOOK_RETRY_LIMIT = 5;

export function shouldRetryStoredWebhook(attempts: number) {
  return attempts < WEBHOOK_RETRY_LIMIT;
}

export type ReconciliationResult = {
  totalCandidates: number;
  offset: number;
  startCursorId: string | null;
  nextCursorId: string | null;
  audited: number;
  paidAtProvider: number;
  paidValueAtProvider: number;
  recovered: number;
  recoveredValue: number;
  accessesGranted: number;
  stillPending: number;
  terminal: number;
  errors: number;
  secondaryErrors: number;
  webhookRetries: number;
  webhookRecovered: number;
};

type PendingOrder = {
  id: string;
  transaction_identifier: string | null;
  total_amount: number;
  customer_id: string | null;
  checkout_phone: string | null;
  order_items: Array<{ model_id: string }> | null;
  payment_last_checked_at: string | null;
  payment_provider: PaymentProvider;
};

async function runInBatches<T>(values: T[], size: number, task: (value: T) => Promise<void>) {
  for (let index = 0; index < values.length; index += size) {
    await Promise.all(values.slice(index, index + size).map(task));
  }
}

export async function reconcileRecentPayments(
  supabaseAdmin: SupabaseClient<Database>,
  options: {
    dryRun?: boolean;
    hours?: number;
    limit?: number;
  } = {},
): Promise<ReconciliationResult> {
  const dryRun = options.dryRun ?? true;
  const hours = Math.max(1, Math.floor(options.hours ?? DEFAULT_LOOKBACK_HOURS));
  const limit = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Math.floor(options.limit ?? DEFAULT_BATCH_SIZE)),
  );
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const result: ReconciliationResult = {
    totalCandidates: 0,
    offset: 0,
    startCursorId: null,
    nextCursorId: null,
    audited: 0,
    paidAtProvider: 0,
    paidValueAtProvider: 0,
    recovered: 0,
    recoveredValue: 0,
    accessesGranted: 0,
    stillPending: 0,
    terminal: 0,
    errors: 0,
    secondaryErrors: 0,
    webhookRetries: 0,
    webhookRecovered: 0,
  };

  if (!dryRun) {
    const { data: retryableEvents, error: retryError } = await supabaseAdmin
      .from("webhook_events")
      .select("*")
      .in("provider", ["syncpay", "onpay"])
      .eq("processing_status", "pending")
      .lt("attempts", WEBHOOK_RETRY_LIMIT)
      .order("received_at", { ascending: true })
      .limit(Math.min(limit, DEFAULT_BATCH_SIZE));
    if (retryError) throw retryError;

    await runInBatches(
      (retryableEvents ?? []).filter((event) => shouldRetryStoredWebhook(event.attempts)),
      PROVIDER_CONCURRENCY,
      async (event) => {
        result.webhookRetries += 1;
        try {
          const retried = event.provider === "onpay"
            ? await processStoredOnPayWebhook(supabaseAdmin, event)
            : await processStoredSyncPayWebhook(supabaseAdmin, event);
          if (retried.ok && !("retryable" in retried && retried.retryable)) {
            result.webhookRecovered += 1;
            console.info("payment:webhook_retry_completed", {
              eventId: event.id,
              transaction: event.transaction_identifier?.slice(0, 8),
            });
          }
        } catch (reason) {
          result.secondaryErrors += 1;
          console.error("payment:error", {
            eventId: event.id,
            stage: "webhook_retry",
            message: reason instanceof Error ? reason.message : String(reason),
          });
        }
      },
    );
  }

  const { count: pendingCount, error: countError } = await supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("payment_provider", ["syncpay", "onpay"])
    .eq("payment_status", "pending")
    .not("transaction_identifier", "is", null)
    .gte("created_at", since);
  if (countError) throw countError;

  result.totalCandidates = pendingCount ?? 0;
  const pendingQuery = supabaseAdmin
    .from("orders")
    .select(
      "id,transaction_identifier,total_amount,customer_id,checkout_phone,payment_last_checked_at,payment_provider,order_items(model_id)",
    )
    .in("payment_provider", ["syncpay", "onpay"])
    .eq("payment_status", "pending")
    .not("transaction_identifier", "is", null)
    .gte("created_at", since)
    // Never-checked orders first, then the least recently checked. A stable ID
    // tie-breaker keeps each priority window deterministic without offsetting a
    // mutable pending dataset.
    .order("payment_last_checked_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit);
  const { data: orders, error } = await pendingQuery;
  if (error) throw error;
  const pendingOrders = (orders ?? []) as PendingOrder[];
  result.nextCursorId =
    pendingOrders.length === limit
      ? String(pendingOrders[pendingOrders.length - 1]?.id ?? "") || null
      : null;

  // Re-running access creation is safe and repairs paid orders whose critical
  // status transition succeeded before account/access creation completed.
  if (!dryRun) {
    const { data: paidOrders, error: paidError } = await supabaseAdmin
      .from("orders")
      .select("id")
      .in("payment_provider", ["syncpay", "onpay"])
      .eq("payment_status", "paid")
      .gte("paid_at", since)
      .order("paid_at", { ascending: true })
      .limit(limit);
    if (paidError) throw paidError;

    await runInBatches(paidOrders ?? [], PROVIDER_CONCURRENCY, async (paidOrder) => {
      try {
        await grantOrderAccess(supabaseAdmin, String(paidOrder.id));
      } catch (reason) {
        result.errors += 1;
        console.error("payment:error", {
          orderId: paidOrder.id,
          stage: "access_retry",
          message: reason instanceof Error ? reason.message : String(reason),
        });
      }
    });
  }

  await runInBatches(pendingOrders, PROVIDER_CONCURRENCY, async (order) => {
    result.audited += 1;
    const orderId = String(order.id);
    const transactionId = String(order.transaction_identifier);
    console.info("payment:provider_lookup", { orderId, provider: order.payment_provider, transaction: transactionId.slice(0, 8) });

    try {
      const before = await supabaseAdmin
        .from("customer_access")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId)
        .eq("access_status", "active");
      const processed = await processPaymentConfirmation(supabaseAdmin, {
        provider: order.payment_provider,
        transactionId,
        confirmationSource: "api_reconciliation",
        dryRun,
      });
      if (processed.status === "pending") {
        result.stillPending += 1;
        return;
      }
      if (processed.status !== "paid") {
        result.terminal += 1;
        return;
      }

      const orderValue = Number(order.total_amount);
      result.paidAtProvider += 1;
      result.paidValueAtProvider += orderValue;
      if (dryRun) return;
      console.info("payment:account_resolution", {
        orderId,
        hasCustomer: Boolean(order.customer_id),
        hasPhone: Boolean(order.checkout_phone),
      });
      const after = await supabaseAdmin
        .from("customer_access")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId)
        .eq("access_status", "active");
      result.accessesGranted += Math.max(0, (after.count ?? 0) - (before.count ?? 0));
      if (processed.transitionedToPaid) {
        result.recovered += 1;
        result.recoveredValue += orderValue;
      }
      console.info("payment:access_grant", {
        orderId,
        itemCount: Array.isArray(order.order_items) ? order.order_items.length : 0,
      });
    } catch (reason) {
      result.errors += 1;
      console.error("payment:error", {
        orderId,
        stage: "reconciliation",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  });

  result.paidValueAtProvider = Number(result.paidValueAtProvider.toFixed(2));
  result.recoveredValue = Number(result.recoveredValue.toFixed(2));
  console.info("payment:reconciliation", { dryRun, hours, limit, ...result });
  return result;
}
