import type { PaymentProvider } from "./payment-provider";
import { PRIMARY_PUBLIC_ORIGIN, resolvePublicOrigin } from "./public-origin";

function configuredOrigin(provider: PaymentProvider) {
  const providerUrl =
    provider === "syncpay"
      ? process.env.SYNC_PAY_WEBHOOK_URL
      : provider === "pushinpay"
        ? process.env.PUSHIN_PAY_WEBHOOK_URL
        : undefined;
  const raw =
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL ||
    providerUrl ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    PRIMARY_PUBLIC_ORIGIN;
  return resolvePublicOrigin(raw);
}

export function buildPaymentWebhookUrl(
  provider: PaymentProvider,
  orderId: string | undefined,
  requestOrigin?: string,
) {
  const base = resolvePublicOrigin(requestOrigin?.trim() || configuredOrigin(provider));
  const url = new URL(base);
  const localDevelopment = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) {
    throw new Error("A URL do webhook deve usar HTTPS.");
  }
  url.pathname =
    provider === "syncpay" ? "/api/webhooks/syncpay" : `/api/public/webhooks/${provider}`;
  url.search = "";
  url.hash = "";
  if (orderId) url.searchParams.set("order_id", orderId);
  return url.toString();
}
