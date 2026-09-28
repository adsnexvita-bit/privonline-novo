import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  abortR2MultipartUpload,
  completeR2MultipartUpload,
  createR2MultipartPartUrl,
  createR2MultipartUpload,
  createR2ReadUrl,
  createR2UploadUrl,
  R2_MULTIPART_PART_SIZE_BYTES,
  R2_MULTIPART_THRESHOLD_BYTES,
  R2_MAX_MULTIPART_PARTS,
  isSafeR2Key,
  r2KeyFromReference,
  r2ObjectExists,
  r2Reference,
  validateMediaUpload,
} from "@/lib/r2.server";

const extensionByType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

function safeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 120);
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_admin", { _auth_user_id: context.userId });
  if (error || !data) throw new Error("Acesso restrito a administradores.");
}

function multipartKey(key: string) {
  if (!/^(models|model-assets|category-icons|demonstrations)\//.test(key) || !isSafeR2Key(key)) {
    throw new Error("Arquivo multipart inválido.");
  }
  return key;
}

async function prepareUpload(key: string, contentType: string, size: number) {
  if (size >= R2_MULTIPART_THRESHOLD_BYTES) {
    const uploadId = await createR2MultipartUpload({ key, contentType });
    const partSize = Math.max(
      R2_MULTIPART_PART_SIZE_BYTES,
      Math.ceil(size / R2_MAX_MULTIPART_PARTS / R2_MULTIPART_PART_SIZE_BYTES) *
        R2_MULTIPART_PART_SIZE_BYTES,
    );
    return {
      strategy: "multipart" as const,
      key,
      reference: r2Reference(key),
      uploadId,
      partSize,
    };
  }
  const signed = await createR2UploadUrl({ key, contentType });
  return { strategy: "single" as const, ...signed, key, reference: r2Reference(key) };
}

export const prepareR2MediaUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { modelId?: unknown; scope?: unknown; filename?: unknown; contentType?: unknown; size?: unknown }) => ({
    modelId: String(raw?.modelId ?? "").trim(),
    scope: raw?.scope === "preview" ? "preview" : "content",
    filename: String(raw?.filename ?? "arquivo"),
    contentType: String(raw?.contentType ?? "").toLowerCase(),
    size: Number(raw?.size ?? 0),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.modelId) throw new Error("Modelo inválido.");
    const kind = validateMediaUpload({ contentType: data.contentType, size: data.size });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: model, error } = await supabaseAdmin.from("models").select("id").eq("id", data.modelId).maybeSingle();
    if (error || !model) throw new Error("Modelo não encontrado.");
    const extension = extensionByType[data.contentType] ?? "bin";
    const filename = safeName(data.filename.replace(/\.[^.]+$/, "")) || "arquivo";
    const key = `models/${data.modelId}/${data.scope === "preview" ? "previews" : "content"}/${kind}s/${crypto.randomUUID()}-${filename}.${extension}`;
    console.info("media-upload.prepare", {
      modelId: data.modelId,
      scope: data.scope,
      mediaType: kind,
      contentType: data.contentType,
      size: data.size,
      key,
    });
    return { ...(await prepareUpload(key, data.contentType, data.size)), mediaType: kind };
  });

export const confirmR2MediaUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { modelId?: unknown; scope?: unknown; reference?: unknown }) => ({
    modelId: String(raw?.modelId ?? "").trim(),
    scope: raw?.scope === "preview" ? "preview" : "content",
    reference: String(raw?.reference ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const key = r2KeyFromReference(data.reference);
    const expectedPrefix = `models/${data.modelId}/${data.scope === "preview" ? "previews" : "content"}/`;
    if (!key || !data.modelId || !key.startsWith(expectedPrefix)) throw new Error("Referência de mídia inválida.");
    if (!(await r2ObjectExists(key))) throw new Error("O arquivo não foi confirmado no armazenamento. Tente novamente.");
    console.info("media-upload.confirmed", { modelId: data.modelId, scope: data.scope, key });
    return { ok: true };
  });

/** Creates a direct R2 upload for public/admin assets that do not belong to a
 * persisted media row yet (profile covers, category icons and demonstrations). */
export const prepareR2AssetUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { asset?: unknown; filename?: unknown; contentType?: unknown; size?: unknown }) => ({
    asset: ["model-asset", "category-icon", "demonstration"].includes(String(raw?.asset))
      ? String(raw?.asset)
      : "",
    filename: String(raw?.filename ?? "arquivo"),
    contentType: String(raw?.contentType ?? "").toLowerCase(),
    size: Number(raw?.size ?? 0),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.asset) throw new Error("Tipo de ativo inválido.");
    const kind = validateMediaUpload({ contentType: data.contentType, size: data.size });
    if (data.asset === "category-icon" && kind !== "image") throw new Error("O ícone precisa ser uma imagem.");
    const extension = extensionByType[data.contentType] ?? "bin";
    const filename = safeName(data.filename.replace(/\.[^.]+$/, "")) || "arquivo";
    const group = data.asset === "model-asset" ? "model-assets" : data.asset === "category-icon" ? "category-icons" : "demonstrations";
    const key = `${group}/${kind}s/${crypto.randomUUID()}-${filename}.${extension}`;
    return { ...(await prepareUpload(key, data.contentType, data.size)), mediaType: kind };
  });

export const prepareR2MultipartPartUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { key?: unknown; uploadId?: unknown; partNumber?: unknown }) => ({
    key: String(raw?.key ?? ""),
    uploadId: String(raw?.uploadId ?? ""),
    partNumber: Number(raw?.partNumber ?? 0),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.uploadId || !Number.isInteger(data.partNumber) || data.partNumber < 1 || data.partNumber > 10_000) {
      throw new Error("Parte multipart inválida.");
    }
    return { url: await createR2MultipartPartUrl({ key: multipartKey(data.key), uploadId: data.uploadId, partNumber: data.partNumber }) };
  });

export const completeR2MultipartMediaUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { key?: unknown; uploadId?: unknown; parts?: unknown }) => ({
    key: String(raw?.key ?? ""),
    uploadId: String(raw?.uploadId ?? ""),
    parts: Array.isArray(raw?.parts)
      ? raw.parts.map((part: any) => ({ partNumber: Number(part?.partNumber), etag: String(part?.etag ?? "") })).slice(0, 10_000)
      : [],
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.uploadId || !data.parts.length || data.parts.some((part) => !Number.isInteger(part.partNumber) || !part.etag)) {
      throw new Error("Conclusão multipart inválida.");
    }
    await completeR2MultipartUpload({ key: multipartKey(data.key), uploadId: data.uploadId, parts: data.parts });
    return { ok: true };
  });

export const abortR2MultipartMediaUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { key?: unknown; uploadId?: unknown }) => ({ key: String(raw?.key ?? ""), uploadId: String(raw?.uploadId ?? "") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.uploadId) return { ok: true };
    await abortR2MultipartUpload({ key: multipartKey(data.key), uploadId: data.uploadId });
    return { ok: true };
  });

export const resolveR2MediaUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { references?: unknown }) => ({
    references: Array.isArray(raw?.references)
      ? raw.references.map((item) => String(item)).filter((item) => item.startsWith("r2://")).slice(0, 500)
      : [],
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const rows = await Promise.all(data.references.map(async (reference) => [reference, await createR2ReadUrl(reference)] as const));
    return Object.fromEntries(rows.filter((row): row is [string, string] => Boolean(row[1])));
  });
