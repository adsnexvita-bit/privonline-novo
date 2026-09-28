import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeDollarSign,
  Check,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { AdminLayout, type AdminIdentity } from "@/components/admin/AdminLayout";
import { useConfirmDialog } from "@/components/admin/ConfirmDialog";
import { RouteLoadingOverlay } from "@/components/ui/RouteLoadingOverlay";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/admin-helpers";

export const Route = createFileRoute("/admin/planos")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/modelos" });
  },
  head: () => ({
    meta: [
      { title: "Planos — Privadinhos Online Admin" },
      { name: "description", content: "Gestão de preços dos planos da Privadinhos Online." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminLayout
      title="Planos"
      subtitle="Configure somente os preços. A apresentação pública é padronizada automaticamente."
    >
      {(identity) => <PlansBody identity={identity} />}
    </AdminLayout>
  ),
});

type Plan = {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  access_type: "lifetime" | "subscription";
  duration_days: number | null;
  created_at: string;
};
type ModelOption = {
  id: string;
  name: string;
  username: string;
  profile_image_path: string | null;
};
type Assignment = { plan_id: string; model_id: string };
type PlanOffer = {
  id: string;
  plan_id: string;
  duration_days: number;
  price: number;
  display_order: number;
  is_active: boolean;
};

const PRICE_PERIODS = [
  { days: 30, label: "1 mês", description: "Assinatura principal" },
  { days: 90, label: "3 meses", description: "Pacote trimestral" },
  { days: 180, label: "6 meses", description: "Pacote semestral" },
  { days: 360, label: "12 meses", description: "Pacote anual" },
] as const;
type PriceMap = Record<number, string>;

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function parsePrice(value: string) {
  const normalized = value.trim().replace(/\s/g, "");
  return Number(
    normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized,
  );
}

function PlansBody({ identity }: { identity: AdminIdentity }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [offers, setOffers] = useState<PlanOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Plan | null | "new">(null);
  const { confirmAction, confirmDialog } = useConfirmDialog();

  async function reload() {
    setLoading(true);
    setError(null);
    const [plansResult, modelsResult, assignmentsResult, offersResult] = await Promise.all([
      supabase.from("plans").select("*").order("created_at", { ascending: true }),
      supabase
        .from("models")
        .select("id,name,username,profile_image_path")
        .order("name", { ascending: true }),
      supabase.from("plan_models").select("plan_id,model_id"),
      supabase.from("plan_offers").select("*").order("display_order", { ascending: true }),
    ]);
    const firstError =
      plansResult.error || modelsResult.error || assignmentsResult.error || offersResult.error;
    if (firstError) setError(firstError.message);
    setPlans((plansResult.data ?? []) as Plan[]);
    setModels((modelsResult.data ?? []) as ModelOption[]);
    setAssignments((assignmentsResult.data ?? []) as Assignment[]);
    setOffers((offersResult.data ?? []) as PlanOffer[]);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  const assignmentCount = useMemo(() => {
    const counts = new Map<string, number>();
    assignments.forEach(({ plan_id }) => counts.set(plan_id, (counts.get(plan_id) ?? 0) + 1));
    return counts;
  }, [assignments]);

  const offersByPlan = useMemo(() => {
    const grouped = new Map<string, PlanOffer[]>();
    offers.forEach((offer) =>
      grouped.set(offer.plan_id, [...(grouped.get(offer.plan_id) ?? []), offer]),
    );
    return grouped;
  }, [offers]);

  async function remove(plan: Plan) {
    const confirmed = await confirmAction({
      title: "Excluir tabela de preços?",
      description:
        "As modelos vinculadas ficarão sem opções de assinatura até receberem outra tabela.",
      confirmText: "Excluir tabela",
      destructive: true,
    });
    if (!confirmed) return;
    const { error: deleteError } = await supabase.from("plans").delete().eq("id", plan.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await logAdminAction({
      adminId: identity.adminId,
      action: "plan.delete",
      entityType: "plan",
      entityId: plan.id,
    });
    void reload();
  }

  if (editing) {
    return (
      <PlanEditor
        initial={editing === "new" ? null : editing}
        initialOffers={editing === "new" ? [] : (offersByPlan.get(editing.id) ?? [])}
        models={models}
        plans={plans}
        assignments={assignments}
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
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-sm font-bold text-foreground">Design único e automático</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Informe os preços de 1, 3, 6 e 12 meses. Textos, cores, ordem e destaque são definidos
            pelo sistema.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="btn-primary flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-black"
        >
          <Plus className="h-4 w-4" /> Nova tabela
        </button>
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {loading ? (
        <RouteLoadingOverlay />
      ) : plans.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const planOffers = (offersByPlan.get(plan.id) ?? []).filter((offer) => offer.is_active);
            const visibleOffers = planOffers.length
              ? planOffers
              : [{ id: "base", duration_days: 30, price: plan.price }];
            return (
              <article
                key={plan.id}
                className="rounded-3xl border border-border bg-card p-5 shadow-xl shadow-black/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
                    <BadgeDollarSign className="h-5 w-5" />
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${plan.is_active ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}
                  >
                    {plan.is_active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <h2 className="mt-5 text-xl font-black">Tabela de assinatura</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {assignmentCount.get(plan.id) ?? 0} modelo(s) incluída(s)
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {visibleOffers.map((offer) => (
                    <span
                      key={offer.id}
                      className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-foreground"
                    >
                      {offer.duration_days / 30} {offer.duration_days === 30 ? "mês" : "meses"} ·{" "}
                      {money(Number(offer.price))}
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(plan)}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-bold hover:bg-muted"
                  >
                    <Pencil className="h-4 w-4" /> Configurar preços{" "}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(plan)}
                    aria-label="Excluir tabela de preços"
                    className="grid h-11 w-11 place-items-center rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-border p-6 text-center">
          <div>
            <BadgeDollarSign className="mx-auto h-9 w-9 text-primary" />
            <h2 className="mt-3 text-lg font-black">Crie a primeira tabela de preços</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Preencha os valores e escolha as modelos.
            </p>
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

function PlanEditor({
  initial,
  initialOffers,
  models,
  plans,
  assignments,
  identity,
  onClose,
  onSaved,
}: {
  initial: Plan | null;
  initialOffers: PlanOffer[];
  models: ModelOption[];
  plans: Plan[];
  assignments: Assignment[];
  identity: AdminIdentity;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prices, setPrices] = useState<PriceMap>(() => {
    const values: PriceMap = {};
    PRICE_PERIODS.forEach(({ days }) => {
      const offer = initialOffers.find((item) => item.duration_days === days);
      values[days] = offer ? String(offer.price).replace(".", ",") : "";
    });
    if (!values[30] && initial?.price) values[30] = String(initial.price).replace(".", ",");
    return values;
  });
  const [selected, setSelected] = useState(
    new Set(
      initial
        ? assignments.filter((item) => item.plan_id === initial.id).map((item) => item.model_id)
        : [],
    ),
  );
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"prices" | "models">("prices");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleModels = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return models;
    return models.filter(
      (model) =>
        model.name.toLocaleLowerCase("pt-BR").includes(term) ||
        model.username.toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [models, search]);
  const assignedPlanByModel = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.model_id, assignment.plan_id])),
    [assignments],
  );

  function toggleModel(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const parsedOffers = PRICE_PERIODS.flatMap((period, index) => {
        const raw = prices[period.days]?.trim() ?? "";
        if (!raw) return [];
        const price = parsePrice(raw);
        if (!Number.isFinite(price) || price <= 0)
          throw new Error(`Informe um valor válido para ${period.label}.`);
        return [{ ...period, price, displayOrder: index }];
      });
      const monthly = parsedOffers.find((offer) => offer.days === 30);
      if (!monthly) throw new Error("O preço de 1 mês é obrigatório.");

      const planPayload = {
        name: initial?.name || `Tabela de assinatura ${plans.length + 1}`,
        price: monthly.price,
        is_active: true,
        access_type: "subscription" as const,
        duration_days: 30,
        is_featured: true,
        eyebrow_text: null,
        promo_tag_text: null,
        promo_tag_color: null,
      };

      let planId = initial?.id;
      if (planId) {
        const { error: updateError } = await supabase
          .from("plans")
          .update(planPayload)
          .eq("id", planId);
        if (updateError) throw updateError;
      } else {
        const { data, error: insertError } = await supabase
          .from("plans")
          .insert(planPayload)
          .select("id")
          .single();
        if (insertError) throw insertError;
        planId = data.id;
      }

      const selectedIds = Array.from(selected);
      const { error: clearPlanError } = await supabase
        .from("plan_models")
        .delete()
        .eq("plan_id", planId);
      if (clearPlanError) throw clearPlanError;
      if (selectedIds.length) {
        const { error: releaseModelsError } = await supabase
          .from("plan_models")
          .delete()
          .in("model_id", selectedIds);
        if (releaseModelsError) throw releaseModelsError;
        const { error: assignmentError } = await supabase
          .from("plan_models")
          .insert(selectedIds.map((modelId) => ({ plan_id: planId!, model_id: modelId })));
        if (assignmentError) throw assignmentError;
      }

      const { error: clearOffersError } = await supabase
        .from("plan_offers")
        .delete()
        .eq("plan_id", planId);
      if (clearOffersError) throw clearOffersError;
      const { error: offersError } = await supabase.from("plan_offers").insert(
        parsedOffers.map((offer) => ({
          plan_id: planId!,
          duration_days: offer.days,
          price: offer.price,
          is_primary: offer.days === 30,
          is_highlighted: false,
          button_color: null,
          tag_text: null,
          tag_color: null,
          display_order: offer.displayOrder,
          is_active: true,
        })),
      );
      if (offersError) throw offersError;

      await logAdminAction({
        adminId: identity.adminId,
        action: initial ? "plan.update" : "plan.create",
        entityType: "plan",
        entityId: planId,
        details: {
          prices: parsedOffers.map(({ days, price }) => ({ durationDays: days, price })),
          modelIds: selectedIds,
          layout: "profile-subscription",
        },
      });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar os preços.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative w-full">
      <div className="min-h-[calc(100vh-11rem)] rounded-3xl border border-border bg-card p-5 shadow-xl shadow-black/5 sm:p-7 lg:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              Design padronizado
            </p>
            <h2 className="mt-1 text-2xl font-black">
              {initial ? "Editar preços" : "Nova tabela de preços"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-bold text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 rounded-2xl border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setTab("prices")}
            className={`min-h-11 rounded-xl px-3 text-sm font-black ${tab === "prices" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Preços
          </button>
          <button
            type="button"
            onClick={() => setTab("models")}
            className={`min-h-11 rounded-xl px-3 text-sm font-black ${tab === "models" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Modelos ({selected.size})
          </button>
        </div>

        {tab === "prices" ? (
          <section className="mt-6">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-black">Você só precisa preencher os valores</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                O perfil usa automaticamente o mesmo título, ordem, cor e formato de botões. Deixe
                um pacote em branco para não exibi-lo.
              </p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {PRICE_PERIODS.map((period) => (
                <label
                  key={period.days}
                  className="rounded-2xl border border-border bg-surface p-4"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span>
                      <strong className="block text-base">{period.label}</strong>
                      <small className="text-xs font-medium text-muted-foreground">
                        {period.description}
                      </small>
                    </span>
                    {period.days === 30 ? (
                      <small className="rounded-full bg-primary/10 px-2 py-1 font-bold text-primary">
                        Obrigatório
                      </small>
                    ) : null}
                  </span>
                  <span className="mt-4 flex min-h-12 items-center rounded-xl border border-border bg-input px-4 focus-within:border-primary">
                    <span className="mr-2 text-sm font-bold text-muted-foreground">R$</span>
                    <input
                      inputMode="decimal"
                      value={prices[period.days] ?? ""}
                      onChange={(event) =>
                        setPrices((current) => ({ ...current, [period.days]: event.target.value }))
                      }
                      placeholder="0,00"
                      className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none"
                    />
                  </span>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {tab === "models" ? (
          <section className="mt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-base font-black">Modelos que usam estes preços</h3>
                <p className="text-xs text-muted-foreground">
                  Cada modelo pode usar uma única tabela.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(models.map((model) => model.id)))}
                  className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary"
                >
                  Selecionar todas
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground"
                >
                  Desmarcar
                </button>
              </div>
            </div>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar modelo..."
                className="min-h-11 w-full rounded-xl border border-border bg-input pl-10 pr-4 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
              {visibleModels.map((model) => {
                const checked = selected.has(model.id);
                const assignedElsewhere = Boolean(
                  assignedPlanByModel.get(model.id) &&
                  assignedPlanByModel.get(model.id) !== initial?.id,
                );
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => toggleModel(model.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${checked ? "border-primary/50 bg-primary/10" : "border-border bg-surface hover:bg-muted"}`}
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {model.profile_image_path ? (
                        <img
                          src={model.profile_image_path}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">{model.name}</p>
                      <p className="truncate text-xs text-muted-foreground">@{model.username}</p>
                      {assignedElsewhere ? (
                        <p className="mt-0.5 truncate text-[11px] font-bold text-primary">
                          Será movida da tabela atual
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border ${checked ? "border-primary bg-primary text-white" : "border-border"}`}
                    >
                      {checked ? <Check className="h-4 w-4" /> : null}
                    </span>
                  </button>
                );
              })}
              {!visibleModels.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma modelo encontrada.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-12 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="btn-primary flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar preços
          </button>
        </div>
      </div>
    </div>
  );
}
