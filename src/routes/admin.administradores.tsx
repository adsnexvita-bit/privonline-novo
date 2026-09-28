import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, KeyRound, ArrowLeft } from "lucide-react";
import { AdminLayout, type AdminIdentity } from "@/components/admin/AdminLayout";
import { useConfirmDialog } from "@/components/admin/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { createAdminUser, deleteAdminUser, updateAdminPassword } from "@/lib/admin.functions";
import { logAdminAction } from "@/lib/admin-helpers";

export const Route = createFileRoute("/admin/administradores")({
  head: () => ({
    meta: [
      { title: "Administradores — Privadinhos Online Admin" },
      { name: "description", content: "Gestão de administradores." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminLayout title="Administradores" subtitle="Gerencie quem tem acesso ao painel.">
      {(ident) => <AdminsBody identity={ident} />}
    </AdminLayout>
  ),
});

type Admin = {
  id: string;
  auth_user_id: string;
  email: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

function AdminsBody({ identity }: { identity: AdminIdentity }) {
  const [rows, setRows] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [passwordAdmin, setPasswordAdmin] = useState<Admin | null>(null);
  const create = useServerFn(createAdminUser);
  const del = useServerFn(deleteAdminUser);
  const updatePassword = useServerFn(updateAdminPassword);
  const { confirmAction, confirmDialog } = useConfirmDialog();

  async function reload() {
    setLoading(true);
    const { data } = await supabase
      .from("admin_users")
      .select("*")
      .order("created_at", { ascending: false });
    setRows((data ?? []) as Admin[]);
    setLoading(false);
  }
  useEffect(() => {
    reload();
  }, []);

  async function toggle(a: Admin) {
    await supabase
      .from("admin_users")
      .update({ is_active: !a.is_active } as never)
      .eq("id", a.id);
    await logAdminAction({
      adminId: identity.adminId,
      action: "admin.toggle_active",
      entityType: "admin_user",
      entityId: a.id,
      details: { is_active: !a.is_active },
    });
    reload();
  }

  async function remove(a: Admin) {
    if (a.id === identity.adminId) return alert("Você não pode remover a si mesmo.");
    const confirmed = await confirmAction({
      title: "Remover administrador?",
      description: `${a.email} perderá acesso ao painel administrativo.`,
      confirmText: "Remover administrador",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await del({ data: { id: a.id } });
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao remover");
    }
  }

  if (creating) {
    return (
      <CreateModal
        onClose={() => setCreating(false)}
        onSave={async (payload) => {
          try {
            await create({ data: payload });
            setCreating(false);
            await reload();
          } catch (e) {
            alert(e instanceof Error ? e.message : "Erro ao criar");
          }
        }}
      />
    );
  }

  if (passwordAdmin) {
    return (
      <PasswordModal
        admin={passwordAdmin}
        onClose={() => setPasswordAdmin(null)}
        onSave={async (password) => {
          await updatePassword({ data: { id: passwordAdmin.id, password } });
          setPasswordAdmin(null);
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} administrador(es)</p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="btn-primary flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold"
        >
          <Plus className="h-4 w-4" />
          Novo administrador
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="card-premium overflow-x-auto rounded-2xl">
          <table className="min-w-[640px] w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold">{a.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.email}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggle(a)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${a.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}
                    >
                      {a.is_active ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPasswordAdmin(a)}
                        title={`Alterar senha de ${a.name}`}
                        aria-label={`Alterar senha de ${a.name}`}
                        className="rounded-lg border border-border p-2 text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void remove(a);
                        }}
                        title={`Remover ${a.name}`}
                        aria-label={`Remover ${a.name}`}
                        className="rounded-lg border border-destructive/40 p-2 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}

function CreateModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (p: { name: string; email: string; password: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  return (
    <div className="relative w-full">
      <div className="min-h-[calc(100vh-11rem)] w-full rounded-3xl border border-border bg-card p-5 shadow-xl shadow-black/5 sm:p-7 lg:p-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black">Novo administrador</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        </div>
        <div className="space-y-3">
          <input
            placeholder="Nome"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
          />
          <input
            placeholder="E-mail"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
          />
          <input
            placeholder="Senha"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            onClick={async () => {
              if (!form.name || !form.email || form.password.length < 8)
                return alert("Preencha todos os campos (senha ≥ 8 caracteres).");
              setBusy(true);
              await onSave(form);
              setBusy(false);
            }}
            disabled={busy}
            className="btn-primary flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordModal({
  admin,
  onClose,
  onSave,
}: {
  admin: Admin;
  onClose: () => void;
  onSave: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password.length > 72) {
      setError("A senha deve ter no máximo 72 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As senhas digitadas não coincidem.");
      return;
    }

    setBusy(true);
    try {
      await onSave(password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar a senha.");
      setBusy(false);
    }
  }

  return (
    <div className="relative w-full">
      <div className="min-h-[calc(100vh-11rem)] w-full rounded-3xl border border-border bg-card p-5 shadow-xl shadow-black/5 sm:p-7 lg:p-8">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-black">Alterar senha</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {admin.name} · {admin.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold">Nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo de 8 caracteres"
              className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold">Confirmar nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !busy) void save();
              }}
              placeholder="Digite novamente"
              className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm"
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          A alteração entra em vigor imediatamente. O administrador deverá usar a nova senha no
          próximo acesso.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => void save()}
            disabled={busy}
            className="btn-primary flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Salvar nova senha
          </button>
        </div>
      </div>
    </div>
  );
}
