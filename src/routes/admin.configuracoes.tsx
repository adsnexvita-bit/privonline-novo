import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  ChevronRight,
  CreditCard,
  Headphones,
  Loader2,
  ScrollText,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  getAdminProfileSupportSettings,
  updateProfileSupportSettings,
} from "@/lib/profile-support-settings.functions";

export const Route = createFileRoute("/admin/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Privadinhos Online Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname.startsWith("/admin/configuracoes/")) {
    return <Outlet />;
  }

  return <ConfiguracoesHome />;
}

function ConfiguracoesHome() {
  const loadSupportSettings = useServerFn(getAdminProfileSupportSettings);
  const saveSupportSettings = useServerFn(updateProfileSupportSettings);
  const [supportEnabled, setSupportEnabled] = useState(true);
  const [loadingSupport, setLoadingSupport] = useState(true);
  const [savingSupport, setSavingSupport] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadSupportSettings()
      .then((settings) => active && setSupportEnabled(settings.enabled))
      .catch((reason) => {
        if (!active) return;
        setSupportError(
          reason instanceof Error ? reason.message : "Não foi possível carregar a configuração.",
        );
      })
      .finally(() => active && setLoadingSupport(false));
    return () => {
      active = false;
    };
  }, [loadSupportSettings]);

  async function toggleSupport() {
    if (loadingSupport || savingSupport) return;
    const nextEnabled = !supportEnabled;
    setSavingSupport(true);
    setSupportError(null);
    try {
      const settings = await saveSupportSettings({ data: { enabled: nextEnabled } });
      setSupportEnabled(settings.enabled);
    } catch (reason) {
      setSupportError(
        reason instanceof Error ? reason.message : "Não foi possível salvar a configuração.",
      );
    } finally {
      setSavingSupport(false);
    }
  }

  return (
    <AdminLayout title="Configurações">
      {() => (
        <div className="mx-auto max-w-5xl space-y-4">
          <section className="card-premium rounded-2xl p-5 sm:p-6">
            <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Headphones className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-black">Suporte no perfil</h2>
                  <p className="text-sm text-muted-foreground">
                    Exibe o contato do Telegram para visitantes e clientes sem pedidos.
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={supportEnabled}
                disabled={loadingSupport || savingSupport}
                onClick={toggleSupport}
                className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-black sm:w-auto ${supportEnabled ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"} disabled:opacity-60`}
              >
                {savingSupport ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-label="Salvando" />
                ) : supportEnabled ? (
                  "Ativado"
                ) : (
                  "Desativado"
                )}
              </button>
            </div>
            {supportError ? (
              <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {supportError}
              </p>
            ) : null}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <ConfigLink to="/admin/configuracoes/pagamentos" icon={CreditCard} title="Pagamentos" />
            <ConfigLink to="/admin/webhooks" icon={Webhook} title="Webhooks" />
            <ConfigLink to="/admin/administradores" icon={ShieldCheck} title="Administradores" />
            <ConfigLink to="/admin/logs" icon={ScrollText} title="Logs do sistema" />
          </section>
        </div>
      )}
    </AdminLayout>
  );
}

function ConfigLink({
  to,
  icon: Icon,
  title,
}: {
  to:
    | "/admin/configuracoes/pagamentos"
    | "/admin/webhooks"
    | "/admin/administradores"
    | "/admin/logs";
  icon: typeof CreditCard;
  title: string;
}) {
  return (
    <Link
      to={to}
      className="card-premium group flex min-h-24 items-center gap-4 rounded-2xl px-5 py-4 transition hover:-translate-y-0.5 hover:border-primary/40"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <strong className="min-w-0 flex-1 text-sm">{title}</strong>
      <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
