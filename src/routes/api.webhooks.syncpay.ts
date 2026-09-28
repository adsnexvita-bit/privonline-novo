import { createFileRoute } from "@tanstack/react-router";
import { receiveSyncPayWebhook } from "@/lib/syncpay-webhook.server";

export const Route = createFileRoute("/api/webhooks/syncpay")({
  server: {
    handlers: {
      POST: ({ request }) => receiveSyncPayWebhook(request),
    },
  },
});
