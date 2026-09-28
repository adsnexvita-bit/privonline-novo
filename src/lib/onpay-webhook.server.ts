import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getOnPayCredentials } from "./payment-credentials.server";
import { processPaymentConfirmation } from "./payment-processing.server";

const EVENTS = new Set([
  "payment.created", "payment.pending", "payment.paid", "payment.expired",
  "payment.failed", "payment.refunded", "payment.cancelled",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateOnPayWebhookSignature(rawBody: string, supplied: string | null, secret: string) {
  if (!secret) throw new Response("Webhook authentication unavailable", { status: 503 });
  if (!supplied?.startsWith("sha256=")) throw new Response("Unauthorized", { status: 401 });
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied.trim());
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

export function parseOnPayWebhook(headers: Headers, payload: Record<string, unknown>) {
  const eventType = String(headers.get("x-onpay-event") || payload.event || payload.type || "").trim().toLowerCase();
  if (!EVENTS.has(eventType)) throw new Response("Unsupported event", { status: 422 });
  if (!isRecord(payload.data)) throw new Response("Invalid payload", { status: 422 });
  const transactionId = typeof payload.data.id === "string" ? payload.data.id.trim() : "";
  const method = String(payload.data.method ?? "").toUpperCase();
  const gatewayStatus = String(payload.data.status ?? "").toUpperCase();
  if (!transactionId || method !== "PIX" || !gatewayStatus) throw new Response("Invalid payload", { status: 422 });
  const suppliedId = typeof payload.id === "string" ? payload.id.trim() : "";
  const version = String(payload.occurredAt || payload.createdAt || gatewayStatus);
  return {
    eventType,
    transactionId,
    gatewayStatus,
    externalEventId: suppliedId || `${transactionId}:${eventType}:${version}`,
    payload,
  };
}

async function markEvent(db: SupabaseClient<Database>, id: string, patch: Database["public"]["Tables"]["webhook_events"]["Update"]) {
  const { error } = await db.from("webhook_events").update(patch).eq("id", id);
  if (error) throw error;
}

export async function processStoredOnPayWebhook(db: SupabaseClient<Database>, event: Database["public"]["Tables"]["webhook_events"]["Row"]) {
  const attempts = Number(event.attempts ?? 0) + 1;
  const transactionId = event.transaction_identifier?.trim();
  if (!transactionId) {
    await markEvent(db, event.id, { processing_status: "ignored", processed_at: new Date().toISOString(), attempts, error_message: "Evento sem transação." });
    return { ok: true, ignored: true };
  }
  try {
    const result = await processPaymentConfirmation(db, { provider: "onpay", transactionId, confirmationSource: "webhook" });
    await markEvent(db, event.id, { processing_status: "processed", processed_at: new Date().toISOString(), attempts, error_message: null, gateway_status: result.gatewayStatus });
    return { ok: true, result };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Erro desconhecido";
    const retryable = message.includes("Pedido não encontrado");
    await markEvent(db, event.id, { processing_status: retryable ? "pending" : "failed", processed_at: retryable ? null : new Date().toISOString(), attempts, error_message: message });
    return { ok: retryable, retryable, note: message };
  }
}

export async function receiveOnPayWebhook(request: Request) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawBody = await request.text();
  if (!rawBody || rawBody.length > 256_000) return new Response("Invalid body", { status: 413 });
  const { webhookSecret } = await getOnPayCredentials();
  validateOnPayWebhookSignature(rawBody, request.headers.get("x-onpay-signature"), webhookSecret);
  let payload: Record<string, unknown>;
  try {
    const value = JSON.parse(rawBody);
    if (!isRecord(value)) throw new Error();
    payload = value;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = parseOnPayWebhook(request.headers, payload);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const existing = await supabaseAdmin.from("webhook_events").select("*").eq("provider", "onpay").eq("external_event_id", parsed.externalEventId).maybeSingle();
  if (existing.error) return new Response("Storage unavailable", { status: 503 });
  if (existing.data?.processing_status === "processed" || existing.data?.processing_status === "ignored") {
    return Response.json({ ok: true, duplicated: true, id: existing.data.id });
  }
  let event = existing.data;
  if (!event) {
    const inserted = await supabaseAdmin.from("webhook_events").insert({
      provider: "onpay", external_event_id: parsed.externalEventId, event_type: parsed.eventType,
      transaction_identifier: parsed.transactionId, payload: parsed.payload as never,
      processing_status: "pending", gateway_status: parsed.gatewayStatus,
    }).select("*").single();
    if (inserted.error || !inserted.data) return new Response("Storage unavailable", { status: 503 });
    event = inserted.data;
  }
  const result = await processStoredOnPayWebhook(supabaseAdmin, event);
  return Response.json({ ok: result.ok, id: event.id, retryable: "retryable" in result && result.retryable }, { status: result.ok ? 200 : 500 });
}
