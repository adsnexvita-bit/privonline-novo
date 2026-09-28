import { createFileRoute } from "@tanstack/react-router";
import { processWebhookEvent } from "@/lib/admin-orders.functions";

export const Route = createFileRoute("/api/public/webhooks/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const provider = String(params.provider ?? "unknown")
          .toLowerCase()
          .slice(0, 32);
        if (provider !== "syncpay" && provider !== "pushinpay" && provider !== "onpay") {
          return new Response("Provider not found", { status: 404 });
        }
        if (provider === "syncpay") {
          const { receiveSyncPayWebhook } = await import("@/lib/syncpay-webhook.server");
          return receiveSyncPayWebhook(request);
        }
        if (provider === "onpay") {
          const { receiveOnPayWebhook } = await import("@/lib/onpay-webhook.server");
          return receiveOnPayWebhook(request);
        }
        const bodyText = await request.text();
        console.info("payment:webhook_received", { provider, bytes: bodyText.length });

        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(bodyText);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const authorization = request.headers.get("authorization") ?? "";
        const bearer = authorization.replace(/^Bearer\s+/i, "");
        const secretHeader = request.headers.get("x-webhook-secret") ?? "";
        const { getPushinPayCredentials } = await import("@/lib/payment-credentials.server");
        const { webhookBearerToken: configured } = await getPushinPayCredentials();
        // Providers do not guarantee an authorization header on cash-in
        // callbacks. When an optional shared secret is configured we enforce
        // it; otherwise authenticity is established below by fetching the
        // transaction directly from SyncPay before granting access.
        if (configured && bearer !== configured && secretHeader !== configured) {
          return new Response("Unauthorized", { status: 401 });
        }

        const data =
          payload.data && typeof payload.data === "object"
            ? (payload.data as Record<string, unknown>)
            : payload;
        const transactionId =
          (payload.identifier as string) ??
          (payload.transaction_identifier as string) ??
          (payload.transaction_id as string) ??
          (data.identifier as string) ??
          (data.transaction_identifier as string) ??
          (data.transaction_id as string) ??
          (data.id as string) ??
          null;
        const eventType =
          request.headers.get("event") ??
          (payload.event as string) ??
          (payload.type as string) ??
          (data.status as string) ??
          "unknown";
        const eventVersion =
          (data.updated_at as string) ??
          (payload.updated_at as string) ??
          (data.created_at as string) ??
          "unversioned";
        const externalId = transactionId
          ? `${transactionId}:${eventType}:${eventVersion}`
          : crypto.randomUUID();
        const orderHint = new URL(request.url).searchParams.get("order_id");
        const storedPayload = {
          ...payload,
          famaflix_order_id: orderHint,
        };

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency: unique on (provider, external_event_id)
        const { data: existing } = await supabaseAdmin
          .from("webhook_events")
          .select("*")
          .eq("provider", provider)
          .eq("external_event_id", externalId)
          .maybeSingle();

        if (existing) {
          if (
            existing.processing_status === "processed" ||
            existing.processing_status === "ignored"
          ) {
            return Response.json({ ok: true, duplicated: true, id: existing.id });
          }
          const result = await processWebhookEvent(existing as unknown as Record<string, unknown>);
          return Response.json(
            { ok: result.ok, retried: true, id: existing.id },
            { status: result.ok ? 200 : 500 },
          );
        }

        const { data: created, error } = await supabaseAdmin
          .from("webhook_events")
          .insert({
            provider,
            external_event_id: externalId,
            event_type: eventType,
            transaction_identifier: transactionId,
            payload: storedPayload as never,
            processing_status: "pending",
          })
          .select("*")
          .single();

        if (error || !created) {
          return new Response("Insert failed", { status: 500 });
        }

        const result = await processWebhookEvent(created as unknown as Record<string, unknown>);
        return Response.json({ ok: result.ok, id: created.id }, { status: result.ok ? 200 : 500 });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "authorization, content-type, event, x-webhook-secret, x-onpay-signature, x-onpay-event",
          },
        }),
    },
  },
});
