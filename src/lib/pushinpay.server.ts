import type { PaymentStatus } from "./syncpay.server";
import { buildPaymentWebhookUrl } from "./payment-webhook-url";
import { getPushinPayCredentials } from "./payment-credentials.server";

const API_URL = "https://api.pushinpay.com.br/api";
const CHECKOUT_TIMEOUT_MS = 15_000;

async function token() {
  const { apiToken } = await getPushinPayCredentials();
  if (!apiToken)
    throw new Error("A chave da API Pushin Pay ainda não foi configurada no painel admin.");
  return apiToken;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = await response.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function createPushinPayCashIn(input: {
  orderId: string;
  amount: number;
  webhookOrigin?: string;
}) {
  const apiToken = await token();
  const value = Math.round(input.amount * 100);
  if (value < 50) throw new Error("O valor mínimo para Pix é R$ 0,50.");
  const response = await fetch(`${API_URL}/pix/cashIn`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      value,
      webhook_url: buildPaymentWebhookUrl("pushinpay", input.orderId, input.webhookOrigin),
    }),
    signal: AbortSignal.timeout(CHECKOUT_TIMEOUT_MS),
  });
  const body = await readJson(response);
  const identifier = body.id;
  const pixCode = body.qr_code;
  if (
    !response.ok ||
    typeof identifier !== "string" ||
    !identifier ||
    typeof pixCode !== "string" ||
    !pixCode
  ) {
    const message =
      typeof body.message === "string" ? body.message : "Não foi possível gerar o Pix.";
    throw new Error(`Pushin Pay (${response.status}): ${message}`);
  }
  return { identifier, pixCode };
}

export async function getPushinPayTransaction(identifier: string) {
  const apiToken = await token();
  const response = await fetch(`${API_URL}/transactions/${encodeURIComponent(identifier)}`, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(CHECKOUT_TIMEOUT_MS),
  });
  const body = await readJson(response);
  if (!response.ok) {
    const message =
      typeof body.message === "string" ? body.message : "Falha ao consultar a transação.";
    throw new Error(`Pushin Pay (${response.status}): ${message}`);
  }
  const amount = Number(body.value) / 100;
  const status = typeof body.status === "string" ? body.status : "";
  if (!Number.isFinite(amount) || !status)
    throw new Error("A Pushin Pay retornou uma transação inválida.");
  return { amount, status };
}

export function mapPushinPayStatus(status: string): PaymentStatus | null {
  const normalized = status.trim().toLowerCase();
  if (normalized === "paid") return "paid";
  if (["created", "pending", "processing"].includes(normalized)) return "pending";
  if (["expired", "failed", "rejected"].includes(normalized)) return "failed";
  if (["canceled", "cancelled"].includes(normalized)) return "cancelled";
  if (normalized === "refunded") return "refunded";
  if (normalized === "chargeback") return "chargeback";
  return null;
}
