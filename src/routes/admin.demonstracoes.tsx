import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteLoadingOverlay } from "@/components/ui/RouteLoadingOverlay";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Film,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useConfirmDialog } from "@/components/admin/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { resolveDemonstrationUrl, type Demonstration } from "@/lib/demonstrations";
import { formatPrice, resolveMediaUrl, type PublicModel } from "@/lib/models";
import { abortR2MultipartMediaUpload, completeR2MultipartMediaUpload, prepareR2AssetUpload, prepareR2MultipartPartUpload } from "@/lib/media-storage.functions";
import { uploadFileToR2 } from "@/lib/r2-upload";

export const Route = createFileRoute("/admin/demonstracoes")({
  head: () => ({
    meta: [
      { title: "Demonstrações — Privadinhos Online Admin" },
      { name: "description", content: "Gestão do conteúdo exibido no Acesso Livre." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminLayout
      title="Demonstrações"
      subtitle="Cadastre modelos gratuitas, imagens e vídeos para a seção Acesso Livre."
    >
      {() => <DemonstrationsPage />}
    </AdminLayout>
  ),
});

function DemonstrationsPage() {
  const [tab, setTab] = useState<"media" | "models">("media");
  const [items, setItems] = useState<Demonstration[]>([]);
  const [freeModels, setFreeModels] = useState<PublicModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirmAction, confirmDialog } = useConfirmDialog();
  const prepareAssetUpload = useServerFn(prepareR2AssetUpload);
  const prepareMultipartPartOnServer = useServerFn(prepareR2MultipartPartUpload);
  const completeMultipartOnServer = useServerFn(completeR2MultipartMediaUpload);
  const abortMultipartOnServer = useServerFn(abortR2MultipartMediaUpload);

  const reload = useCallback(async () => {
    setLoading(true);
    const [demos, models] = await Promise.all([
      supabase
        .from("free_demonstrations")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false }),
      supabase
        .from("models")
        .select("*")
        .eq("price", 0)
        .eq("is_active", true)
        .order("display_order", { ascending: true }),
    ]);
    if (demos.error) {
      setError("Aplique a migração de Demonstrações no Supabase para começar a cadastrar mídias.");
      setItems([]);
    } else {
      setError(null);
      setItems((demos.data ?? []) as Demonstration[]);
    }
    setFreeModels((models.data ?? []) as PublicModel[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function upload(file: File) {
    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    const isVideo = ["video/mp4", "video/webm"].includes(file.type);
    if (!isImage && !isVideo) {
      setError("Formato inválido. Envie JPG, PNG, WEBP, MP4 ou WEBM.");
      return;
    }
    setUploading(true);
    setError(null);
    let reference = "";
    try {
      const prepared = await prepareAssetUpload({ data: {
        asset: "demonstration", filename: file.name, contentType: file.type, size: file.size,
      } });
      await uploadFileToR2({ prepared, file, contentType: file.type, getPartUrl: (data) => prepareMultipartPartOnServer({ data }), completeMultipart: (data) => completeMultipartOnServer({ data }), abortMultipart: (data) => abortMultipartOnServer({ data }) });
      reference = prepared.reference;
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Não foi possível enviar o arquivo.");
      setUploading(false);
      return;
    }
    const { error: insertError } = await supabase.from("free_demonstrations").insert({
      demonstration_type: isVideo ? "video" : "image",
      title: file.name.replace(/\.[^.]+$/, ""),
      file_path: reference,
      display_order: items.length,
      is_active: true,
    });
    if (insertError) {
      setError(insertError.message);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    await reload();
  }

  async function update(item: Demonstration, patch: Partial<Demonstration>) {
    const { error: updateError } = await supabase
      .from("free_demonstrations")
      .update(patch)
      .eq("id", item.id);
    if (updateError) setError(updateError.message);
    else await reload();
  }

  async function remove(item: Demonstration) {
    const confirmed = await confirmAction({
      title: "Excluir demonstração?",
      description: `A demonstração “${item.title || "Sem título"}” será removida permanentemente do banco e do armazenamento.`,
      confirmText: "Excluir demonstração",
      destructive: true,
    });
    if (!confirmed) return;
    await supabase.from("free_demonstrations").delete().eq("id", item.id);
    await reload();
  }

  async function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ordered = [...items];
    const from = ordered.findIndex((item) => item.id === dragId);
    const to = ordered.findIndex((item) => item.id === targetId);
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setItems(ordered.map((item, index) => ({ ...item, display_order: index })));
    setDragId(null);
    await Promise.all(
      ordered.map((item, index) =>
        supabase.from("free_demonstrations").update({ display_order: index }).eq("id", item.id),
      ),
    );
    await reload();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-muted p-1">
        <button
          type="button"
          onClick={() => setTab("media")}
          className={`min-h-12 rounded-xl text-sm font-bold ${
            tab === "media" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Imagens e vídeos ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("models")}
          className={`min-h-12 rounded-xl text-sm font-bold ${
            tab === "models" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Modelos grátis ({freeModels.length})
        </button>
      </div>

      {tab === "media" ? (
        <>
          <section className="admin-glass rounded-3xl p-5 sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black">Nova mídia avulsa</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cada arquivo enviado vira uma demonstração individual na página inicial.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="btn-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 font-black disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Adicionar arquivo
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                className="hidden"
                onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])}
              />
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => !uploading && fileRef.current?.click()}
              className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/50 text-center transition hover:border-primary/40 hover:bg-primary/5"
            >
              <UploadCloud className="mb-2 h-8 w-8 text-primary" />
              <p className="font-bold">Clique para selecionar uma imagem ou vídeo</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Imagens até 15 MB · vídeos até 500 MB
              </p>
            </div>
            {error ? (
              <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </section>

          {loading ? (
            <RouteLoadingOverlay />
          ) : items.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => {
                const url = resolveDemonstrationUrl(item.file_path);
                return (
                  <article
                    key={item.id}
                    draggable
                    onDragStart={() => setDragId(item.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => drop(item.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`overflow-hidden rounded-2xl border bg-muted transition ${
                      dragId === item.id ? "border-primary/40 opacity-50" : "border-border"
                    }`}
                  >
                    <div className="relative aspect-[3/4] bg-muted">
                      {item.demonstration_type === "video" ? (
                        <video
                          src={url}
                          muted
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <img
                          src={url}
                          alt={item.title || ""}
                          className="h-full w-full object-cover"
                        />
                      )}
                      <span className="absolute right-2 top-2 grid h-9 w-9 cursor-grab place-items-center rounded-xl bg-black/65 text-white backdrop-blur">
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-black text-white backdrop-blur">
                        {item.demonstration_type === "video" ? "VÍDEO" : "IMAGEM"}
                      </span>
                    </div>
                    <div className="space-y-3 p-3">
                      <input
                        value={item.title ?? ""}
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((row) =>
                              row.id === item.id ? { ...row, title: event.target.value } : row,
                            ),
                          )
                        }
                        onBlur={(event) =>
                          update(item, { title: event.target.value.trim() || null })
                        }
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-bold outline-none focus:border-primary/40"
                        aria-label={`Título de ${item.title || "demonstração"}`}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => update(item, { is_active: !item.is_active })}
                          className={`min-h-9 rounded-xl px-3 text-xs font-bold ${
                            item.is_active
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {item.is_active ? "Visível" : "Oculta"}
                        </button>
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void remove(item);
                          }}
                          aria-label={`Excluir ${item.title || "demonstração"}`}
                          className="grid h-9 w-9 place-items-center rounded-xl border border-destructive/25 text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-muted/40 p-12 text-center">
              <ImageIcon className="mx-auto h-9 w-9 text-muted-foreground" />
              <p className="mt-3 font-black">Nenhuma mídia avulsa cadastrada</p>
            </div>
          )}
        </>
      ) : (
        <section>
          <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Modelos gratuitas</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Modelos marcadas como gratuitas aparecem automaticamente no Acesso Livre.
              </p>
            </div>
            <Link
              to="/admin/modelos"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold"
            >
              <Users className="h-4 w-4" /> Gerenciar modelos
            </Link>
          </div>
          {freeModels.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {freeModels.map((model, index) => (
                <article
                  key={model.id}
                  className="overflow-hidden rounded-2xl border border-border bg-muted"
                >
                  <img
                    src={resolveMediaUrl(model.cover_image_path, index)}
                    alt=""
                    className="aspect-[3/4] w-full object-cover"
                  />
                  <div className="p-3">
                    <h3 className="truncate font-black">{model.name}</h3>
                    <p className="text-sm font-bold text-emerald-400">
                      {model.price === 0 ? "Grátis" : formatPrice(model.price)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-muted/40 p-12 text-center">
              <Film className="mx-auto h-9 w-9 text-muted-foreground" />
              <p className="mt-3 font-black">Nenhuma modelo gratuita</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Marque “Modelo gratuita” na edição de um perfil.
              </p>
            </div>
          )}
        </section>
      )}
      {confirmDialog}
    </div>
  );
}
