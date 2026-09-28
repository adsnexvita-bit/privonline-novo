import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type OnPayCredentials = { apiKey: string; webhookSecret: string };
type SyncPayCredentials = {
  clientId: string;
  clientSecret: string;
  webhookBearerToken: string;
};
type PushinPayCredentials = { apiToken: string; webhookBearerToken: string };

function encryptionKey() {
  const configured = process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!configured)
    throw new Error("A chave de criptografia das credenciais de pagamento não está configurada.");
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32)
    throw new Error("A chave de criptografia das credenciais de pagamento é inválida.");
  return key;
}

export function encryptServerCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptServerCredential(value: unknown) {
  if (typeof value !== "string") return "";
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) return "";
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Não foi possível descriptografar as credenciais de pagamento.");
  }
}

export function credentialHint(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const suffix = trimmed.slice(-4);
  return `••••${suffix}`;
}

export function encryptPaymentCredential(value: string) {
  return encryptServerCredential(value.trim());
}

async function getPaymentCredentialRecord(action: string, providerLabel: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("admin_audit_logs")
    .select("details")
    .eq("action", action)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível consultar as credenciais da ${providerLabel}.`);
  return data?.details && typeof data.details === "object" && !Array.isArray(data.details)
    ? (data.details as Record<string, unknown>)
    : {};
}

export function getOnPayCredentialRecord() {
  return getPaymentCredentialRecord("payment.onpay_credentials_update", "ONPAY");
}

export function getSyncPayCredentialRecord() {
  return getPaymentCredentialRecord("payment.syncpay_credentials_update", "SyncPay");
}

export function getPushinPayCredentialRecord() {
  return getPaymentCredentialRecord("payment.pushinpay_credentials_update", "Pushin Pay");
}

export async function getOnPayCredentials(): Promise<OnPayCredentials> {
  const record = await getOnPayCredentialRecord();
  const apiKey =
    decryptServerCredential(record.api_key_encrypted) || process.env.ONPAY_API_KEY?.trim() || "";
  const webhookSecret =
    decryptServerCredential(record.webhook_secret_encrypted) ||
    process.env.ONPAY_WEBHOOK_SECRET?.trim() ||
    "";
  return { apiKey, webhookSecret };
}

export async function getSyncPayCredentials(): Promise<SyncPayCredentials> {
  const record = await getSyncPayCredentialRecord();
  const clientId =
    decryptServerCredential(record.client_id_encrypted) ||
    process.env.SYNC_PAY_CLIENT_ID?.trim() ||
    "";
  const clientSecret =
    decryptServerCredential(record.client_secret_encrypted) ||
    process.env.SYNC_PAY_CLIENT_SECRET?.trim() ||
    "";
  const webhookBearerToken =
    decryptServerCredential(record.webhook_bearer_token_encrypted) ||
    process.env.SYNC_PAY_WEBHOOK_BEARER_TOKEN?.trim() ||
    "";
  return { clientId, clientSecret, webhookBearerToken };
}

export async function getPushinPayCredentials(): Promise<PushinPayCredentials> {
  const record = await getPushinPayCredentialRecord();
  const apiToken =
    decryptServerCredential(record.api_token_encrypted) ||
    process.env.PUSHIN_PAY_TOKEN?.trim() ||
    "";
  const webhookBearerToken =
    decryptServerCredential(record.webhook_bearer_token_encrypted) ||
    process.env.PUSHIN_PAY_WEBHOOK_BEARER_TOKEN?.trim() ||
    "";
  return { apiToken, webhookBearerToken };
}

export function deterministicUuid(value: string) {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
