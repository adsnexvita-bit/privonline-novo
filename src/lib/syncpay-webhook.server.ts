import type { SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import type { Database } from "@/integrations/supabase/types";
import { processPaymentConfirmation } from "./payment-processing.server";

const SYNCPAY_EVENTS = new Map<string, "created" | "updated">([
  ["cashin.create", "created"],
  ["cashin.created", "created"],
  ["cashin.update", "updated"],
  ["cashin.updated", "updated"],
] as const);
const SYNCPAY_STATUSES = new Set([
  "pending",
  "created",
  "processing",
  "waiting_for_approval",
  "completed",
  "paid",
  "approved",
  "succeeded",
  "paid_out",
  "failed",
  "declined",
  "rejected",
  "expired",
  "cancelled",
  "canceled",
  "refunded",
  "chargeback",
]);

type SyncPayWebhookData = {
  id: string;
  amount: number | string;
  status: string;
  payment_method: string;
  created_at?: string;
  updated_at?: string;
};

export type ParsedSyncPayWebhook = {
  eventType: "cashin.create" | "cashin.created" | "cashin.update" | "cashin.updated";
  normalizedEventType: "created" | "updated";
  externalEventId: string | null;
  transactionId: string | null;
  gatewayStatus: string;
  payload: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * SyncPay's legacy webhook wraps the cash-in in `data`; the current public
 * contract sends the same fields at the root. This normalizes only those two
 * documented shapes and leaves the original payload untouched for storage.
 */
export function normalizeSyncPayCashInPayload(
  payload: Record<string, unknown>,
): SyncPayWebhookData {
  if (Object.hasOwn(payload, "data")) {
    if (!isRecord(payload.data)) throw new Response("Invalid payload", { status: 422 });
    return payload.data as SyncPayWebhookData;
  }
  return payload as SyncPayWebhookData;
}

export function validateSyncPayWebhookAuthorization(headers: Headers, configuredToken?: string) {
  const authorization = headers.get("authorization")?.trim() ?? "";
  const configured =
    configuredToken?.trim() || process.env.SYNC_PAY_WEBHOOK_BEARER_TOKEN?.trim() || "";
  if (!configured) {
    console.error("payment:webhook_auth_rejected", { provider: "syncpay", reason: "unconfigured" });
    throw new Response("Webhook authentication unavailable", { status: 503 });
  }
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    console.warn("payment:webhook_auth_rejected", { provider: "syncpay", reason: "missing" });
    throw new Response("Unauthorized", { status: 401 });
  }
  const supplied = authorization.replace(/^Bearer\s+/i, "");
  const configuredBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  if (
    configuredBuffer.length !== suppliedBuffer.length ||
    !timingSafeEqual(configuredBuffer, suppliedBuffer)
  ) {
    console.warn("payment:webhook_auth_rejected", { provider: "syncpay", reason: "mismatch" });
    throw new Response("Unauthorized", { status: 401 });
  }
}

export function parseSyncPayWebhook(
  headers: Headers,
  payload: Record<string, unknown>,
): ParsedSyncPayWebhook {
  const eventType = headers.get("event")?.trim().toLowerCase() ?? "";
  const normalizedEventType = SYNCPAY_EVENTS.get(eventType);
  if (!normalizedEventType) {
    throw new Response("Unsupported event", { status: 422 });
  }
  const value = normalizeSyncPayCashInPayload(payload);
  const transactionId = typeof value.id === "string" && value.id.trim() ? value.id.trim() : null;
  const gatewayStatus = typeof value.status === "string" ? value.status.trim().toLowerCase() : "";
  const paymentMethod =
    typeof value.payment_method === "string" ? value.payment_method.trim().toUpperCase() : "";
  if (!Number.isFinite(Number(value.amount)) || paymentMethod !== "PIX") {
    throw new Response("Invalid cash-in payload", { status: 422 });
  }
  if (!SYNCPAY_STATUSES.has(gatewayStatus)) {
    throw new Response("Unsupported status", { status: 422 });
  }
  const version = value.updated_at || value.created_at || "unversioned";
  return {
    eventType: eventType as ParsedSyncPayWebhook["eventType"],
    normalizedEventType,
    externalEventId: transactionId
      ? `${transactionId}:${eventType}:${version}:${gatewayStatus}`
      : null,
    transactionId,
    gatewayStatus,
    payload,
  };
}

async function markEvent(
  db: SupabaseClient<Database>,
  eventId: string,
  patch: Database["public"]["Tables"]["webhook_events"]["Update"],
) {
  const { error } = await db.from("webhook_events").update(patch).eq("id", eventId);
  if (error) throw error;
}

export async function processStoredSyncPayWebhook(
  db: SupabaseClient<Database>,
  event: Database["public"]["Tables"]["webhook_events"]["Row"],
) {
  const eventId = String(event.id);
  const transactionId = event.transaction_identifier?.trim();
  const attempts = Number(event.attempts ?? 0) + 1;
  if (!transactionId) {
    await markEvent(db, eventId, {
      processing_status: "ignored",
      processed_at: new Date().toISOString(),
      error_message: "Evento sem identificador de transação.",
      attempts,
    });
    return { ok: true, ignored: true, note: "sem transação" };
  }

  try {
    const result = await processPaymentConfirmation(db, {
      provider: "syncpay",
      transactionId,
      confirmationSource: "webhook",
    });
    await markEvent(db, eventId, {
      processing_status: "processed",
      processed_at: new Date().toISOString(),
      error_message: null,
      attempts,
      gateway_status: result.gatewayStatus,
    });
    return { ok: true, result };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Erro desconhecido";
    const notFound = message.includes("Pedido não encontrado");
    if (notFound) {
      const { data: gift } = await db
        .from("creator_gifts")
        .select("id")
        .eq("transaction_identifier", transactionId)
        .maybeSingle();
      if (gift?.id) {
        const { processCreatorGiftPayment } = await import("./creator-posts.functions");
        const giftResult = await processCreatorGiftPayment(String(gift.id), transactionId);
        await markEvent(db, eventId, {
          processing_status: giftResult.ok ? "processed" : "failed",
          processed_at: new Date().toISOString(),
          error_message: giftResult.ok ? null : `Presente não confirmado: ${giftResult.status}`,
          attempts,
        });
        return giftResult.ok
          ? { ok: true, gift: true, result: giftResult }
          : { ok: false, note: `Presente não confirmado: ${giftResult.status}` };
      }
    }
    await markEvent(db, eventId, {
      // A valid webhook can beat the checkout update that links the provider
      // transaction to its order. Keep it durable and retryable; never infer
      // an order from customer data or amount.
      processing_status: notFound ? "pending" : "failed",
      processed_at: notFound ? null : new Date().toISOString(),
      error_message: message,
      attempts,
    });
    if (notFound) {
      console.warn("payment:webhook_retry_scheduled", {
        provider: "syncpay",
        transaction: transactionId.slice(0, 8),
        attempts,
      });
      return { ok: true, retryable: true, note: message };
    }
    return { ok: false, note: message };
  }
}

export async function receiveSyncPayWebhook(request: Request) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const { getSyncPayCredentials } = await import("./payment-credentials.server");
  const { webhookBearerToken } = await getSyncPayCredentials();
  validateSyncPayWebhookAuthorization(request.headers, webhookBearerToken);

  const bodyText = await request.text();
  if (!bodyText || bodyText.length > 256_000) {
    return new Response("Invalid body", { status: 413 });
  }
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(bodyText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    payload = parsed as Record<string, unknown>;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = parseSyncPayWebhook(request.headers, payload);
  console.info("payment:webhook_received", {
    provider: "syncpay",
    eventTypeOriginal: parsed.eventType,
    eventTypeNormalized: parsed.normalizedEventType,
    transactionPresent: Boolean(parsed.transactionId),
    bytes: bodyText.length,
  });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let existing: Database["public"]["Tables"]["webhook_events"]["Row"] | null = null;
  if (parsed.externalEventId) {
    const { data, error } = await supabaseAdmin
      .from("webhook_events")
      .select("*")
      .eq("provider", "syncpay")
      .eq("external_event_id", parsed.externalEventId)
      .maybeSingle();
    if (error) return new Response("Storage unavailable", { status: 503 });
    existing = data;
  }
  if (existing?.processing_status === "processed" || existing?.processing_status === "ignored") {
    return Response.json({ ok: true, duplicated: true, id: existing.id });
  }

  let event = existing;
  if (!event) {
    const { data, error } = await supabaseAdmin
      .from("webhook_events")
      .insert({
        provider: "syncpay",
        external_event_id: parsed.externalEventId,
        event_type: parsed.eventType,
        transaction_identifier: parsed.transactionId,
        payload: parsed.payload as never,
        processing_status: "pending",
        gateway_status: parsed.gatewayStatus,
      })
      .select("*")
      .single();
    if (error || !data) {
      // A concurrent identical delivery may have won the unique insert.
      if (!parsed.externalEventId) return new Response("Storage unavailable", { status: 503 });
      const duplicate = await supabaseAdmin
        .from("webhook_events")
        .select("*")
        .eq("provider", "syncpay")
        .eq("external_event_id", parsed.externalEventId)
        .maybeSingle();
      if (!duplicate.data) return new Response("Storage unavailable", { status: 503 });
      event = duplicate.data;
    } else {
      event = data;
    }
  }

  const result = await processStoredSyncPayWebhook(supabaseAdmin, event);
  return Response.json(
    {
      ok: result.ok,
      id: event.id,
      ignored: "ignored" in result ? result.ignored : false,
      retryable: "retryable" in result ? result.retryable : false,
    },
    { status: result.ok ? 200 : 500 },
  );
}
