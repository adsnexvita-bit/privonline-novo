import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckSquare,
  FileImage,
  FileVideo,
  GripVertical,
  Heart,
  Loader2,
  Pencil,
  Square,
  Trash2,
  UploadCloud,
  ArrowLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/admin-helpers";
import { deleteModelMediaAsAdmin, reorderModelMediaAsAdmin } from "@/lib/admin.functions";
import { abortR2MultipartMediaUpload, completeR2MultipartMediaUpload, prepareR2MediaUpload, prepareR2MultipartPartUpload, resolveR2MediaUrls } from "@/lib/media-storage.functions";
import { uploadFileToR2 } from "@/lib/r2-upload";
import type { AdminIdentity } from "./AdminLayout";
import { useConfirmDialog } from "./ConfirmDialog";
import { BulkUploadDialog } from "./BulkUploadDialog";

type Media = {
  id: string;
  model_id: string;
  media_type: "image" | "video";
  file_path: string;
  preview_path: string | null;
  title: string | null;
  description: string | null;
  is_free_preview: boolean;
  display_order: number;
  like_count: number;
  comment_count: number;
};

const ACCEPTED =
  "image/jpeg,image/jpg,image/png,image/webp,image/gif,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm";
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
};
const ACCEPTED_SET = new Set(Object.values(MIME_BY_EXTENSION));

function resolvedMimeType(file: File): string | null {
  if (ACCEPTED_SET.has(file.type)) return file.type;
  return MIME_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

function normalizedFileName(name: string) {
  return name
    .trim()
    .normalize("NFC")
    .replace(/[\s_]+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function storedFileName(path: string) {
  const storedName = path.split("/").pop() ?? "";
  return storedName.replace(/^\d+-/, "");
}

function storageFileName(name: string) {
  const sanitized = name
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "arquivo";
}

function mediaTitle(item: Media) {
  return item.title || storedFileName(item.file_path) || "Sem título";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error ?? "");
}

function isTransientUploadError(error: unknown) {
  const message = errorMessage(error);
  const status =
    error && typeof error === "object" && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 0;
  return (
    [408, 425, 429, 500, 502, 503, 504, 520, 522, 524].includes(status) ||
    /(?:http\s*)?(?:408|425|429|500|502|503|504|520|522|524)|timeout|timed out|network|fetch failed|load failed/i.test(
      message,
    )
  );
}

async function withUploadRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientUploadError(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) =>
        window.setTimeout(resolve, 800 * 2 ** attempt + Math.round(Math.random() * 250)),
      );
    }
  }
  throw lastError;
}

function uploadErrorMessage(error: unknown) {
  if (!error) return "erro desconhecido";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "erro desconhecido";
}

function summarizedNames(names: string[]) {
  const visible = names.slice(0, 5).join(", ");
  return names.length > 5 ? `${visible} e mais ${names.length - 5}` : visible;
}

function uniqueStorageKey(modelSlug: string, fileName: string) {
  const token =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `content/${modelSlug}/${Date.now()}-${token}-${storageFileName(fileName)}`;
}

async function resolveAdminMediaUrl(path: string | null) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || path.startsWith("blob:") || path.startsWith("data:")) {
    return path;
  }
  const [bucket, ...parts] = path.split("/");
  if (!bucket || !parts.length) return "";
  const key = parts.join("/");
  if (bucket === "model-private-media") {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(key, 60 * 60);
    return data?.signedUrl ?? "";
  }
  return supabase.storage.from(bucket).getPublicUrl(key).data.publicUrl;
}

export function ModelContentManager({
  model,
  identity,
}: {
  model: { id: string; name: string; slug: string };
  identity: AdminIdentity;
}) {
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [editing, setEditing] = useState<Media | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [uploadNotice, setUploadNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const deleteMediaOnServer = useServerFn(deleteModelMediaAsAdmin);
  const reorderMediaOnServer = useServerFn(reorderModelMediaAsAdmin);
  const prepareUploadOnServer = useServerFn(prepareR2MediaUpload);
  const prepareMultipartPartOnServer = useServerFn(prepareR2MultipartPartUpload);
  const completeMultipartOnServer = useServerFn(completeR2MultipartMediaUpload);
  const abortMultipartOnServer = useServerFn(abortR2MultipartMediaUpload);
  const resolveR2UrlsOnServer = useServerFn(resolveR2MediaUrls);
  const { confirmAction, confirmDialog } = useConfirmDialog();
  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("model_media")
      .select("*")
      .eq("model_id", model.id)
      .order("display_order", { ascending: true });
    const rows = (data ?? []) as Media[];
    setMedia(rows);
    setSelectedIds((current) => {
      const available = new Set(rows.map((item) => item.id));
      return new Set([...current].filter((id) => available.has(id)));
    });
    const r2Urls = await resolveR2UrlsOnServer({ data: { references: rows.map((item) => item.file_path) } });
    const resolved = await Promise.all(
      rows.map(async (item) => {
        // O painel administrativo sempre exibe o arquivo original. A versão
        // reduzida e desfocada é exclusiva da vitrine pública sem acesso.
        return [item.id, r2Urls[item.file_path] ?? (await resolveAdminMediaUrl(item.file_path))] as const;
      }),
    );
    setMediaUrls(Object.fromEntries(resolved.filter((entry) => Boolean(entry[1]))));
    setLoading(false);
  }, [model.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function onFiles(files: Iterable<File> | null) {
    if (!files) return;
    const receivedFiles = Array.from(files);
    const existingNames = new Set(
      media
        .map((item) => item.title || storedFileName(item.file_path))
        .filter((name): name is string => Boolean(name))
        .map(normalizedFileName),
    );
    const queuedNames = new Set<string>();
    const duplicateNames: string[] = [];
    const selectedFiles = receivedFiles.filter((file) => {
      const normalized = normalizedFileName(file.name);
      if (existingNames.has(normalized) || queuedNames.has(normalized)) {
        duplicateNames.push(file.name);
        return false;
      }
      queuedNames.add(normalized);
      return true;
    });
    setUploadNotice(
      duplicateNames.length
        ? `${duplicateNames.length} arquivo(s) repetido(s) foram removidos do upload: ${duplicateNames.join(", ")}`
        : "",
    );
    if (!selectedFiles.length) return;
    setUploading(true);
    setUploadProgress({ current: 0, total: selectedFiles.length });
    let order = media.length;
    let processed = 0;
    let uploaded = 0;
    const failedNames: string[] = [];
    const failedDetails: string[] = [];
    const invalidNames: string[] = [];

    for (const file of selectedFiles) {
      let uploadedKey: string | null = null;
      try {
        const mimeType = resolvedMimeType(file);
        if (!mimeType) {
          invalidNames.push(file.name);
          continue;
        }
        const isVideo = mimeType.startsWith("video/");
        const prepared = await prepareUploadOnServer({ data: {
          modelId: model.id, scope: "content", filename: file.name, contentType: mimeType, size: file.size,
        } });
        await uploadFileToR2({
          prepared,
          file,
          contentType: mimeType,
          onProgress: (percent) => {
            setUploadNotice(`Enviando ${file.name}: ${percent}% concluído.`);
          },
          getPartUrl: (data) => prepareMultipartPartOnServer({ data }),
          completeMultipart: (data) => completeMultipartOnServer({ data }),
          abortMultipart: (data) => abortMultipartOnServer({ data }),
        });
        uploadedKey = prepared.reference;

        const inserted = await withUploadRetry(async () => {
          const { data, error } = await supabase
            .from("model_media")
            .insert({
              model_id: model.id,
              media_type: isVideo ? "video" : "image",
              file_path: prepared.reference,
              preview_path: null,
              title: file.name,
              display_order: order,
              is_free_preview: false,
            })
            .select()
            .single();
          if (!error && data) return data;
          if (error?.code === "23505") {
            const { data: existing } = await supabase
              .from("model_media")
              .select("*")
              .eq("model_id", model.id)
              .eq("file_path", prepared.reference)
              .maybeSingle();
            if (existing) return existing;
          }
          throw error ?? new Error("Não foi possível registrar o arquivo.");
        });

        order += 1;
        uploaded += 1;
        void withUploadRetry(() =>
          logAdminAction({
            adminId: identity.adminId,
            action: "media.upload",
            entityType: "model_media",
            entityId: inserted.id,
            details: { model_id: model.id, media_type: isVideo ? "video" : "image" },
          }),
        ).catch(() => {
          // O arquivo já está seguro; uma falha temporária no log não deve invalidar o upload.
        });
      } catch (error) {
        // O registro só é persistido após o upload direto concluir. Objetos
        // temporariamente órfãos ficam privados e podem ser conciliados depois.
        const detail = `${file.name}: ${uploadErrorMessage(error)}`;
        console.error("[ModelContentManager] upload failed", detail, error);
        failedNames.push(file.name);
        failedDetails.push(detail);
      } finally {
        processed += 1;
        setUploadProgress({ current: processed, total: selectedFiles.length });
        if (processed < selectedFiles.length) {
          await new Promise((resolve) => window.setTimeout(resolve, 180));
        }
      }
    }

    const notices: string[] = [];
    if (uploaded) notices.push(`${uploaded} arquivo(s) enviado(s) com sucesso.`);
    if (duplicateNames.length) {
      notices.push(
        `${duplicateNames.length} repetido(s) ignorado(s): ${summarizedNames(duplicateNames)}.`,
      );
    }
    if (invalidNames.length) {
      notices.push(
        `${invalidNames.length} arquivo(s) com formato inválido: ${summarizedNames(invalidNames)}.`,
      );
    }
    if (failedNames.length) {
      notices.push(
        `${failedNames.length} arquivo(s) não foram concluídos após as retentativas: ${summarizedNames(failedNames)}. Detalhe: ${summarizedNames(failedDetails)}.`,
      );
    }
    setUploadNotice(notices.join(" "));
    await reload();
    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function updateField(id: string, patch: Partial<Media>) {
    const { error } = await supabase
      .from("model_media")
      .update(patch as never)
      .eq("id", id);
    if (error) throw error;
    await logAdminAction({
      adminId: identity.adminId,
      action: "media.update",
      entityType: "model_media",
      entityId: id,
      details: patch as Record<string, unknown>,
    });
    await reload();
  }

  async function persistDraggedOrder(sourceId: string, targetId: string) {
    if (!sourceId || sourceId === targetId || savingOrder) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const ordered = [...media];
    const from = ordered.findIndex((item) => item.id === sourceId);
    const to = ordered.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    const normalized = ordered.map((item, index) => ({ ...item, display_order: index }));
    setMedia(normalized);
    setDragId(null);
    setOverId(null);
    setSavingOrder(true);
    try {
      await reorderMediaOnServer({
        data: { orders: normalized.map((item) => ({ id: item.id, displayOrder: item.display_order })) },
      });
      await logAdminAction({
        adminId: identity.adminId,
        action: "media.reorder",
        entityType: "model",
        entityId: model.id,
        details: { ordered_ids: normalized.map((item) => item.id) },
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível salvar a nova ordem.");
      await reload();
    } finally {
      setSavingOrder(false);
    }
  }

  async function remove(item: Media) {
    if (deletingIds.has(item.id)) return;
    const confirmed = await confirmAction({
      title: "Excluir conteúdo?",
      description: "O arquivo será removido permanentemente do banco e do armazenamento.",
      confirmText: "Excluir conteúdo",
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingIds((current) => new Set(current).add(item.id));
    try {
      const { deletedIds } = await deleteMediaOnServer({ data: { ids: [item.id] } });
      if (!deletedIds.includes(item.id)) {
        throw new Error("O conteúdo selecionado não foi excluído.");
      }
      await logAdminAction({
        adminId: identity.adminId,
        action: "media.delete",
        entityType: "model_media",
        entityId: item.id,
      });
      await reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível excluir o conteúdo.");
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) =>
      media.every((item) => current.has(item.id))
        ? new Set()
        : new Set(media.map((item) => item.id)),
    );
  }

  async function removeSelected() {
    const selected = media.filter((item) => selectedIds.has(item.id));
    if (!selected.length || deletingSelected) return;
    const confirmed = await confirmAction({
      title: `Excluir ${selected.length} conteúdo(s)?`,
      description:
        "Todos os arquivos selecionados serão removidos permanentemente do banco e do armazenamento.",
      confirmText: "Excluir selecionados",
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingSelected(true);
    try {
      const ids = selected.map((item) => item.id);
      const { deletedIds } = await deleteMediaOnServer({ data: { ids } });
      if (deletedIds.length !== ids.length) {
        throw new Error("Nem todos os conteúdos selecionados puderam ser excluídos.");
      }
      await logAdminAction({
        adminId: identity.adminId,
        action: "media.bulk.delete",
        entityType: "model",
        entityId: model.id,
        details: { media_ids: ids, count: ids.length },
      });
      setSelectedIds(new Set());
      await reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível excluir os conteúdos.");
    } finally {
      setDeletingSelected(false);
    }
  }

  const allDisplayedSelected = media.length > 0 && media.every((item) => selectedIds.has(item.id));

  if (editing) {
    return (
      <MediaEditor
        media={editing}
        onClose={() => setEditing(null)}
        onSaved={(patch) => updateField(editing.id, patch)}
      />
    );
  }

  return (
    <section>
      <div className="mb-5 rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-black">Conteúdos privados</h3>
            <p className="mt-1 text-sm text-muted-foreground">Adicione imagens e vídeos à biblioteca de {model.name}.</p>
          </div>
          <button type="button" onClick={() => setUploadOpen(true)} className="btn-primary inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black">
            <UploadCloud className="h-4 w-4" /> Upload
          </button>
        </div>
        <BulkUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} accept={ACCEPTED} onUpload={async (file) => onFiles([file])} title="Upload de conteúdos" helper="JPG, PNG, WEBP, GIF, MP4 ou WEBM" />
        {uploadNotice ? (
          <div
            role="status"
            className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/8 px-4 py-3 text-sm font-semibold text-amber-100"
          >
            {uploadNotice}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : media.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <p className="font-bold">Nenhum conteúdo adicionado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Arraste os arquivos para a área acima para montar a galeria desta modelo.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2.5 shadow-sm">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-black transition hover:border-primary/40"
            >
              {allDisplayedSelected ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              {allDisplayedSelected ? "Desmarcar todos" : "Selecionar todos"}
            </button>
            {selectedIds.size > 0 ? (
              <>
                <span className="text-xs font-bold text-muted-foreground">
                  {selectedIds.size} selecionado(s)
                </span>
                <button
                  type="button"
                  disabled={deletingSelected}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void removeSelected();
                  }}
                  className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl border border-destructive/35 bg-destructive/10 px-3 text-xs font-black text-destructive transition hover:bg-destructive/20 disabled:opacity-60"
                >
                  {deletingSelected ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Excluir selecionados
                </button>
              </>
            ) : (
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <GripVertical className="h-4 w-4" />
                Segure e arraste para reordenar.
              </span>
            )}
            {savingOrder ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando ordem
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {media.map((item) => (
              <article
                key={item.id}
                draggable={!savingOrder}
                onDragStart={(event) => {
                  setDragId(item.id);
                  dragIdRef.current = item.id;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", item.id);
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (dragId && dragId !== item.id) setOverId(item.id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDragLeave={() => {
                  if (overId === item.id) setOverId(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = dragIdRef.current ?? event.dataTransfer.getData("text/plain");
                  if (sourceId) void persistDraggedOrder(sourceId, item.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                  dragIdRef.current = null;
                }}
                className={`group overflow-hidden rounded-2xl border bg-muted transition ${
                  dragId === item.id
                    ? "scale-[.98] border-primary/40 opacity-45"
                    : overId === item.id
                      ? "border-primary bg-primary/8 shadow-[0_0_0_3px_rgba(255,92,0,.14)]"
                      : "border-border"
                }`}
              >
                <div className="relative aspect-[3/4] bg-muted">
                  <button
                    type="button"
                    aria-label={
                      selectedIds.has(item.id)
                        ? `Desmarcar ${mediaTitle(item)}`
                        : `Selecionar ${mediaTitle(item)}`
                    }
                    aria-pressed={selectedIds.has(item.id)}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleSelected(item.id);
                    }}
                    className={`absolute left-2 top-2 z-10 grid h-10 w-10 place-items-center rounded-xl border backdrop-blur transition ${
                      selectedIds.has(item.id)
                        ? "border-primary bg-primary text-white shadow-[0_0_20px_rgba(255,92,0,.38)]"
                        : "border-white/15 bg-black/60 text-white hover:border-primary/50"
                    }`}
                  >
                    {selectedIds.has(item.id) ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                  {mediaUrls[item.id] ? (
                    item.media_type === "video" ? (
                      <video
                        src={mediaUrls[item.id]}
                        muted
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <img
                        src={mediaUrls[item.id]}
                        alt={item.title || `Conteúdo de ${model.name}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-xs font-bold text-muted-foreground">
                      {item.media_type === "video" ? "VÍDEO" : "IMAGEM"}
                    </div>
                  )}
                  <span className="absolute right-2 top-2 grid h-9 w-9 cursor-grab place-items-center rounded-xl border border-white/15 bg-black/60 text-white backdrop-blur active:cursor-grabbing">
                    <GripVertical className="h-4 w-4" />
                  </span>
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-bold">{mediaTitle(item)}</p>
                  <p className="text-xs text-muted-foreground">Posição {item.display_order + 1}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                    <Heart className="h-3.5 w-3.5 text-primary" />
                    {item.like_count ?? 0} curtidas exibidas
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <IconButton label="Editar" onClick={() => setEditing(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label="Excluir"
                      danger
                      disabled={deletingIds.has(item.id)}
                      onClick={() => void remove(item)}
                    >
                      {deletingIds.has(item.id) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </IconButton>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {confirmDialog}
    </section>
  );
}

function IconButton({
  label,
  onClick,
  disabled = false,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={`grid h-9 w-9 place-items-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "border-destructive/30 text-destructive"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function MediaEditor({
  media,
  onClose,
  onSaved,
}: {
  media: Media;
  onClose: () => void;
  onSaved: (patch: Partial<Media>) => Promise<void>;
}) {
  const [title, setTitle] = useState(media.title ?? "");
  const [description, setDescription] = useState(media.description ?? "");
  const [likeCount, setLikeCount] = useState(String(media.like_count ?? 0));
  const [commentCount, setCommentCount] = useState(String(media.comment_count ?? 0));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      await onSaved({
        title: title || null,
        description: description || null,
        like_count: Math.max(0, Number(likeCount) || 0),
        comment_count: Math.max(0, Number(commentCount) || 0),
      });
      onClose();
    } catch (error) {
      setSaveError(errorMessage(error) || "Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="min-h-[calc(100vh-15rem)] rounded-3xl border border-border bg-card p-5 shadow-xl shadow-black/5 sm:p-7">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-black">Editar conteúdo</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        </div>
        <label className="text-sm font-bold">Título</label>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-2 w-full rounded-xl border border-border bg-input px-3 py-2"
        />
        <label className="mt-4 block text-sm font-bold">Descrição</label>
        <textarea
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="mt-2 w-full rounded-xl border border-border bg-input px-3 py-2"
        />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm font-bold">
            Curtidas exibidas
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={likeCount}
              onChange={(event) => setLikeCount(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-input px-3 py-2"
            />
          </label>
          <label className="text-sm font-bold">
            Comentários
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={commentCount}
              onChange={(event) => setCommentCount(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-input px-3 py-2"
            />
          </label>
        </div>
        {saveError ? (
          <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {saveError}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="btn-primary min-h-11 rounded-xl px-4 font-bold disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </section>
  );
}
