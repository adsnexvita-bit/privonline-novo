import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { verifyPixCharge, type PaymentProvider } from "./payment-provider.server";
import { getMetaCapiConfigurationStatus, sendMetaPurchaseForOrder } from "./meta-capi.server";

type CandidateStatus = "sent" | "missing" | "failed" | "ambiguous" | "provider_not_paid" | "error";

export type MetaReconciliationRow = {
  orderId: string;
  transactionId: string;
  value: number;
  paidAt: string | null;
  models: string[];
  eventId: string;
  status: CandidateStatus;
  reason: string;
  recovered: boolean;
  attempts: number;
  lastAttemptAt: string | null;
  history: Array<{ attempt: number; at: string; status: string; httpStatus: number | null; eventsReceived: number | null; requestId: string | null; error: string | null }>;
};

export async function reconcileMetaPurchases(
  db: SupabaseClient<Database>,
  options: { dryRun?: boolean; hours?: number; limit?: number; from?: string; to?: string; orderIds?: string[] } = {},
) {
  const dryRun = options.dryRun ?? true;
  const hours = Math.min(168, Math.max(1, options.hours ?? 36));
  const limit = Math.min(250, Math.max(1, options.limit ?? 100));
  const since = options.from ?? new Date(Date.now() - hours * 3_600_000).toISOString();
  const until = options.to ?? new Date().toISOString();
  const configuration = await getMetaCapiConfigurationStatus(undefined, db);
  if (!configuration.configured) throw new Error("Meta CAPI não configurada neste ambiente.");
  if (!dryRun && configuration.testMode) {
    throw new Error("Recuperação bloqueada: a integração Meta está em modo de teste.");
  }

  console.info("meta-reconciliation:start", { dryRun, since, limit, pixelHint: configuration.pixelHint });
  let ordersQuery = db
    .from("orders")
    .select("id,transaction_identifier,total_amount,paid_at,payment_provider,order_items(models(name))")
    .eq("payment_status", "paid")
    .not("transaction_identifier", "is", null)
    .gte("paid_at", since)
    .lte("paid_at", until)
    .order("paid_at", { ascending: true })
    .limit(limit);
  if (options.orderIds?.length) ordersQuery = ordersQuery.in("id", options.orderIds);
  const { data: orders, error } = await ordersQuery;
  if (error) throw error;

  const orderIds = (orders ?? []).map((order) => String(order.id));
  const { data: events, error: eventsError } = orderIds.length
    ? await db.from("meta_conversion_events").select("order_id,event_id,delivery_status,error_message,attempts,last_attempt_at").in("order_id", orderIds)
    : { data: [], error: null };
  if (eventsError) throw eventsError;
  const eventByOrder = new Map((events ?? []).map((event) => [String(event.order_id), event]));
  const { data: attempts, error: attemptsError } = orderIds.length
    ? await db.from("meta_conversion_attempts").select("order_id,attempt_number,attempted_at,delivery_status,http_status,events_received,response_request_id,error_message").in("order_id", orderIds).order("attempt_number", { ascending: false })
    : { data: [], error: null };
  if (attemptsError) throw attemptsError;
  const attemptsByOrder = new Map<string, typeof attempts>();
  for (const attempt of attempts ?? []) {
    const key = String(attempt.order_id);
    attemptsByOrder.set(key, [...(attemptsByOrder.get(key) ?? []), attempt]);
  }

  const rows: MetaReconciliationRow[] = [];
  for (const order of orders ?? []) {
    const orderId = String(order.id);
    const transactionId = String(order.transaction_identifier);
    const event = eventByOrder.get(orderId);
    const base = {
      orderId,
      transactionId,
      value: Number(order.total_amount),
      paidAt: order.paid_at,
      models: (order.order_items ?? []).map((item) => item.models?.name).filter((name): name is string => Boolean(name)),
      eventId: event?.event_id ?? `feverby-purchase-${orderId}`,
      attempts: event?.attempts ?? 0,
      lastAttemptAt: event?.last_attempt_at ?? null,
      history: (attemptsByOrder.get(orderId) ?? []).map((attempt) => ({ attempt: attempt.attempt_number, at: attempt.attempted_at, status: attempt.delivery_status, httpStatus: attempt.http_status, eventsReceived: attempt.events_received, requestId: attempt.response_request_id, error: attempt.error_message })),
    };

    if (event?.delivery_status === "sent") {
      console.info("meta-reconciliation:event_found", { orderId, eventId: event.event_id });
      rows.push({ ...base, status: "sent", reason: "Resposta Meta confirmada e registrada.", recovered: false });
      continue;
    }
    if (event?.delivery_status === "pending") {
      rows.push({ ...base, status: "ambiguous", reason: "Tentativa pendente; requer expiração do claim antes de retentar.", recovered: false });
      continue;
    }

    console.info("meta-reconciliation:approved_purchase", { orderId, transaction: transactionId.slice(0, 8) });
    try {
      const provider = (order.payment_provider === "pushinpay" || order.payment_provider === "onpay" ? order.payment_provider : "syncpay") as PaymentProvider;
      const verified = await verifyPixCharge(provider, transactionId, Number(order.total_amount));
      if (verified.status !== "paid") {
        rows.push({ ...base, status: "provider_not_paid", reason: `Operadora retornou ${verified.status}.`, recovered: false });
        continue;
      }
      const missingStatus = event?.delivery_status === "failed" ? "failed" : "missing";
      console.info("meta-reconciliation:event_missing", { orderId, eventId: base.eventId, status: missingStatus });
      if (dryRun) {
        rows.push({ ...base, status: missingStatus, reason: event?.error_message ?? "Sem registro de entrega Meta.", recovered: false });
        continue;
      }
      console.info("meta-reconciliation:sending", { orderId, eventId: base.eventId });
      const result = await sendMetaPurchaseForOrder(db, orderId);
      if (result.sent) {
        console.info("meta-reconciliation:success", { orderId, eventId: result.eventId });
        rows.push({ ...base, status: missingStatus, reason: "Evento recuperado e confirmado pela Meta.", recovered: true });
      } else {
        console.error("meta-reconciliation:error", { orderId, reason: result.reason });
        rows.push({ ...base, status: "error", reason: result.reason, recovered: false });
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error("meta-reconciliation:error", { orderId, reason: message });
      rows.push({ ...base, status: "error", reason: message, recovered: false });
    }
  }

  return {
    dryRun,
    period: { from: since, to: until },
    approvedPurchases: rows.length,
    sent: rows.filter((row) => row.status === "sent").length,
    missing: rows.filter((row) => row.status === "missing").length,
    failed: rows.filter((row) => row.status === "failed").length,
    ambiguous: rows.filter((row) => row.status === "ambiguous").length,
    recovered: rows.filter((row) => row.recovered).length,
    errors: rows.filter((row) => row.status === "error").length,
    rows,
  };
}
