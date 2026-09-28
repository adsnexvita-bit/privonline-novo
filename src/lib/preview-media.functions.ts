import { createServerFn } from "@tanstack/react-start";
import type { PublicMedia } from "@/lib/models";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createR2ReadUrl, isR2Reference, removeR2Reference } from "@/lib/r2.server";

const PREVIEW_URL_TTL_SECONDS = 60 * 60;

function storageLocation(path: string): { bucket: string; key: string } | null {
  if (!path || /^(https?:|data:|blob:)/i.test(path)) return null;
  const [bucket, ...parts] = path.split("/");
  if (!bucket || parts.length === 0) return null;
  return { bucket, key: parts.join("/") };
}

export const listModelPreviewMedia = createServerFn({ method: "POST" })
  .inputValidator((data: { modelId: string }) => ({
    modelId: String(data?.modelId ?? ""),
  }))
  .handler(async ({ data }): Promise<PublicMedia[]> => {
    if (!data.modelId) return [];

    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.famaflix_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_famaflix_SUPABASE_URL;
    const supabasePublishableKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.famaflix_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_famaflix_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_famaflix_SUPABASE_ANON_KEY;
    const hasPrivateServerKey = Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.famaflix_SUPABASE_SECRET_KEY ||
      process.env.famaflix_SUPABASE_SERVICE_ROLE_KEY,
    );

    if (!supabaseUrl || !supabasePublishableKey) {
      throw new Error("Não foi possível carregar a galeria.");
    }

    // Production uses the private server client only to read metadata and sign
    // separate preview derivatives. Original private files are never signed or
    // returned before access is confirmed. Local preview can safely fall back
    // to the public client and RLS.
    const supabasePublic = hasPrivateServerKey
      ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
      : (await import("@supabase/supabase-js")).createClient(supabaseUrl, supabasePublishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

    const { data: model } = await supabasePublic
      .from("models")
      .select("id")
      .eq("id", data.modelId)
      .eq("is_active", true)
      .maybeSingle();
    if (!model) return [];

    const { data: rows, error } = await supabasePublic
      .from("model_previews")
      .select("id,media_type,file_path,title,display_order,like_count,comment_count")
      .eq("model_id", data.modelId)
      .order("display_order", { ascending: true });
    if (error) throw new Error("Não foi possível carregar a galeria.");

    // The admin uploads already-edited previews. The server only signs those
    // lightweight files and never exposes the private gallery originals.
    const paths = new Set<string>();
    for (const row of rows ?? []) {
      if (row.file_path) paths.add(String(row.file_path));
    }

    const urlByPath = new Map<string, string>();
    const pathsByBucket = new Map<string, Array<{ path: string; key: string }>>();
    for (const path of paths) {
      if (isR2Reference(path)) {
        const signed = await createR2ReadUrl(path, PREVIEW_URL_TTL_SECONDS);
        if (signed) urlByPath.set(path, signed);
        continue;
      }
      const location = storageLocation(path);
      if (!location) {
        urlByPath.set(path, path);
        continue;
      }
      const entries = pathsByBucket.get(location.bucket) ?? [];
      entries.push({ path, key: location.key });
      pathsByBucket.set(location.bucket, entries);
    }

    await Promise.all(
      [...pathsByBucket.entries()].map(async ([bucket, entries]) => {
        const { data: signedRows, error: signedError } = await supabasePublic.storage
          .from(bucket)
          .createSignedUrls(
            entries.map((entry) => entry.key),
            PREVIEW_URL_TTL_SECONDS,
          );
        if (signedError) return;
        signedRows?.forEach((signed, index) => {
          const source = entries[index];
          if (source && signed.signedUrl) urlByPath.set(source.path, signed.signedUrl);
        });
      }),
    );

    const resolveUrl = (path: string | null): string | null =>
      path ? (urlByPath.get(path) ?? null) : null;

    const resolved = (rows ?? []).map((row) => {
      const fileUrl = resolveUrl(row.file_path as string);
      if (!fileUrl) return null;
      return {
        id: row.id as string,
        media_type: row.media_type as "image" | "video",
        file_path: row.file_path as string,
        preview_path: null,
        file_url: fileUrl,
        preview_url: null,
        title: row.title as string | null,
        description: null,
        is_free_preview: true,
        display_order: row.display_order as number,
        like_count: row.like_count as number,
        comment_count: row.comment_count as number,
      } satisfies PublicMedia;
    });

    return resolved.filter((item): item is PublicMedia => item !== null);
  });

/** Removes preview records and their private files through the authenticated
 * admin server path. This avoids a failed RLS/storage cleanup leaving the
 * selection UI out of sync with the database. */
export const deleteModelPreviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { ids?: unknown }) => {
    const ids = Array.isArray(raw?.ids)
      ? raw.ids.map((id) => String(id).trim()).filter(Boolean)
      : [];
    if (!ids.length) throw new Error("Selecione ao menos uma prévia.");
    return { ids: [...new Set(ids)].slice(0, 100) };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (roleError) throw roleError;
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: previews, error: findError } = await supabaseAdmin
      .from("model_previews")
      .select("id,file_path")
      .in("id", data.ids);
    if (findError) throw findError;
    if (!previews?.length) throw new Error("As prévias selecionadas não foram encontradas.");

    const { error: deleteError } = await supabaseAdmin
      .from("model_previews")
      .delete()
      .in(
        "id",
        previews.map((preview) => preview.id),
      );
    if (deleteError) throw deleteError;

    const r2References: string[] = [];
    for (const preview of previews) {
      if (isR2Reference(String(preview.file_path ?? ""))) {
        r2References.push(String(preview.file_path));
        continue;
      }
    }
    // Supabase files remain intact during the R2 transition as a fallback.
    await Promise.all(r2References.map((reference) => removeR2Reference(reference)));

    return { deletedIds: previews.map((preview) => preview.id) };
  });

/** Updates preview metadata through the authenticated admin server path. */
export const updateModelPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (raw: { id?: unknown; title?: unknown; likeCount?: unknown; commentCount?: unknown; filePath?: unknown }) => {
      const id = String(raw?.id ?? "").trim();
      if (!id) throw new Error("Prévia inválida.");
      const toCount = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
      const rawTitle = typeof raw?.title === "string" ? raw.title.trim() : "";
      return {
        id,
        title: rawTitle.slice(0, 180) || null,
        likeCount: toCount(raw?.likeCount),
        commentCount: toCount(raw?.commentCount),
        filePath: typeof raw?.filePath === "string" && raw.filePath.startsWith("r2://") ? raw.filePath : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (roleError) throw roleError;
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: preview, error } = await supabaseAdmin
      .from("model_previews")
      .update({
        title: data.title,
        like_count: data.likeCount,
        comment_count: data.commentCount,
        ...(data.filePath ? { file_path: data.filePath } : {}),
      })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!preview) throw new Error("Prévia não encontrada.");
    return { ok: true };
  });

/** Reorders manually uploaded preview media. */
export const updateModelPreviewOrder = createServerFn({ method: "POST" })
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
    if (!orders.length) throw new Error("Nenhuma prévia para reordenar.");
    return { orders: orders.slice(0, 500) };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (roleError) throw roleError;
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results = await Promise.all(
      data.orders.map((item) =>
        supabaseAdmin
          .from("model_previews")
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
