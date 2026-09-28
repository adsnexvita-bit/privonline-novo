import { createFileRoute } from "@tanstack/react-router";
import { RouteLoadingOverlay } from "@/components/ui/RouteLoadingOverlay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Crown,
  GripVertical,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useConfirmDialog } from "@/components/admin/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/admin-helpers";
import { CATEGORY_ICONS, resolveCategoryIconUrl } from "@/lib/category-icons";
import {
  categoryGradient,
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_SECONDARY,
  parseCategoryColor,
  serializeCategoryColor,
  type CategoryColorConfig,
} from "@/lib/category-color";
import { resolveMediaUrl } from "@/lib/models";
import { abortR2MultipartMediaUpload, completeR2MultipartMediaUpload, prepareR2AssetUpload, prepareR2MultipartPartUpload } from "@/lib/media-storage.functions";
import { uploadFileToR2 } from "@/lib/r2-upload";

export const Route = createFileRoute("/admin/categorias")({
  head: () => ({
    meta: [
      { title: "Categorias — Privadinhos Online Admin" },
      { name: "description", content: "Organização das categorias da página inicial." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminLayout
      title="Categorias"
      subtitle="Organize as seções da página inicial, seus perfis e destaques."
    >
      {() => <CategoriesPage />}
    </AdminLayout>
  ),
});

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon_name: string | null;
  icon_path: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

type Model = {
  id: string;
  name: string;
  username: string;
  profile_image_path: string | null;
  cover_image_path: string | null;
};

type CategoryModel = {
  category_id: string;
  model_id: string;
  is_featured: boolean;
  display_order: number;
};

const BRAND_ORANGE = DEFAULT_CATEGORY_COLOR;

function normalizeCategoryColor(color: string | null | undefined) {
  return serializeCategoryColor(parseCategoryColor(color));
}

function CategoryColorEditor({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (value: string) => void;
}) {
  const config = parseCategoryColor(value);

  function update(next: CategoryColorConfig) {
    onChange(serializeCategoryColor(next));
  }

  function setPrimary(primary: string) {
    update({ ...config, primary });
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/60 p-3.5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-muted-foreground">Cor da categoria</span>
        <span
          className="h-10 w-16 shrink-0 rounded-xl border border-border shadow-inner"
          style={{ background: categoryGradient(config) }}
          aria-label="Prévia da cor"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
        {(["solid", "gradient"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() =>
              update(
                mode === "solid"
                  ? { mode, primary: config.primary }
                  : {
                      mode,
                      primary: config.primary,
                      secondary:
                        config.mode === "gradient" ? config.secondary : DEFAULT_CATEGORY_SECONDARY,
                      angle: config.mode === "gradient" ? config.angle : 135,
                      scale: config.mode === "gradient" ? config.scale : 70,
                    },
              )
            }
            className={`min-h-10 rounded-lg text-sm font-black transition ${
              config.mode === mode
                ? "bg-primary text-white shadow-lg shadow-primary/15"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {mode === "solid" ? "Cor sólida" : "Degradê"}
          </button>
        ))}
      </div>

      <div className={`mt-3 grid gap-3 ${config.mode === "gradient" ? "sm:grid-cols-2" : ""}`}>
        <ColorField
          label={config.mode === "gradient" ? "Primeira cor" : "Cor"}
          value={config.primary}
          onChange={setPrimary}
        />
        {config.mode === "gradient" ? (
          <ColorField
            label="Segunda cor"
            value={config.secondary}
            onChange={(secondary) => update({ ...config, secondary })}
          />
        ) : null}
      </div>

      {config.mode === "gradient" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <RangeField
            label="Ângulo"
            value={config.angle}
            min={0}
            max={360}
            suffix="°"
            onChange={(angle) => update({ ...config, angle })}
          />
          <RangeField
            label="Escala"
            value={config.scale}
            min={10}
            max={100}
            suffix="%"
            onChange={(scale) => update({ ...config, scale })}
          />
        </div>
      ) : null}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 rounded-xl border border-border bg-muted p-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />
        <input
          value={value}
          onChange={(event) => {
            if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) onChange(event.target.value);
          }}
          maxLength={7}
          className="min-h-10 min-w-0 flex-1 bg-transparent px-2 font-mono text-xs uppercase outline-none"
        />
      </span>
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between text-xs font-bold text-muted-foreground">
        {label}
        <span className="text-foreground">
          {Math.round(value)}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
      />
    </label>
  );
}

function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [links, setLinks] = useState<CategoryModel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null);
  const [dragModelId, setDragModelId] = useState<string | null>(null);
  const iconFileRef = useRef<HTMLInputElement>(null);
  const { confirmAction, confirmDialog } = useConfirmDialog();
  const prepareAssetUpload = useServerFn(prepareR2AssetUpload);
  const prepareMultipartPartOnServer = useServerFn(prepareR2MultipartPartUpload);
  const completeMultipartOnServer = useServerFn(completeR2MultipartMediaUpload);
  const abortMultipartOnServer = useServerFn(abortR2MultipartMediaUpload);

  const reload = useCallback(async () => {
    setLoading(true);
    const [categoryRows, modelRows, linkRows] = await Promise.all([
      supabase.from("categories").select("*").order("display_order", { ascending: true }),
      supabase
        .from("models")
        .select("id,name,username,profile_image_path,cover_image_path")
        .eq("is_active", true)
        .order("name"),
      supabase.from("category_models").select("*").order("display_order", { ascending: true }),
    ]);
    if (categoryRows.error) {
      setError("Aplique a migração de Categorias no Supabase para começar.");
      setCategories([]);
    } else {
      setError(null);
      setCategories(
        ((categoryRows.data ?? []) as Category[]).map((category) => ({
          ...category,
          color: normalizeCategoryColor(category.color),
        })),
      );
    }
    setModels((modelRows.data ?? []) as Model[]);
    setLinks((linkRows.data ?? []) as CategoryModel[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const selected = categories.find((category) => category.id === selectedId) ?? null;
  const selectedLinks = useMemo(
    () =>
      links
        .filter((link) => link.category_id === selectedId)
        .sort((a, b) => a.display_order - b.display_order),
    [links, selectedId],
  );
  const selectedModelIds = useMemo(
    () => new Set(selectedLinks.map((link) => link.model_id)),
    [selectedLinks],
  );
  const orderedModels = useMemo(() => {
    const modelById = new Map(models.map((model) => [model.id, model]));
    const selectedModels = selectedLinks.flatMap((link) => {
      const model = modelById.get(link.model_id);
      return model ? [model] : [];
    });
    const remainingModels = models.filter((model) => !selectedModelIds.has(model.id));
    return [...selectedModels, ...remainingModels];
  }, [models, selectedLinks, selectedModelIds]);

  async function saveCategory() {
    if (!editing || saving) return;
    const name = editing.name?.trim() ?? "";
    const slug = slugify(editing.slug || name);
    if (!name || !slug) {
      setError("Informe o nome da categoria.");
      return;
    }
    const payload = {
      name,
      slug,
      description: editing.description?.trim() || null,
      color: serializeCategoryColor(parseCategoryColor(editing.color)),
      icon_name: editing.icon_path ? null : editing.icon_name || "sparkles",
      icon_path: editing.icon_path || null,
      is_active: editing.is_active ?? true,
      display_order: editing.display_order ?? categories.length,
    };
    setSaving(true);
    setError(null);
    if (editing.id) {
      const { error: saveError } = await supabase
        .from("categories")
        .update(payload)
        .eq("id", editing.id);
      if (saveError) {
        setError(`Não foi possível salvar a categoria: ${saveError.message}`);
        setSaving(false);
        return;
      }
    } else {
      const { data, error: saveError } = await supabase
        .from("categories")
        .insert(payload)
        .select()
        .single();
      if (saveError) {
        setError(
          saveError.code === "42P01"
            ? "A estrutura de Categorias ainda não foi aplicada no Supabase."
            : `Não foi possível criar a categoria: ${saveError.message}`,
        );
        setSaving(false);
        return;
      }
      setSelectedId(data.id);
    }
    setEditing(null);
    await reload();
    setSaving(false);
  }

  async function uploadCategoryIcon(file: File) {
    if (file.type !== "image/png") {
      setError("O ícone personalizado precisa ser um arquivo PNG.");
      return;
    }
    setUploadingIcon(true);
    setError(null);
    try {
      const prepared = await prepareAssetUpload({ data: {
        asset: "category-icon", filename: file.name, contentType: "image/png", size: file.size,
      } });
      await uploadFileToR2({ prepared, file, contentType: "image/png", getPartUrl: (data) => prepareMultipartPartOnServer({ data }), completeMultipart: (data) => completeMultipartOnServer({ data }), abortMultipart: (data) => abortMultipartOnServer({ data }) });
      setEditing((current) =>
        current ? { ...current, icon_path: prepared.reference, icon_name: null } : current,
      );
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Não foi possível enviar o PNG.");
    }
    setUploadingIcon(false);
    if (iconFileRef.current) iconFileRef.current.value = "";
  }

  async function removeCategory(category: Category) {
    const confirmed = await confirmAction({
      title: "Excluir categoria?",
      description: `A categoria “${category.name}” será removida. Os perfis vinculados não serão excluídos.`,
      confirmText: "Excluir categoria",
      destructive: true,
    });
    if (!confirmed) return;
    await supabase.from("categories").delete().eq("id", category.id);
    if (selectedId === category.id) setSelectedId(null);
    await reload();
  }

  async function dropCategory(targetId: string) {
    if (!dragCategoryId || dragCategoryId === targetId) return;
    const ordered = [...categories];
    const from = ordered.findIndex((category) => category.id === dragCategoryId);
    const to = ordered.findIndex((category) => category.id === targetId);
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setCategories(ordered.map((category, index) => ({ ...category, display_order: index })));
    setDragCategoryId(null);
    await Promise.all(
      ordered.map((category, index) =>
        supabase.from("categories").update({ display_order: index }).eq("id", category.id),
      ),
    );
    await reload();
  }

  async function toggleModel(modelId: string) {
    if (!selected) return;
    const current = links.find(
      (link) => link.category_id === selected.id && link.model_id === modelId,
    );
    if (current) {
      await supabase
        .from("category_models")
        .delete()
        .eq("category_id", selected.id)
        .eq("model_id", modelId);
    } else {
      await supabase.from("category_models").insert({
        category_id: selected.id,
        model_id: modelId,
        display_order: selectedLinks.length,
        is_featured: false,
      });
    }
    await reload();
  }

  async function toggleFeatured(link: CategoryModel) {
    await supabase
      .from("category_models")
      .update({ is_featured: !link.is_featured })
      .eq("category_id", link.category_id)
      .eq("model_id", link.model_id);
    await reload();
  }

  async function dropModel(targetModelId: string) {
    if (!selected || !dragModelId || dragModelId === targetModelId) return;
    const ordered = [...selectedLinks];
    const from = ordered.findIndex((link) => link.model_id === dragModelId);
    const to = ordered.findIndex((link) => link.model_id === targetModelId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setDragModelId(null);
    await Promise.all(
      ordered.map((link, index) =>
        supabase
          .from("category_models")
          .update({ display_order: index })
          .eq("category_id", selected.id)
          .eq("model_id", link.model_id),
      ),
    );
    await reload();
  }

  async function moveModelToPosition(modelId: string, position: number) {
    if (!selected) return;
    const ordered = [...selectedLinks];
    const from = ordered.findIndex((link) => link.model_id === modelId);
    const to = Math.max(0, Math.min(ordered.length - 1, position - 1));
    if (from < 0 || from === to) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setLinks((current) => [
      ...current.filter((link) => link.category_id !== selected.id),
      ...ordered.map((link, index) => ({ ...link, display_order: index })),
    ]);
    await Promise.all(
      ordered.map((link, index) =>
        supabase
          .from("category_models")
          .update({ display_order: index })
          .eq("category_id", selected.id)
          .eq("model_id", link.model_id),
      ),
    );
    await reload();
  }

  return (
    <div>
      <div
        className={
          editing
            ? "hidden"
            : "grid items-start gap-5 lg:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]"
        }
      >
      <aside className="admin-glass h-fit rounded-3xl p-4 lg:sticky lg:top-7">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-border/70 pb-4">
          <div>
            <h2 className="font-black">Categorias</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Organize a ordem em que aparecem na página inicial.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setEditing({
                name: "",
                slug: "",
                description: "",
                color: BRAND_ORANGE,
                icon_name: "sparkles",
                icon_path: null,
                is_active: true,
                display_order: categories.length,
              })
            }
            aria-label="Nova categoria"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-black text-white shadow-sm shadow-primary/20"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova</span>
          </button>
        </div>
        {error ? (
          <p className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {loading ? (
          <RouteLoadingOverlay />
        ) : (
          <div className="space-y-1.5">
            {categories.map((category, index) => (
              <div
                key={category.id}
                draggable
                onDragStart={() => setDragCategoryId(category.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropCategory(category.id)}
                className={`group flex items-center gap-2 rounded-2xl border px-2 py-2 transition ${
                  selectedId === category.id
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-transparent hover:bg-muted/70"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(category.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 p-1 text-left"
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground transition group-hover:text-foreground" />
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
                    style={{
                      color: parseCategoryColor(category.color).primary,
                      background: categoryGradient(parseCategoryColor(category.color)),
                    }}
                  >
                    <CategoryIcon
                      name={category.icon_name}
                      path={category.icon_path}
                      className="h-4 w-4"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{category.name}</strong>
                    <span className="text-xs text-muted-foreground">
                      {links.filter((link) => link.category_id === category.id).length} perfil(is) ·{" "}
                      {category.is_active ? "visível" : "oculta"}
                    </span>
                  </span>
                  <span className="text-[11px] font-bold text-muted-foreground">{index + 1}</span>
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setEditing(category)}
                  aria-label={`Editar ${category.name}`}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-surface hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void removeCategory(category);
                  }}
                  aria-label={`Excluir ${category.name}`}
                  className="grid h-8 w-8 place-items-center rounded-lg text-destructive transition hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {!categories.length ? (
              <div className="px-3 py-10 text-center">
                <p className="text-sm font-bold">Nenhuma categoria criada</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Crie sua primeira categoria para organizar a página inicial.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      name: "",
                      slug: "",
                      description: "",
                      color: BRAND_ORANGE,
                      icon_name: "sparkles",
                      icon_path: null,
                      is_active: true,
                      display_order: 0,
                    })
                  }
                  className="btn-primary mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-black"
                >
                  <Plus className="h-4 w-4" /> Nova categoria
                </button>
              </div>
            ) : null}
          </div>
        )}
      </aside>

      <main className="min-w-0">
        {selected ? (
          <div className="space-y-6">
            <section className="rounded-3xl border border-border/70 bg-card px-5 py-4 shadow-sm sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
                    style={{
                      color: parseCategoryColor(selected.color).primary,
                      background: categoryGradient(parseCategoryColor(selected.color)),
                    }}
                  >
                    <CategoryIcon
                      name={selected.icon_name}
                      path={selected.icon_path}
                      className="h-5 w-5"
                    />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-black sm:text-2xl">{selected.name}</h2>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {selected.description || "Sem descrição pública."}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">
                      {selectedLinks.length} perfil{selectedLinks.length === 1 ? "" : "is"} ·{" "}
                      {selected.is_active ? "Visível" : "Oculta"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(selected)}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-bold hover:bg-muted"
                >
                  <Pencil className="h-4 w-4" /> Editar categoria
                </button>
              </div>
            </section>

            <section>
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-black">Perfis da categoria</h2>
                  <p className="text-sm text-muted-foreground">
                    Organize os perfis e defina a ordem em que aparecem na página inicial.
                  </p>
                </div>
                <span className="text-xs font-bold text-muted-foreground">
                  {selectedLinks.length} perfil{selectedLinks.length === 1 ? "" : "is"} adicionado
                  {selectedLinks.length === 1 ? "" : "s"}
                </span>
              </div>

              {selectedLinks.length === 0 ? (
                <div className="mb-4 rounded-2xl bg-muted/55 px-4 py-3 text-sm text-muted-foreground">
                  <strong className="block text-foreground">Nenhum perfil nesta categoria</strong>
                  <span className="mt-1 block text-xs">
                    Adicione perfis abaixo para que apareçam nesta seção da página inicial.
                  </span>
                </div>
              ) : null}

              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                {orderedModels.map((model, index) => {
                  const link = links.find(
                    (row) => row.category_id === selected.id && row.model_id === model.id,
                  );
                  const position = selectedLinks.findIndex((row) => row.model_id === model.id);
                  return (
                    <article
                      key={model.id}
                      draggable={Boolean(link)}
                      onDragStart={() => link && setDragModelId(model.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => dropModel(model.id)}
                      className={`w-full max-w-[290px] overflow-hidden rounded-2xl border bg-card shadow-sm transition ${
                        link ? "border-primary/30" : "border-border opacity-70 hover:opacity-100"
                      }`}
                    >
                      <div className="relative aspect-[3/4] bg-muted">
                        <img
                          src={resolveMediaUrl(model.cover_image_path, index)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        {link ? (
                          <GripVertical className="absolute right-2 top-2 h-8 w-8 cursor-grab rounded-xl bg-black/60 p-2 text-white backdrop-blur" />
                        ) : null}
                      </div>
                      <div className="space-y-3 p-3.5">
                        <div>
                          <h3 className="truncate text-sm font-black">{model.name}</h3>
                          <p className="truncate text-xs text-muted-foreground">
                            @{model.username}
                          </p>
                        </div>
                        {link ? (
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-bold text-muted-foreground">
                              Posição
                            </span>
                            <select
                              value={position + 1}
                              onChange={(event) =>
                                moveModelToPosition(model.id, Number(event.target.value))
                              }
                              className="min-h-9 w-full rounded-xl border border-border bg-input px-3 text-xs font-black text-foreground outline-none focus:border-primary"
                            >
                              {selectedLinks.map((_, optionIndex) => (
                                <option key={optionIndex} value={optionIndex + 1}>
                                  {optionIndex + 1}ª posição
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => toggleModel(model.id)}
                            className={`inline-flex min-h-9 items-center justify-center gap-1 rounded-xl px-3 text-xs font-bold ${
                              link
                                ? "bg-emerald-500/15 text-emerald-500"
                                : "border border-border text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {link ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Plus className="h-3.5 w-3.5" />
                            )}
                            {link ? "Na categoria" : "Adicionar"}
                          </button>
                          {link ? (
                            <button
                              onClick={() => toggleFeatured(link)}
                              className={`inline-flex min-h-9 items-center justify-center gap-1 rounded-xl px-3 text-xs font-bold ${
                                link.is_featured
                                  ? "bg-primary/15 text-primary"
                                  : "border border-border text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              <Crown className="h-3.5 w-3.5" />
                              {link.is_featured ? "Em destaque" : "Destacar"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        ) : (
          <div className="grid min-h-80 place-items-center rounded-3xl border border-dashed border-border bg-muted/40 p-10 text-center">
            <div>
              <h2 className="text-xl font-black">Selecione uma categoria</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Escolha uma categoria ao lado para adicionar e organizar seus perfis.
              </p>
            </div>
          </div>
        )}
      </main>
      </div>

      {editing ? (
        <div className="relative w-full">
          <div className="admin-glass min-h-[calc(100vh-11rem)] w-full rounded-3xl p-5 sm:p-7 lg:p-8">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-black">
                {editing.id ? "Editar categoria" : "Nova categoria"}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>
            </div>
            <div className="space-y-4">
              <CategoryColorEditor
                value={editing.color}
                onChange={(color) => setEditing((current) => ({ ...current, color }))}
              />
              <label className="block text-sm font-bold">
                <span className="mb-1 block text-muted-foreground">Nome</span>
                <input
                  value={editing.name ?? ""}
                  onChange={(event) =>
                    setEditing((current) => ({ ...current, name: event.target.value }))
                  }
                  className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 outline-none focus:border-primary/40"
                />
              </label>
              <label className="block text-sm font-bold">
                <span className="mb-1 block text-muted-foreground">Slug</span>
                <input
                  value={editing.slug ?? ""}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      slug: slugify(event.target.value),
                    }))
                  }
                  placeholder="Gerado automaticamente"
                  className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 outline-none focus:border-primary/40"
                />
              </label>
              <label className="block text-sm font-bold">
                <span className="mb-1 block text-muted-foreground">Descrição pública</span>
                <textarea
                  value={editing.description ?? ""}
                  onChange={(event) =>
                    setEditing((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={3}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-3 outline-none focus:border-primary/40"
                />
              </label>
              <div>
                <span className="mb-2 block text-sm font-bold text-muted-foreground">
                  Ícone predefinido
                </span>
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                  {CATEGORY_ICONS.map((item) => {
                    const Icon = item.icon;
                    const active = !editing.icon_path && editing.icon_name === item.name;
                    return (
                      <button
                        key={item.name}
                        type="button"
                        title={item.label}
                        aria-label={item.label}
                        onClick={() =>
                          setEditing((current) => ({
                            ...current,
                            icon_name: item.name,
                            icon_path: null,
                          }))
                        }
                        className={`grid aspect-square place-items-center rounded-xl border ${
                          active
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border bg-surface text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <span className="mb-2 block text-sm font-bold text-muted-foreground">
                  Ou envie seu ícone PNG
                </span>
                <button
                  type="button"
                  onClick={() => iconFileRef.current?.click()}
                  disabled={uploadingIcon}
                  className="flex min-h-20 w-full items-center gap-3 rounded-xl border border-dashed border-border bg-surface p-3 text-left transition hover:border-primary/40 disabled:opacity-50"
                >
                  {editing.icon_path ? (
                    <img
                      src={resolveCategoryIconUrl(editing.icon_path)}
                      alt="Ícone enviado"
                      className="h-12 w-12 rounded-xl object-contain"
                    />
                  ) : uploadingIcon ? (
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  ) : (
                    <ImagePlus className="h-8 w-8 text-primary" />
                  )}
                  <span>
                    <strong className="block text-sm">
                      {editing.icon_path ? "Trocar ícone PNG" : "Selecionar arquivo PNG"}
                    </strong>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Fundo transparente · máximo 5 MB
                    </span>
                  </span>
                </button>
                <input
                  ref={iconFileRef}
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={(event) =>
                    event.target.files?.[0] && uploadCategoryIcon(event.target.files[0])
                  }
                />
              </div>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={editing.is_active ?? true}
                  onChange={(event) =>
                    setEditing((current) => ({ ...current, is_active: event.target.checked }))
                  }
                  className="h-4 w-4 accent-primary"
                />
                Exibir esta categoria na página inicial
              </label>
              {error ? (
                <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={saveCategory}
                disabled={saving || uploadingIcon}
                className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-black disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}{" "}
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmDialog}
    </div>
  );
}
