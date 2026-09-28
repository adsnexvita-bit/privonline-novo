import { createFileRoute } from "@tanstack/react-router";
import { RouteLoadingOverlay } from "@/components/ui/RouteLoadingOverlay";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BadgePercent,
  Check,
  Copy,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AdminLayout, type AdminIdentity } from "@/components/admin/AdminLayout";
import { useConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PromotionCampaignCard } from "@/components/PromotionCampaignCard";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/admin-helpers";
import { resolveMediaUrl } from "@/lib/models";
import { promotionTextContent } from "@/lib/promotion-rich-text";

export const Route = createFileRoute("/admin/promocoes")({
  head: () => ({
    meta: [
      { title: "Promoções — Privadinhos Online Admin" },
      { name: "description", content: "Promoções compartilhadas entre modelos." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminLayout title="Promoções">
      {(identity) => <PromotionsBody identity={identity} />}
    </AdminLayout>
  ),
});

type Promotion = {
  id: string;
  name: string;
  title: string;
  description: string | null;
  urgency_text: string | null;
  complementary_text: string | null;
  show_countdown: boolean;
  original_price: number | null;
  promotional_price: number;
  badge_text: string | null;
  badge_color: string | null;
  cta_text: string;
  starts_at: string;
  ends_at: string | null;
  access_type: "lifetime" | "subscription";
  duration_days: number | null;
  is_active: boolean;
  created_at: string;
  order_bump_enabled: boolean;
  order_bump_default_price: number;
  order_bump_max_visible: number;
  order_bump_title: string;
  order_bump_description: string;
  benefits_text: string | null;
  card_border_color: string | null;
  countdown_bg_color: string | null;
  countdown_text_color: string | null;
  title_color: string | null;
  subtitle_color: string | null;
  price_color: string | null;
  complementary_color: string | null;
  button_color: string | null;
  button_text_color: string | null;
  benefits_color: string | null;
};

type ModelOption = {
  id: string;
  name: string;
  username: string;
  is_active: boolean;
  profile_image_path: string | null;
};
type Assignment = { promotion_id: string; model_id: string };
type BumpAssignment = {
  promotion_id: string;
  model_id: string;
  price_override: number | null;
  display_order: number;
};
type PromotionOrder = { promotion_id: string | null; total_amount: number; payment_status: string };
type CampaignStatus = "scheduled" | "active" | "ended" | "inactive";

function campaignStatus(promotion: Promotion): CampaignStatus {
  if (!promotion.is_active) return "inactive";
  const now = Date.now();
  if (now < new Date(promotion.starts_at).getTime()) return "scheduled";
  if (promotion.ends_at && now >= new Date(promotion.ends_at).getTime()) return "ended";
  return "active";
}

const statusLabels: Record<CampaignStatus, string> = {
  scheduled: "Agendada",
  active: "Ativa",
  ended: "Encerrada",
  inactive: "Inativa",
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function localDateTime(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function newPromotionDates() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: localDateTime(start.toISOString()), end: localDateTime(end.toISOString()) };
}

function PromotionsBody({ identity }: { identity: AdminIdentity }) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [bumpAssignments, setBumpAssignments] = useState<BumpAssignment[]>([]);
  const [orders, setOrders] = useState<PromotionOrder[]>([]);
  const [filter, setFilter] = useState<"all" | CampaignStatus>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Promotion | null | "new">(null);
  const { confirmAction, confirmDialog } = useConfirmDialog();

  async function reload() {
    setLoading(true);
    setError(null);
    const [promotionResult, modelsResult, assignmentsResult, bumpResult, ordersResult] =
      await Promise.all([
        supabase.from("promotions").select("*").order("created_at", { ascending: false }),
        supabase
          .from("models")
          .select("id,name,username,is_active,profile_image_path")
          .order("name"),
        supabase.from("promotion_models").select("promotion_id,model_id"),
        supabase
          .from("promotion_order_bump_models")
          .select("promotion_id,model_id,price_override,display_order"),
        supabase
          .from("orders")
          .select("promotion_id,total_amount,payment_status")
          .not("promotion_id", "is", null),
      ]);
    const firstError =
      promotionResult.error ||
      modelsResult.error ||
      assignmentsResult.error ||
      bumpResult.error ||
      ordersResult.error;
    if (firstError) setError(firstError.message);
    setPromotions((promotionResult.data ?? []) as Promotion[]);
    setModels((modelsResult.data ?? []) as ModelOption[]);
    setAssignments((assignmentsResult.data ?? []) as Assignment[]);
    setBumpAssignments((bumpResult.data ?? []) as BumpAssignment[]);
    setOrders((ordersResult.data ?? []) as PromotionOrder[]);
    setLoading(false);
  }

  useEffect(() => void reload(), []);

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    assignments.forEach((item) =>
      result.set(item.promotion_id, (result.get(item.promotion_id) ?? 0) + 1),
    );
    return result;
  }, [assignments]);

  const metrics = useMemo(() => {
    const result = new Map<string, { purchases: number; revenue: number }>();
    orders
      .filter((order) => order.payment_status === "paid")
      .forEach((order) => {
        if (!order.promotion_id) return;
        const current = result.get(order.promotion_id) ?? { purchases: 0, revenue: 0 };
        current.purchases += 1;
        current.revenue += Number(order.total_amount);
        result.set(order.promotion_id, current);
      });
    return result;
  }, [orders]);

  const visiblePromotions = useMemo(
    () =>
      promotions.filter((promotion) => filter === "all" || campaignStatus(promotion) === filter),
    [filter, promotions],
  );

  async function duplicate(promotion: Promotion) {
    const participantIds = assignments
      .filter((item) => item.promotion_id === promotion.id)
      .map((item) => item.model_id);
    const { data: duplicatedPromotionId, error: duplicateError } = await supabase.rpc(
      "admin_save_promotion",
      {
        target_promotion_id: null,
        campaign_name: `${promotion.name} — cópia`,
        promotion_title: promotion.title,
        promotion_description: promotion.description ?? "",
        promotion_urgency_text: promotion.urgency_text ?? "",
        promotion_complementary_text: promotion.complementary_text ?? "",
        promotion_original_price: promotion.original_price,
        promotion_promotional_price: promotion.promotional_price,
        promotion_badge_text: promotion.badge_text ?? "",
        promotion_badge_color: promotion.badge_color ?? "",
        promotion_cta_text: promotion.cta_text,
        promotion_starts_at: promotion.starts_at,
        promotion_ends_at: promotion.ends_at,
        promotion_show_countdown: promotion.show_countdown,
        promotion_access_type: promotion.access_type,
        promotion_duration_days: promotion.duration_days,
        promotion_is_active: false,
        participant_model_ids: participantIds,
        promotion_benefits_text: promotion.benefits_text ?? "",
        promotion_card_border_color: promotion.card_border_color ?? "#f04400",
        promotion_countdown_bg_color: promotion.countdown_bg_color ?? "#f04400",
        promotion_countdown_text_color: promotion.countdown_text_color ?? "#ffffff",
        promotion_title_color: promotion.title_color ?? "#171311",
        promotion_subtitle_color: promotion.subtitle_color ?? "#4f4845",
        promotion_price_color: promotion.price_color ?? "#f04400",
        promotion_complementary_color: promotion.complementary_color ?? "#332d2a",
        promotion_button_color: promotion.button_color ?? "#16b93a",
        promotion_button_text_color: promotion.button_text_color ?? "#ffffff",
        promotion_benefits_color: promotion.benefits_color ?? "#332d2a",
      },
    );
    if (duplicateError) return setError(duplicateError.message);
    const originalBumps = bumpAssignments
      .filter((item) => item.promotion_id === promotion.id)
      .sort((a, b) => a.display_order - b.display_order)
      .map((item, index) => ({
        model_id: item.model_id,
        price_override: item.price_override,
        display_order: index,
      }));
    const { error: bumpDuplicateError } = await supabase.rpc("admin_save_promotion_order_bumps", {
      target_promotion_id: String(duplicatedPromotionId),
      bump_enabled: promotion.order_bump_enabled,
      bump_default_price: promotion.order_bump_default_price,
      bump_max_visible: promotion.order_bump_max_visible,
      bump_title: promotion.order_bump_title,
      bump_description: promotion.order_bump_description,
      bump_models: originalBumps,
    });
    if (bumpDuplicateError) return setError(bumpDuplicateError.message);
    void reload();
  }

  async function remove(promotion: Promotion) {
    const confirmed = await confirmAction({
      title: "Excluir promoção?",
      description: `“${promotionTextContent(promotion.title)}” deixará de aparecer em todas as modelos participantes.`,
      confirmText: "Excluir promoção",
      destructive: true,
    });
    if (!confirmed) return;
    const { error: deleteError } = await supabase
      .from("promotions")
      .delete()
      .eq("id", promotion.id);
    if (deleteError) return setError(deleteError.message);
    await logAdminAction({
      adminId: identity.adminId,
      action: "promotion.delete",
      entityType: "promotion",
      entityId: promotion.id,
    });
    void reload();
  }

  if (editing) {
    return (
      <PromotionEditor
        initial={editing === "new" ? null : editing}
        models={models}
        promotions={promotions}
        assignments={assignments}
        bumpAssignments={bumpAssignments}
        identity={identity}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void reload();
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Crie uma configuração única e distribua a mesma promoção para várias modelos.
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="btn-primary inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-5 text-sm font-bold"
        >
          <Plus className="h-4 w-4" /> Nova promoção
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Filtrar campanhas">
        {(["all", "active", "scheduled", "ended", "inactive"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === value ? "bg-primary text-white" : "border border-border bg-card text-muted-foreground"}`}
          >
            {value === "all" ? "Todas" : statusLabels[value]}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading ? (
        <RouteLoadingOverlay />
      ) : visiblePromotions.length ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-[1.3fr_.65fr_.8fr_.55fr_.55fr_.7fr_auto] gap-4 border-b border-border bg-muted/45 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Promoção</span>
            <span>Valor</span>
            <span>Período</span>
            <span>Modelos</span>
            <span>Compras</span>
            <span>Faturamento</span>
            <span>Ações</span>
          </div>
          {visiblePromotions.map((promotion) => (
            <article
              key={promotion.id}
              className="grid gap-3 border-b border-border px-5 py-4 last:border-b-0 md:grid-cols-[1.3fr_.65fr_.8fr_.55fr_.55fr_.7fr_auto] md:items-center md:gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <strong className="truncate text-sm font-semibold">{promotion.name}</strong>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${campaignStatus(promotion) === "active" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}
                  >
                    {statusLabels[campaignStatus(promotion)]}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {promotion.access_type === "lifetime"
                    ? "Acesso vitalício"
                    : `${promotion.duration_days} dias de acesso`}
                </p>
              </div>
              <div>
                <strong className="block text-sm tabular-nums text-primary">
                  {money(promotion.promotional_price)}
                </strong>
                {promotion.original_price != null &&
                promotion.original_price > promotion.promotional_price ? (
                  <span className="text-xs text-muted-foreground line-through">
                    {money(promotion.original_price)}
                  </span>
                ) : null}
              </div>
              <div className="text-xs leading-5 text-muted-foreground">
                <span className="block">
                  {new Date(promotion.starts_at).toLocaleDateString("pt-BR")}
                </span>
                <span>
                  {promotion.ends_at
                    ? `até ${new Date(promotion.ends_at).toLocaleDateString("pt-BR")}`
                    : "sem término"}
                </span>
              </div>
              <span className="text-sm font-medium">
                {counts.get(promotion.id) ?? 0} selecionadas
              </span>
              <span className="text-sm tabular-nums">
                {metrics.get(promotion.id)?.purchases ?? 0}
              </span>
              <strong className="text-sm tabular-nums">
                {money(metrics.get(promotion.id)?.revenue ?? 0)}
              </strong>
              <div className="flex gap-2 md:justify-end">
                <button
                  type="button"
                  onClick={() => void duplicate(promotion)}
                  aria-label={`Duplicar ${promotionTextContent(promotion.title)}`}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-border hover:bg-muted"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(promotion)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted"
                >
                  <Pencil className="h-4 w-4" /> Editar <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(promotion)}
                  aria-label={`Excluir ${promotionTextContent(promotion.title)}`}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border text-center">
          <div>
            <BadgePercent className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-3 text-lg font-bold">Nenhuma promoção criada</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie uma promoção e escolha todas as modelos participantes.
            </p>
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

function PromotionEditor({
  initial,
  models,
  promotions,
  assignments,
  bumpAssignments,
  identity,
  onClose,
  onSaved,
}: {
  initial: Promotion | null;
  models: ModelOption[];
  promotions: Promotion[];
  assignments: Assignment[];
  bumpAssignments: BumpAssignment[];
  identity: AdminIdentity;
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaults = useMemo(newPromotionDates, []);
  const [name, setName] = useState(initial?.name ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [urgencyText, setUrgencyText] = useState(initial?.urgency_text ?? "");
  const [complementaryText, setComplementaryText] = useState(
    initial?.complementary_text ?? "Pague 1 vez e acesse para sempre!",
  );
  const [benefitsText, setBenefitsText] = useState(
    initial?.benefits_text ?? "⭐ Pagamento único &nbsp;&nbsp; 🔥 Acesso vitalício",
  );
  const [originalPrice, setOriginalPrice] = useState(String(initial?.original_price ?? ""));
  const [promotionalPrice, setPromotionalPrice] = useState(
    String(initial?.promotional_price ?? ""),
  );
  const [badgeText, setBadgeText] = useState(initial?.badge_text ?? "");
  const [badgeColor, setBadgeColor] = useState(initial?.badge_color ?? "#FFE8DD");
  const [ctaText, setCtaText] = useState(initial?.cta_text ?? "Aproveitar promoção");
  const [cardBorderColor, setCardBorderColor] = useState(initial?.card_border_color ?? "#f04400");
  const [countdownBgColor, setCountdownBgColor] = useState(
    initial?.countdown_bg_color ?? "#f04400",
  );
  const [countdownTextColor, setCountdownTextColor] = useState(
    initial?.countdown_text_color ?? "#ffffff",
  );
  const [titleColor, setTitleColor] = useState(initial?.title_color ?? "#171311");
  const [subtitleColor, setSubtitleColor] = useState(initial?.subtitle_color ?? "#4f4845");
  const [priceColor, setPriceColor] = useState(initial?.price_color ?? "#f04400");
  const [complementaryColor, setComplementaryColor] = useState(
    initial?.complementary_color ?? "#332d2a",
  );
  const [buttonColor, setButtonColor] = useState(initial?.button_color ?? "#16b93a");
  const [buttonTextColor, setButtonTextColor] = useState(initial?.button_text_color ?? "#ffffff");
  const [benefitsColor, setBenefitsColor] = useState(initial?.benefits_color ?? "#332d2a");
  const [startsAt, setStartsAt] = useState(
    initial ? localDateTime(initial.starts_at) : defaults.start,
  );
  const [noEnd, setNoEnd] = useState(initial ? initial.ends_at == null : false);
  const [endsAt, setEndsAt] = useState(
    initial?.ends_at ? localDateTime(initial.ends_at) : defaults.end,
  );
  const [showCountdown, setShowCountdown] = useState(initial?.show_countdown ?? false);
  const [accessType, setAccessType] = useState<"lifetime" | "subscription">(
    initial?.access_type ?? "lifetime",
  );
  const [durationDays, setDurationDays] = useState(String(initial?.duration_days ?? 30));
  const [active, setActive] = useState(initial?.is_active ?? false);
  const [bumpEnabled, setBumpEnabled] = useState(initial?.order_bump_enabled ?? false);
  const [bumpDefaultPrice, setBumpDefaultPrice] = useState(
    String(initial?.order_bump_default_price ?? 2.99),
  );
  const [bumpMaxVisible, setBumpMaxVisible] = useState(
    String(initial?.order_bump_max_visible ?? 4),
  );
  const [bumpTitle, setBumpTitle] = useState(
    initial?.order_bump_title ?? "Aproveite e leve também",
  );
  const [bumpDescription, setBumpDescription] = useState(
    initial?.order_bump_description ??
      "Adicione outras modelos à sua compra por um valor exclusivo.",
  );
  const [bumpSearch, setBumpSearch] = useState("");
  const [bumpModels, setBumpModels] = useState<Array<{ modelId: string; price: string }>>(() =>
    initial
      ? bumpAssignments
          .filter((item) => item.promotion_id === initial.id)
          .sort((a, b) => a.display_order - b.display_order)
          .map((item) => ({
            modelId: item.model_id,
            price: item.price_override == null ? "" : String(item.price_override),
          }))
      : [],
  );
  const [selected, setSelected] = useState(
    () =>
      new Set(
        initial
          ? assignments
              .filter((item) => item.promotion_id === initial.id)
              .map((item) => item.model_id)
          : [],
      ),
  );
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleModels = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return term
      ? models.filter(
          (model) =>
            model.name.toLocaleLowerCase("pt-BR").includes(term) ||
            model.username.toLocaleLowerCase("pt-BR").includes(term),
        )
      : models;
  }, [models, search]);
  const selectedModels = useMemo(
    () => models.filter((model) => selected.has(model.id)),
    [models, selected],
  );
  const bumpVisibleModels = useMemo(() => {
    const term = bumpSearch.trim().toLocaleLowerCase("pt-BR");
    return models.filter(
      (model) =>
        !term ||
        model.name.toLocaleLowerCase("pt-BR").includes(term) ||
        model.username.toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [bumpSearch, models]);

  function toggleBump(modelId: string) {
    setBumpModels((current) =>
      current.some((item) => item.modelId === modelId)
        ? current.filter((item) => item.modelId !== modelId)
        : [...current, { modelId, price: "" }],
    );
  }

  function moveBump(index: number, direction: -1 | 1) {
    setBumpModels((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function findClientConflict(start: Date, end: Date | null) {
    if (!active) return null;
    for (const promotion of promotions) {
      if (promotion.id === initial?.id || !promotion.is_active) continue;
      const promotionEnd = promotion.ends_at ? new Date(promotion.ends_at) : null;
      const overlaps =
        (!end || new Date(promotion.starts_at) < end) && (!promotionEnd || start < promotionEnd);
      if (!overlaps) continue;
      const conflictingModelId = assignments.find(
        (item) => item.promotion_id === promotion.id && selected.has(item.model_id),
      )?.model_id;
      if (conflictingModelId)
        return { promotion, model: models.find((model) => model.id === conflictingModelId) };
    }
    return null;
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const original = originalPrice.trim() ? Number(originalPrice.replace(",", ".")) : null;
      const promotional = Number(promotionalPrice.replace(",", "."));
      const start = new Date(startsAt);
      const end = noEnd ? null : new Date(endsAt);
      const duration = accessType === "subscription" ? Number(durationDays) : null;
      if (!name.trim()) throw new Error("Informe o nome interno da campanha.");
      if (!title.trim()) throw new Error("Informe o título promocional.");
      if (
        !Number.isFinite(promotional) ||
        promotional < 0 ||
        (original != null && (!Number.isFinite(original) || original < promotional))
      )
        throw new Error(
          "Quando informado, o valor original deve ser maior ou igual ao promocional.",
        );
      if (end && !(start < end))
        throw new Error("A data final precisa ser posterior à data inicial.");
      if (showCountdown && !end) throw new Error("Defina um término para exibir o contador.");
      if (accessType === "subscription" && (!Number.isInteger(duration) || Number(duration) <= 0))
        throw new Error("Informe uma duração válida em dias.");
      if (!selected.size) throw new Error("Selecione pelo menos uma modelo participante.");
      const parsedBumpDefault = Number(bumpDefaultPrice.replace(",", "."));
      const parsedBumpMax = Number(bumpMaxVisible);
      if (bumpEnabled && (!Number.isFinite(parsedBumpDefault) || parsedBumpDefault <= 0))
        throw new Error("Informe um valor padrão válido para o Order Bump.");
      if (
        bumpEnabled &&
        (!Number.isInteger(parsedBumpMax) || parsedBumpMax < 1 || parsedBumpMax > 20)
      )
        throw new Error("A quantidade máxima de ofertas deve estar entre 1 e 20.");
      const conflict = findClientConflict(start, end);
      if (conflict)
        throw new Error(
          `A modelo “${conflict.model?.name ?? "selecionada"}” já participa da promoção ativa “${promotionTextContent(conflict.promotion.title)}” no mesmo período.`,
        );

      const { data, error: saveError } = await supabase.rpc("admin_save_promotion", {
        target_promotion_id: initial?.id ?? null,
        campaign_name: name.trim(),
        promotion_title: title.trim(),
        promotion_description: description.trim(),
        promotion_urgency_text: urgencyText.trim(),
        promotion_complementary_text: complementaryText.trim(),
        promotion_original_price: original,
        promotion_promotional_price: promotional,
        promotion_badge_text: badgeText.trim(),
        promotion_badge_color: badgeText.trim() ? badgeColor : "",
        promotion_cta_text: ctaText.trim(),
        promotion_starts_at: start.toISOString(),
        promotion_ends_at: end?.toISOString() ?? null,
        promotion_show_countdown: showCountdown,
        promotion_access_type: accessType,
        promotion_duration_days: duration,
        promotion_is_active: active,
        participant_model_ids: Array.from(selected),
        promotion_benefits_text: benefitsText.trim(),
        promotion_card_border_color: cardBorderColor,
        promotion_countdown_bg_color: countdownBgColor,
        promotion_countdown_text_color: countdownTextColor,
        promotion_title_color: titleColor,
        promotion_subtitle_color: subtitleColor,
        promotion_price_color: priceColor,
        promotion_complementary_color: complementaryColor,
        promotion_button_color: buttonColor,
        promotion_button_text_color: buttonTextColor,
        promotion_benefits_color: benefitsColor,
      });
      if (saveError) throw saveError;
      const bumpPayload = bumpModels.map((item, index) => ({
        model_id: item.modelId,
        price_override: item.price.trim() ? Number(item.price.replace(",", ".")) : null,
        display_order: index,
      }));
      if (
        bumpPayload.some(
          (item) =>
            item.price_override != null &&
            (!Number.isFinite(item.price_override) || item.price_override <= 0),
        )
      )
        throw new Error("Revise os valores individuais do Order Bump.");
      const { error: bumpSaveError } = await supabase.rpc("admin_save_promotion_order_bumps", {
        target_promotion_id: String(data),
        bump_enabled: bumpEnabled,
        bump_default_price: parsedBumpDefault,
        bump_max_visible: parsedBumpMax,
        bump_title: bumpTitle.trim(),
        bump_description: bumpDescription.trim(),
        bump_models: bumpPayload,
      });
      if (bumpSaveError) throw bumpSaveError;
      await logAdminAction({
        adminId: identity.adminId,
        action: initial ? "promotion.update" : "promotion.create",
        entityType: "promotion",
        entityId: String(data),
        details: { name: name.trim(), title: title.trim(), modelIds: Array.from(selected), active },
      });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar a promoção.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-10rem)] rounded-2xl border border-border bg-card p-5 sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold">
          {initial ? `Editar ${initial.name}` : "Nova campanha"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
      </div>

      <EditorSection title="Conteúdo visual da promoção">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Nome interno da campanha" wide>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sextouu — 14/08"
            />
          </Field>
          <div className="lg:col-span-2 rounded-2xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-semibold">Foto da modelo</p>
            <p className="mt-1 text-sm text-muted-foreground">
              O card usa automaticamente a foto de perfil de cada modelo participante.
            </p>
          </div>
          <RichTextEditor label="Título principal" value={title} onChange={setTitle} />
          <RichTextEditor label="Subtítulo" value={description} onChange={setDescription} />
          <RichTextEditor
            label="Destaque inicial do subtítulo"
            value={urgencyText}
            onChange={setUrgencyText}
            placeholder="APENAS HOJE:"
          />
          <RichTextEditor
            label="Mensagem abaixo do preço"
            value={complementaryText}
            onChange={setComplementaryText}
          />
          <Field label="Valor original">
            <input
              inputMode="decimal"
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              placeholder="49,90"
            />
          </Field>
          <Field label="Valor promocional">
            <input
              inputMode="decimal"
              value={promotionalPrice}
              onChange={(e) => setPromotionalPrice(e.target.value)}
              placeholder="19,90"
            />
          </Field>
          <Field label="Texto do botão">
            <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
          </Field>
          <RichTextEditor
            label="Mensagem final / benefícios"
            value={benefitsText}
            onChange={setBenefitsText}
          />
          <Field label="Tipo de acesso">
            <select
              value={accessType}
              onChange={(e) => setAccessType(e.target.value as "lifetime" | "subscription")}
            >
              <option value="lifetime">Acesso vitalício</option>
              <option value="subscription">Acesso por período</option>
            </select>
          </Field>
          {accessType === "subscription" ? (
            <Field label="Duração do acesso (dias)">
              <input
                type="number"
                min="1"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
              />
            </Field>
          ) : null}
        </div>
      </EditorSection>

      <EditorSection title="Período e urgência">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Início">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label="Fim">
            <input
              type="datetime-local"
              value={endsAt}
              disabled={noEnd}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Switch
            checked={noEnd}
            onChange={(checked) => {
              setNoEnd(checked);
              if (checked) setShowCountdown(false);
            }}
            label="Sem data de término"
          />
          <Switch
            checked={showCountdown}
            disabled={noEnd}
            onChange={setShowCountdown}
            label="Exibir contador regressivo"
          />
          <Switch checked={active} onChange={setActive} label="Promoção ativa" />
        </div>
      </EditorSection>

      <EditorSection title="Aparência">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ColorField label="Borda do card" value={cardBorderColor} onChange={setCardBorderColor} />
          <ColorField
            label="Fundo do contador"
            value={countdownBgColor}
            onChange={setCountdownBgColor}
          />
          <ColorField
            label="Texto do contador"
            value={countdownTextColor}
            onChange={setCountdownTextColor}
          />
          <ColorField label="Título" value={titleColor} onChange={setTitleColor} />
          <ColorField label="Subtítulo" value={subtitleColor} onChange={setSubtitleColor} />
          <ColorField label="Preço" value={priceColor} onChange={setPriceColor} />
          <ColorField
            label="Mensagem complementar"
            value={complementaryColor}
            onChange={setComplementaryColor}
          />
          <ColorField label="Botão" value={buttonColor} onChange={setButtonColor} />
          <ColorField
            label="Texto do botão"
            value={buttonTextColor}
            onChange={setButtonTextColor}
          />
          <ColorField label="Benefícios" value={benefitsColor} onChange={setBenefitsColor} />
        </div>
      </EditorSection>

      <section className="mt-8 border-t border-border pt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Preview da campanha</h3>
          <span className="text-xs font-medium text-muted-foreground">
            Mesmo componente exibido no perfil
          </span>
        </div>
        <PromotionCampaignCard
          preview
          creatorName={selectedModels[0]?.name ?? "Modelo"}
          creatorImage={
            selectedModels[0]?.profile_image_path
              ? resolveMediaUrl(selectedModels[0].profile_image_path)
              : null
          }
          campaign={{
            title: title || "Título da campanha",
            description,
            urgencyText,
            complementaryText,
            benefitsText,
            originalPrice: Number(originalPrice.replace(",", ".")) || null,
            promotionalPrice: Number(promotionalPrice.replace(",", ".")) || 0,
            ctaText,
            endsAt: noEnd || !endsAt ? null : new Date(endsAt).toISOString(),
            showCountdown,
            cardBorderColor,
            countdownBgColor,
            countdownTextColor,
            titleColor,
            subtitleColor,
            priceColor,
            complementaryColor,
            buttonColor,
            buttonTextColor,
            benefitsColor,
          }}
        />
      </section>

      <section className="mt-8 border-t border-border pt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">Order Bump</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Ofertas adicionais exibidas no checkout desta campanha.
            </p>
          </div>
          <Switch checked={bumpEnabled} onChange={setBumpEnabled} label="Ativar Order Bump" />
        </div>
        {bumpEnabled ? (
          <div className="mt-5 space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Valor padrão por modelo">
                <input
                  inputMode="decimal"
                  value={bumpDefaultPrice}
                  onChange={(event) => setBumpDefaultPrice(event.target.value)}
                  placeholder="2,99"
                />
              </Field>
              <Field label="Quantidade máxima de ofertas exibidas">
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={bumpMaxVisible}
                  onChange={(event) => setBumpMaxVisible(event.target.value)}
                />
              </Field>
              <Field label="Título do Order Bump">
                <input value={bumpTitle} onChange={(event) => setBumpTitle(event.target.value)} />
              </Field>
              <Field label="Texto auxiliar">
                <input
                  value={bumpDescription}
                  onChange={(event) => setBumpDescription(event.target.value)}
                />
              </Field>
            </div>
            <div className="rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold">Modelos oferecidas no Order Bump</h4>
                  <p className="text-xs text-muted-foreground">
                    {bumpModels.length} selecionada{bumpModels.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBumpModels([])}
                  disabled={!bumpModels.length}
                  className="text-sm font-semibold text-muted-foreground disabled:opacity-40"
                >
                  Limpar
                </button>
              </div>
              <label className="mt-4 flex min-h-11 items-center gap-2 rounded-xl border border-border bg-input px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={bumpSearch}
                  onChange={(event) => setBumpSearch(event.target.value)}
                  placeholder="Pesquisar modelo"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-border">
                {bumpVisibleModels.map((model) => {
                  const index = bumpModels.findIndex((item) => item.modelId === model.id);
                  const item = index >= 0 ? bumpModels[index] : null;
                  return (
                    <div
                      key={model.id}
                      className="flex min-h-16 items-center gap-3 border-b border-border px-3 last:border-0"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(item)}
                        onChange={() => toggleBump(model.id)}
                        className="h-4 w-4 accent-primary"
                      />
                      <img
                        src={resolveMediaUrl(model.profile_image_path)}
                        alt=""
                        className="h-10 w-10 rounded-full bg-muted object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => toggleBump(model.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <strong className="block truncate text-sm font-semibold">
                          {model.name}
                        </strong>
                        <span className="block truncate text-xs text-muted-foreground">
                          @{model.username}
                        </span>
                      </button>
                      {item ? (
                        <>
                          <input
                            aria-label={`Preço individual de ${model.name}`}
                            inputMode="decimal"
                            value={item.price}
                            onChange={(event) =>
                              setBumpModels((current) =>
                                current.map((entry) =>
                                  entry.modelId === model.id
                                    ? { ...entry, price: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                            placeholder={bumpDefaultPrice || "2,99"}
                            className="h-9 w-24 rounded-lg border border-border bg-card px-2 text-right text-sm tabular-nums outline-none focus:border-primary"
                          />
                          <div className="flex">
                            <button
                              type="button"
                              onClick={() => moveBump(index, -1)}
                              disabled={index === 0}
                              aria-label="Mover para cima"
                              className="grid h-8 w-8 place-items-center disabled:opacity-25"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveBump(index, 1)}
                              disabled={index === bumpModels.length - 1}
                              aria-label="Mover para baixo"
                              className="grid h-8 w-8 place-items-center disabled:opacity-25"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            {bumpModels.length ? (
              <div className="rounded-2xl bg-muted/45 p-4">
                <h4 className="text-sm font-bold">Preview do Order Bump</h4>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {bumpModels.slice(0, Number(bumpMaxVisible) || 4).map((item) => {
                    const model = models.find((entry) => entry.id === item.modelId);
                    if (!model) return null;
                    return (
                      <div
                        key={item.modelId}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                      >
                        <img
                          src={resolveMediaUrl(model.profile_image_path)}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover"
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm">{model.name}</strong>
                          <small className="text-muted-foreground">Acesso vitalício</small>
                        </span>
                        <b className="text-sm tabular-nums text-primary">
                          +{" "}
                          {money(
                            Number(item.price.replace(",", ".")) ||
                              Number(bumpDefaultPrice.replace(",", ".")) ||
                              0,
                          )}
                        </b>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="mt-8 border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Modelos participantes</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {selected.size} selecionada{selected.size === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set(models.map((model) => model.id)))}
              className="min-h-10 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted"
            >
              Selecionar todas
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={!selected.size}
              className="min-h-10 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              Limpar seleção
            </button>
          </div>
        </div>

        {selectedModels.length ? (
          <div className="mt-4 flex max-h-28 flex-wrap gap-2 overflow-y-auto rounded-xl bg-muted/45 p-3">
            {selectedModels.map((model) => (
              <span
                key={model.id}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card pl-3 pr-1.5 text-xs font-semibold"
              >
                {model.name}
                <button
                  type="button"
                  onClick={() => toggle(model.id)}
                  aria-label={`Remover ${model.name}`}
                  className="grid h-6 w-6 place-items-center rounded-full hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <label className="mt-4 flex min-h-11 items-center gap-2 rounded-xl border border-border bg-input px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por nome ou usuário"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-border">
          {visibleModels.map((model) => (
            <label
              key={model.id}
              className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border px-4 last:border-b-0 hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={selected.has(model.id)}
                onChange={() => toggle(model.id)}
                className="h-4 w-4 accent-primary"
              />
              <img
                src={resolveMediaUrl(model.profile_image_path)}
                alt=""
                className="h-9 w-9 rounded-full bg-muted object-cover"
              />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-semibold">{model.name}</strong>
                <span className="block truncate text-xs text-muted-foreground">
                  @{model.username}
                </span>
              </span>
              {selected.has(model.id) ? <Check className="h-4 w-4 text-primary" /> : null}
            </label>
          ))}
          {!visibleModels.length ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma modelo encontrada.
            </p>
          ) : null}
        </div>
      </section>

      {error ? (
        <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-xl border border-border px-5 text-sm font-semibold"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-6 text-sm font-bold disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar promoção
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`block text-xs font-semibold uppercase tracking-wide text-muted-foreground ${wide ? "lg:col-span-2" : ""}`}
    >
      <span>{label}</span>
      <span className="promotion-field mt-1.5 block">{children}</span>
    </label>
  );
}

function RichTextEditor({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [color, setColor] = useState("#f04400");

  const insertMarkup = (before: string, after = before) => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = value.slice(start, end) || "texto";
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:col-span-2">
      <span>{label}</span>
      <span className="mt-1.5 block overflow-hidden rounded-xl border border-border bg-white focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
        <span className="flex min-h-10 flex-wrap items-center gap-1 border-b border-border bg-muted/35 px-2 py-1.5">
          <button
            type="button"
            onClick={() => insertMarkup("<strong>", "</strong>")}
            className="grid h-8 w-8 place-items-center rounded-lg text-sm font-bold hover:bg-white"
            aria-label="Negrito"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => insertMarkup("<em>", "</em>")}
            className="grid h-8 w-8 place-items-center rounded-lg text-sm italic hover:bg-white"
            aria-label="Itálico"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => insertMarkup("", "<br>")}
            className="h-8 rounded-lg px-2 text-[11px] font-semibold normal-case hover:bg-white"
          >
            Quebra
          </button>
          <span className="mx-1 h-5 w-px bg-border" />
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0"
            aria-label="Cor do texto"
          />
          <button
            type="button"
            onClick={() => insertMarkup(`<span style="color:${color}">`, "</span>")}
            className="h-8 rounded-lg px-2 text-[11px] font-semibold normal-case hover:bg-white"
          >
            Aplicar cor
          </button>
        </span>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-y bg-transparent px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none"
        />
      </span>
    </label>
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
    <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span>{label}</span>
      <span className="promotion-field mt-1.5 flex items-center gap-2 px-3">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium normal-case tracking-normal text-foreground outline-none"
        />
      </span>
    </label>
  );
}

function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7 border-t border-border pt-6">
      <h3 className="mb-4 text-lg font-bold">{title}</h3>
      {children}
    </section>
  );
}

function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border px-4 text-sm font-semibold ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
    >
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="relative h-6 w-11 rounded-full bg-muted transition peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}
