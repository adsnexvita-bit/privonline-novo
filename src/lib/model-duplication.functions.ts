import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { copyR2Reference, isR2Reference, r2KeyFromReference, removeR2Reference } from "@/lib/r2.server";

export const duplicateModelAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { id: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(raw?.id ?? "")) throw new Error("Perfil inválido.");
    return { id: raw.id };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin", { _auth_user_id: context.userId });
    if (roleError) throw roleError;
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Tables added after generated database types use the same privileged client.
    const db = supabaseAdmin as any;
    const { data: source, error: sourceError } = await db.from("models").select("*").eq("id", data.id).single();
    if (sourceError) throw sourceError;
    const children = await Promise.all(["model_media", "model_previews", "model_testimonials", "creator_posts"].map(async table => {
      const { data: rows, error } = await db.from(table).select("*").eq(table === "creator_posts" ? "creator_id" : "model_id", data.id);
      if (error) throw error;
      return rows as Array<Record<string, unknown>>;
    }));
    const posts = children[3];
    let postMedia: Array<Record<string, unknown>> = [];
    if (posts.length) {
      const { data: rows, error } = await db.from("creator_post_media").select("*").in("post_id", posts.map(post => post.id));
      if (error) throw error;
      postMedia = rows;
    }
    const references = new Set<string>();
    for (const row of [source, ...children.flat(), ...postMedia]) {
      for (const [field, value] of Object.entries(row)) {
        if (typeof value === "string" && /_(path|key)$/.test(field) && value && !/^(https?:|data:|blob:)/i.test(value)) references.add(value);
      }
    }
    const id = crypto.randomUUID();
    const files: Record<string, string> = {};
    const legacyCopies: Array<{ bucket: string; key: string }> = [];
    try {
      // Sequential copying bounds memory and makes failure cleanup deterministic.
      for (const reference of references) {
        if (isR2Reference(reference)) {
          const sourceKey = r2KeyFromReference(reference);
          if (!sourceKey) throw new Error("Referência de mídia inválida.");
          const slash = sourceKey.lastIndexOf("/");
          const directory = sourceKey.slice(0, slash).replace(`models/${data.id}/`, `models/${id}/`);
          const destination = `${directory}/${crypto.randomUUID()}-${sourceKey.slice(slash + 1)}`;
          files[reference] = await copyR2Reference(reference, destination);
        } else {
          const [bucket, ...parts] = reference.split("/");
          const key = parts.join("/");
          if (!bucket || !key) throw new Error("Referência de mídia inválida.");
          const { data: blob, error: readError } = await supabaseAdmin.storage.from(bucket).download(key);
          if (readError) throw readError;
          const destination = `${id}/${crypto.randomUUID()}-${parts.at(-1)}`;
          const { error: writeError } = await supabaseAdmin.storage.from(bucket).upload(destination, blob, { contentType: blob.type || "application/octet-stream" });
          if (writeError) throw writeError;
          legacyCopies.push({ bucket, key: destination });
          files[reference] = `${bucket}/${destination}`;
        }
      }
      const { error } = await db.rpc("duplicate_model_profile", { _source: data.id, _target: id, _files: files });
      if (error) throw error;
    } catch (error) {
      // A lost RPC response can occur after commit. Preserve the completed copy.
      const { data: committed, error: lookupError } = await db.from("models").select("id").eq("id", id).maybeSingle();
      if (committed) return { id };
      if (lookupError) throw error;
      await Promise.allSettled([
        ...Object.values(files).filter(isR2Reference).map(removeR2Reference),
        ...legacyCopies.map(({ bucket, key }) => supabaseAdmin.storage.from(bucket).remove([key])),
      ]);
      throw error;
    }
    return { id };
  });
