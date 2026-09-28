import { createHash } from "node:crypto";
import type { PaymentStatus } from "./syncpay.server";
import { deterministicUuid, getOnPayCredentials } from "./payment-credentials.server";

const DEFAULT_API_URL = "https://api.onpay.global";

type OnPayTransaction = {
  id: string;
  status: string;
  amount: number;
  qrCode?: string;
  paidAt?: string | null;
};

function apiUrl(path: string) {
  return new URL(path, process.env.ONPAY_API_URL?.trim() || DEFAULT_API_URL).toString();
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function cpfDigit(base: string, factor: number) {
  let total = 0;
  for (const char of base) total += Number(char) * factor--;
  const result = 11 - (total % 11);
  return result >= 10 ? 0 : result;
}

export function createSyntheticOnPayCpf(orderId: string) {
  const digest = createHash("sha256").update(`onpay-payer:${orderId}`).digest("hex");
  let base = Array.from(digest.slice(0, 9), (char) => (parseInt(char, 16) % 10).toString()).join("");
  if (/^(\d)\1{8}$/.test(base)) base = `12345678${base.at(-1)}`;
  const first = cpfDigit(base, 10);
  const second = cpfDigit(`${base}${first}`, 11);
  return `${base}${first}${second}`;
}

export function createSyntheticOnPayEmail(orderId: string) {
  const token = createHash("sha256").update(`onpay-email:${orderId}`).digest("hex").slice(0, 20);
  return `checkout+${token}@example.com`;
}

export function normalizeOnPayPhone(phone: string) {
  const digits = onlyDigits(phone);
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length < 10 || local.length > 11) throw new Error("Telefone inválido para gerar o PIX.");
  return `+55${local}`;
}

async function requestOnPay(path: string, init: RequestInit = {}) {
  const { apiKey } = await getOnPayCredentials();
  if (!apiKey) throw new Error("A chave da API ONPAY ainda não foi configurada no painel admin.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !body?.success) {
      console.error("payment:onpay_error", { status: response.status, path });
      throw new Error("A ONPAY não conseguiu processar a solicitação.");
    }
    return body;
  } catch (reason) {
    if (reason instanceof Error && reason.name === "AbortError") {
      throw new Error("A ONPAY demorou demais para responder.");
    }
    throw reason;
  } finally {
    clearTimeout(timeout);
  }
}

function readTransaction(body: Record<string, unknown>): OnPayTransaction {
  const data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("A ONPAY retornou uma resposta inválida.");
  }
  const value = data as Record<string, unknown>;
  const transaction: OnPayTransaction = {
    id: String(value.id ?? ""),
    status: String(value.status ?? ""),
    amount: Number(value.amount),
    qrCode: typeof value.qrCode === "string" ? value.qrCode : undefined,
    paidAt: typeof value.paidAt === "string" ? value.paidAt : null,
  };
  if (!transaction.id || !transaction.status || !Number.isFinite(transaction.amount)) {
    throw new Error("A ONPAY retornou uma transação inválida.");
  }
  return transaction;
}

export async function createOnPayCashIn(input: {
  orderId: string;
  amount: number;
  client: { cpf: string; name?: string; email?: string; phone?: string };
}) {
  const name = input.client.name?.trim();
  if (!name || name.length < 2) throw new Error("Informe o nome para gerar o PIX.");
  const phone = normalizeOnPayPhone(input.client.phone ?? "");
  const body = await requestOnPay("/api/v2/payments", {
    method: "POST",
    headers: { "idempotency-key": deterministicUuid(`onpay:${input.orderId}`) },
    body: JSON.stringify({
      method: "PIX",
      amount: Math.round(input.amount * 100) / 100,
      currency: "BRL",
      reference: input.orderId,
      payer: {
        name,
        phone,
        taxId: createSyntheticOnPayCpf(input.orderId),
        email: createSyntheticOnPayEmail(input.orderId),
      },
      expiresIn: 900,
    }),
  });
  const transaction = readTransaction(body);
  if (!transaction.qrCode) throw new Error("A ONPAY não retornou o código PIX.");
  return {
    identifier: transaction.id,
    pixCode: transaction.qrCode,
  };
}

export async function getOnPayTransaction(identifier: string) {
  return readTransaction(await requestOnPay(`/api/v2/transactions/${encodeURIComponent(identifier)}`));
}

export function mapOnPayStatus(status: string): PaymentStatus | null {
  switch (status.trim().toUpperCase()) {
    case "CREATED":
    case "ACTION_REQUIRED":
    case "PENDING": return "pending";
    case "AUTHORIZED":
    case "PAID": return "paid";
    case "FAILED":
    case "REJECTED": return "failed";
    case "EXPIRED":
    case "CANCELLED":
    case "CANCELED": return "cancelled";
    case "REFUNDED": return "refunded";
    default: return null;
  }
}
