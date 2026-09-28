import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CHECKOUT_EVENT_NAMES = ["InitiateCheckout", "AddPaymentInfo"] as const;

export const getMetaAdsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (error || !isAdmin) throw new Error("Acesso restrito a administradores.");

    const { data: testSettings } = await context.supabase
      .from("meta_ads_settings")
      .select("test_mode, test_event_code")
      .eq("id", true)
      .maybeSingle();
    const { getMetaCapiConfigurationStatus } = await import("./meta-capi.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return getMetaCapiConfigurationStatus(testSettings, supabaseAdmin);
  });

export const updateMetaAdsCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { pixelId?: string; accessToken?: string }) => {
    const pixelId = String(raw?.pixelId ?? "").trim();
    const accessToken = String(raw?.accessToken ?? "").trim().slice(0, 4096);
    if (!/^\d{5,30}$/.test(pixelId)) {
      throw new Error("Informe um ID de Pixel/Dataset válido, usando apenas números.");
    }
    return { pixelId, accessToken };
  })
  .handler(async ({ context, data }) => {
    await assertMetaAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      encryptMetaAccessToken,
      getMetaCapiCredentials,
      getMetaCredentialRecord,
    } = await import("./meta-capi-credentials.server");
    const { credentialHint } = await import("./payment-credentials.server");
    const currentRecord = await getMetaCredentialRecord(supabaseAdmin);
    const currentCredentials = await getMetaCapiCredentials(supabaseAdmin);
    const encryptedToken = data.accessToken
      ? encryptMetaAccessToken(data.accessToken)
      : typeof currentRecord.access_token_encrypted === "string"
        ? currentRecord.access_token_encrypted
        : "";
    const tokenAvailable = Boolean(encryptedToken || currentCredentials.accessToken);
    if (!tokenAvailable) throw new Error("Informe o token privado da Conversions API.");

    const { data: adminUser } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: adminUser?.id ?? null,
      action: "meta.credentials_update",
      entity_type: "meta_credentials",
      entity_id: null,
      details: {
        pixel_id: data.pixelId,
        access_token_encrypted: encryptedToken || null,
        access_token_hint: data.accessToken
          ? credentialHint(data.accessToken)
          : currentRecord.access_token_hint || currentCredentials.tokenHint,
      },
    });
    if (error) throw new Error("Não foi possível salvar as credenciais da Meta.");
    return { success: true };
  });

export const updateMetaAdsTestMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { enabled?: boolean; testEventCode?: string }) => {
    const enabled = Boolean(raw?.enabled);
    const testEventCode = String(raw?.testEventCode ?? "")
      .trim()
      .slice(0, 120);
    if (enabled && !testEventCode) {
      throw new Error("Informe o código de teste fornecido pela Meta.");
    }
    return { enabled, testEventCode };
  })
  .handler(async ({ context, data }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (error || !isAdmin) throw new Error("Acesso restrito a administradores.");

    const { error: updateError } = await context.supabase.from("meta_ads_settings").upsert(
      {
        id: true,
        test_mode: data.enabled,
        test_event_code: data.testEventCode || null,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "id" },
    );
    if (updateError) throw new Error("Não foi possível atualizar o modo de teste.");
    return { success: true };
  });

function metaAuditInput(raw: { from?: string; to?: string; orderIds?: string[] }) {
  const from = new Date(String(raw?.from ?? ""));
  const to = new Date(String(raw?.to ?? ""));
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
    throw new Error("Período de auditoria inválido.");
  }
  if (to.getTime() - from.getTime() > 31 * 86_400_000) {
    throw new Error("O período máximo é de 31 dias.");
  }
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    orderIds: Array.from(new Set((raw?.orderIds ?? []).map(String))).slice(0, 250),
  };
}

async function assertMetaAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("is_admin", { _auth_user_id: context.userId });
  if (error || !isAdmin) throw new Error("Acesso restrito a administradores.");
}

export const auditMetaPurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(metaAuditInput)
  .handler(async ({ context, data }) => {
    await assertMetaAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { reconcileMetaPurchases } = await import("./meta-reconciliation.server");
    return reconcileMetaPurchases(supabaseAdmin, { dryRun: true, from: data.from, to: data.to, limit: 250 });
  });

export const resendMetaPurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(metaAuditInput)
  .handler(async ({ context, data }) => {
    await assertMetaAdmin(context);
    if (!data.orderIds.length) throw new Error("Nenhum evento elegível selecionado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { reconcileMetaPurchases } = await import("./meta-reconciliation.server");
    return reconcileMetaPurchases(supabaseAdmin, { dryRun: false, from: data.from, to: data.to, orderIds: data.orderIds, limit: 250 });
  });

export const trackMetaCheckoutEvent = createServerFn({ method: "POST" })
  .inputValidator(
    (raw: {
      eventName?: string;
      eventId?: string;
      value?: number;
      externalId?: string;
      attribution?: Record<string, unknown>;
    }) => {
      const eventName = String(raw?.eventName ?? "");
      if (!CHECKOUT_EVENT_NAMES.includes(eventName as (typeof CHECKOUT_EVENT_NAMES)[number])) {
        throw new Error("Evento inválido.");
      }
      const eventId = String(raw?.eventId ?? "")
        .trim()
        .slice(0, 160);
      const externalId = String(raw?.externalId ?? "")
        .trim()
        .slice(0, 160);
      const value = Number(raw?.value ?? 0);
      if (!eventId || !externalId || !Number.isFinite(value) || value <= 0) {
        throw new Error("Dados do evento inválidos.");
      }
      const attributionKeys = ["fbc", "fbp"] as const;
      const attribution = Object.fromEntries(
        attributionKeys.flatMap((key) => {
          const attributionValue = String(raw?.attribution?.[key] ?? "")
            .trim()
            .slice(0, 500);
          return attributionValue ? [[key, attributionValue]] : [];
        }),
      );
      return {
        eventName: eventName as (typeof CHECKOUT_EVENT_NAMES)[number],
        eventId,
        value,
        externalId,
        attribution,
      };
    },
  )
  .handler(async ({ data }) => {
    const { sendMetaCheckoutEvent } = await import("./meta-capi.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return sendMetaCheckoutEvent({ ...data, supabaseAdmin });
  });
