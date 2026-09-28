import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  credentialHint,
  decryptServerCredential,
  encryptServerCredential,
} from "./payment-credentials.server";

export type MetaCapiCredentials = {
  pixelId: string;
  accessToken: string;
  tokenHint: string | null;
};

async function database(db?: SupabaseClient<Database>) {
  if (db) return db;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function getMetaCredentialRecord(db?: SupabaseClient<Database>) {
  const client = await database(db);
  const { data, error } = await client
    .from("admin_audit_logs")
    .select("details")
    .eq("action", "meta.credentials_update")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar as credenciais da Meta.");
  return data?.details && typeof data.details === "object" && !Array.isArray(data.details)
    ? (data.details as Record<string, unknown>)
    : {};
}

export async function getMetaCapiCredentials(
  db?: SupabaseClient<Database>,
): Promise<MetaCapiCredentials> {
  const record = await getMetaCredentialRecord(db);
  const pixelId =
    (typeof record.pixel_id === "string" ? record.pixel_id.trim() : "") ||
    process.env.META_PIXEL_ID?.trim() ||
    "";
  const accessToken =
    decryptServerCredential(record.access_token_encrypted) ||
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN?.trim() ||
    "";
  return {
    pixelId,
    accessToken,
    tokenHint:
      (typeof record.access_token_hint === "string" ? record.access_token_hint : null) ||
      (accessToken ? credentialHint(accessToken) : null),
  };
}

export function encryptMetaAccessToken(value: string) {
  return encryptServerCredential(value.trim());
}
