import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  FileImage,
  FileVideo,
  ChevronDown,
  Download,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Play,
  GripVertical,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/admin-helpers";
import {
  deleteModelPreviews,
  updateModelPreview,
  updateModelPreviewOrder,
} from "@/lib/preview-media.functions";
import { abortR2MultipartMediaUpload, completeR2MultipartMediaUpload, confirmR2MediaUpload, prepareR2MediaUpload, prepareR2MultipartPartUpload, resolveR2MediaUrls } from "@/lib/media-storage.functions";
import { uploadFileToR2 } from "@/lib/r2-upload";
import type { AdminIdentity } from "./AdminLayout";
import { useConfirmDialog } from "./ConfirmDialog";
import { BulkUploadDialog } from "./BulkUploadDialog";

type Preview = {
  id: string;
  model_id: string;
  media_type: "image" | "video";
  file_path: string;
  title: string | null;
  display_order: number;
  like_count: number;
  comment_count: number;
  created_at: string;
};

const ACCEPTED =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm";
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
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

function safeName(name: string) {
  const sanitized = name
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "arquivo";
}

function previewFileName(item: Preview) {
  return (
    item.title ||
    item.file_path
      .split("/")
      .pop()
      ?.replace(/^[a-f0-9-]+-/i, "") ||
    "Prévia"
  );
}

function formatDuration(seconds: number | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function signedUrl(path: string) {
  if (path.startsWith("r2://")) return "";
  const [bucket, ...parts] = path.split("/");
  if (!bucket || !parts.length) return "";
  const { data } = await supabase.storage.from(bucket).createSignedUrl(parts.join("/"), 3600);
  return data?.signedUrl ?? "";
}

function uploadErrorDetail(error: unknown) {
  if (!error) return "erro desconhecido";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "erro desconhecido";
}

export function ModelPreviewManager({
  model,
  identity,
}: {
  model: { id: string; name: string; slug: string };
  identity: AdminIdentity;
}) {
  const [items, setItems] = useState<Preview[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<Preview | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [sortMode, setSortMode] = useState<"recent" | "manual">("manual");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const replacementInputRef = useRef<HTMLInputElement>(null);
  const [replacementTarget, setReplacementTarget] = useState<Preview | null>(null);
  const deletePreviewsOnServer = useServerFn(deleteModelPreviews);
  const prepareUploadOnServer = useServerFn(prepareR2MediaUpload);
  const prepareMultipartPartOnServer = useServerFn(prepareR2MultipartPartUpload);
  const completeMultipartOnServer = useServerFn(completeR2MultipartMediaUpload);
  const abortMultipartOnServer = useServerFn(abortR2MultipartMediaUpload);
  const confirmUploadOnServer = useServerFn(confirmR2MediaUpload);
  const resolveR2UrlsOnServer = useServerFn(resolveR2MediaUrls);
  const updatePreviewOnServer = useServerFn(updateModelPreview);
  const updatePreviewOrderOnServer = useServerFn(updateModelPreviewOrder);
  const { confirmAction, confirmDialog } = useConfirmDialog();

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("model_previews")
      .select("*")
      .eq("model_id", model.id)
      .order("display_order", { ascending: true });
    if (error) {
      setItems([]);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as Preview[];
    setItems(rows);
    setSelectedIds(new Set());
    const r2Urls = await resolveR2UrlsOnServer({ data: { references: rows.map((item) => item.file_path) } });
    const resolved = await Promise.all(
      rows.map(async (item) => [item.id, r2Urls[item.file_path] ?? (await signedUrl(item.file_path))] as const),
    );
    setUrls(Object.fromEntries(resolved));
    setLoading(false);
  }, [model.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function upload(files: FileList | File[] | null) {
    const selectedFiles = files ? Array.from(files) : [];
    if (!selectedFiles.length || uploading) return;
    setUploading(true);
    try {
      let order = items.length;
      let uploaded = 0;
      const rejected: string[] = [];
      for (const file of selectedFiles) {
        const mimeType = resolvedMimeType(file);
        if (!mimeType) {
          rejected.push(`${file.name}: formato não suportado`);
          continue;
        }
        const mediaType = mimeType.startsWith("video/") ? "video" : "image";
        const prepared = await prepareUploadOnServer({ data: {
          modelId: model.id, scope: "preview", filename: file.name, contentType: mimeType, size: file.size,
        } });
        await uploadFileToR2({ prepared, file, contentType: mimeType, getPartUrl: (data) => prepareMultipartPartOnServer({ data }), completeMultipart: (data) => completeMultipartOnServer({ data }), abortMultipart: (data) => abortMultipartOnServer({ data }) });
        await confirmUploadOnServer({ data: { modelId: model.id, scope: "preview", reference: prepared.reference } });
        const { data, error } = await supabase
          .from("model_previews")
          .insert({
            model_id: model.id,
            media_type: mediaType,
            file_path: prepared.reference,
            title: file.name,
            display_order: order,
          })
          .select()
          .single();
        if (error) {
          throw error;
        }
        order += 1;
        uploaded += 1;
        await logAdminAction({
          adminId: identity.adminId,
          action: "model_preview.upload",
          entityType: "model_preview",
          entityId: data.id,
          details: { model_id: model.id, media_type: mediaType, mime_type: mimeType },
        });
      }
      if (!uploaded) {
        throw new Error(rejected[0] ?? "Nenhum arquivo válido foi selecionado.");
      }
      await reload();
      if (rejected.length) throw new Error(`${uploaded} prévia(s) enviada(s). ${rejected.join(" ")}`);
    } catch (error) {
      throw new Error(errorMessage(error, "Não foi possível enviar as prévias."));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function update(item: Preview, patch: Partial<Preview>) {
    try {
      await updatePreviewOnServer({
        data: {
          id: item.id,
          title: patch.title,
          likeCount: patch.like_count,
          commentCount: patch.comment_count,
        },
      });
    } catch (error) {
      alert(errorMessage(error, "Não foi possível salvar as alterações da prévia."));
      return;
    }
    await logAdminAction({
      adminId: identity.adminId,
      action: "model_preview.update",
      entityType: "model_preview",
      entityId: item.id,
      details: patch as Record<string, unknown>,
    });
    setEditing(null);
    await reload();
  }

  async function replacePreview(fileList: FileList | null) {
    const item = replacementTarget;
    const file = fileList?.[0];
    if (!item || !file || uploading) return;
    const mimeType = resolvedMimeType(file);
    const mediaType = mimeType?.startsWith("video/") ? "video" : "image";
    if (!mimeType) {
      alert("Formato não suportado para a prévia.");
      return;
    }
    if (mediaType !== item.media_type) {
      alert(
        `Selecione um ${item.media_type === "video" ? "vídeo" : "arquivo de imagem"} para substituir esta prévia.`,
      );
      return;
    }
    setUploading(true);
    try {
      const prepared = await prepareUploadOnServer({ data: {
        modelId: model.id, scope: "preview", filename: file.name, contentType: mimeType, size: file.size,
      } });
      await uploadFileToR2({ prepared, file, contentType: mimeType, getPartUrl: (data) => prepareMultipartPartOnServer({ data }), completeMultipart: (data) => completeMultipartOnServer({ data }), abortMultipart: (data) => abortMultipartOnServer({ data }) });
      await confirmUploadOnServer({ data: { modelId: model.id, scope: "preview", reference: prepared.reference } });
      await updatePreviewOnServer({
        data: {
          id: item.id,
          title: file.name,
          likeCount: item.like_count,
          commentCount: item.comment_count,
          filePath: prepared.reference,
        },
      });
      await logAdminAction({
        adminId: identity.adminId,
        action: "model_preview.replace",
        entityType: "model_preview",
        entityId: item.id,
        details: { model_id: model.id, mime_type: mimeType },
      });
      await reload();
    } catch (error) {
      alert(errorMessage(error, "Não foi possível substituir a prévia."));
    } finally {
      setUploading(false);
      setReplacementTarget(null);
      if (replacementInputRef.current) replacementInputRef.current.value = "";
    }
  }

  async function remove(item: Preview) {
    const ok = await confirmAction({
      title: "Excluir prévia?",
      description: "A prévia será removida permanentemente do banco de dados e do armazenamento.",
      confirmText: "Excluir prévia",
      destructive: true,
    });
    if (!ok) return;
    await deletePreviews([item]);
  }

  function togglePreview(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPreviews() {
    setSelectedIds((current) =>
      current.size === items.length ? new Set() : new Set(items.map((item) => item.id)),
    );
  }

  async function deletePreviews(previews: Preview[]) {
    if (!previews.length || deleting) return;
    setDeleting(true);
    try {
      const ids = previews.map((item) => item.id);
      const result = await deletePreviewsOnServer({ data: { ids } });
      if (!result.deletedIds.length) throw new Error("Nenhuma prévia foi excluída.");

      await Promise.all(
        previews.map((preview) =>
          logAdminAction({
            adminId: identity.adminId,
            action: "model_preview.delete",
            entityType: "model_preview",
            entityId: preview.id,
            details: { model_id: model.id },
          }),
        ),
      );
      await reload();
    } catch (error) {
      alert(errorMessage(error, "Não foi possível excluir as prévias."));
    } finally {
      setDeleting(false);
    }
  }

  async function removeSelected() {
    const selected = items.filter((item) => selectedIds.has(item.id));
    if (!selected.length) return;
    const ok = await confirmAction({
      title: `Excluir ${selected.length} prévia(s)?`,
      description:
        "As prévias selecionadas serão removidas permanentemente do banco de dados e do armazenamento.",
      confirmText: "Excluir selecionadas",
      destructive: true,
    });
    if (!ok) return;
    await deletePreviews(selected);
  }

  async function movePreview(sourceId: string, targetId: string) {
    if (sourceId === targetId || savingOrder) return;
    const ordered = [...items];
    const from = ordered.findIndex((item) => item.id === sourceId);
    const to = ordered.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;

    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    const next = ordered.map((item, index) => ({ ...item, display_order: index }));
    setItems(next);
    setSavingOrder(true);

    try {
      await updatePreviewOrderOnServer({
        data: {
          orders: next.map((item) => ({ id: item.id, displayOrder: item.display_order })),
        },
      });
      await logAdminAction({
        adminId: identity.adminId,
        action: "model_preview.reorder",
        entityType: "model",
        entityId: model.id,
        details: { ordered_ids: next.map((item) => item.id) },
      });
    } catch (error) {
      alert(errorMessage(error, "Não foi possível salvar a nova ordem das prévias."));
      await reload();
    } finally {
      setSavingOrder(false);
      setDragId(null);
      setOverId(null);
    }
  }

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const displayedItems =
    sortMode === "recent"
      ? [...items].sort(
          (first, second) =>
            new Date(second.created_at).getTime() - new Date(first.created_at).getTime(),
        )
      : items;

  return (
    <section className="pb-2">
      <header className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-black tracking-tight">Prévias</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie as imagens e vídeos exibidos como prévia no perfil.
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold text-muted-foreground">
          {items.length} {items.length === 1 ? "arquivo" : "arquivos"}
        </span>
      </header>

      <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-muted/25 px-4 py-3">
        <p className="text-sm text-muted-foreground">Envie imagens e vídeos para a vitrine pública.</p>
        <button type="button" onClick={() => setUploadOpen(true)} className="btn-primary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-black">
          <UploadCloud className="h-4 w-4" /> Upload
        </button>
      </div>
      <BulkUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} accept={ACCEPTED} onUpload={async (file) => upload([file])} title="Upload de prévias" helper="JPG, PNG, WEBP, GIF, MP4 ou WEBM" />
      <input
        ref={replacementInputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(event) => void replacePreview(event.target.files)}
      />

      {items.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 border-y border-border py-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2 font-semibold">
            <input
              className="h-4 w-4 accent-primary"
              type="checkbox"
              checked={allSelected}
              onChange={toggleAllPreviews}
            />
            Selecionar todas
          </label>
          {selectedIds.size > 0 ? (
            <span className="font-medium text-muted-foreground">
              {selectedIds.size} selecionado(s)
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
              Ordenar por:
              <span className="relative">
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as "recent" | "manual")}
                  className="appearance-none rounded-lg border border-border bg-white py-2 pl-2.5 pr-7 text-xs font-bold text-foreground outline-none hover:border-primary/40"
                >
                  <option value="recent">Mais recentes</option>
                  <option value="manual">Ordem manual</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
              </span>
            </label>
            {selectedIds.size > 0 ? (
              <button
                type="button"
                disabled={deleting}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void removeSelected();
                }}
                className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-destructive/35 px-3 text-xs font-bold text-destructive disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Excluir selecionadas
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="grid place-items-center py-14">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <FileImage className="h-5 w-5" />
          </span>
          <div>
            <p className="font-bold">Esta modelo ainda não possui prévias.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Envie imagens ou vídeos para começar.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {displayedItems.map((item) => {
            const isDragging = dragId === item.id;
            const isOver = overId === item.id && dragId !== item.id;

            return (
              <article
                key={item.id}
                draggable={sortMode === "manual" && !savingOrder && !deleting}
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
                  if (sourceId) void movePreview(sourceId, item.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                  dragIdRef.current = null;
                }}
                className={`group relative rounded-2xl border bg-card transition ${
                  isDragging
                    ? "scale-[0.98] border-primary/40 opacity-50"
                    : isOver
                      ? "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/.12)]"
                      : selectedIds.has(item.id)
                        ? "border-primary ring-2 ring-primary/15"
                        : "border-border hover:border-primary/35"
                } ${savingOrder ? "cursor-wait" : sortMode === "manual" ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <div className="relative aspect-[3/4] overflow-hidden rounded-t-[15px] bg-muted">
                  <label className="absolute right-2 top-2 z-10 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-white/90 shadow-sm">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => togglePreview(item.id)}
                      aria-label={`Selecionar ${item.title ?? "prévia"}`}
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                  </label>
                  {sortMode === "manual" ? (
                    <span className="pointer-events-none absolute left-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg border border-white/15 bg-black/60 text-white backdrop-blur">
                      <GripVertical className="h-4 w-4" />
                    </span>
                  ) : null}
                  {urls[item.id] ? (
                    item.media_type === "video" ? (
                      <video
                        src={urls[item.id]}
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                        onLoadedMetadata={(event) =>
                          setDurations((current) => ({
                            ...current,
                            [item.id]: event.currentTarget.duration,
                          }))
                        }
                      />
                    ) : (
                      <img
                        src={urls[item.id]}
                        alt={item.title ?? ""}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )
                  ) : (
                    <div className="grid h-full place-items-center text-muted-foreground">
                      {item.media_type === "video" ? <FileVideo /> : <FileImage />}
                    </div>
                  )}
                  {item.media_type === "video" && urls[item.id] ? (
                    <>
                      <span className="pointer-events-none absolute inset-0 grid place-items-center">
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white">
                          <Play className="ml-0.5 h-4 w-4 fill-current" />
                        </span>
                      </span>
                      {formatDuration(durations[item.id]) ? (
                        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {formatDuration(durations[item.id])}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <div className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{previewFileName(item)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.media_type === "video" ? "Vídeo" : "Imagem"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                        <span
                          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1"
                          title="Curtidas configuradas"
                        >
                          <Heart className="h-3.5 w-3.5" />
                          {item.like_count ?? 0} curtidas
                        </span>
                        <span
                          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1"
                          title="Comentários configurados"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          {item.comment_count ?? 0} comentários
                        </span>
                      </div>
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setMenuOpenId((current) => (current === item.id ? null : item.id))
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Mais opções"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuOpenId === item.id ? (
                        <div className="absolute right-0 top-9 z-30 w-40 rounded-xl border border-border bg-white p-1 shadow-lg">
                          <button
                            type="button"
                            onClick={() =>
                              urls[item.id] &&
                              window.open(urls[item.id], "_blank", "noopener,noreferrer")
                            }
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold hover:bg-muted"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Visualizar
                          </button>
                          <a
                            href={urls[item.id] || undefined}
                            download={previewFileName(item)}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold hover:bg-muted"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Baixar
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              setReplacementTarget(item);
                              replacementInputRef.current?.click();
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold hover:bg-muted"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Substituir arquivo
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              setEditing(item);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold hover:bg-muted"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar informações
                          </button>
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => {
                              setMenuOpenId(null);
                              void remove(item);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-destructive hover:bg-destructive/5"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing ? (
        <PreviewEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => update(editing, patch)}
        />
      ) : null}

      {confirmDialog}
    </section>
  );
}

function PreviewEditor({
  item,
  onClose,
  onSave,
}: {
  item: Preview;
  onClose: () => void;
  onSave: (patch: Partial<Preview>) => Promise<void>;
}) {
  const [title, setTitle] = useState(item.title ?? "");
  const [likes, setLikes] = useState(String(item.like_count ?? 0));
  const [comments, setComments] = useState(String(item.comment_count ?? 0));
  const [saving, setSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, saving]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim() || null,
        like_count: Math.max(0, Number(likes) || 0),
        comment_count: Math.max(0, Number(comments) || 0),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-foreground/45 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-editor-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-card text-card-foreground shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 id="preview-editor-title" className="text-lg font-bold tracking-tight">
              Editar informações
            </h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {previewFileName(item)}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label="Fechar edição"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6">
          <label htmlFor="preview-title" className="text-sm font-semibold">
            Título
          </label>
          <input
            ref={titleInputRef}
            id="preview-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-border bg-input px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label htmlFor="preview-likes" className="text-sm font-semibold">
              Curtidas
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Número exibido no perfil
              </span>
            </label>
            <label htmlFor="preview-comments" className="hidden text-sm font-semibold sm:block">
              Comentários
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Número exibido no perfil
              </span>
            </label>
            <input
              id="preview-likes"
              type="number"
              min={0}
              value={likes}
              onChange={(event) => setLikes(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-input px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <label htmlFor="preview-comments" className="text-sm font-semibold sm:hidden">
              Comentários
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Número exibido no perfil
              </span>
            </label>
            <input
              id="preview-comments"
              type="number"
              min={0}
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-input px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="min-h-11 rounded-xl border border-border px-5 text-sm font-semibold transition hover:bg-muted disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold disabled:cursor-wait disabled:opacity-65"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
