import { createHash } from "node:crypto";
import { getSyncPayCredentials } from "./payment-credentials.server";
import { buildPaymentWebhookUrl } from "./payment-webhook-url";

const DEFAULT_API_URL = "https://api.syncpayments.com.br";
// SyncPay requires webhook responses within five seconds. Keeping each
// gateway request below two seconds leaves time for database reconciliation
// and lets SyncPay retry transient failures instead of receiving a late 2xx.
const WEBHOOK_REQUEST_TIMEOUT_MS = 1_800;
// Pix creation is an interactive user action. SyncPay can take a few seconds
// to authenticate and create the QR Code, so this must not share the short
// webhook timeout.
const CHECKOUT_REQUEST_TIMEOUT_MS = 15_000;
export const INTERACTIVE_STATUS_TIMEOUT_MS = 6_000;

type TokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  expires_at?: unknown;
  message?: unknown;
};

export type SyncPayCashInInput = {
  orderId: string;
  amount: number;
  description: string;
  webhookOrigin?: string;
  client: {
    cpf: string;
    name?: string;
    email?: string;
    phone?: string;
  };
};

export type SyncPayCashInResult = {
  identifier: string;
  pixCode: string;
};

export type SyncPayTransaction = {
  identifier: string;
  amount: number;
  status: string;
  transactionDate: string | null;
};

export type SyncPayTransactionState = {
  transactionId: string;
  providerStatus: string;
  isPaid: boolean;
  amount: number;
  transactionDate: string | null;
  rawShapeVersion: "root" | "data";
};

export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded" | "chargeback";

let cachedToken: { value: string; expiresAt: number; credentialsHash: string } | null = null;

function apiUrl(path: string) {
  const base = (process.env.SYNC_PAY_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, "");
  return `${base}${path}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = await response.json();
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function gatewayError(response: Response, body: Record<string, unknown>, fallback: string) {
  const message = typeof body.message === "string" ? body.message : fallback;
  return new Error(`SyncPay (${response.status}): ${message}`);
}

async function getAccessToken(): Promise<string> {
  const { clientId, clientSecret } = await getSyncPayCredentials();
  if (!clientId || !clientSecret) {
    throw new Error("As credenciais da API SyncPay ainda não foram configuradas no painel admin.");
  }
  const credentialsHash = createHash("sha256").update(`${clientId}\0${clientSecret}`).digest("hex");
  if (
    cachedToken &&
    cachedToken.credentialsHash === credentialsHash &&
    cachedToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedToken.value;
  }

  const response = await fetch(apiUrl("/api/partner/v1/auth-token"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(CHECKOUT_REQUEST_TIMEOUT_MS),
  });
  const body = (await readJson(response)) as TokenResponse;
  if (!response.ok || typeof body.access_token !== "string" || !body.access_token) {
    throw gatewayError(response, body as Record<string, unknown>, "Falha ao autenticar.");
  }

  const expiresAtFromResponse =
    typeof body.expires_at === "string" ? new Date(body.expires_at).getTime() : Number.NaN;
  const expiresIn =
    typeof body.expires_in === "number" && Number.isFinite(body.expires_in)
      ? body.expires_in
      : 3_600;
  cachedToken = {
    value: body.access_token,
    credentialsHash,
    expiresAt: Number.isFinite(expiresAtFromResponse)
      ? expiresAtFromResponse
      : Date.now() + expiresIn * 1_000,
  };
  return cachedToken.value;
}

export async function createSyncPayCashIn(input: SyncPayCashInInput): Promise<SyncPayCashInResult> {
  const token = await getAccessToken();
  const cpfDigits = input.client.cpf.replace(/\D/g, "");
  // SyncPay requires CPF, name and email in the cash-in payload. The checkout
  // asks only for phone and an optional name, so technical fallbacks remain
  // exclusively on the server and are never exposed to the buyer.
  const phoneDigits = input.client.phone?.replace(/\D/g, "") ?? "";
  const nationalPhone =
    phoneDigits.length > 11 && phoneDigits.startsWith("55") ? phoneDigits.slice(2) : phoneDigits;
  const client = {
    cpf: input.client.cpf,
    name: input.client.name?.trim() || "Cliente Feverby",
    email: input.client.email?.trim() || `cliente+${cpfDigits}@privadinhos.online`,
    ...(nationalPhone ? { phone: nationalPhone } : {}),
  };
  const response = await fetch(apiUrl("/api/partner/v1/cash-in"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Number(input.amount.toFixed(2)),
      description: input.description,
      webhook_url: buildPaymentWebhookUrl("syncpay", input.orderId, input.webhookOrigin),
      client,
    }),
    signal: AbortSignal.timeout(CHECKOUT_REQUEST_TIMEOUT_MS),
  });
  const body = await readJson(response);
  const identifier = body.identifier;
  const pixCode = body.pix_code;
  if (
    !response.ok ||
    typeof identifier !== "string" ||
    !identifier ||
    typeof pixCode !== "string" ||
    !pixCode
  ) {
    throw gatewayError(response, body, "Não foi possível gerar o Pix.");
  }
  return { identifier, pixCode };
}

export async function getSyncPayTransaction(
  identifier: string,
  timeoutMs = WEBHOOK_REQUEST_TIMEOUT_MS,
): Promise<SyncPayTransaction> {
  const state = await getSyncPayTransactionState(identifier, timeoutMs);
  return {
    identifier: state.transactionId,
    amount: state.amount,
    status: state.providerStatus,
    transactionDate: state.transactionDate,
  };
}

function transactionIdentifier(data: Record<string, unknown>): string | null {
  for (const key of ["identifier", "id", "reference_id", "transaction_identifier"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Pure normalization for the two SyncPay Partner response envelopes observed
 * in production. It never mutates application state or triggers side effects.
 */
export function normalizeSyncPayTransactionState(
  body: Record<string, unknown>,
  requestedIdentifier: string,
): SyncPayTransactionState {
  const requested = requestedIdentifier.trim();
  if (!requested) throw new Error("Identificador da transação SyncPay ausente.");
  const hasDataEnvelope =
    Boolean(body.data) && typeof body.data === "object" && !Array.isArray(body.data);
  const data = hasDataEnvelope ? (body.data as Record<string, unknown>) : body;
  const returnedIdentifier = transactionIdentifier(data);
  if (!returnedIdentifier) throw new Error("A SyncPay não retornou o identificador da transação.");
  if (returnedIdentifier !== requested) {
    throw new Error("O identificador retornado pela SyncPay diverge da transação consultada.");
  }
  const amount = Number(data.amount);
  const providerStatus = typeof data.status === "string" ? data.status.trim() : "";
  if (!Number.isFinite(amount) || !providerStatus) {
    throw new Error("A SyncPay retornou uma transação inválida.");
  }
  return {
    transactionId: returnedIdentifier,
    providerStatus,
    isPaid: providerStatus === "completed" || providerStatus === "PAID_OUT",
    amount,
    transactionDate: typeof data.transaction_date === "string" ? data.transaction_date : null,
    rawShapeVersion: hasDataEnvelope ? "data" : "root",
  };
}

export async function getSyncPayTransactionState(
  identifier: string,
  timeoutMs = WEBHOOK_REQUEST_TIMEOUT_MS,
): Promise<SyncPayTransactionState> {
  const requestedIdentifier = identifier.trim();
  if (!requestedIdentifier) throw new Error("Identificador da transação SyncPay ausente.");
  const token = await getAccessToken();
  const response = await fetch(
    apiUrl(`/api/partner/v1/transaction/${encodeURIComponent(requestedIdentifier)}`),
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const body = await readJson(response);
  if (!response.ok) {
    throw gatewayError(response, body, "Falha ao consultar a transação.");
  }
  return normalizeSyncPayTransactionState(body, requestedIdentifier);
}

export function mapSyncPayStatus(status: string): PaymentStatus | null {
  const exact = status.trim();
  const normalized = exact.toLowerCase().replace(/[\s-]+/g, "_");
  // The current partner webhook documents `completed`; the legacy production
  // API returns `PAID_OUT`. Do not grant access for speculative paid aliases.
  if (exact === "completed" || exact === "PAID_OUT") {
    return "paid";
  }
  if (["pending", "created", "processing", "waiting_for_approval"].includes(normalized)) {
    return "pending";
  }
  if (["failed", "declined", "rejected", "expired"].includes(normalized)) {
    return "failed";
  }
  if (["cancelled", "canceled"].includes(normalized)) return "cancelled";
  if (["refunded", "med"].includes(normalized)) return "refunded";
  if (normalized === "chargeback") return "chargeback";
  return null;
}

export function amountsMatch(expected: number, actual: number) {
  return Math.round(expected * 100) === Math.round(actual * 100);
}
