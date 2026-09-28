import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const tokenPattern = /^[A-Za-z0-9_-]{16}$/;

export const getAdminModelCampaignLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { modelId: string }) => {
    const modelId = String(raw?.modelId ?? "").trim();
    if (!modelId) throw new Error("Modelo inválida.");
    return { modelId };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (adminError) throw adminError;
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: model, error } = await supabaseAdmin
      .from("models")
      .select("id")
      .eq("id", data.modelId)
      .maybeSingle();
    if (error) throw error;
    if (!model) throw new Error("Modelo não encontrada.");

    const { campaignLinksForModel } = await import("./campaign-links.server");
    return campaignLinksForModel(model.id);
  });

export const resolvePublicCampaignLink = createServerFn({ method: "GET" })
  .inputValidator((raw: { token: string }) => {
    const token = String(raw?.token ?? "").trim();
    if (!tokenPattern.test(token)) throw new Error("Link de campanha inválido.");
    return { token };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: models, error } = await supabaseAdmin
      .from("models")
      .select("id,username")
      .eq("is_active", true);
    if (error) throw error;

    const { resolveCampaignToken } = await import("./campaign-links.server");
    return resolveCampaignToken(data.token, models ?? []);
  });
