import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { GATEWAY_PRODUCT } from "./gateway-product";

const DEFAULT_GRAPH_API_VERSION = "v23.0";
const DEFAULT_EVENT_SOURCE_URL = "https://privadinhos.online/";
const META_REQUEST_TIMEOUT_MS = 8_000;

type MetaPurchaseResult =
  | { sent: true; eventId: string }
  | {
      sent: false;
      reason: "not_configured" | "order_not_found" | "already_claimed" | "request_failed";
    };

type MetaCheckoutEventName = "InitiateCheckout" | "AddPaymentInfo";

type MetaCheckoutEventResult =
  { sent: true; eventId: string } | { sent: false; reason: "not_configured" | "request_failed" };

function configuredSourceUrl() {
  const candidate = process.env.META_EVENT_SOURCE_URL?.trim() || DEFAULT_EVENT_SOURCE_URL;
  try {
    const url = new URL(candidate);
    // Never disclose a creator route, checkout state or private media path.
    return `${url.origin}/`;
  } catch {
    return DEFAULT_EVENT_SOURCE_URL;
  }
}

export async function getMetaCapiConfigurationStatus(
  testSettings?: {
    test_mode: boolean;
    test_event_code: string | null;
  } | null,
  supabaseAdmin?: SupabaseClient<Database>,
) {
  const { getMetaCapiCredentials } = await import("./meta-capi-credentials.server");
  const credentials = await getMetaCapiCredentials(supabaseAdmin);
  const pixelId = credentials.pixelId;
  const token = credentials.accessToken;
  const testMode = testSettings
    ? testSettings.test_mode
    : Boolean(process.env.META_TEST_EVENT_CODE?.trim());
  return {
    configured: Boolean(pixelId && token),
    pixelConfigured: Boolean(pixelId),
    tokenConfigured: Boolean(token),
    pixelId,
    pixelHint: pixelId ? `••••${pixelId.slice(-4)}` : null,
    tokenHint: credentials.tokenHint,
    eventSourceUrl: configuredSourceUrl(),
    graphVersion: process.env.META_GRAPH_API_VERSION?.trim() || DEFAULT_GRAPH_API_VERSION,
    testMode,
    testEventCode: testSettings?.test_event_code?.trim() || "",
  };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sanitizedAttribution(attribution?: Record<string, unknown>) {
  const pick = (key: string) => {
    const value = String(attribution?.[key] ?? "").trim();
    return value ? value.slice(0, 500) : "";
  };
  return {
    fbc: pick("fbc"),
    fbp: pick("fbp"),
  };
}

async function activeTestEventCode(supabaseAdmin?: SupabaseClient<Database>) {
  if (supabaseAdmin) {
    const { data: testSettings } = await supabaseAdmin
      .from("meta_ads_settings")
      .select("test_mode, test_event_code")
      .eq("id", true)
      .maybeSingle();
    if (testSettings) {
      return testSettings.test_mode ? testSettings.test_event_code?.trim() : "";
    }
  }
  return process.env.META_TEST_EVENT_CODE?.trim();
}

async function deliverMetaEvent(
  payload: Record<string, unknown>,
  supabaseAdmin?: SupabaseClient<Database>,
): Promise<MetaCheckoutEventResult> {
  const { getMetaCapiCredentials } = await import("./meta-capi-credentials.server");
  const { pixelId, accessToken } = await getMetaCapiCredentials(supabaseAdmin);
  if (!pixelId || !accessToken) {
    return { sent: false, reason: "not_configured" };
  }

  const graphVersion = process.env.META_GRAPH_API_VERSION?.trim() || DEFAULT_GRAPH_API_VERSION;
  const endpoint = new URL(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pixelId)}/events`,
  );
  endpoint.searchParams.set("access_token", accessToken);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), META_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const responseText = (await response.text()).slice(0, 500);
      console.error("Meta CAPI event rejected", {
        status: response.status,
        response: responseText,
      });
      return { sent: false, reason: "request_failed" };
    }
    const eventId = (
      ((payload.data as Array<Record<string, unknown>> | undefined)?.[0]?.event_id as
        string | undefined) ?? ""
    ).trim();
    return { sent: true, eventId };
  } catch (requestError) {
    console.error("Meta CAPI event failed", {
      error: requestError instanceof Error ? requestError.message : "unknown",
    });
    return { sent: false, reason: "request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendMetaCheckoutEvent({
  supabaseAdmin,
  eventName,
  eventId,
  value,
  externalId,
  attribution,
}: {
  supabaseAdmin?: SupabaseClient<Database>;
  eventName: MetaCheckoutEventName;
  eventId: string;
  value: number;
  externalId: string;
  attribution?: Record<string, unknown>;
}): Promise<MetaCheckoutEventResult> {
  const cleanEventId = eventId.trim().slice(0, 160);
  const cleanExternalId = externalId.trim().slice(0, 160);
  if (!cleanEventId || !cleanExternalId) {
    return { sent: false, reason: "request_failed" };
  }

  const { fbc, fbp } = sanitizedAttribution(attribution);
  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: cleanEventId,
        action_source: "website",
        event_source_url: configuredSourceUrl(),
        user_data: {
          external_id: [await sha256(cleanExternalId)],
          ...(fbc ? { fbc } : {}),
          ...(fbp ? { fbp } : {}),
        },
        custom_data: {
          currency: "BRL",
          value: Number(value),
          content_type: "product",
          content_ids: [GATEWAY_PRODUCT.id],
          content_name: GATEWAY_PRODUCT.description,
        },
      },
    ],
  };

  const testEventCode = await activeTestEventCode(supabaseAdmin);
  if (testEventCode) payload.test_event_code = testEventCode;
  return deliverMetaEvent(payload, supabaseAdmin);
}

/**
 * Sends a privacy-minimised Purchase event after the order has been verified.
 *
 * Meta deduplicates repeated deliveries by event_id. The order UUID is safe to
 * use for that purpose and lets webhook retries remain idempotent.
 */
export async function sendMetaPurchaseForOrder(
  supabaseAdmin: SupabaseClient<Database>,
  orderId: string,
): Promise<MetaPurchaseResult> {
  const { getMetaCapiCredentials } = await import("./meta-capi-credentials.server");
  const { pixelId, accessToken } = await getMetaCapiCredentials(supabaseAdmin);
  if (!pixelId || !accessToken) {
    return { sent: false, reason: "not_configured" };
  }

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id, customer_id, total_amount, payment_status, paid_at")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order || order.payment_status !== "paid") {
    return { sent: false, reason: "order_not_found" };
  }
  const { data: attribution } = await supabaseAdmin
    .from("order_attributions")
    .select("fbc, fbp")
    .eq("order_id", orderId)
    .maybeSingle();

  let eventId = `feverby-purchase-${order.id}`;
  let attemptNumber = 1;
  const attemptStartedAt = new Date().toISOString();
  const { error: claimError } = await supabaseAdmin.from("meta_conversion_events").insert({
    order_id: String(order.id),
    event_id: eventId,
    provider: "meta",
    event_name: "Purchase",
    delivery_status: "pending",
    last_attempt_at: attemptStartedAt,
  });
  if (claimError) {
    if (claimError.code === "23505") {
      const { data: existing } = await supabaseAdmin
        .from("meta_conversion_events")
        .select("id,event_id,delivery_status,attempts,updated_at")
        .eq("order_id", orderId)
        .maybeSingle();
      if (!existing) return { sent: false, reason: "request_failed" };
      eventId = existing.event_id;
      attemptNumber = existing.attempts + 1;
      if (existing.delivery_status === "sent") {
        return { sent: true, eventId: existing.event_id };
      }
      const isFreshClaim = existing.delivery_status === "pending"
        && Date.now() - new Date(existing.updated_at).getTime() < 5 * 60_000;
      if (isFreshClaim) return { sent: false, reason: "already_claimed" };

      const { data: reclaimed, error: reclaimError } = await supabaseAdmin
        .from("meta_conversion_events")
        .update({
          delivery_status: "pending",
          attempts: attemptNumber,
          error_message: null,
          last_attempt_at: attemptStartedAt,
          updated_at: attemptStartedAt,
        })
        .eq("id", existing.id)
        .eq("updated_at", existing.updated_at)
        .select("id")
        .maybeSingle();
      if (reclaimError || !reclaimed) return { sent: false, reason: "already_claimed" };
    } else {
      console.error("Meta CAPI delivery claim failed", {
        orderId,
        code: claimError.code,
        message: claimError.message,
      });
      return { sent: false, reason: "request_failed" };
    }
  }

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(
          new Date(order.paid_at ?? new Date().toISOString()).getTime() / 1000,
        ),
        event_id: eventId,
        action_source: "website",
        event_source_url: configuredSourceUrl(),
        user_data: {
          // A one-way hash of the internal customer UUID improves matching
          // without sharing CPF, name, e-mail or the purchased creator.
          external_id: [await sha256(String(order.customer_id))],
          ...(attribution?.fbc ? { fbc: attribution.fbc } : {}),
          ...(attribution?.fbp ? { fbp: attribution.fbp } : {}),
        },
        custom_data: {
          currency: "BRL",
          value: Number(order.total_amount),
          content_type: "product",
          content_ids: [GATEWAY_PRODUCT.id],
          content_name: GATEWAY_PRODUCT.description,
        },
      },
    ],
  };
  const testEventCode = await activeTestEventCode(supabaseAdmin);
  if (testEventCode) payload.test_event_code = testEventCode;

  const graphVersion = process.env.META_GRAPH_API_VERSION?.trim() || DEFAULT_GRAPH_API_VERSION;
  const endpoint = new URL(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pixelId)}/events`,
  );
  endpoint.searchParams.set("access_token", accessToken);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), META_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseText = (await response.text()).slice(0, 2_000);
    let responsePayload: Record<string, unknown> | null = null;
    try {
      responsePayload = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      responsePayload = null;
    }
    const eventsReceived = Number(responsePayload?.events_received ?? 0);
    await supabaseAdmin.from("meta_conversion_attempts").insert({
      order_id: orderId,
      event_id: eventId,
      attempt_number: attemptNumber,
      delivery_status: response.ok && eventsReceived >= 1 ? "sent" : "failed",
      http_status: response.status,
      events_received: eventsReceived,
      response_request_id: String(responsePayload?.fbtrace_id ?? "") || null,
      error_message: response.ok && eventsReceived >= 1 ? null : responseText || "Resposta sem confirmação.",
    });
    if (!response.ok || eventsReceived < 1) {
      await supabaseAdmin
        .from("meta_conversion_events")
        .update({
          delivery_status: "failed",
          error_message: responseText || `Meta respondeu HTTP ${response.status} sem confirmar o evento.`,
          response_payload: responsePayload,
          response_request_id: String(responsePayload?.fbtrace_id ?? "") || null,
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", orderId)
        .eq("delivery_status", "pending");
      console.error("Meta CAPI Purchase rejected", {
        orderId,
        status: response.status,
        response: responseText,
      });
      return { sent: false, reason: "request_failed" };
    }
    await supabaseAdmin
      .from("meta_conversion_events")
      .update({
        delivery_status: "sent",
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: null,
        response_payload: responsePayload,
        response_request_id: String(responsePayload?.fbtrace_id ?? "") || null,
      })
      .eq("order_id", orderId)
      .eq("delivery_status", "pending");
    return { sent: true, eventId };
  } catch (requestError) {
    await supabaseAdmin.from("meta_conversion_attempts").insert({
      order_id: orderId,
      event_id: eventId,
      attempt_number: attemptNumber,
      delivery_status: "failed",
      error_message: requestError instanceof Error ? requestError.message : "Falha desconhecida.",
    });
    await supabaseAdmin
      .from("meta_conversion_events")
      .update({
        delivery_status: "failed",
        error_message: requestError instanceof Error ? requestError.message : "Falha desconhecida.",
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId)
      .eq("delivery_status", "pending");
    console.error("Meta CAPI Purchase failed", {
      orderId,
      error: requestError instanceof Error ? requestError.message : "unknown",
    });
    return { sent: false, reason: "request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}
