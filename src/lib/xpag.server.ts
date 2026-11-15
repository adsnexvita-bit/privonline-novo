import { createHmac, timingSafeEqual } from "node:crypto";
import { getXPagCredentials } from "./payment-credentials.server";
import { buildPaymentWebhookUrl } from "./payment-webhook-url";
import type { PaymentStatus } from "./syncpay.server";

const DEFAULT_API_URL = "https://api.xpag.global";
function apiUrl(path: string) {
  return `${(process.env.XPAG_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, "")}${path}`;
}

async function request(path: string, init: RequestInit = {}) {
  const { clientId, clientSecret } = await getXPagCredentials();
  if (!clientId || !clientSecret)
    throw new Error("As credenciais da API XPag ainda não foram configuradas no painel admin.");
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Client-Id": clientId,
      "X-Client-Secret": clientSecret,
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body && typeof body === "object" && "ok" in body && body.ok === false))
    throw new Error(
      `XPag (${response.status}): ${body && typeof body.error === "string" ? body.error : "A XPag recusou a solicitação."}`,
    );
  return body as Record<string, unknown>;
}

export async function createXPagCashIn(input: {
  orderId: string;
  amount: number;
  webhookOrigin?: string;
  client: { name?: string; cpf: string };
}) {
  const body = await request("/cashin", {
    method: "POST",
    body: JSON.stringify({
      currency: "BRL",
      amount: Number(input.amount.toFixed(2)),
      name: input.client.name?.trim() || "Cliente Privadinhos",
      document: input.client.cpf.replace(/\D/g, ""),
      description: "Compra Privadinhos Online",
      external_id: input.orderId,
      webhook_url: buildPaymentWebhookUrl("xpag", input.orderId, input.webhookOrigin),
    }),
  });
  const pixCode =
    typeof body.copyPaste === "string"
      ? body.copyPaste
      : typeof body.copy_paste === "string"
        ? body.copy_paste
        : "";
  const identifier =
    typeof body.transaction_id === "string"
      ? body.transaction_id
      : typeof body.request_number === "string"
        ? body.request_number
        : "";
  if (!identifier || !pixCode) throw new Error("A XPag não retornou o código PIX.");
  return { identifier, pixCode };
}

export async function getXPagTransaction(identifier: string) {
  const body = await request(`/transactions/${encodeURIComponent(identifier)}`);
  const value = (body.data && typeof body.data === "object" ? body.data : body) as Record<
    string,
    unknown
  >;
  return {
    id: String(value.transaction_id ?? value.id ?? identifier),
    status: String(value.status ?? ""),
    amount: Number(value.amount),
    paidAt: typeof value.updated_at === "string" ? value.updated_at : null,
  };
}

export function mapXPagStatus(status: string): PaymentStatus | null {
  switch (status.trim().toLowerCase()) {
    case "confirmed":
    case "completed":
      return "paid";
    case "pending":
    case "created":
    case "awaiting_instruction":
      return "pending";
    case "failed":
      return "failed";
    case "expired":
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "refunded":
      return "refunded";
    case "med":
    case "chargeback":
      return "chargeback";
    default:
      return null;
  }
}

export async function receiveXPagWebhook(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-webhook-signature")?.trim().toLowerCase() || "";
  const { clientSecret } = await getXPagCredentials();
  const expected = createHmac("sha256", clientSecret).update(raw).digest("hex");
  if (
    !signature ||
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return new Response("invalid signature", { status: 401 });
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new Response("invalid payload", { status: 400 });
  }
  const transactionId = String(payload.transaction_id ?? payload.request_number ?? "").trim();
  if (!transactionId) return new Response("missing transaction", { status: 400 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { processPaymentConfirmation } = await import("./payment-processing.server");
  try {
    await processPaymentConfirmation(supabaseAdmin, {
      provider: "xpag",
      transactionId,
      confirmationSource: "webhook",
    });
  } catch (error) {
    console.error("payment:xpag_webhook_error", error);
    return new Response("retry", { status: 500 });
  }
  return Response.json({ ok: true });
}
