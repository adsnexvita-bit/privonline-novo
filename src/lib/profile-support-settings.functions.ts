import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROFILE_SUPPORT_ACTION = "profile_support.settings_update";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function readProfileSupportEnabled(details: unknown): boolean {
  if (!details || typeof details !== "object" || Array.isArray(details)) return true;
  const enabled = (details as Record<string, unknown>).enabled;
  return typeof enabled === "boolean" ? enabled : true;
}

async function loadProfileSupportEnabled(): Promise<boolean> {
  const db = await admin();
  const { data, error } = await db
    .from("admin_audit_logs")
    .select("details")
    .eq("action", PROFILE_SUPPORT_ACTION)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Could not load profile support settings", { code: error.code });
    return false;
  }
  return readProfileSupportEnabled(data?.details);
}

export const getPublicProfileSupportSettings = createServerFn({ method: "GET" }).handler(
  async () => ({ enabled: await loadProfileSupportEnabled() }),
);

export const getAdminProfileSupportSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (error || !isAdmin) throw new Error("Acesso restrito a administradores.");
    return { enabled: await loadProfileSupportEnabled() };
  });

export const updateProfileSupportSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { enabled?: boolean }) => ({ enabled: raw?.enabled === true }))
  .handler(async ({ context, data }) => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (adminError || !isAdmin) throw new Error("Acesso restrito a administradores.");

    const db = await admin();
    const { data: adminUser } = await db
      .from("admin_users")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    const { error } = await db.from("admin_audit_logs").insert({
      admin_user_id: adminUser?.id ?? null,
      action: PROFILE_SUPPORT_ACTION,
      entity_type: "profile_support_settings",
      entity_id: null,
      details: { enabled: data.enabled },
    });
    if (error) throw new Error("Não foi possível atualizar a seção de suporte.");
    return { enabled: data.enabled };
  });
