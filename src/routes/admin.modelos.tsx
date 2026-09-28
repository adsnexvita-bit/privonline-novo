import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  CopyPlus,
  Check,
  ExternalLink,
  Link2,
  ArrowLeft,
  X,
  Loader2,
  Upload,
  ImageIcon,
  GripVertical,
  ZoomIn,
  RotateCcw,
  Instagram,
  Music2,
} from "lucide-react";
import { AdminLayout, type AdminIdentity } from "@/components/admin/AdminLayout";
import { useConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ModelContentManager } from "@/components/admin/ModelContentManager";
import { ModelPreviewManager } from "@/components/admin/ModelPreviewManager";
import { ModelPostsManager } from "@/components/admin/ModelPostsManager";
import { ModelTestimonialsManager } from "@/components/admin/ModelTestimonialsManager";
import { RouteLoadingOverlay } from "@/components/ui/RouteLoadingOverlay";
import pushinPayLogo from "@/assets/pushinpay-logo.png";
import syncPayLogo from "@/assets/syncpay-logo.png";
import onPayLogo from "@/assets/onpay-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction, slugify } from "@/lib/admin-helpers";
import { duplicateModelAsAdmin } from "@/lib/model-duplication.functions";
import { deleteModelsAsAdmin } from "@/lib/admin.functions";
import { fetchInstagramProfileImage } from "@/lib/instagram-profile.functions";
import {
  abortR2MultipartMediaUpload,
  completeR2MultipartMediaUpload,
  prepareR2AssetUpload,
  prepareR2MultipartPartUpload,
} from "@/lib/media-storage.functions";
import { uploadFileToR2 } from "@/lib/r2-upload";
import { resolveMediaUrl } from "@/lib/models";
import { normalizeModelUsername, validateModelUsername } from "@/lib/model-usernames";
import { PAYMENT_PROVIDERS, type PaymentProvider } from "@/lib/payment-provider";
import { getAdminModelCampaignLinks } from "@/lib/campaign-links.functions";
import { resolvePublicOrigin } from "@/lib/public-origin";
import { ALLOWED_IMAGE_TYPES, MIN_DIMENSION } from "@/lib/image-processing";
import {
  PLAN_DURATION_UNITS,
  planDurationFromDays,
  planDurationToDays,
  type PlanDurationUnit,
} from "@/lib/plan-duration";

export const Route = createFileRoute("/admin/modelos")({
  head: () => ({
    meta: [
      { title: "Modelos — Privadinhos Online Admin" },
      { name: "description", content: "Gestão de criadores da Privadinhos Online." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminLayout title="Modelos" subtitle="Cadastre, edite e organize os criadores.">
      {(ident) => <ModelsBody identity={ident} />}
    </AdminLayout>
  ),
});

type ModelRow = {
  id: string;
  name: string;
  username: string;
  slug: string;
  short_description: string | null;
  full_description: string | null;
  profile_image_path: string | null;
  cover_image_path: string | null;
  profile_cover_image_path: string | null;
  price: number;
  is_active: boolean;
  show_in_library: boolean;
  display_order: number;
  photo_count: number;
  video_count: number;
  custom_posts_count: number | null;
  custom_photo_count: number | null;
  custom_video_count: number | null;
  community_telegram_url: string | null;
  community_enabled: boolean;
  community_title: string | null;
  community_description: string | null;
  community_button_text: string | null;
  instagram_url: string | null;
  instagram_enabled: boolean;
  instagram_profile_image_url: string | null;
  public_audio_enabled: boolean;
  public_audio_title: string | null;
  public_audio_path: string | null;
  paid_audio_enabled: boolean;
  paid_audio_title: string | null;
  paid_audio_path: string | null;
};

type CategoryOption = {
  id: string;
  name: string;
  is_active: boolean;
};

const empty: Partial<ModelRow> = {
  name: "",
  username: "",
  slug: "",
  short_description: "",
  full_description: "",
  profile_image_path: "",
  cover_image_path: "",
  profile_cover_image_path: "",
  custom_posts_count: null,
  custom_photo_count: null,
  custom_video_count: null,
  community_telegram_url: null,
  community_enabled: false,
  community_title: null,
  community_description: null,
  community_button_text: null,
  instagram_url: null,
  instagram_enabled: false,
  instagram_profile_image_url: null,
  public_audio_enabled: false,
  public_audio_title: null,
  public_audio_path: null,
  paid_audio_enabled: false,
  paid_audio_title: null,
  paid_audio_path: null,
  is_active: true,
  show_in_library: true,
};

const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/opus",
  "audio/webm",
  "audio/flac",
  "audio/x-flac",
] as const;

function isValidInstagramProfileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !/^(?:www\.)?instagram\.com$/i.test(url.hostname))
      return false;
    const username = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[a-z0-9._]+$/i.test(username);
  } catch {
    return false;
  }
}

function normalizeOptionalCount(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.trunc(Number(value)));
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function ModelsBody({ identity }: { identity: AdminIdentity }) {
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<ModelRow> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState<null | "order" | "reorder">(null);
  const [busy, setBusy] = useState(false);
  const [copiedModelId, setCopiedModelId] = useState<string | null>(null);
  const duplicateModelOnServer = useServerFn(duplicateModelAsAdmin);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const deleteModelsOnServer = useServerFn(deleteModelsAsAdmin);
  const { confirmAction, confirmDialog } = useConfirmDialog();

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase
      .from("models")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    setRows((data ?? []) as ModelRow[]);
    setSelected(new Set());
    setLoading(false);
  }
  useEffect(() => {
    reload();
  }, []);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  async function toggle(id: string, field: "is_active", value: boolean) {
    await supabase
      .from("models")
      .update({ [field]: value } as never)
      .eq("id", id);
    await logAdminAction({
      adminId: identity.adminId,
      action: `model.${field}`,
      entityType: "model",
      entityId: id,
      details: { value },
    });
    reload();
  }

  async function copyProfileLink(model: ModelRow) {
    const profileUrl = `${resolvePublicOrigin(window.location.origin)}/${model.username}`;
    await copyText(profileUrl);
    setCopiedModelId(model.id);
    window.setTimeout(
      () => setCopiedModelId((current) => (current === model.id ? null : current)),
      1800,
    );
  }

  async function duplicate(model: ModelRow) {
    if (busy) return;
    setBusy(true);
    setDuplicatingId(model.id);
    setErr(null);
    try {
      const { id } = await duplicateModelOnServer({ data: { id: model.id } });
      await reload();
      const { data: copied, error } = await supabase.from("models").select("*").eq("id", id).single();
      if (error) throw error;
      setEditing(copied as ModelRow);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Não foi possível duplicar o perfil.");
    } finally {
      setBusy(false);
      setDuplicatingId(null);
    }
  }

  async function remove(id: string) {
    const row = rows.find((item) => item.id === id);
    const confirmed = await confirmAction({
      title: "Excluir criador?",
      description: `O perfil${row?.name ? ` “${row.name}”` : ""}, conteúdos, prévias e arquivos vinculados serão removidos permanentemente.`,
      confirmText: "Excluir criador",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const { deletedIds } = await deleteModelsOnServer({ data: { ids: [id] } });
      if (!deletedIds.includes(id)) {
        throw new Error("O perfil selecionado não foi excluído.");
      }
      await logAdminAction({
        adminId: identity.adminId,
        action: "model.delete",
        entityType: "model",
        entityId: id,
      });
      setSelected((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao excluir o perfil.");
    } finally {
      setBusy(false);
    }
  }

  async function bulkUpdate(patch: Partial<ModelRow>, action: string) {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("models")
        .update(patch as never)
        .in("id", selectedIds);
      if (error) throw error;
      await logAdminAction({
        adminId: identity.adminId,
        action: `model.bulk.${action}`,
        entityType: "model",
        details: { ids: selectedIds, patch: patch as Record<string, unknown> },
      });
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro na ação em lote");
    } finally {
      setBusy(false);
    }
  }

  async function bulkDelete() {
    if (selectedIds.length === 0) return;
    const confirmed = await confirmAction({
      title: `Excluir ${selectedIds.length} criador(es)?`,
      description:
        "Todos os perfis selecionados, conteúdos, prévias e arquivos vinculados serão removidos permanentemente.",
      confirmText: "Excluir selecionados",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const { deletedIds } = await deleteModelsOnServer({ data: { ids: selectedIds } });
      if (deletedIds.length !== selectedIds.length) {
        throw new Error("Nem todos os perfis selecionados puderam ser excluídos.");
      }
      await logAdminAction({
        adminId: identity.adminId,
        action: "model.bulk.delete",
        entityType: "model",
        details: { ids: selectedIds },
      });
      setSelected(new Set());
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao excluir em lote");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <ModelEditor
        initial={editing}
        identity={identity}
        onClose={() => setEditing(null)}
        onSaved={(savedModel) => {
          // Mantém a edição aberta após salvar, agora que ela ocupa a área
          // principal do painel em vez de uma janela sobreposta.
          setEditing(savedModel);
          void reload();
        }}
      />
    );
  }

  return (
    <div>
      {err && <p className="mb-3 text-sm text-destructive">{err}</p>}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          {rows.length === 1 ? "1 criador" : `${rows.length} criadores`}
          {selected.size > 0 && ` • ${selected.size} selecionado${selected.size === 1 ? "" : "s"}`}
        </p>
        <button
          type="button"
          onClick={() => setEditing({ ...empty })}
          className="btn-primary flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold"
        >
          <Plus className="h-4 w-4" />
          Novo criador
        </button>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
          <span className="font-bold text-primary">Ações em lote:</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void bulkUpdate({ is_active: true }, "activate")}
            className="rounded-lg bg-emerald-500/15 px-3 py-1.5 font-semibold text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            Ativar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void bulkUpdate({ is_active: false }, "deactivate")}
            className="rounded-lg bg-muted px-3 py-1.5 font-semibold hover:bg-muted/70 disabled:opacity-50"
          >
            Desativar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setBulkOpen("reorder")}
            className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted disabled:opacity-50"
          >
            Alterar ordem
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void bulkDelete();
            }}
            className="rounded-lg border border-destructive/40 px-3 py-1.5 font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Excluir
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto rounded-lg px-3 py-1.5 font-semibold text-muted-foreground hover:bg-muted"
          >
            Limpar seleção
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="card-premium overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">Preço</th>
                  <th className="px-4 py-3">Conteúdos</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t border-border ${selected.has(r.id) ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-2.5 font-semibold">{r.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">@{r.username}</td>
                    <td className="px-4 py-2.5 font-medium">R$ {Number(r.price).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.photo_count + r.video_count}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => toggle(r.id, "is_active", !r.is_active)}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            r.is_active
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {r.is_active ? "Ativo" : "Inativo"}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void copyProfileLink(r)}
                          aria-label={`Copiar link de divulgação de ${r.name}`}
                          title={
                            copiedModelId === r.id ? "Link copiado" : "Copiar link de divulgação"
                          }
                          className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition ${
                            copiedModelId === r.id
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedModelId === r.id ? "Copiado" : "Link"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void duplicate(r)}
                          aria-label={`Duplicar perfil de ${r.name}`}
                          title="Duplicar perfil"
                          className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                        >
                          {duplicatingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="h-3.5 w-3.5" />}
                          Duplicar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(r)}
                          aria-label={`Editar ${r.name}`}
                          className="rounded-lg border border-border p-2 hover:bg-muted"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void remove(r.id);
                          }}
                          aria-label={`Excluir ${r.name}`}
                          className="rounded-lg border border-destructive/40 p-2 text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      Nenhum criador cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {bulkOpen === "order" ? (
        <BulkFieldModal
          field={bulkOpen}
          count={selected.size}
          onClose={() => setBulkOpen(null)}
          onApply={async (value) => {
            const patch = { display_order: value };
            await bulkUpdate(patch as Partial<ModelRow>, "order");
            setBulkOpen(null);
          }}
        />
      ) : null}

      {bulkOpen === "reorder" && (
        <BulkReorderModal
          items={rows
            .filter((r) => selected.has(r.id))
            .map((r) => ({
              id: r.id,
              name: r.name,
              username: r.username,
              image: r.profile_image_path,
            }))}
          onClose={() => setBulkOpen(null)}
          onApply={async (orderedIds) => {
            setBusy(true);
            try {
              // Assign contiguous display_order starting at 1 in the chosen sequence.
              await Promise.all(
                orderedIds.map((id, i) =>
                  supabase
                    .from("models")
                    .update({ display_order: i + 1 })
                    .eq("id", id),
                ),
              );
              await logAdminAction({
                adminId: identity.adminId,
                action: "model.bulk.reorder",
                entityType: "model",
                details: { orderedIds },
              });
              await reload();
              setBulkOpen(null);
            } catch (e) {
              alert(e instanceof Error ? e.message : "Erro ao reordenar");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}

function BulkFieldModal({
  field,
  count,
  onClose,
  onApply,
}: {
  field: "order";
  count: number;
  onClose: () => void;
  onApply: (value: number) => Promise<void>;
}) {
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const label = "Nova ordem (aplicada a todos)";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black">Alterar {field === "price" ? "preço" : "ordem"}</h2>
          <button onClick={onClose} className="rounded-lg border border-border p-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Aplicado a {count} criador(es).</p>
        <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
          {label}
        </label>
        <input
          type="number"
          step={field === "price" ? "0.01" : "1"}
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            disabled={saving || value === ""}
            onClick={async () => {
              setSaving(true);
              await onApply(Number(value));
              setSaving(false);
            }}
            className="btn-primary flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelEditor({
  initial,
  identity,
  onClose,
  onSaved,
}: {
  initial: Partial<ModelRow>;
  identity: AdminIdentity;
  onClose: () => void;
  onSaved: (savedModel: Partial<ModelRow>) => void;
}) {
  const [form, setForm] = useState<Partial<ModelRow>>(initial);
  const [savedModel, setSavedModel] = useState<Partial<ModelRow>>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "profile" | "plans" | "links" | "content" | "previews" | "posts" | "testimonials" | "community"
  >("profile");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  type UploadField =
    | "profile_image_path"
    | "cover_image_path"
    | "profile_cover_image_path"
    | "instagram_profile_image_url";
  const [uploading, setUploading] = useState<null | UploadField>(null);
  type AudioField = "public_audio_path" | "paid_audio_path";
  const [audioUploading, setAudioUploading] = useState<null | AudioField>(null);
  const [fetchingInstagramImage, setFetchingInstagramImage] = useState(false);
  const [instagramImageFeedback, setInstagramImageFeedback] = useState<string | null>(null);
  const loadInstagramProfileImage = useServerFn(fetchInstagramProfileImage);
  const prepareAssetUpload = useServerFn(prepareR2AssetUpload);
  const prepareMultipartPartOnServer = useServerFn(prepareR2MultipartPartUpload);
  const completeMultipartOnServer = useServerFn(completeR2MultipartMediaUpload);
  const abortMultipartOnServer = useServerFn(abortR2MultipartMediaUpload);
  const [cropTarget, setCropTarget] = useState<{
    field: UploadField;
    file: File;
    previewUrl: string;
  } | null>(null);
  const isNew = !savedModel.id;

  useEffect(() => {
    let active = true;
    async function loadAssignments() {
      setLoadingAssignments(true);
      const modelId = initial.id;
      const [categoriesResult, categoryResult] = await Promise.all([
        supabase
          .from("categories")
          .select("id,name,is_active")
          .order("display_order", { ascending: true }),
        modelId
          ? supabase
              .from("category_models")
              .select("category_id")
              .eq("model_id", modelId)
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!active) return;
      const firstError = categoriesResult.error || categoryResult.error;
      if (firstError) setErr(firstError.message);
      setCategories((categoriesResult.data ?? []) as CategoryOption[]);
      if (modelId) {
        setCategoryId(categoryResult.data?.category_id ?? "");
      }
      setLoadingAssignments(false);
    }
    loadAssignments();
    return () => {
      active = false;
    };
  }, [initial.id]);

  function set<K extends keyof ModelRow>(k: K, v: ModelRow[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setSuccess(null);
    try {
      const automaticSlug = `${slugify(form.name ?? "modelo")}-${crypto.randomUUID().slice(0, 8)}`;
      const payload = {
        name: form.name?.trim() ?? "",
        username: normalizeModelUsername(form.username ?? ""),
        slug: (isNew ? automaticSlug : savedModel.slug || automaticSlug).toLowerCase(),
        short_description: form.short_description ?? null,
        full_description: form.full_description ?? null,
        profile_image_path: form.profile_image_path ?? null,
        cover_image_path: form.cover_image_path ?? null,
        profile_cover_image_path: form.profile_cover_image_path ?? null,
        custom_posts_count: normalizeOptionalCount(form.custom_posts_count),
        custom_photo_count: normalizeOptionalCount(form.custom_photo_count),
        custom_video_count: normalizeOptionalCount(form.custom_video_count),
        community_telegram_url: form.community_telegram_url?.trim() || null,
        community_enabled: !!form.community_enabled,
        community_title: form.community_title?.trim() || null,
        community_description: form.community_description?.trim() || null,
        community_button_text: form.community_button_text?.trim() || null,
        instagram_url: form.instagram_url?.trim() || null,
        instagram_enabled: !!form.instagram_enabled,
        instagram_profile_image_url: form.instagram_profile_image_url?.trim() || null,
        public_audio_enabled: !!form.public_audio_enabled,
        public_audio_title: form.public_audio_title?.trim() || null,
        public_audio_path: form.public_audio_path?.trim() || null,
        paid_audio_enabled: !!form.paid_audio_enabled,
        paid_audio_title: form.paid_audio_title?.trim() || null,
        paid_audio_path: form.paid_audio_path?.trim() || null,
        is_active: !!form.is_active,
        show_in_library: form.show_in_library !== false,
      };
      if (!payload.name || !payload.username) {
        throw new Error("Nome e usuário são obrigatórios.");
      }
      const usernameError = validateModelUsername(payload.username);
      if (usernameError) throw new Error(usernameError);
      if (
        payload.community_telegram_url &&
        !/^https:\/\/(?:t\.me|telegram\.me)\//i.test(payload.community_telegram_url)
      ) {
        throw new Error("Use um link válido do Telegram iniciado por https://t.me/.");
      }
      if (payload.instagram_url && !isValidInstagramProfileUrl(payload.instagram_url)) {
        throw new Error("Insira um link válido de perfil do Instagram.");
      }
      if (
        payload.public_audio_enabled &&
        (!payload.public_audio_title || !payload.public_audio_path)
      ) {
        throw new Error("Informe o título e envie o áudio para visitantes antes de ativá-lo.");
      }
      if (payload.paid_audio_enabled && (!payload.paid_audio_title || !payload.paid_audio_path)) {
        throw new Error("Informe o título e envie o áudio para compradores antes de ativá-lo.");
      }
      let usernameQuery = supabase
        .from("models")
        .select("id")
        .ilike("username", payload.username)
        .limit(1);
      if (!isNew && savedModel.id) usernameQuery = usernameQuery.neq("id", savedModel.id);
      const { data: usernameMatch, error: usernameLookupError } = await usernameQuery.maybeSingle();
      if (usernameLookupError) throw usernameLookupError;
      if (usernameMatch) {
        throw new Error(`O usuário “${payload.username}” já pertence a outra modelo.`);
      }
      let persistedModel: Partial<ModelRow>;
      if (isNew) {
        const { data, error } = await supabase.from("models").insert(payload).select().single();
        if (error) throw error;
        persistedModel = data as ModelRow;
        setSavedModel(persistedModel);
        setForm(persistedModel);
        await logAdminAction({
          adminId: identity.adminId,
          action: "model.create",
          entityType: "model",
          entityId: data.id,
        });
      } else {
        const { data, error } = await supabase
          .from("models")
          .update(payload)
          .eq("id", savedModel.id!)
          .select()
          .single();
        if (error) throw error;
        persistedModel = data as ModelRow;
        setSavedModel(persistedModel);
        setForm(persistedModel);
        await logAdminAction({
          adminId: identity.adminId,
          action: "model.update",
          entityType: "model",
          entityId: savedModel.id!,
        });
      }

      const modelId = persistedModel.id!;
      const clearCategories = await supabase
        .from("category_models")
        .delete()
        .eq("model_id", modelId);
      if (clearCategories.error) throw clearCategories.error;

      if (categoryId) {
        const { error } = await supabase.from("category_models").insert({
          category_id: categoryId,
          model_id: modelId,
          display_order: 0,
          is_featured: false,
        });
        if (error) throw error;
      }
      await logAdminAction({
        adminId: identity.adminId,
        action: "model.assignments.update",
        entityType: "model",
        entityId: modelId,
        details: { categoryId: categoryId || null },
      });
      onSaved(persistedModel);
      setSuccess("Perfil salvo com sucesso.");
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "message" in e && typeof e.message === "string"
            ? e.message
            : "Erro ao salvar";
      setErr(message);
    } finally {
      setSaving(false);
    }
  }

  function handleUpload(field: UploadField, file: File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      alert("Formato inválido. Envie JPG, PNG ou WEBP.");
      return;
    }
    setCropTarget({ field, file, previewUrl: URL.createObjectURL(file) });
  }

  async function handleAudioUpload(field: AudioField, file: File) {
    if (!ALLOWED_AUDIO_TYPES.includes(file.type as (typeof ALLOWED_AUDIO_TYPES)[number])) {
      alert("Formato inválido. Envie MP3, WAV, M4A, AAC, OGG, OPUS, WEBM ou FLAC.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      alert("O áudio deve ter no máximo 100 MB.");
      return;
    }
    setAudioUploading(field);
    try {
      const prepared = await prepareAssetUpload({
        data: {
          asset: "model-asset",
          filename: file.name,
          contentType: file.type,
          size: file.size,
        },
      });
      await uploadFileToR2({
        prepared,
        file,
        contentType: file.type,
        getPartUrl: (data) => prepareMultipartPartOnServer({ data }),
        completeMultipart: (data) => completeMultipartOnServer({ data }),
        abortMultipart: (data) => abortMultipartOnServer({ data }),
      });
      set(field, prepared.reference);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha no upload do áudio");
    } finally {
      setAudioUploading(null);
    }
  }

  async function updateInstagramProfileImage() {
    const instagramUrl = form.instagram_url?.trim();
    if (!instagramUrl || !savedModel.id || fetchingInstagramImage) return;
    if (!isValidInstagramProfileUrl(instagramUrl)) {
      setInstagramImageFeedback("Insira um link válido de perfil do Instagram.");
      return;
    }
    setFetchingInstagramImage(true);
    setInstagramImageFeedback(null);
    try {
      const { imagePath } = await loadInstagramProfileImage({
        data: { instagramUrl, modelId: savedModel.id },
      });
      set("instagram_profile_image_url", imagePath);
      setInstagramImageFeedback("Foto do Instagram atualizada.");
    } catch {
      setInstagramImageFeedback(
        "Não foi possível atualizar a foto. A última imagem válida continuará sendo utilizada.",
      );
    } finally {
      setFetchingInstagramImage(false);
    }
  }

  async function applyCrop(file: File) {
    if (!cropTarget) return;
    const field = cropTarget.field;
    setUploading(field);
    URL.revokeObjectURL(cropTarget.previewUrl);
    setCropTarget(null);
    try {
      const prepared = await prepareAssetUpload({
        data: {
          asset: "model-asset",
          filename: file.name,
          contentType: file.type,
          size: file.size,
        },
      });
      await uploadFileToR2({
        prepared,
        file,
        contentType: file.type,
        getPartUrl: (data) => prepareMultipartPartOnServer({ data }),
        completeMultipart: (data) => completeMultipartOnServer({ data }),
        abortMultipart: (data) => abortMultipartOnServer({ data }),
      });
      set(field, prepared.reference);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="relative w-full">
      {cropTarget && (
        <ImageCropModal
          file={cropTarget.file}
          previewUrl={cropTarget.previewUrl}
          spec={cropSpecs[cropTarget.field]}
          onCancel={() => {
            URL.revokeObjectURL(cropTarget.previewUrl);
            setCropTarget(null);
          }}
          onApply={applyCrop}
        />
      )}
      <div className="relative isolate min-h-[calc(100vh-11rem)] w-full rounded-3xl border border-border bg-card p-5 text-foreground shadow-xl shadow-black/5 sm:p-7 lg:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Modelos
            </p>
            <h2 className="mt-1 text-xl font-black sm:text-2xl">
              {isNew ? "Novo criador" : `Editar ${savedModel.name}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar para modelos</span>
            <span className="sm:hidden">Voltar</span>
          </button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-1 rounded-2xl border border-border bg-muted p-1 sm:grid-cols-4 xl:grid-cols-8">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`min-h-11 rounded-xl px-3 text-sm font-bold transition ${
              activeTab === "profile"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Perfil e configurações
          </button>
          <button
            type="button"
            disabled={isNew}
            onClick={() => setActiveTab("plans")}
            className={`min-h-11 rounded-xl px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              activeTab === "plans" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Planos
          </button>
          <button
            type="button"
            disabled={isNew}
            onClick={() => setActiveTab("links")}
            className={`min-h-11 rounded-xl px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              activeTab === "links" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Links
          </button>
          <button
            type="button"
            disabled={isNew}
            onClick={() => setActiveTab("content")}
            className={`min-h-11 rounded-xl px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              activeTab === "content"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Conteúdos {!isNew ? `(${(initial.photo_count ?? 0) + (initial.video_count ?? 0)})` : ""}
          </button>
          <button
            type="button"
            disabled={isNew}
            onClick={() => setActiveTab("previews")}
            className={`min-h-11 rounded-xl px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              activeTab === "previews"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Prévias
          </button>
          <button
            type="button"
            disabled={isNew}
            onClick={() => setActiveTab("posts")}
            className={`min-h-11 rounded-xl px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${activeTab === "posts" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Posts
          </button>
          <button
            type="button"
            disabled={isNew}
            onClick={() => setActiveTab("community")}
            className={`min-h-11 rounded-xl px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              activeTab === "community"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Comunidade
          </button>
          <button
            type="button"
            disabled={isNew}
            onClick={() => setActiveTab("testimonials")}
            className={`min-h-11 rounded-xl px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              activeTab === "testimonials"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Depoimentos
          </button>
        </div>

        {activeTab === "profile" ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nome">
                <input
                  value={form.name ?? ""}
                  onChange={(e) => set("name", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Nome de usuário">
                <input
                  value={form.username ?? ""}
                  onChange={(e) =>
                    set(
                      "username",
                      e.target.value
                        .replace(/^@+/, "")
                        .replace(/\s/g, "")
                        .toLocaleLowerCase("pt-BR"),
                    )
                  }
                  className={inputCls}
                  placeholder="ninafoxie"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Link direto: privadinhos.online/
                  {normalizeModelUsername(form.username ?? "usuario")}
                </p>
              </Field>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.is_active}
                    onChange={(e) => set("is_active", e.target.checked)}
                  />
                  Ativo
                </label>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-4 sm:col-span-2">
                <label className="flex cursor-pointer items-start justify-between gap-4">
                  <span>
                    <span className="block text-sm font-bold text-foreground">
                      Exibir na biblioteca
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      Quando desativado, a modelo continuará ativa e poderá vender normalmente
                      através do link direto do perfil, mas não será exibida na biblioteca/tela
                      inicial.
                    </span>
                  </span>
                  <span className="relative mt-0.5 inline-flex shrink-0 items-center">
                    <input
                      type="checkbox"
                      checked={form.show_in_library !== false}
                      onChange={(event) => set("show_in_library", event.target.checked)}
                      className="peer sr-only"
                      role="switch"
                      aria-label="Exibir na biblioteca"
                    />
                    <span className="h-7 w-12 rounded-full bg-muted transition peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50" />
                    <span className="pointer-events-none absolute left-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                  </span>
                </label>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">ID da modelo: </span>
                {savedModel.id ?? "será criado automaticamente ao salvar"}
              </div>
              <Field label="Categoria">
                <select
                  value={categoryId}
                  disabled={loadingAssignments}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className={inputCls}
                >
                  <option value="">Sem categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {!category.is_active ? " (inativa)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Descrição curta" full>
                <textarea
                  rows={2}
                  value={form.short_description ?? ""}
                  onChange={(e) => set("short_description", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3 sm:col-span-2">
                <Field label="Quantidade de posts">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.custom_posts_count ?? ""}
                    onChange={(e) =>
                      set(
                        "custom_posts_count",
                        e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                      )
                    }
                    className={inputCls}
                    placeholder={String((form.photo_count ?? 0) + (form.video_count ?? 0))}
                  />
                </Field>
                <Field label="Quantidade de fotos">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.custom_photo_count ?? ""}
                    onChange={(e) =>
                      set(
                        "custom_photo_count",
                        e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                      )
                    }
                    className={inputCls}
                    placeholder={String(form.photo_count ?? 0)}
                  />
                </Field>
                <Field label="Quantidade de vídeos">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.custom_video_count ?? ""}
                    onChange={(e) =>
                      set(
                        "custom_video_count",
                        e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                      )
                    }
                    className={inputCls}
                    placeholder={String(form.video_count ?? 0)}
                  />
                </Field>
              </div>
              <ImageUploadField
                label="Foto de perfil"
                value={form.profile_image_path ?? null}
                uploading={uploading === "profile_image_path"}
                disabled={isNew}
                spec={cropSpecs.profile_image_path}
                onFile={(f) => handleUpload("profile_image_path", f)}
                onClear={() => set("profile_image_path", null)}
              />
              <ImageUploadField
                label="Capa do perfil e card inicial"
                value={form.profile_cover_image_path ?? null}
                uploading={uploading === "profile_cover_image_path"}
                disabled={isNew}
                spec={cropSpecs.profile_cover_image_path}
                onFile={(f) => handleUpload("profile_cover_image_path", f)}
                onClear={() => set("profile_cover_image_path", null)}
              />
            </div>

            <section className="mt-6 rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Music2 className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-foreground">Áudios do perfil</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Configure uma mensagem para visitantes e outra exclusiva para compradores.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <ProfileAudioSettings
                  audience="Visitantes que ainda não compraram"
                  enabled={!!form.public_audio_enabled}
                  title={form.public_audio_title ?? ""}
                  path={form.public_audio_path ?? null}
                  uploading={audioUploading === "public_audio_path"}
                  disabled={isNew}
                  onEnabled={(value) => set("public_audio_enabled", value)}
                  onTitle={(value) => set("public_audio_title", value)}
                  onFile={(file) => handleAudioUpload("public_audio_path", file)}
                  onClear={() => {
                    set("public_audio_path", null);
                    set("public_audio_enabled", false);
                  }}
                />
                <ProfileAudioSettings
                  audience="Compradores com acesso liberado"
                  enabled={!!form.paid_audio_enabled}
                  title={form.paid_audio_title ?? ""}
                  path={form.paid_audio_path ?? null}
                  uploading={audioUploading === "paid_audio_path"}
                  disabled={isNew}
                  onEnabled={(value) => set("paid_audio_enabled", value)}
                  onTitle={(value) => set("paid_audio_title", value)}
                  onFile={(file) => handleAudioUpload("paid_audio_path", file)}
                  onClear={() => {
                    set("paid_audio_path", null);
                    set("paid_audio_enabled", false);
                  }}
                />
              </div>
            </section>

            {isNew ? (
              <p className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                Salve o perfil uma vez. A tela continuará aberta e os uploads de imagens, fotos e
                vídeos serão liberados automaticamente.
              </p>
            ) : null}

            {err && (
              <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {err}
              </p>
            )}

            {success && (
              <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                {success}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !!uploading || !!audioUploading}
                className="btn-primary flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isNew ? "Salvar e liberar uploads" : "Salvar perfil"}
              </button>
            </div>
          </>
        ) : activeTab === "links" && savedModel.id ? (
          <ModelGatewayLinks
            modelId={savedModel.id}
            name={savedModel.name ?? form.name ?? "Modelo"}
          />
        ) : activeTab === "plans" && savedModel.id && savedModel.name ? (
          <ModelPlansSettings
            model={{ id: savedModel.id, name: savedModel.name }}
            identity={identity}
          />
        ) : activeTab === "community" ? (
          <CommunitySettings
            form={form}
            onChange={set}
            onSave={save}
            saving={saving}
            error={err}
            fetchingInstagramImage={fetchingInstagramImage}
            onUpdateInstagramImage={updateInstagramProfileImage}
            onUploadInstagramImage={(file) => handleUpload("instagram_profile_image_url", file)}
            uploadingInstagramImage={uploading === "instagram_profile_image_url"}
            instagramImageFeedback={instagramImageFeedback}
          />
        ) : savedModel.id && savedModel.name && savedModel.slug ? (
          activeTab === "testimonials" ? (
            <ModelTestimonialsManager modelId={savedModel.id} />
          ) : activeTab === "posts" ? (
            <ModelPostsManager
              model={{
                id: savedModel.id,
                name: savedModel.name,
                username: savedModel.username ?? savedModel.slug,
                profile_image_path: savedModel.profile_image_path ?? null,
              }}
            />
          ) : activeTab === "previews" ? (
            <ModelPreviewManager
              model={{ id: savedModel.id, name: savedModel.name, slug: savedModel.slug }}
              identity={identity}
            />
          ) : (
            <ModelContentManager
              model={{ id: savedModel.id, name: savedModel.name, slug: savedModel.slug }}
              identity={identity}
            />
          )
        ) : null}
      </div>
    </div>
  );
}

function ModelGatewayLinks({ modelId, name }: { modelId: string; name: string }) {
  const loadCampaignLinks = useServerFn(getAdminModelCampaignLinks);
  const [origin, setOrigin] = useState("");
  const [links, setLinks] = useState<Array<{ provider: PaymentProvider; token: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedGateway, setCopiedGateway] = useState<PaymentProvider | null>(null);

  useEffect(() => {
    setOrigin(resolvePublicOrigin(window.location.origin));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loadCampaignLinks({ data: { modelId } })
      .then((result) => {
        if (active) setLinks(result);
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível gerar os links desta modelo.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadCampaignLinks, modelId]);

  async function copyCampaignLink(provider: PaymentProvider, link: string) {
    await copyText(link);
    setCopiedGateway(provider);
    window.setTimeout(
      () => setCopiedGateway((current) => (current === provider ? null : current)),
      1800,
    );
  }

  const gatewayVisuals: Record<
    PaymentProvider,
    { description: string; logo?: string; accent: string; badge: string }
  > = {
    syncpay: {
      description: "Campanhas direcionadas exclusivamente para pagamentos via SyncPay.",
      logo: syncPayLogo,
      accent: "from-sky-500/15 via-blue-500/5 to-transparent",
      badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    },
    pushinpay: {
      description: "Campanhas direcionadas exclusivamente para pagamentos via Pushin Pay.",
      logo: pushinPayLogo,
      accent: "from-indigo-500/15 via-blue-500/5 to-transparent",
      badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    },
    onpay: {
      description: "Campanhas direcionadas exclusivamente para pagamentos via ONPAY.",
      logo: onPayLogo,
      accent: "from-[#1238f5]/20 via-[#1238f5]/5 to-transparent",
      badge: "bg-[#1238f5]/10 text-[#1238f5] dark:text-blue-300",
    },
  };

  return (
    <section>
      <div className="mb-6 overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Link2 className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
              Campanhas por gateway
            </p>
            <h3 className="mt-1 text-xl font-black text-foreground sm:text-2xl">Links de {name}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Use um link diferente em cada campanha para comparar a conversão dos gateways. O
              comprador continua no mesmo perfil; somente a operadora do PIX é definida pelo link.
            </p>
          </div>
        </div>
      </div>

      {loading ? <RouteLoadingOverlay /> : null}
      {error ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!loading && !error ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {PAYMENT_PROVIDERS.map((provider) => {
            const visual = gatewayVisuals[provider.value];
            const copied = copiedGateway === provider.value;
            const campaign = links.find((item) => item.provider === provider.value);
            const path = campaign ? `/c/${campaign.token}` : "";
            const link = origin && path ? `${origin}${path}` : path;

            return (
              <article
                key={provider.value}
                className="group relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
              >
                <div
                  className={`pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${visual.accent}`}
                />
                <div className="relative">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-3">
                      {visual.logo ? (
                        <img
                          src={visual.logo}
                          alt={`Ícone ${provider.label}`}
                          className="h-12 w-12 rounded-2xl border border-white/70 object-cover shadow-md"
                        />
                      ) : null}
                      <span>
                        <strong className="block text-base font-black text-foreground">
                          {provider.label}
                        </strong>
                        <span
                          className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${visual.badge}`}
                        >
                          PIX direcionado
                        </span>
                      </span>
                    </span>
                  </div>

                  <p className="mt-5 min-h-10 text-sm leading-relaxed text-muted-foreground">
                    {visual.description}
                  </p>

                  <div className="mt-4 rounded-2xl border border-border bg-muted/50 p-3">
                    <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      Link da campanha
                    </p>
                    <p className="truncate font-mono text-xs text-foreground" title={link}>
                      {link}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                    <button
                      type="button"
                      disabled={!link}
                      onClick={() => void copyCampaignLink(provider.value, link)}
                      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-45 ${
                        copied
                          ? "bg-emerald-500 text-white"
                          : "bg-primary text-primary-foreground hover:brightness-95"
                      }`}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? "Copiado" : "Copiar link"}
                    </button>
                    <a
                      href={link || undefined}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Abrir link ${provider.label}`}
                      className="grid min-h-11 w-11 place-items-center rounded-xl border border-border text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <p className="mt-5 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Você pode adicionar parâmetros UTM depois do link normalmente. O código identifica a modelo
        e o gateway no servidor sem expor a operadora na URL.
      </p>
    </section>
  );
}

type ModelPlanOfferRow = {
  id: string;
  duration_days: number;
  price: number;
  display_order: number;
  is_active: boolean;
};

type ModelPlanDraft = {
  key: string;
  durationValue: string;
  durationUnit: PlanDurationUnit;
  price: string;
};

function modelPlanDraft(days: number, price: number | string, key: string): ModelPlanDraft {
  const duration = planDurationFromDays(days);
  return {
    key,
    durationValue: String(duration.value),
    durationUnit: duration.unit,
    price: String(price).replace(".", ","),
  };
}

function parseModelPlanPrice(value: string) {
  const normalized = value.trim().replace(/\s/g, "");
  return Number(
    normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized,
  );
}

function ModelPlansSettings({
  model,
  identity,
}: {
  model: { id: string; name: string };
  identity: AdminIdentity;
}) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState(`Plano de ${model.name}`);
  const [offers, setOffers] = useState<ModelPlanDraft[]>([modelPlanDraft(30, "", "initial-30")]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadPlan() {
      setLoading(true);
      setError(null);
      const { data: assignment, error: assignmentError } = await supabase
        .from("plan_models")
        .select("plan_id,plans(id,name,price,duration_days)")
        .eq("model_id", model.id)
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (assignmentError) {
        setError(assignmentError.message);
        setLoading(false);
        return;
      }
      const assignedPlan = assignment?.plans as unknown as {
        id: string;
        name: string;
        price: number;
        duration_days: number | null;
      } | null;
      if (!assignedPlan) {
        setPlanId(null);
        setPlanName(`Plano de ${model.name}`);
        setOffers([modelPlanDraft(30, "", "initial-30")]);
        setLoading(false);
        return;
      }
      const { data: offerRows, error: offersError } = await supabase
        .from("plan_offers")
        .select("id,duration_days,price,display_order,is_active")
        .eq("plan_id", assignedPlan.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (!active) return;
      if (offersError) {
        setError(offersError.message);
      } else {
        const rows = (offerRows ?? []) as ModelPlanOfferRow[];
        setPlanId(assignedPlan.id);
        setPlanName(assignedPlan.name);
        setOffers(
          rows.length
            ? rows.map((offer) => modelPlanDraft(offer.duration_days, offer.price, offer.id))
            : [
                modelPlanDraft(
                  assignedPlan.duration_days ?? 30,
                  assignedPlan.price,
                  `base-${assignedPlan.id}`,
                ),
              ],
        );
      }
      setLoading(false);
    }
    void loadPlan();
    return () => {
      active = false;
    };
  }, [model.id, model.name]);

  function updateOffer(key: string, patch: Partial<ModelPlanDraft>) {
    setOffers((current) =>
      current.map((offer) => (offer.key === key ? { ...offer, ...patch } : offer)),
    );
  }

  function addOffer() {
    setOffers((current) => [
      ...current,
      {
        key: `new-${crypto.randomUUID()}`,
        durationValue: "1",
        durationUnit: "months",
        price: "",
      },
    ]);
  }

  async function savePlan() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const normalizedName = planName.trim();
      if (!normalizedName) throw new Error("Informe o nome do plano.");
      if (!offers.length) throw new Error("Adicione pelo menos uma opção de acesso.");

      const parsedOffers = offers.map((offer, index) => {
        const durationValue = Number(offer.durationValue);
        if (!Number.isInteger(durationValue) || durationValue <= 0 || durationValue > 36500) {
          throw new Error(`Informe uma duração válida na opção ${index + 1}.`);
        }
        const durationDays = planDurationToDays(durationValue, offer.durationUnit);
        const price = parseModelPlanPrice(offer.price);
        if (!Number.isFinite(price) || price <= 0) {
          throw new Error(`Informe um preço válido na opção ${index + 1}.`);
        }
        return { durationDays, price, displayOrder: index };
      });
      if (new Set(parsedOffers.map((offer) => offer.durationDays)).size !== parsedOffers.length) {
        throw new Error("Existem duas opções com a mesma duração.");
      }

      let targetPlanId = planId;
      let createIndividualPlan = !targetPlanId;
      if (targetPlanId) {
        const { count, error: countError } = await supabase
          .from("plan_models")
          .select("model_id", { count: "exact", head: true })
          .eq("plan_id", targetPlanId);
        if (countError) throw countError;
        createIndividualPlan = (count ?? 0) > 1;
      }

      const primary = parsedOffers[0];
      const planPayload = {
        name: normalizedName,
        price: primary.price,
        is_active: true,
        access_type: "subscription",
        duration_days: primary.durationDays,
        is_featured: true,
        eyebrow_text: null,
        promo_tag_text: null,
        promo_tag_color: null,
      };

      if (createIndividualPlan) {
        const previousPlanId = targetPlanId;
        const { data: createdPlan, error: createError } = await supabase
          .from("plans")
          .insert(planPayload)
          .select("id")
          .single();
        if (createError) throw createError;
        targetPlanId = createdPlan.id;

        const { error: offersError } = await supabase.from("plan_offers").insert(
          parsedOffers.map((offer) => ({
            plan_id: targetPlanId!,
            duration_days: offer.durationDays,
            price: offer.price,
            is_primary: offer.displayOrder === 0,
            is_highlighted: false,
            button_color: null,
            tag_text: null,
            tag_color: null,
            display_order: offer.displayOrder,
            is_active: true,
          })),
        );
        if (offersError) {
          await supabase.from("plans").delete().eq("id", targetPlanId);
          throw offersError;
        }

        const { error: detachError } = await supabase
          .from("plan_models")
          .delete()
          .eq("model_id", model.id);
        if (detachError) throw detachError;
        const { error: attachError } = await supabase
          .from("plan_models")
          .insert({ plan_id: targetPlanId, model_id: model.id });
        if (attachError) {
          if (previousPlanId) {
            await supabase
              .from("plan_models")
              .insert({ plan_id: previousPlanId, model_id: model.id });
          }
          await supabase.from("plans").delete().eq("id", targetPlanId);
          throw attachError;
        }
      } else {
        const { error: updateError } = await supabase
          .from("plans")
          .update(planPayload)
          .eq("id", targetPlanId!);
        if (updateError) throw updateError;
        const { error: clearError } = await supabase
          .from("plan_offers")
          .delete()
          .eq("plan_id", targetPlanId!);
        if (clearError) throw clearError;
        const { error: offersError } = await supabase.from("plan_offers").insert(
          parsedOffers.map((offer) => ({
            plan_id: targetPlanId!,
            duration_days: offer.durationDays,
            price: offer.price,
            is_primary: offer.displayOrder === 0,
            is_highlighted: false,
            button_color: null,
            tag_text: null,
            tag_color: null,
            display_order: offer.displayOrder,
            is_active: true,
          })),
        );
        if (offersError) throw offersError;
      }

      setPlanId(targetPlanId);
      setOffers(
        parsedOffers.map((offer, index) =>
          modelPlanDraft(offer.durationDays, offer.price, `saved-${targetPlanId}-${index}`),
        ),
      );
      await logAdminAction({
        adminId: identity.adminId,
        action: "model.plan.update",
        entityType: "model",
        entityId: model.id,
        details: {
          planId: targetPlanId,
          name: normalizedName,
          offers: parsedOffers,
        },
      });
      setSuccess("Plano da modelo salvo com sucesso.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o plano.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <RouteLoadingOverlay />;

  return (
    <section>
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <h3 className="font-black">Plano individual de {model.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure livremente o nome, o preço e o período de cada opção. O primeiro item será a
          opção principal exibida no perfil.
        </p>
      </div>

      <label className="mt-5 block text-sm font-bold">
        Nome do plano
        <input
          value={planName}
          onChange={(event) => setPlanName(event.target.value)}
          maxLength={100}
          placeholder={`Plano de ${model.name}`}
          className={`${inputCls} mt-2`}
        />
      </label>

      <div className="mt-5 space-y-3">
        {offers.map((offer, index) => (
          <article key={offer.key} className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="font-black">Opção {index + 1}</h4>
                <p className="text-xs text-muted-foreground">
                  {index === 0 ? "Plano principal" : "Opção adicional"}
                </p>
              </div>
              {offers.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setOffers((current) => current.filter((item) => item.key !== offer.key))
                  }
                  aria-label={`Remover opção ${index + 1}`}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr]">
              <label className="text-sm font-bold">
                Tempo
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={36500}
                  step={1}
                  value={offer.durationValue}
                  onChange={(event) =>
                    updateOffer(offer.key, { durationValue: event.target.value })
                  }
                  className={`${inputCls} mt-1.5`}
                />
              </label>
              <label className="text-sm font-bold">
                Unidade
                <select
                  value={offer.durationUnit}
                  onChange={(event) =>
                    updateOffer(offer.key, {
                      durationUnit: event.target.value as PlanDurationUnit,
                    })
                  }
                  className={`${inputCls} mt-1.5`}
                >
                  {PLAN_DURATION_UNITS.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold">
                Preço
                <span className="mt-1.5 flex min-h-11 items-center rounded-xl border border-border bg-input px-3 focus-within:border-primary">
                  <span className="mr-2 text-sm font-bold text-muted-foreground">R$</span>
                  <input
                    inputMode="decimal"
                    value={offer.price}
                    onChange={(event) => updateOffer(offer.key, { price: event.target.value })}
                    placeholder="0,00"
                    className="min-w-0 flex-1 bg-transparent font-bold outline-none"
                  />
                </span>
              </label>
            </div>
          </article>
        ))}
      </div>

      <button
        type="button"
        onClick={addOffer}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-black text-primary"
      >
        <Plus className="h-4 w-4" /> Adicionar opção
      </button>

      {error ? (
        <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => void savePlan()}
          disabled={saving}
          className="btn-primary inline-flex min-h-12 items-center gap-2 rounded-xl px-6 text-sm font-black disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar plano da modelo
        </button>
      </div>
    </section>
  );
}

function CommunitySettings({
  form,
  onChange,
  onSave,
  saving,
  error,
  fetchingInstagramImage,
  onUpdateInstagramImage,
  onUploadInstagramImage,
  uploadingInstagramImage,
  instagramImageFeedback,
}: {
  form: Partial<ModelRow>;
  onChange: <K extends keyof ModelRow>(key: K, value: ModelRow[K]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  error: string | null;
  fetchingInstagramImage: boolean;
  onUpdateInstagramImage: () => void;
  onUploadInstagramImage: (file: File) => void;
  uploadingInstagramImage: boolean;
  instagramImageFeedback: string | null;
}) {
  const [instagramImageFailed, setInstagramImageFailed] = useState(false);
  const [communityTab, setCommunityTab] = useState<"telegram" | "instagram">("telegram");
  const instagramImageInputRef = useRef<HTMLInputElement>(null);
  const instagramUrl = form.instagram_url?.trim() ?? "";
  const isInstagramUrlValid = !instagramUrl || isValidInstagramProfileUrl(instagramUrl);
  const hasInstagramImage = !!form.instagram_profile_image_url && !instagramImageFailed;

  useEffect(() => {
    setInstagramImageFailed(false);
  }, [form.instagram_profile_image_url]);

  return (
    <section className="mx-auto max-w-3xl">
      <header className="mb-4 px-1 sm:mb-5">
        <h3 className="text-xl font-black">Comunidade</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Configure os benefícios e canais complementares exibidos para a modelo.
        </p>
      </header>

      <div className="mb-4 flex justify-center sm:mb-5">
        <div className="inline-flex rounded-2xl border border-border bg-muted/50 p-1">
          <button
            type="button"
            onClick={() => setCommunityTab("telegram")}
            className={`min-h-10 rounded-xl px-5 text-sm font-bold transition ${communityTab === "telegram" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Telegram
          </button>
          <button
            type="button"
            onClick={() => setCommunityTab("instagram")}
            className={`min-h-10 rounded-xl px-5 text-sm font-bold transition ${communityTab === "instagram" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Instagram
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5">
        {communityTab === "telegram" ? (
          <section className="rounded-3xl border border-border bg-muted/35 p-5 sm:p-6">
            <h4 className="text-lg font-black">Comunidade Premium</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure o acesso exclusivo liberado após a compra.
            </p>

            <label className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-border bg-white px-4 py-3 text-sm font-bold">
              <span>
                Ativar comunidade premium
                <small className="mt-1 block text-xs font-normal text-muted-foreground">
                  Exibe o bônus antes da compra e o acesso após a liberação.
                </small>
              </span>
              <input
                type="checkbox"
                checked={!!form.community_enabled}
                onChange={(event) => onChange("community_enabled", event.target.checked)}
                className="h-5 w-5 accent-primary"
              />
            </label>
            <div
              className={`mt-4 grid gap-4 transition-opacity ${form.community_enabled ? "" : "opacity-55"}`}
            >
              <Field label="Link premium do Telegram">
                <input
                  type="url"
                  value={form.community_telegram_url ?? ""}
                  onChange={(event) =>
                    onChange("community_telegram_url", event.target.value || null)
                  }
                  className={inputCls}
                  placeholder="https://t.me/+seu_link_privado"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Use um link seguro iniciado por https://t.me/
                </p>
              </Field>
              <div className="border-t border-border pt-4">
                <p className="text-sm font-bold">Conteúdo do card</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Personalize o conteúdo exibido para o cliente após a liberação.
                </p>
                <div className="mt-3 grid gap-3">
                  <Field label="Título do card">
                    <input
                      value={form.community_title ?? ""}
                      onChange={(event) => onChange("community_title", event.target.value || null)}
                      className={inputCls}
                      placeholder="Entre para minha comunidade exclusiva"
                    />
                  </Field>
                  <Field label="Descrição">
                    <textarea
                      rows={3}
                      value={form.community_description ?? ""}
                      onChange={(event) =>
                        onChange("community_description", event.target.value || null)
                      }
                      className={inputCls}
                      placeholder="Seu acesso foi liberado. Entre agora no meu canal premium no Telegram."
                    />
                  </Field>
                  <Field label="Texto do botão">
                    <input
                      value={form.community_button_text ?? ""}
                      onChange={(event) =>
                        onChange("community_button_text", event.target.value || null)
                      }
                      className={inputCls}
                      placeholder="Acessar comunidade no Telegram"
                    />
                  </Field>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {communityTab === "instagram" ? (
          <section
            className={`rounded-3xl border border-border bg-muted/35 p-5 sm:p-6 ${form.instagram_enabled ? "" : ""}`}
          >
            <h4 className="text-lg font-black">Instagram</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Divulgue o perfil público da modelo abaixo das ofertas.
            </p>
            <label className="mt-4 flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-border bg-white px-4 py-3 text-sm font-bold">
              <span>
                Exibir perfil do Instagram
                <small className="mt-1 block text-xs font-normal text-muted-foreground">
                  Mostra o perfil na página pública da modelo.
                </small>
              </span>
              <input
                type="checkbox"
                checked={!!form.instagram_enabled}
                onChange={(event) => onChange("instagram_enabled", event.target.checked)}
                className="h-5 w-5 accent-primary"
              />
            </label>
            <div
              className={`mt-4 transition-opacity ${form.instagram_enabled ? "" : "opacity-70"}`}
            >
              <Field label="Link do perfil do Instagram">
                <input
                  type="url"
                  value={form.instagram_url ?? ""}
                  onChange={(event) => onChange("instagram_url", event.target.value || null)}
                  className={`${inputCls} mt-3`}
                  placeholder="https://instagram.com/nomedamodelo"
                />
                {!isInstagramUrlValid ? (
                  <p className="mt-2 text-xs font-medium text-destructive">
                    Insira um link válido de perfil do Instagram.
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-white p-3 sm:flex-nowrap">
                  {hasInstagramImage ? (
                    <img
                      src={resolveMediaUrl(form.instagram_profile_image_url, 0)}
                      alt="Prévia da foto de perfil do Instagram"
                      onError={() => setInstagramImageFailed(true)}
                      className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-primary/20"
                    />
                  ) : (
                    <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white">
                      <Instagram className="h-7 w-7" aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">Foto do perfil</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {hasInstagramImage
                        ? "Foto de perfil atualizada a partir do Instagram."
                        : "Nenhuma foto válida encontrada."}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:ml-auto sm:justify-end">
                    <input
                      ref={instagramImageInputRef}
                      type="file"
                      accept={ALLOWED_IMAGE_TYPES.join(",")}
                      className="hidden"
                      onChange={(event) => {
                        const [file] = Array.from(event.target.files ?? []);
                        if (file) onUploadInstagramImage(file);
                        event.currentTarget.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => instagramImageInputRef.current?.click()}
                      disabled={uploadingInstagramImage}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-bold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uploadingInstagramImage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Enviar manualmente
                    </button>
                    <button
                      type="button"
                      onClick={() => void onUpdateInstagramImage()}
                      disabled={!instagramUrl || !isInstagramUrlValid || fetchingInstagramImage}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary/35 px-3 text-sm font-bold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {fetchingInstagramImage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      {hasInstagramImage ? "Atualizar" : "Buscar foto"}
                    </button>
                  </div>
                </div>
                {instagramImageFeedback ? (
                  <p
                    className={`mt-2 text-xs font-medium ${instagramImageFeedback === "Foto do Instagram atualizada." ? "text-emerald-600" : "text-destructive"}`}
                  >
                    {instagramImageFeedback}
                  </p>
                ) : null}
              </Field>
            </div>
          </section>
        ) : null}
      </div>

      {error ? (
        <p className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:opacity-60 sm:w-auto"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </section>
  );
}

type CropSpec = {
  label: string;
  ratioLabel: string;
  width: number;
  height: number;
  previewClass: string;
  fileSuffix: string;
};

const cropSpecs = {
  profile_image_path: {
    label: "Foto de perfil",
    ratioLabel: "1:1",
    width: 1080,
    height: 1080,
    previewClass: "aspect-square w-24",
    fileSuffix: "1x1",
  },
  cover_image_path: {
    label: "Capa da biblioteca",
    ratioLabel: "3:4",
    width: 1200,
    height: 1600,
    previewClass: "aspect-[3/4] w-[4.5rem]",
    fileSuffix: "3x4",
  },
  profile_cover_image_path: {
    label: "Capa do perfil",
    ratioLabel: "16:9",
    width: 1920,
    height: 1080,
    previewClass: "aspect-video w-32",
    fileSuffix: "16x9",
  },
  instagram_profile_image_url: {
    label: "Foto do Instagram",
    ratioLabel: "1:1",
    width: 1080,
    height: 1080,
    previewClass: "aspect-square w-24",
    fileSuffix: "instagram-1x1",
  },
} satisfies Record<string, CropSpec>;

function ImageUploadField({
  label,
  value,
  uploading,
  disabled,
  spec,
  onFile,
  onClear,
}: {
  label: string;
  value: string | null;
  uploading: boolean;
  disabled: boolean;
  spec: CropSpec;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(value);

  useEffect(() => {
    let active = true;

    async function loadPreview() {
      if (
        !value ||
        /^https?:\/\//i.test(value) ||
        value.startsWith("data:") ||
        value.startsWith("blob:")
      ) {
        if (active) setPreviewUrl(value);
        return;
      }

      if (value.startsWith("r2://")) {
        if (active) setPreviewUrl(`/api/public/media?ref=${encodeURIComponent(value)}`);
        return;
      }

      const [bucket, ...parts] = value.split("/").filter(Boolean);
      if (!bucket || parts.length === 0) {
        if (active) setPreviewUrl(value);
        return;
      }

      if (bucket === "model-public-images") {
        const { data } = supabase.storage.from(bucket).getPublicUrl(parts.join("/"));
        if (active) setPreviewUrl(data.publicUrl);
        return;
      }

      // Existing images were stored in a private bucket. Admins can still
      // preview them while replacing them with the new public image bucket.
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(parts.join("/"), 60 * 60);
      if (active) setPreviewUrl(data?.signedUrl ?? value);
    }

    void loadPreview();
    return () => {
      active = false;
    };
  }, [value]);

  function acceptFile(file?: File) {
    if (file && !uploading && !disabled) onFile(file);
  }

  return (
    <div className="sm:col-span-2">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <div
        role="button"
        tabIndex={uploading || disabled ? -1 : 0}
        aria-label={`Selecionar e ajustar ${label.toLowerCase()}`}
        onClick={() => !uploading && !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (!uploading && !disabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!uploading && !disabled) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          acceptFile(event.dataTransfer.files?.[0]);
        }}
        className={`group flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed p-3 transition ${
          dragging
            ? "border-primary bg-primary/10 ring-2 ring-primary/20"
            : "border-border bg-input hover:border-primary/60 hover:bg-muted"
        } ${uploading || disabled ? "pointer-events-none opacity-45" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            acceptFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
          disabled={uploading || disabled}
        />
        <div
          className={`relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-muted ${spec.previewClass}`}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
          {uploading && (
            <div className="absolute inset-0 grid place-items-center bg-black/60">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Upload className="h-4 w-4 text-primary" />
            )}
            {disabled
              ? "Salve o perfil para liberar"
              : uploading
                ? "Enviando imagem..."
                : value
                  ? "Clique para trocar e ajustar"
                  : "Arraste uma imagem ou clique para selecionar"}
          </div>
          <p className="text-xs text-muted-foreground">
            Você poderá mover, ampliar e recortar antes de enviar.
          </p>
          {value && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClear();
              }}
              className="self-start text-xs text-muted-foreground hover:text-destructive"
            >
              Remover imagem
            </button>
          )}
          <p className="text-[10px] text-muted-foreground">
            JPG, PNG ou WEBP · formato final {spec.ratioLabel} ({spec.width}×{spec.height}).
          </p>
        </div>
      </div>
    </div>
  );
}

function ImageCropModal({
  file,
  previewUrl,
  spec,
  onCancel,
  onApply,
}: {
  file: File;
  previewUrl: string;
  spec: CropSpec;
  onCancel: () => void;
  onApply: (file: File) => Promise<void>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function geometry(nextZoom = zoom) {
    const viewport = viewportRef.current;
    if (!viewport || !naturalSize.width || !naturalSize.height) return null;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const baseScale = Math.max(width / naturalSize.width, height / naturalSize.height);
    const displayWidth = naturalSize.width * baseScale * nextZoom;
    const displayHeight = naturalSize.height * baseScale * nextZoom;
    return {
      width,
      height,
      displayWidth,
      displayHeight,
      maxX: Math.max(0, (displayWidth - width) / 2),
      maxY: Math.max(0, (displayHeight - height) / 2),
    };
  }

  function clampOffset(next: { x: number; y: number }, nextZoom = zoom) {
    const dimensions = geometry(nextZoom);
    if (!dimensions) return next;
    return {
      x: Math.max(-dimensions.maxX, Math.min(dimensions.maxX, next.x)),
      y: Math.max(-dimensions.maxY, Math.min(dimensions.maxY, next.y)),
    };
  }

  function changeZoom(nextZoom: number) {
    setZoom(nextZoom);
    setOffset((current) => clampOffset(current, nextZoom));
  }

  async function exportCrop() {
    const dimensions = geometry();
    const image = imageRef.current;
    if (!dimensions || !image) return;
    setProcessing(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = spec.width;
      canvas.height = spec.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("O editor de imagem não está disponível neste navegador.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      const scale = spec.width / dimensions.width;
      const drawX = ((dimensions.width - dimensions.displayWidth) / 2 + offset.x) * scale;
      const drawY = ((dimensions.height - dimensions.displayHeight) / 2 + offset.y) * scale;
      context.drawImage(
        image,
        drawX,
        drawY,
        dimensions.displayWidth * scale,
        dimensions.displayHeight * scale,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.92),
      );
      if (!blob) throw new Error("Não foi possível concluir o recorte.");
      const baseName = file.name.replace(/\.[^.]+$/, "") || "imagem";
      await onApply(
        new File([blob], `${baseName}-${spec.fileSuffix}.webp`, { type: "image/webp" }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível ajustar a imagem.");
      setProcessing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 backdrop-blur-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-4 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Ajustar {spec.label}
            </p>
            <h3 className="mt-1 text-xl font-black">Zoom e recorte</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Arraste a imagem para escolher exatamente o que ficará visível.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={processing}
            className="rounded-full border border-border p-2.5 hover:bg-muted disabled:opacity-50"
            aria-label="Fechar editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={viewportRef}
          className="relative mx-auto max-w-full touch-none cursor-grab overflow-hidden rounded-2xl bg-black active:cursor-grabbing"
          style={{
            aspectRatio: `${spec.width} / ${spec.height}`,
            width: `min(100%, calc(54dvh * ${spec.width / spec.height}), 520px)`,
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = {
              x: event.clientX,
              y: event.clientY,
              offsetX: offset.x,
              offsetY: offset.y,
            };
          }}
          onPointerMove={(event) => {
            if (!dragRef.current) return;
            setOffset(
              clampOffset({
                x: dragRef.current.offsetX + event.clientX - dragRef.current.x,
                y: dragRef.current.offsetY + event.clientY - dragRef.current.y,
              }),
            );
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
        >
          <img
            ref={imageRef}
            src={previewUrl}
            alt={`Prévia de ${spec.label.toLowerCase()}`}
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth < MIN_DIMENSION || image.naturalHeight < MIN_DIMENSION) {
                setError(`Imagem muito pequena. Mínimo ${MIN_DIMENSION}px em cada lado.`);
                return;
              }
              setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
            }}
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
            style={
              naturalSize.width
                ? (() => {
                    const dimensions = geometry();
                    return dimensions
                      ? {
                          width: dimensions.displayWidth,
                          height: dimensions.displayHeight,
                          transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                        }
                      : undefined;
                  })()
                : undefined
            }
          />
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/30" />
          <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/20" />
          <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/20" />
          <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/20" />
          <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/20" />
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-muted px-4 py-3">
          <ZoomIn className="h-4 w-4 shrink-0 text-primary" />
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => changeZoom(Number(event.target.value))}
            className="w-full accent-primary"
            aria-label="Zoom da imagem"
          />
          <span className="w-11 text-right text-xs font-bold">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
            className="rounded-lg border border-border p-2 hover:bg-muted"
            aria-label="Restaurar enquadramento"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={processing}
            className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={exportCrop}
            disabled={processing || !!error || !naturalSize.width}
            className="btn-primary flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black disabled:opacity-50"
          >
            {processing && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplicar recorte
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileAudioSettings({
  audience,
  enabled,
  title,
  path,
  uploading,
  disabled,
  onEnabled,
  onTitle,
  onFile,
  onClear,
}: {
  audience: string;
  enabled: boolean;
  title: string;
  path: string | null;
  uploading: boolean;
  disabled: boolean;
  onEnabled: (value: boolean) => void;
  onTitle: (value: string) => void;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const inputId = `profile-audio-${audience.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-foreground">{audience}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Exibido no final do card do perfil.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabled(event.target.checked)}
          />
          Mostrar
        </label>
      </div>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Título
      </label>
      <input
        value={title}
        maxLength={80}
        onChange={(event) => onTitle(event.target.value)}
        className={`${inputCls} mt-1`}
        placeholder="Uma mensagem especial para você"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary transition hover:bg-primary/10 ${disabled || uploading ? "pointer-events-none opacity-50" : ""}`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? "Enviando…" : path ? "Substituir áudio" : "Enviar áudio"}
        </label>
        <input
          id={inputId}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/opus,audio/webm,audio/flac,audio/x-flac,.mp3,.wav,.m4a,.aac,.ogg,.opus,.webm,.flac"
          className="sr-only"
          disabled={disabled || uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
        {path ? (
          <button
            type="button"
            onClick={onClear}
            className="min-h-10 rounded-xl px-3 text-xs font-semibold text-destructive hover:bg-destructive/10"
          >
            Remover
          </button>
        ) : null}
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">
        {path
          ? `Arquivo pronto: ${path.split("/").pop()}`
          : disabled
            ? "Salve a modelo para liberar o upload."
            : "MP3, WAV, M4A, AAC, OGG, OPUS, WEBM ou FLAC · até 100 MB"}
      </p>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary";
function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

type ReorderItem = { id: string; name: string; username: string; image: string | null };

function BulkReorderModal({
  items,
  onClose,
  onApply,
}: {
  items: ReorderItem[];
  onClose: () => void;
  onApply: (orderedIds: string[]) => Promise<void>;
}) {
  const [list, setList] = useState<ReorderItem[]>(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function move(fromId: string, toId: string) {
    if (fromId === toId) return;
    setList((prev) => {
      const from = prev.findIndex((i) => i.id === fromId);
      const to = prev.findIndex((i) => i.id === toId);
      if (from < 0 || to < 0) return prev;
      const next = prev.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function nudge(id: string, dir: -1 | 1) {
    setList((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-6 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black">Reordenar criadores</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Arraste ou use as setas. A ordem final será aplicada ao salvar.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-border p-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-2">
          {list.map((item, idx) => {
            const isDragging = dragId === item.id;
            const isOver = overId === item.id && dragId !== item.id;
            return (
              <li
                key={item.id}
                draggable
                onDragStart={(e) => {
                  setDragId(item.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overId !== item.id) setOverId(item.id);
                }}
                onDragLeave={() => {
                  if (overId === item.id) setOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) move(dragId, item.id);
                  setDragId(null);
                  setOverId(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                className={`flex items-center gap-3 rounded-xl border p-2 transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/10 opacity-70"
                    : isOver
                      ? "border-primary bg-primary/5"
                      : "border-border bg-input"
                }`}
              >
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                  {item.image ? (
                    <img src={item.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">@{item.username}</p>
                </div>
                <span className="text-[11px] font-bold text-muted-foreground">#{idx + 1}</span>
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => nudge(item.id, -1)}
                    disabled={idx === 0}
                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Mover para cima"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => nudge(item.id, 1)}
                    disabled={idx === list.length - 1}
                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Mover para baixo"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            disabled={saving || list.length === 0}
            onClick={async () => {
              setSaving(true);
              try {
                await onApply(list.map((i) => i.id));
              } finally {
                setSaving(false);
              }
            }}
            className="btn-primary flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar ordem
          </button>
        </div>
      </div>
    </div>
  );
}
