import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Search,
  ShieldCheck,
  ShieldX,
  Pencil,
  KeyRound,
  ArrowLeft,
  Plus,
  X,
} from "lucide-react";
import { AdminLayout, type AdminIdentity } from "@/components/admin/AdminLayout";
import { AdminOrdersPanel } from "@/components/admin/AdminOrdersPanel";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/admin-helpers";
import { formatBrazilPhone } from "@/lib/phone";
import { formatPlanDurationDays } from "@/lib/plan-duration";
import {
  grantCustomerAccessAsAdmin,
  listCustomersAsAdmin,
  registerCustomerAsAdmin,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Privadinhos Online Admin" },
      { name: "description", content: "Gestão de clientes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminLayout title="Clientes" subtitle="Compradores e usuários cadastrados em um só lugar.">
      {(ident) => <ClientsBody identity={ident} />}
    </AdminLayout>
  ),
});

type Customer = {
  id: string;
  cpf: string;
  name: string;
  email: string | null;
  phone: string | null;
  hasAccessPassword: boolean;
  is_active: boolean;
  created_at: string;
};

type Plan = {
  id: string;
  name: string;
  durationDays: number | null;
  accessType: string;
  price: number;
};

type Model = { id: string; name: string; username: string; plans: Plan[] };

type Access = {
  id: string;
  customer_id: string;
  model_id: string;
  access_status: string;
  granted_at: string;
  expires_at: string | null;
  plan_id: string | null;
  revoked_at: string | null;
  models?: { name: string; username: string };
};

function formatPlanOption(plan: Plan) {
  const duration =
    plan.durationDays == null ? "Vitalício" : formatPlanDurationDays(plan.durationDays);
  const price = Number(plan.price).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return `${plan.name} — ${duration} · ${price}`;
}

function ClientsBody({ identity }: { identity: AdminIdentity }) {
  const [rows, setRows] = useState<Customer[]>([]);
  const [buyerIds, setBuyerIds] = useState<Set<string>>(new Set());
  const [models, setModels] = useState<Model[]>([]);
  const [tab, setTab] = useState<"buyers" | "users">("users");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const listCustomers = useServerFn(listCustomersAsAdmin);

  async function reload() {
    setLoading(true);
    setLoadError(null);
    try {
      const directory = await listCustomers();
      setRows(directory.customers as Customer[]);
      setBuyerIds(new Set(directory.buyerIds));
      setModels((directory.models ?? []) as Model[]);
    } catch (error) {
      setRows([]);
      setBuyerIds(new Set());
      setLoadError(
        error instanceof Error ? error.message : "Não foi possível carregar os usuários.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const users = rows.filter((row) => !buyerIds.has(row.id));
    if (!term) return users;
    return users.filter((r) => {
      return (
        r.name.toLowerCase().includes(term) ||
        (r.email ?? "").toLowerCase().includes(term) ||
        (r.phone ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, buyerIds, q]);

  async function toggleActive(c: Customer) {
    await supabase
      .from("customers")
      .update({ is_active: !c.is_active } as never)
      .eq("id", c.id);
    await logAdminAction({
      adminId: identity.adminId,
      action: "customer.toggle_active",
      entityType: "customer",
      entityId: c.id,
      details: { is_active: !c.is_active },
    });
    reload();
  }

  if (detail) {
    return (
      <CustomerDetail
        customer={detail}
        identity={identity}
        models={models}
        onClose={() => setDetail(null)}
        onChanged={reload}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 inline-grid w-full grid-cols-2 gap-1 rounded-2xl border border-border bg-muted p-1 sm:w-auto">
        <button
          onClick={() => setTab("buyers")}
          className={`min-h-12 rounded-xl px-5 text-sm font-bold ${
            tab === "buyers" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Compradores
        </button>
        <button
          onClick={() => setTab("users")}
          className={`min-h-12 rounded-xl px-5 text-sm font-bold ${
            tab === "users" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Usuários
        </button>
      </div>

      {tab === "buyers" ? (
        <AdminOrdersPanel />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome, e-mail ou telefone"
                className="min-h-11 w-full rounded-xl border border-border bg-input py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold"
            >
              <Plus className="h-4 w-4" />
              Cadastrar cliente
            </button>
            <p className="px-1 text-sm text-muted-foreground">{filtered.length} cliente(s)</p>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : loadError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {loadError}
            </div>
          ) : (
            <div className="card-premium overflow-x-auto rounded-2xl">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Telefone</th>
                    <th className="px-4 py-3">Senha de acesso</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold">{c.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.phone ? formatBrazilPhone(c.phone) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.hasAccessPassword ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}
                        >
                          {c.hasAccessPassword ? "Criada" : "Não criada"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}
                        >
                          {c.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setDetail(c)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs"
                          >
                            <Pencil className="h-3 w-3" />
                            Editar
                          </button>
                          <button
                            onClick={() => setDetail(c)}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2 py-1 text-xs font-semibold text-primary"
                          >
                            <KeyRound className="h-3 w-3" />
                            Liberar acesso
                          </button>
                          <button
                            onClick={() => toggleActive(c)}
                            className="rounded-lg border border-border px-2 py-1 text-xs"
                          >
                            {c.is_active ? "Desativar" : "Ativar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-10 text-center text-sm text-muted-foreground"
                      >
                        Nenhum cliente encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {showCreate && (
            <CreateCustomerModal
              models={models}
              onClose={() => setShowCreate(false)}
              onCreated={async () => {
                setShowCreate(false);
                await reload();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function CustomerDetail({
  customer,
  identity,
  models,
  onClose,
  onChanged,
}: {
  customer: Customer;
  identity: AdminIdentity;
  models: Model[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [form, setForm] = useState({
    name: customer.name,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
  });
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [grantModelId, setGrantModelId] = useState("");
  const [grantPlanId, setGrantPlanId] = useState("");
  const [busy, setBusy] = useState(false);
  const grantCustomerAccess = useServerFn(grantCustomerAccessAsAdmin);

  useEffect(() => {
    (async () => {
      const [a] = await Promise.all([
        supabase
          .from("customer_access")
          .select("*, models(name,username)")
          .eq("customer_id", customer.id)
          .order("granted_at", { ascending: false }),
      ]);
      setAccesses((a.data ?? []) as unknown as Access[]);
    })();
  }, [customer.id]);

  async function save() {
    setBusy(true);
    await supabase
      .from("customers")
      .update({ name: form.name, email: form.email || null, phone: form.phone || null } as never)
      .eq("id", customer.id);
    await logAdminAction({
      adminId: identity.adminId,
      action: "customer.update",
      entityType: "customer",
      entityId: customer.id,
    });
    setBusy(false);
    onChanged();
    onClose();
  }

  async function grantAccess() {
    if (!grantModelId || !grantPlanId) return;
    try {
      await grantCustomerAccess({
        data: {
          customerId: customer.id,
          accesses: [{ modelId: grantModelId, planId: grantPlanId }],
        },
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível liberar o acesso.");
      return;
    }
    setGrantModelId("");
    setGrantPlanId("");
    // refresh
    const { data } = await supabase
      .from("customer_access")
      .select("*, models(name,username)")
      .eq("customer_id", customer.id)
      .order("granted_at", { ascending: false });
    setAccesses((data ?? []) as unknown as Access[]);
  }

  async function revoke(a: Access) {
    await supabase
      .from("customer_access")
      .update({
        access_status: "revoked",
        revoked_at: new Date().toISOString(),
        revocation_reason: "admin",
      } as never)
      .eq("id", a.id);
    await logAdminAction({
      adminId: identity.adminId,
      action: "access.revoke",
      entityType: "customer_access",
      entityId: a.id,
    });
    const { data } = await supabase
      .from("customer_access")
      .select("*, models(name,username)")
      .eq("customer_id", customer.id)
      .order("granted_at", { ascending: false });
    setAccesses((data ?? []) as unknown as Access[]);
  }

  async function reactivate(a: Access) {
    await supabase
      .from("customer_access")
      .update({ access_status: "active", revoked_at: null, revocation_reason: null } as never)
      .eq("id", a.id);
    await logAdminAction({
      adminId: identity.adminId,
      action: "access.reactivate",
      entityType: "customer_access",
      entityId: a.id,
    });
    const { data } = await supabase
      .from("customer_access")
      .select("*, models(name,username)")
      .eq("customer_id", customer.id)
      .order("granted_at", { ascending: false });
    setAccesses((data ?? []) as unknown as Access[]);
  }

  return (
    <div className="relative w-full">
      <div className="min-h-[calc(100vh-11rem)] w-full rounded-3xl border border-border bg-card p-5 shadow-xl shadow-black/5 sm:p-7 lg:p-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black">Editar usuário</h2>
            <p className="text-xs text-muted-foreground">
              {customer.phone ? formatBrazilPhone(customer.phone) : "Telefone não informado"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Nome</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">E-mail</label>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">
              Telefone
            </label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-bold">Acessos e liberações manuais</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Escolha uma modelo para conceder acesso imediato, sem criar um pedido.
          </p>
          <div className="mt-2 flex flex-col gap-2 lg:flex-row">
            <select
              value={grantModelId}
              onChange={(e) => {
                setGrantModelId(e.target.value);
                setGrantPlanId("");
              }}
              className="flex-1 rounded-xl border border-border bg-input px-3 py-2 text-sm"
            >
              <option value="">Selecione um criador para liberar</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (@{m.username})
                </option>
              ))}
            </select>
            <select
              value={grantPlanId}
              onChange={(e) => setGrantPlanId(e.target.value)}
              disabled={!grantModelId}
              className="flex-1 rounded-xl border border-border bg-input px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">Selecione o plano</option>
              {(models.find((model) => model.id === grantModelId)?.plans ?? []).map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            <button
              onClick={grantAccess}
              disabled={!grantModelId || !grantPlanId}
              className="btn-primary rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50"
            >
              Liberar
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {accesses.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-border p-3"
              >
                <div>
                  <p className="text-sm font-semibold">{a.models?.name ?? a.model_id}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.access_status === "active" ? "Ativo desde " : "Revogado — "}
                    {new Date(a.granted_at).toLocaleDateString("pt-BR")}
                    {a.access_status === "active"
                      ? a.expires_at
                        ? ` · expira em ${new Date(a.expires_at).toLocaleDateString("pt-BR")}`
                        : " · vitalício"
                      : ""}
                  </p>
                </div>
                {a.access_status === "active" ? (
                  <button
                    onClick={() => revoke(a)}
                    className="flex items-center gap-1 rounded-lg border border-destructive/40 px-2 py-1 text-xs text-destructive"
                  >
                    <ShieldX className="h-3 w-3" />
                    Revogar
                  </button>
                ) : (
                  <button
                    onClick={() => reactivate(a)}
                    className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    Reativar
                  </button>
                )}
              </div>
            ))}
            {accesses.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum acesso registrado.</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm">
            Fechar
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="btn-primary flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateCustomerModal({
  models,
  onClose,
  onCreated,
}: {
  models: Model[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const registerCustomer = useServerFn(registerCustomerAsAdmin);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    accesses: [] as Array<{ modelId: string; planId: string }>,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleModel(modelId: string) {
    setForm((current) => ({
      ...current,
      accesses: current.accesses.some((access) => access.modelId === modelId)
        ? current.accesses.filter((access) => access.modelId !== modelId)
        : [...current.accesses, { modelId, planId: "" }],
    }));
  }

  function selectPlan(modelId: string, planId: string) {
    setForm((current) => ({
      ...current,
      accesses: current.accesses.map((access) =>
        access.modelId === modelId ? { ...access, planId } : access,
      ),
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await registerCustomer({ data: form });
      await onCreated();
      alert(
        result.created
          ? `Cliente criado e ${result.granted} acesso(s) liberado(s).`
          : `Telefone já cadastrado. ${result.granted} novo(s) acesso(s) liberado(s), sem duplicar a conta.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar o cliente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Cadastrar cliente</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie a conta e libere os acessos sem gerar pedido ou pagamento.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-bold">
            Nome
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-input px-3 font-normal outline-none focus:border-primary"
            />
          </label>
          <label className="block text-sm font-bold">
            Telefone
            <input
              required
              inputMode="tel"
              placeholder="(11) 99999-9999"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-input px-3 font-normal outline-none focus:border-primary"
            />
          </label>
          <label className="block text-sm font-bold">
            Senha de 4 números
            <input
              required
              inputMode="numeric"
              type="password"
              maxLength={4}
              pattern="[0-9]{4}"
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value.replace(/\D/g, "").slice(0, 4) })
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-input px-3 font-normal tracking-[0.35em] outline-none focus:border-primary"
            />
          </label>
          <fieldset>
            <legend className="text-sm font-bold">Modelos com acesso ativo</legend>
            <div className="mt-2 grid max-h-[28rem] gap-2 overflow-y-auto rounded-2xl border border-border p-2 sm:grid-cols-2">
              {models.map((model) => {
                const access = form.accesses.find((item) => item.modelId === model.id);
                const selected = Boolean(access);
                const hasPlans = model.plans.length > 0;
                return (
                  <div
                    key={model.id}
                    className={`rounded-xl border p-3 transition-colors ${
                      selected
                        ? "border-primary/45 bg-primary/5"
                        : "border-transparent hover:bg-muted"
                    }`}
                  >
                    <label
                      className={`flex min-h-11 items-center gap-3 ${
                        hasPlans ? "cursor-pointer" : "cursor-not-allowed opacity-55"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!hasPlans}
                        onChange={() => toggleModel(model.id)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="min-w-0 text-sm">
                        <strong className="block truncate">{model.name}</strong>
                        <span className="block truncate text-xs text-muted-foreground">
                          @{model.username}
                          {!hasPlans ? " · Sem planos ativos" : ""}
                        </span>
                      </span>
                    </label>
                    {access ? (
                      <label className="mt-3 block text-xs font-bold text-muted-foreground">
                        Plano de acesso
                        <select
                          required
                          value={access.planId}
                          onChange={(event) => selectPlan(model.id, event.target.value)}
                          className="mt-1 min-h-11 w-full rounded-xl border border-border bg-input px-3 text-sm font-normal text-foreground outline-none focus:border-primary"
                        >
                          <option value="">Selecione o plano</option>
                          {model.plans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {formatPlanOption(plan)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </fieldset>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={
              busy || !form.accesses.length || form.accesses.some((access) => !access.planId)
            }
            className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Cadastrar cliente
          </button>
        </div>
      </form>
    </div>
  );
}
