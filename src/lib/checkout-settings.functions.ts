import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PaymentProvider } from "./payment-provider.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type PaymentProviderMode = "syncpay" | "pushinpay" | "onpay" | "split";
export type CheckoutSettings = {
  instantPixEnabled: boolean;
  paymentProviderMode: PaymentProviderMode;
  syncPayPercentage: number;
  pushinPayPercentage: number;
  onPayPercentage: number;
};

function percentage(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : null;
}

export function readCheckoutSettings(details: unknown): CheckoutSettings {
  const record =
    details && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : {};
  const mode = record.payment_provider_mode;
  const syncPayPercentage = percentage(record.syncpay_percentage) ?? 50;
  const pushinPayPercentage = percentage(record.pushinpay_percentage);
  const onPayPercentage = percentage(record.onpay_percentage);
  const hasCompleteDistribution =
    pushinPayPercentage !== null &&
    onPayPercentage !== null &&
    syncPayPercentage + pushinPayPercentage + onPayPercentage === 100;
  return {
    instantPixEnabled:
      typeof record.instant_pix_enabled === "boolean" ? record.instant_pix_enabled : true,
    paymentProviderMode:
      mode === "pushinpay" || mode === "onpay" || mode === "split" ? mode : "syncpay",
    syncPayPercentage,
    pushinPayPercentage: hasCompleteDistribution ? pushinPayPercentage : 100 - syncPayPercentage,
    onPayPercentage: hasCompleteDistribution ? onPayPercentage : 0,
  };
}

export function chooseSplitPaymentProvider(
  settings: Pick<CheckoutSettings, "syncPayPercentage" | "pushinPayPercentage">,
  draw = Math.random() * 100,
): PaymentProvider {
  if (draw < settings.syncPayPercentage) return "syncpay";
  if (draw < settings.syncPayPercentage + settings.pushinPayPercentage) return "pushinpay";
  return "onpay";
}

export const getCheckoutSettings = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("admin_audit_logs")
    .select("details")
    .eq("action", "checkout.settings_update")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Could not load checkout settings", { code: error.code });
    return readCheckoutSettings(null);
  }

  return readCheckoutSettings(data?.details);
});

export const getAdminCheckoutSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (adminError || !isAdmin) throw new Error("Acesso restrito a administradores.");

    const { data, error } = await context.supabase
      .from("admin_audit_logs")
      .select("details")
      .eq("action", "checkout.settings_update")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Não foi possível consultar a configuração do checkout.");

    const settings = readCheckoutSettings(data?.details);
    const { getOnPayCredentialRecord, getPushinPayCredentialRecord, getSyncPayCredentialRecord } =
      await import("./payment-credentials.server");
    const [credentials, pushinPayCredentials, syncPayCredentials] = await Promise.all([
      getOnPayCredentialRecord(),
      getPushinPayCredentialRecord(),
      getSyncPayCredentialRecord(),
    ]);
    return {
      ...settings,
      syncPay: {
        clientIdConfigured: Boolean(
          syncPayCredentials.client_id_encrypted || process.env.SYNC_PAY_CLIENT_ID,
        ),
        clientSecretConfigured: Boolean(
          syncPayCredentials.client_secret_encrypted || process.env.SYNC_PAY_CLIENT_SECRET,
        ),
        webhookBearerTokenConfigured: Boolean(
          syncPayCredentials.webhook_bearer_token_encrypted ||
          process.env.SYNC_PAY_WEBHOOK_BEARER_TOKEN,
        ),
        clientIdHint:
          typeof syncPayCredentials.client_id_hint === "string"
            ? syncPayCredentials.client_id_hint
            : null,
        clientSecretHint:
          typeof syncPayCredentials.client_secret_hint === "string"
            ? syncPayCredentials.client_secret_hint
            : null,
        webhookBearerTokenHint:
          typeof syncPayCredentials.webhook_bearer_token_hint === "string"
            ? syncPayCredentials.webhook_bearer_token_hint
            : null,
        webhookPath: "/api/webhooks/syncpay",
      },
      onPay: {
        apiKeyConfigured: Boolean(credentials.api_key_encrypted || process.env.ONPAY_API_KEY),
        webhookSecretConfigured: Boolean(
          credentials.webhook_secret_encrypted || process.env.ONPAY_WEBHOOK_SECRET,
        ),
        apiKeyHint: typeof credentials.api_key_hint === "string" ? credentials.api_key_hint : null,
        webhookSecretHint:
          typeof credentials.webhook_secret_hint === "string"
            ? credentials.webhook_secret_hint
            : null,
        webhookPath: "/api/public/webhooks/onpay",
      },
      pushinPay: {
        apiTokenConfigured: Boolean(
          pushinPayCredentials.api_token_encrypted || process.env.PUSHIN_PAY_TOKEN,
        ),
        webhookBearerTokenConfigured: Boolean(
          pushinPayCredentials.webhook_bearer_token_encrypted ||
          process.env.PUSHIN_PAY_WEBHOOK_BEARER_TOKEN,
        ),
        apiTokenHint:
          typeof pushinPayCredentials.api_token_hint === "string"
            ? pushinPayCredentials.api_token_hint
            : null,
        webhookBearerTokenHint:
          typeof pushinPayCredentials.webhook_bearer_token_hint === "string"
            ? pushinPayCredentials.webhook_bearer_token_hint
            : null,
        webhookPath: "/api/public/webhooks/pushinpay",
      },
    };
  });

export const updateCheckoutSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (raw: {
      instantPixEnabled?: boolean;
      paymentProviderMode?: PaymentProviderMode;
      syncPayPercentage?: number;
      pushinPayPercentage?: number;
      onPayPercentage?: number;
    }) => {
      const syncPayPercentage = percentage(raw?.syncPayPercentage) ?? 50;
      const pushinPayPercentage = percentage(raw?.pushinPayPercentage) ?? 50;
      const onPayPercentage = percentage(raw?.onPayPercentage) ?? 0;
      return {
        instantPixEnabled: Boolean(raw?.instantPixEnabled),
        paymentProviderMode:
          raw?.paymentProviderMode === "pushinpay" ||
          raw?.paymentProviderMode === "onpay" ||
          raw?.paymentProviderMode === "split"
            ? raw.paymentProviderMode
            : ("syncpay" as const),
        syncPayPercentage,
        pushinPayPercentage,
        onPayPercentage,
      };
    },
  )
  .handler(async ({ context, data }) => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (adminError || !isAdmin) throw new Error("Acesso restrito a administradores.");
    if (
      data.paymentProviderMode === "split" &&
      data.syncPayPercentage + data.pushinPayPercentage + data.onPayPercentage !== 100
    ) {
      throw new Error("A distribuição entre os três gateways deve totalizar 100%.");
    }

    const db = await admin();
    const { data: adminUser } = await db
      .from("admin_users")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    const { error } = await db.from("admin_audit_logs").insert({
      admin_user_id: adminUser?.id ?? null,
      action: "checkout.settings_update",
      entity_type: "checkout_settings",
      entity_id: null,
      details: {
        instant_pix_enabled: data.instantPixEnabled,
        payment_provider_mode: data.paymentProviderMode,
        syncpay_percentage: data.syncPayPercentage,
        pushinpay_percentage: data.pushinPayPercentage,
        onpay_percentage: data.onPayPercentage,
      },
    });
    if (error) throw new Error("Não foi possível atualizar a configuração do checkout.");

    return { success: true };
  });

export const updateSyncPayCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (raw: { clientId?: string; clientSecret?: string; webhookBearerToken?: string }) => ({
      clientId: String(raw?.clientId ?? "")
        .trim()
        .slice(0, 1000),
      clientSecret: String(raw?.clientSecret ?? "")
        .trim()
        .slice(0, 1000),
      webhookBearerToken: String(raw?.webhookBearerToken ?? "")
        .trim()
        .slice(0, 1000),
    }),
  )
  .handler(async ({ context, data }) => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (adminError || !isAdmin) throw new Error("Acesso restrito a administradores.");
    const {
      credentialHint,
      encryptPaymentCredential,
      getSyncPayCredentialRecord,
      getSyncPayCredentials,
    } = await import("./payment-credentials.server");
    const [current, resolved] = await Promise.all([
      getSyncPayCredentialRecord(),
      getSyncPayCredentials(),
    ]);
    const currentClientId =
      typeof current.client_id_encrypted === "string" ? current.client_id_encrypted : "";
    const currentClientSecret =
      typeof current.client_secret_encrypted === "string" ? current.client_secret_encrypted : "";
    const currentWebhookToken =
      typeof current.webhook_bearer_token_encrypted === "string"
        ? current.webhook_bearer_token_encrypted
        : "";
    const clientIdEncrypted = data.clientId
      ? encryptPaymentCredential(data.clientId)
      : currentClientId || (resolved.clientId ? encryptPaymentCredential(resolved.clientId) : "");
    const clientSecretEncrypted = data.clientSecret
      ? encryptPaymentCredential(data.clientSecret)
      : currentClientSecret ||
        (resolved.clientSecret ? encryptPaymentCredential(resolved.clientSecret) : "");
    const webhookBearerTokenEncrypted = data.webhookBearerToken
      ? encryptPaymentCredential(data.webhookBearerToken)
      : currentWebhookToken ||
        (resolved.webhookBearerToken ? encryptPaymentCredential(resolved.webhookBearerToken) : "");
    if (!clientIdEncrypted || !clientSecretEncrypted || !webhookBearerTokenEncrypted) {
      throw new Error("Informe o Client ID, o Client Secret e o token do webhook da SyncPay.");
    }
    const db = await admin();
    const { data: adminUser } = await db
      .from("admin_users")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    const { error } = await db.from("admin_audit_logs").insert({
      admin_user_id: adminUser?.id ?? null,
      action: "payment.syncpay_credentials_update",
      entity_type: "payment_credentials",
      entity_id: null,
      details: {
        client_id_encrypted: clientIdEncrypted,
        client_secret_encrypted: clientSecretEncrypted,
        webhook_bearer_token_encrypted: webhookBearerTokenEncrypted,
        client_id_hint: data.clientId
          ? credentialHint(data.clientId)
          : typeof current.client_id_hint === "string"
            ? current.client_id_hint
            : null,
        client_secret_hint: data.clientSecret
          ? credentialHint(data.clientSecret)
          : typeof current.client_secret_hint === "string"
            ? current.client_secret_hint
            : null,
        webhook_bearer_token_hint: data.webhookBearerToken
          ? credentialHint(data.webhookBearerToken)
          : typeof current.webhook_bearer_token_hint === "string"
            ? current.webhook_bearer_token_hint
            : null,
      } as never,
    });
    if (error) throw new Error("Não foi possível salvar as credenciais da SyncPay.");
    return { success: true };
  });

export const updatePushinPayCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { apiToken?: string; webhookBearerToken?: string }) => ({
    apiToken: String(raw?.apiToken ?? "")
      .trim()
      .slice(0, 1000),
    webhookBearerToken: String(raw?.webhookBearerToken ?? "")
      .trim()
      .slice(0, 1000),
  }))
  .handler(async ({ context, data }) => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (adminError || !isAdmin) throw new Error("Acesso restrito a administradores.");
    const {
      credentialHint,
      encryptPaymentCredential,
      getPushinPayCredentialRecord,
      getPushinPayCredentials,
    } = await import("./payment-credentials.server");
    const [current, resolved] = await Promise.all([
      getPushinPayCredentialRecord(),
      getPushinPayCredentials(),
    ]);
    const currentApiToken =
      typeof current.api_token_encrypted === "string" ? current.api_token_encrypted : "";
    const currentWebhookToken =
      typeof current.webhook_bearer_token_encrypted === "string"
        ? current.webhook_bearer_token_encrypted
        : "";
    const apiTokenEncrypted = data.apiToken
      ? encryptPaymentCredential(data.apiToken)
      : currentApiToken || (resolved.apiToken ? encryptPaymentCredential(resolved.apiToken) : "");
    const webhookBearerTokenEncrypted = data.webhookBearerToken
      ? encryptPaymentCredential(data.webhookBearerToken)
      : currentWebhookToken ||
        (resolved.webhookBearerToken ? encryptPaymentCredential(resolved.webhookBearerToken) : "");
    if (!apiTokenEncrypted) throw new Error("Informe o token da API Pushin Pay.");
    const db = await admin();
    const { data: adminUser } = await db
      .from("admin_users")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    const { error } = await db.from("admin_audit_logs").insert({
      admin_user_id: adminUser?.id ?? null,
      action: "payment.pushinpay_credentials_update",
      entity_type: "payment_credentials",
      entity_id: null,
      details: {
        api_token_encrypted: apiTokenEncrypted,
        webhook_bearer_token_encrypted: webhookBearerTokenEncrypted || null,
        api_token_hint: data.apiToken
          ? credentialHint(data.apiToken)
          : typeof current.api_token_hint === "string"
            ? current.api_token_hint
            : null,
        webhook_bearer_token_hint: data.webhookBearerToken
          ? credentialHint(data.webhookBearerToken)
          : typeof current.webhook_bearer_token_hint === "string"
            ? current.webhook_bearer_token_hint
            : null,
      } as never,
    });
    if (error) throw new Error("Não foi possível salvar as credenciais da Pushin Pay.");
    return { success: true };
  });

export const updateOnPayCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { apiKey?: string; webhookSecret?: string }) => ({
    apiKey: String(raw?.apiKey ?? "")
      .trim()
      .slice(0, 1000),
    webhookSecret: String(raw?.webhookSecret ?? "")
      .trim()
      .slice(0, 1000),
  }))
  .handler(async ({ context, data }) => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (adminError || !isAdmin) throw new Error("Acesso restrito a administradores.");
    const {
      credentialHint,
      encryptPaymentCredential,
      getOnPayCredentialRecord,
      getOnPayCredentials,
    } = await import("./payment-credentials.server");
    const [current, resolved] = await Promise.all([
      getOnPayCredentialRecord(),
      getOnPayCredentials(),
    ]);
    const currentApiKey =
      typeof current.api_key_encrypted === "string" ? current.api_key_encrypted : "";
    const currentWebhookSecret =
      typeof current.webhook_secret_encrypted === "string" ? current.webhook_secret_encrypted : "";
    const apiKeyEncrypted = data.apiKey
      ? encryptPaymentCredential(data.apiKey)
      : currentApiKey || (resolved.apiKey ? encryptPaymentCredential(resolved.apiKey) : "");
    const webhookSecretEncrypted = data.webhookSecret
      ? encryptPaymentCredential(data.webhookSecret)
      : currentWebhookSecret ||
        (resolved.webhookSecret ? encryptPaymentCredential(resolved.webhookSecret) : "");
    if (!apiKeyEncrypted || !webhookSecretEncrypted)
      throw new Error("Informe a chave da API e o segredo do webhook da ONPAY.");
    const db = await admin();
    const { data: adminUser } = await db
      .from("admin_users")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    const { error } = await db.from("admin_audit_logs").insert({
      admin_user_id: adminUser?.id ?? null,
      action: "payment.onpay_credentials_update",
      entity_type: "payment_credentials",
      entity_id: null,
      details: {
        api_key_encrypted: apiKeyEncrypted,
        webhook_secret_encrypted: webhookSecretEncrypted,
        api_key_hint: data.apiKey
          ? credentialHint(data.apiKey)
          : typeof current.api_key_hint === "string"
            ? current.api_key_hint
            : null,
        webhook_secret_hint: data.webhookSecret
          ? credentialHint(data.webhookSecret)
          : typeof current.webhook_secret_hint === "string"
            ? current.webhook_secret_hint
            : null,
      } as never,
    });
    if (error) throw new Error("Não foi possível salvar as credenciais da ONPAY.");
    return { success: true };
  });
