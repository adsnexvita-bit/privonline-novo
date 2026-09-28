import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isR2Reference, removeR2Reference } from "@/lib/r2.server";
import { createPasswordCustomer, findCustomerByPhone } from "@/lib/customer-identity.server";
import { validateFourDigitPassword } from "@/lib/customer-password.server";
import { normalizeBrazilPhone } from "@/lib/phone";
import { grantManualPlanAccesses, type ManualAccessSelection } from "@/lib/manual-access.server";

function storageLocation(path: string | null | undefined): { bucket: string; key: string } | null {
  if (!path || /^(https?:|data:|blob:)/i.test(path)) return null;
  const [bucket, ...parts] = path.split("/");
  if (!bucket || parts.length === 0) return null;
  return { bucket, key: parts.join("/") };
}

function collectStoragePath(
  pathsByBucket: Map<string, Set<string>>,
  path: string | null | undefined,
) {
  const location = storageLocation(path);
  if (!location) return;
  const paths = pathsByBucket.get(location.bucket) ?? new Set<string>();
  paths.add(location.key);
  pathsByBucket.set(location.bucket, paths);
}

async function removeStoragePaths(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  pathsByBucket: Map<string, Set<string>>,
) {
  // Legacy Supabase objects are intentionally retained as a migration fallback.
  // R2 objects are removed separately only after their database record is gone.
  void supabaseAdmin;
  void pathsByBucket;
}

async function removeR2Paths(paths: Iterable<string>) {
  await Promise.all([...paths].filter(isR2Reference).map((path) => removeR2Reference(path)));
}

/** Creates an admin user (auth + admin_users) — callable only by existing admins. */
export const createAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; name: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (createErr) throw createErr;

    const { error: insertErr } = await supabaseAdmin.from("admin_users").insert({
      auth_user_id: created.user!.id,
      email: data.email,
      name: data.name,
      is_active: true,
    });
    if (insertErr) throw insertErr;

    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: null,
      action: "admin.create",
      entity_type: "admin_user",
      entity_id: created.user!.id,
      details: { email: data.email, by: context.userId },
    });

    return { ok: true };
  });

/** Deletes an admin_users row (does not delete the auth user). */
export const deleteAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { error } = await context.supabase.from("admin_users").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Permanently deletes selected creator profiles and their purchase/access links.
 * Kept on the server so bulk deletion does not depend on a browser-side RLS
 * policy or on a database RPC being present in the schema cache. */
export const deleteModelsAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { ids?: unknown }) => {
    const ids = Array.isArray(raw?.ids)
      ? raw.ids.map((id) => String(id).trim()).filter(Boolean)
      : [];
    if (!ids.length) throw new Error("Selecione ao menos um perfil.");
    return { ids: [...new Set(ids)].slice(0, 100) };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: found, error: foundError } = await supabaseAdmin
      .from("models")
      .select("id,profile_image_path,cover_image_path,profile_cover_image_path")
      .in("id", data.ids);
    if (foundError) throw foundError;
    const ids = (found ?? []).map((model) => model.id);
    if (!ids.length) throw new Error("Os perfis selecionados não foram encontrados.");

    const [{ data: media, error: mediaError }, { data: previews, error: previewsError }] =
      await Promise.all([
        supabaseAdmin.from("model_media").select("file_path,preview_path").in("model_id", ids),
        supabaseAdmin.from("model_previews").select("file_path").in("model_id", ids),
      ]);
    if (mediaError) throw mediaError;
    if (previewsError) throw previewsError;

    const pathsByBucket = new Map<string, Set<string>>();
    const r2Paths = new Set<string>();
    for (const model of found ?? []) {
      collectStoragePath(pathsByBucket, model.profile_image_path);
      collectStoragePath(pathsByBucket, model.cover_image_path);
      collectStoragePath(pathsByBucket, model.profile_cover_image_path);
      [model.profile_image_path, model.cover_image_path, model.profile_cover_image_path]
        .filter(isR2Reference)
        .forEach((path) => r2Paths.add(path));
    }
    for (const item of media ?? []) {
      collectStoragePath(pathsByBucket, item.file_path);
      collectStoragePath(pathsByBucket, item.preview_path);
      [item.file_path, item.preview_path]
        .filter(isR2Reference)
        .forEach((path) => r2Paths.add(path));
    }
    for (const item of previews ?? []) {
      collectStoragePath(pathsByBucket, item.file_path);
      if (isR2Reference(item.file_path)) r2Paths.add(item.file_path);
    }

    const { error: accessError } = await supabaseAdmin
      .from("customer_access")
      .delete()
      .in("model_id", ids);
    if (accessError) throw accessError;
    const { error: orderError } = await supabaseAdmin
      .from("order_items")
      .delete()
      .in("model_id", ids);
    if (orderError) throw orderError;
    const { error: categoryError } = await supabaseAdmin
      .from("category_models")
      .delete()
      .in("model_id", ids);
    if (categoryError) throw categoryError;
    const { error: planError } = await supabaseAdmin
      .from("plan_models")
      .delete()
      .in("model_id", ids);
    if (planError) throw planError;
    const { error: deleteError } = await supabaseAdmin.from("models").delete().in("id", ids);
    if (deleteError) throw deleteError;

    await removeStoragePaths(supabaseAdmin, pathsByBucket);
    await removeR2Paths(r2Paths);
    return { deletedIds: ids };
  });

/** Permanently deletes selected private gallery media and their storage files. */
export const deleteModelMediaAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { ids?: unknown }) => {
    const ids = Array.isArray(raw?.ids)
      ? raw.ids.map((id) => String(id).trim()).filter(Boolean)
      : [];
    if (!ids.length) throw new Error("Selecione ao menos um conteúdo.");
    return { ids: [...new Set(ids)].slice(0, 200) };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: media, error: findError } = await supabaseAdmin
      .from("model_media")
      .select("id,file_path,preview_path")
      .in("id", data.ids);
    if (findError) throw findError;
    if (!media?.length) throw new Error("Os conteúdos selecionados não foram encontrados.");

    const ids = media.map((item) => item.id);
    const pathsByBucket = new Map<string, Set<string>>();
    const r2Paths = new Set<string>();
    for (const item of media) {
      collectStoragePath(pathsByBucket, item.file_path);
      collectStoragePath(pathsByBucket, item.preview_path);
      [item.file_path, item.preview_path]
        .filter(isR2Reference)
        .forEach((path) => r2Paths.add(path));
    }

    const { error: deleteError } = await supabaseAdmin.from("model_media").delete().in("id", ids);
    if (deleteError) throw deleteError;

    await removeStoragePaths(supabaseAdmin, pathsByBucket);
    await removeR2Paths(r2Paths);
    return { deletedIds: ids };
  });

/** Persists the manual order of private gallery items using the privileged
 * server client, so the result never depends on a browser-side RLS policy. */
export const reorderModelMediaAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { orders?: unknown }) => {
    const orders = Array.isArray(raw?.orders)
      ? raw.orders
          .map((item) => ({
            id: String((item as { id?: unknown })?.id ?? "").trim(),
            displayOrder: Math.max(
              0,
              Math.floor(Number((item as { displayOrder?: unknown })?.displayOrder) || 0),
            ),
          }))
          .filter((item) => item.id)
      : [];
    if (!orders.length) throw new Error("Nenhum conteúdo para reordenar.");
    return { orders: orders.slice(0, 500) };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results = await Promise.all(
      data.orders.map((item) =>
        supabaseAdmin
          .from("model_media")
          .update({ display_order: item.displayOrder })
          .eq("id", item.id)
          .select("id")
          .maybeSingle(),
      ),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
    return { ok: true };
  });

/** Returns the customer directory through the privileged server client. This
 * keeps the admin list reliable even when browser-side RLS policies change. */
export function toSafeCustomerDirectoryEntry<
  T extends { password_hash?: string | null; password_salt?: string | null },
>(customer: T) {
  const { password_hash, password_salt, ...safeCustomer } = customer;
  return {
    ...safeCustomer,
    hasAccessPassword: Boolean(password_hash && password_salt),
  };
}

export const listCustomersAsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [customersResult, ordersResult, modelsResult, planModelsResult] = await Promise.all([
      supabaseAdmin
        .from("customers")
        .select("id,cpf,name,email,phone,is_active,created_at,password_hash,password_salt")
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin.from("orders").select("customer_id").limit(2000),
      supabaseAdmin.from("models").select("id,name,username").eq("is_active", true).order("name"),
      supabaseAdmin
        .from("plan_models")
        .select("model_id,plan_id,plans(id,name,duration_days,access_type,is_active,price)"),
    ]);
    if (customersResult.error) throw customersResult.error;
    if (ordersResult.error) throw ordersResult.error;
    if (modelsResult.error) throw modelsResult.error;
    if (planModelsResult.error) throw planModelsResult.error;

    const plansByModel = new Map<string, Array<Record<string, unknown>>>();
    for (const assignment of planModelsResult.data ?? []) {
      const plan = assignment.plans as unknown as Record<string, unknown> | null;
      if (!plan?.is_active) continue;
      const plans = plansByModel.get(assignment.model_id) ?? [];
      plans.push({
        id: assignment.plan_id,
        name: plan.name,
        durationDays: plan.duration_days,
        accessType: plan.access_type,
        price: plan.price,
      });
      plansByModel.set(assignment.model_id, plans);
    }

    return {
      customers: (customersResult.data ?? []).map(toSafeCustomerDirectoryEntry),
      buyerIds: [...new Set((ordersResult.data ?? []).map((order) => order.customer_id))],
      models: (modelsResult.data ?? []).map((model) => ({
        ...model,
        plans: (plansByModel.get(model.id) ?? []).sort((left, right) => {
          const leftDays =
            left.durationDays == null ? Number.POSITIVE_INFINITY : Number(left.durationDays);
          const rightDays =
            right.durationDays == null ? Number.POSITIVE_INFINITY : Number(right.durationDays);
          return (
            leftDays - rightDays || String(left.name).localeCompare(String(right.name), "pt-BR")
          );
        }),
      })),
    };
  });

type AdminContext = { supabase: SupabaseClient<Database>; userId: string };

function parseManualAccessSelections(value: unknown): ManualAccessSelection[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const access = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      modelId: String(access.modelId ?? ""),
      planId: String(access.planId ?? ""),
    };
  });
}

async function requireAdmin(context: AdminContext) {
  const { data, error } = await context.supabase.rpc("is_admin", { _auth_user_id: context.userId });
  if (error) throw error;
  if (!data) throw new Error("Acesso restrito a administradores.");
}

export const registerCustomerAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (raw: { name?: unknown; phone?: unknown; password?: unknown; accesses?: unknown }) => {
      const name = String(raw?.name ?? "")
        .trim()
        .replace(/\s+/g, " ");
      const phone = normalizeBrazilPhone(String(raw?.phone ?? ""));
      const password = validateFourDigitPassword(String(raw?.password ?? ""));
      const accesses = parseManualAccessSelections(raw?.accesses);
      const modelIds = accesses.map((access) => access.modelId);
      if (name.length < 2 || name.length > 100) throw new Error("Informe o nome do cliente.");
      if (!phone) throw new Error("Informe um telefone válido com DDD.");
      if (!accesses.length) throw new Error("Selecione ao menos uma modelo.");
      if (accesses.some((access) => !access.modelId || !access.planId))
        throw new Error("Escolha um plano para cada modelo selecionada.");
      if (new Set(modelIds).size !== accesses.length)
        throw new Error("Cada modelo pode aparecer apenas uma vez.");
      return { name, phone, password, accesses, modelIds };
    },
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: models, error: modelError } = await db
      .from("models")
      .select("id")
      .in("id", data.modelIds)
      .eq("is_active", true);
    if (modelError) throw modelError;
    if ((models ?? []).length !== data.modelIds.length)
      throw new Error("Uma das modelos selecionadas não está ativa.");

    const existing = await findCustomerByPhone(db, data.phone);
    const customer =
      existing ?? (await createPasswordCustomer(db, { ...data, allowExisting: true }));
    if (existing) {
      const { data: credentials, error: credentialError } = await db
        .from("customers")
        .select("password_hash,password_salt")
        .eq("id", customer.id)
        .single();
      if (credentialError) throw credentialError;
      // Existing customers keep their established password. Accounts created
      // by checkout without credentials receive the four-digit password now.
      if (!credentials?.password_hash || !credentials.password_salt) {
        const { createPasswordCredentials } = await import("@/lib/customer-password.server");
        const password = await createPasswordCredentials(data.password);
        const { error } = await db
          .from("customers")
          .update({
            password_hash: password.passwordHash,
            password_salt: password.passwordSalt,
            password_created_at: new Date().toISOString(),
          })
          .eq("id", customer.id);
        if (error) throw error;
      }
    }
    if (!customer.is_active) {
      const { error } = await db
        .from("customers")
        .update({ is_active: true })
        .eq("id", customer.id);
      if (error) throw error;
    }
    const granted = await grantManualPlanAccesses(db, customer.id, data.accesses);
    await db.from("admin_audit_logs").insert({
      admin_user_id: null,
      action: existing ? "customer.manual_access" : "customer.manual_create",
      entity_type: "customer",
      entity_id: customer.id,
      details: { by: context.userId, accesses: data.accesses, granted },
    });
    return { customerId: customer.id, created: !existing, granted };
  });

export const grantCustomerAccessAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { customerId?: unknown; accesses?: unknown }) => ({
    customerId: String(raw?.customerId ?? ""),
    accesses: parseManualAccessSelections(raw?.accesses),
  }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    if (
      !data.customerId ||
      !data.accesses.length ||
      data.accesses.some((access) => !access.modelId || !access.planId)
    )
      throw new Error("Cliente, modelo ou plano inválido.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return { granted: await grantManualPlanAccesses(db, data.customerId, data.accesses) };
  });

/** Resets an administrator password through the privileged server client. */
export const updateAdminPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { id: string; password: string }) => {
    const id = String(raw?.id ?? "").trim();
    const password = String(raw?.password ?? "");
    if (!id) throw new Error("Administrador inválido.");
    if (password.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
    if (password.length > 72) throw new Error("A senha deve ter no máximo 72 caracteres.");
    return { id, password };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: target, error: targetErr }, { data: actor, error: actorErr }] =
      await Promise.all([
        supabaseAdmin
          .from("admin_users")
          .select("id, auth_user_id, email")
          .eq("id", data.id)
          .maybeSingle(),
        supabaseAdmin
          .from("admin_users")
          .select("id")
          .eq("auth_user_id", context.userId)
          .eq("is_active", true)
          .maybeSingle(),
      ]);

    if (targetErr) throw targetErr;
    if (actorErr) throw actorErr;
    if (!target) throw new Error("Administrador não encontrado.");
    if (!actor) throw new Error("Sua conta administrativa não está ativa.");

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      target.auth_user_id,
      { password: data.password },
    );
    if (updateErr) throw updateErr;

    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: actor.id,
      action: "admin.password_update",
      entity_type: "admin_user",
      entity_id: target.id,
      details: { email: target.email, by: context.userId },
    });

    return { ok: true };
  });
