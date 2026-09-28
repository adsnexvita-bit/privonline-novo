import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createR2ReadUrl } from "@/lib/r2.server";

export type ModelTestimonial = {
  id: string;
  imagePath: string;
  imageUrl: string;
  displayOrder: number;
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_admin", {
    _auth_user_id: context.userId,
  });
  if (error || !data) throw new Error("Acesso restrito a administradores.");
}

async function resolveRows(
  rows: Array<{ id: string; image_path: string; display_order: number }>,
): Promise<ModelTestimonial[]> {
  const resolved = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      imagePath: row.image_path,
      imageUrl: await createR2ReadUrl(row.image_path),
      displayOrder: row.display_order,
    })),
  );
  return resolved.filter((row): row is ModelTestimonial => Boolean(row.imageUrl));
}

export const listPublicModelTestimonials = createServerFn({ method: "POST" })
  .inputValidator((raw: { modelId?: unknown }) => ({
    modelId: String(raw?.modelId ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    if (!data.modelId) return [] as ModelTestimonial[];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: model } = await supabaseAdmin
      .from("models")
      .select("id")
      .eq("id", data.modelId)
      .eq("is_active", true)
      .maybeSingle();
    if (!model) return [] as ModelTestimonial[];
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("model_testimonials")
      .select("id,image_path,display_order")
      .eq("model_id", data.modelId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error("Não foi possível carregar os depoimentos.");
    return resolveRows(rows ?? []);
  });

export const listModelTestimonialsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { modelId?: unknown }) => ({
    modelId: String(raw?.modelId ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("model_testimonials")
      .select("id,image_path,display_order")
      .eq("model_id", data.modelId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error("Não foi possível carregar os depoimentos.");
    return resolveRows(rows ?? []);
  });

export const addModelTestimonialAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { modelId?: unknown; imagePath?: unknown }) => ({
    modelId: String(raw?.modelId ?? "").trim(),
    imagePath: String(raw?.imagePath ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.modelId || !data.imagePath.startsWith("r2://model-assets/images/")) {
      throw new Error("Imagem de depoimento inválida.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: last } = await (supabaseAdmin as any)
      .from("model_testimonials")
      .select("display_order")
      .eq("model_id", data.modelId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await (supabaseAdmin as any).from("model_testimonials").insert({
      model_id: data.modelId,
      image_path: data.imagePath,
      display_order: Number(last?.display_order ?? -1) + 1,
    });
    if (error) throw new Error("Não foi possível adicionar o depoimento.");
    return { ok: true };
  });

export const deleteModelTestimonialAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { modelId?: unknown; id?: unknown }) => ({
    modelId: String(raw?.modelId ?? "").trim(),
    id: String(raw?.id ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("model_testimonials")
      .delete()
      .eq("id", data.id)
      .eq("model_id", data.modelId);
    if (error) throw new Error("Não foi possível remover o depoimento.");
    return { ok: true };
  });

export const reorderModelTestimonialsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { modelId?: unknown; ids?: unknown }) => ({
    modelId: String(raw?.modelId ?? "").trim(),
    ids: Array.isArray(raw?.ids) ? raw.ids.map(String).slice(0, 100) : [],
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const [displayOrder, id] of data.ids.entries()) {
      const { error } = await (supabaseAdmin as any)
        .from("model_testimonials")
        .update({ display_order: displayOrder })
        .eq("id", id)
        .eq("model_id", data.modelId);
      if (error) throw new Error("Não foi possível ordenar os depoimentos.");
    }
    return { ok: true };
  });
