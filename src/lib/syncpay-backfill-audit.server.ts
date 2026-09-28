import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { verifyPixCharge } from "./payment-provider.server";

const MAX_AUDIT_BATCH_SIZE = 25;
const MAX_PROVIDER_CONCURRENCY = 6;

export type SyncPayAuditClassification =
  | "pending_real"
  | "completed"
  | "paid_out"
  | "not_found"
  | "api_error"
  | "amount_mismatch"
  | "transaction_mismatch"
  | "other_inconsistency";

export type SyncPayBackfillAuditBatch = {
  cutoffCreatedAt: string;
  startCursorId: string | null;
  nextCursorId: string | null;
  eligiblePending: number;
  audited: number;
  pendingReal: number;
  completed: number;
  paidOut: number;
  notFound: number;
  apiErrors: number;
  unauthorized: number;
  rateLimited: number;
  amountMismatch: number;
  transactionMismatch: number;
  otherInconsistencies: number;
  recoverable: Array<{ orderId: string; transactionId: string; providerStatus: string }>;
};

export function classifySyncPayAuditError(reason: unknown): {
  classification: SyncPayAuditClassification;
  unauthorized: boolean;
  rateLimited: boolean;
} {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (/SyncPay \(404\)/i.test(message)) {
    return { classification: "not_found", unauthorized: false, rateLimited: false };
  }
  if (/valor confirmado.*diferente/i.test(message)) {
    return { classification: "amount_mismatch", unauthorized: false, rateLimited: false };
  }
  if (/identificador.*diverge|transa[cç][aã]o consultada diverge/i.test(message)) {
    return { classification: "transaction_mismatch", unauthorized: false, rateLimited: false };
  }
  const unauthorized = /SyncPay \(401\)/i.test(message);
  const rateLimited = /SyncPay \(429\)/i.test(message);
  if (
    unauthorized ||
    rateLimited ||
    /SyncPay \((?:4\d\d|5\d\d)\)/i.test(message) ||
    /timeout|timed out|AbortError|TimeoutError/i.test(message)
  ) {
    return { classification: "api_error", unauthorized, rateLimited };
  }
  return { classification: "other_inconsistency", unauthorized: false, rateLimited: false };
}

export function classifySyncPayAuditSuccess(result: {
  status: string;
  gatewayStatus: string;
}): SyncPayAuditClassification {
  if (result.status === "pending") return "pending_real";
  if (result.status === "paid" && result.gatewayStatus === "completed") return "completed";
  if (result.status === "paid" && result.gatewayStatus === "PAID_OUT") return "paid_out";
  return "other_inconsistency";
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<void>,
) {
  for (let index = 0; index < values.length; index += concurrency) {
    await Promise.all(values.slice(index, index + concurrency).map(task));
  }
}

export async function auditPendingSyncPayBatch(
  supabaseAdmin: SupabaseClient<Database>,
  options: {
    cutoffCreatedAt: string;
    cursorId?: string | null;
    limit?: number;
    concurrency?: number;
  },
): Promise<SyncPayBackfillAuditBatch> {
  const cutoffCreatedAt = new Date(options.cutoffCreatedAt).toISOString();
  const startCursorId = options.cursorId?.trim() || null;
  const limit = Math.min(MAX_AUDIT_BATCH_SIZE, Math.max(1, Math.trunc(options.limit ?? 25)));
  const concurrency = Math.min(
    MAX_PROVIDER_CONCURRENCY,
    Math.max(1, Math.trunc(options.concurrency ?? MAX_PROVIDER_CONCURRENCY)),
  );
  const { count, error: countError } = await supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("payment_provider", "syncpay")
    .eq("payment_status", "pending")
    .not("transaction_identifier", "is", null)
    .lte("created_at", cutoffCreatedAt);
  if (countError) throw countError;

  let query = supabaseAdmin
    .from("orders")
    .select("id,transaction_identifier,total_amount")
    .eq("payment_provider", "syncpay")
    .eq("payment_status", "pending")
    .not("transaction_identifier", "is", null)
    .lte("created_at", cutoffCreatedAt)
    .order("id", { ascending: true })
    .limit(limit + 1);
  if (startCursorId) query = query.gt("id", startCursorId);
  const { data, error } = await query;
  if (error) throw error;
  const page = (data ?? []).slice(0, limit);
  const result: SyncPayBackfillAuditBatch = {
    cutoffCreatedAt,
    startCursorId,
    nextCursorId:
      (data ?? []).length > limit ? String(page[page.length - 1]?.id ?? "") || null : null,
    eligiblePending: count ?? 0,
    audited: 0,
    pendingReal: 0,
    completed: 0,
    paidOut: 0,
    notFound: 0,
    apiErrors: 0,
    unauthorized: 0,
    rateLimited: 0,
    amountMismatch: 0,
    transactionMismatch: 0,
    otherInconsistencies: 0,
    recoverable: [],
  };

  await runWithConcurrency(page, concurrency, async (order) => {
    const orderId = String(order.id);
    const transactionId = String(order.transaction_identifier);
    result.audited += 1;
    try {
      const processed = await verifyPixCharge("syncpay", transactionId, Number(order.total_amount));
      const classification = classifySyncPayAuditSuccess(processed);
      if (classification === "pending_real") result.pendingReal += 1;
      else if (classification === "completed") result.completed += 1;
      else if (classification === "paid_out") result.paidOut += 1;
      else result.otherInconsistencies += 1;
      if (classification === "completed" || classification === "paid_out") {
        result.recoverable.push({
          orderId,
          transactionId,
          providerStatus: processed.gatewayStatus,
        });
      }
      console.info("payment:historical_audit", {
        orderId,
        transactionId,
        providerStatus: processed.gatewayStatus,
        classification,
      });
    } catch (reason) {
      const classified = classifySyncPayAuditError(reason);
      if (classified.classification === "not_found") result.notFound += 1;
      else if (classified.classification === "api_error") result.apiErrors += 1;
      else if (classified.classification === "amount_mismatch") result.amountMismatch += 1;
      else if (classified.classification === "transaction_mismatch") {
        result.transactionMismatch += 1;
      } else result.otherInconsistencies += 1;
      if (classified.unauthorized) result.unauthorized += 1;
      if (classified.rateLimited) result.rateLimited += 1;
      console.warn("payment:historical_audit_failed", {
        orderId,
        transactionId,
        classification: classified.classification,
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  });

  result.recoverable.sort((left, right) => left.orderId.localeCompare(right.orderId));
  return result;
}
