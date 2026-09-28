import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  UserCircle,
  Settings,
  GalleryHorizontalEnd,
  Tags,
  LogOut,
  Menu,
  X,
  ExternalLink,
  BadgeDollarSign,
  Plug,
  Megaphone,
  ChevronRight,
  BadgePercent,
  RefreshCw,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { fetchAdminIdentity } from "@/lib/admin-helpers";
import { RouteLoadingOverlay } from "@/components/ui/RouteLoadingOverlay";

type MenuItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  matches?: ReadonlyArray<string>;
};

const dashboard: MenuItem = {
  to: "/admin",
  label: "Dashboard",
  icon: LayoutDashboard,
  exact: true,
};

const navigationGroups: ReadonlyArray<{
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  items: ReadonlyArray<MenuItem>;
}> = [
  {
    label: "Conteúdos",
    to: "/admin/modelos",
    icon: GalleryHorizontalEnd,
    items: [
      { to: "/admin/modelos", label: "Modelos", icon: Users },
      { to: "/admin/categorias", label: "Categorias", icon: Tags },
      { to: "/admin/demonstracoes", label: "Demonstrações", icon: GalleryHorizontalEnd },
    ],
  },
  {
    label: "Comercial",
    to: "/admin/clientes",
    icon: BadgeDollarSign,
    items: [
      { to: "/admin/clientes", label: "Clientes", icon: UserCircle },
      { to: "/admin/compras", label: "Compras", icon: BadgeDollarSign },
      { to: "/admin/promocoes", label: "Promoções", icon: BadgePercent },
    ],
  },
  {
    label: "Integrações",
    to: "/admin/integracoes/meta-ads",
    icon: Plug,
    items: [
      {
        to: "/admin/integracoes/meta-ads",
        label: "Rastreamento",
        icon: Megaphone,
      },
      { to: "/admin/configuracoes/pagamentos", label: "Pagamentos", icon: BadgeDollarSign },
    ],
  },
  {
    label: "Sistema",
    to: "/admin/configuracoes",
    icon: Settings,
    items: [
      { to: "/admin/configuracoes", label: "Configurações", icon: Settings },
      { to: "/admin/administradores", label: "Administradores", icon: UserCircle },
      { to: "/admin/webhooks", label: "Webhooks", icon: Plug },
      { to: "/admin/logs", label: "Logs", icon: Settings },
    ],
  },
];

export type AdminIdentity = {
  authUserId: string;
  email: string;
  adminId: string;
  name: string | null;
};

export function AdminLayout({
  children,
  title,
  subtitle,
}: {
  children: (identity: AdminIdentity) => ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const navigate = useNavigate();
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const routerState = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(null);
    fetchAdminIdentity()
      .then((ident) => {
        if (!mounted) return;
        if (!ident) {
          navigate({ to: "/admin/login", replace: true });
          return;
        }
        setIdentity(ident);
      })
      .catch((error) => {
        if (!mounted) return;
        setLoadError(
          error instanceof Error ? error.message : "Não foi possível preparar o painel.",
        );
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [authAttempt, navigate]);

  useEffect(() => setOpen(false), [routerState]);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const detect = () => {
      const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setStandalone(media.matches || iosStandalone);
    };
    detect();
    media.addEventListener?.("change", detect);
    return () => media.removeEventListener?.("change", detect);
  }, []);

  useEffect(() => {
    const normalizedPath = routerState.replace(/\/+$/, "") || "/";
    if (standalone && normalizedPath !== "/admin") {
      navigate({ to: "/admin", replace: true });
    }
  }, [navigate, routerState, standalone]);

  useEffect(() => {
    const activeGroup = navigationGroups.find((group) =>
      group.items.some((item) => isMenuActive(item, routerState)),
    );
    if (!activeGroup) return;
    setExpandedGroups((current) => {
      if (current.has(activeGroup.label)) return current;
      return new Set(current).add(activeGroup.label);
    });
  }, [routerState]);

  function toggleGroup(label: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  if (loading) {
    return (
      <div className="admin-shell relative min-h-screen bg-background">
        <RouteLoadingOverlay label="Preparando o painel" />
      </div>
    );
  }

  if (loadError || !identity) {
    return (
      <div className="admin-shell grid min-h-screen place-items-center bg-background px-4">
        <div className="admin-glass w-full max-w-sm rounded-3xl p-6 text-center">
          <h1 className="text-lg font-bold text-foreground">Não foi possível abrir o painel</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {loadError ?? "Sua sessão não está disponível neste dispositivo."}
          </p>
          <button
            type="button"
            onClick={() => setAuthAttempt((attempt) => attempt + 1)}
            className="btn-primary mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/admin/login", replace: true })}
            className="mt-2 min-h-11 w-full rounded-xl px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Entrar novamente
          </button>
        </div>
      </div>
    );
  }

  if (loadError || !identity) {
    return (
      <div className="admin-shell grid min-h-screen place-items-center bg-background px-4">
        <div className="admin-glass w-full max-w-sm rounded-3xl p-6 text-center">
          <h1 className="text-lg font-bold text-foreground">Não foi possível abrir o painel</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {loadError ?? "Sua sessão não está disponível neste dispositivo."}
          </p>
          <button
            type="button"
            onClick={() => setAuthAttempt((attempt) => attempt + 1)}
            className="btn-primary mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/admin/login", replace: true })}
            className="mt-2 min-h-11 w-full rounded-xl px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Entrar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen bg-background text-foreground">
      {!standalone ? (
        <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/95 px-4 shadow-sm backdrop-blur lg:hidden">
          <Logo className="h-7" />
          <div className="flex items-center gap-2">
            <Link
              to="/"
              aria-label="Abrir site"
              className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-5 w-5" />
            </Link>
            <button
              onClick={() => setOpen((value) => !value)}
              className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface shadow-sm"
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              aria-expanded={open}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      ) : null}

      {!standalone && open ? (
        <button
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      {!standalone ? (
        <aside
          className={`admin-sidebar fixed inset-y-0 left-0 z-40 flex w-[min(300px,calc(100vw-3rem))] flex-col overflow-hidden border-r border-border bg-card text-foreground shadow-[18px_0_40px_-28px_hsl(var(--foreground)/.34)] transition-transform duration-300 lg:w-[18rem] lg:translate-x-0 lg:shadow-none ${
            open ? "translate-x-0" : "-translate-x-[calc(100%+2rem)]"
          }`}
        >
          <div className="flex h-20 items-center justify-between border-b border-border px-6">
            <Logo className="h-8" />
            <Link
              to="/"
              className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Visualizar site"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>

          <nav
            className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-5"
            aria-label="Administração"
          >
            <AdminNavItem item={dashboard} pathname={routerState} />
            {navigationGroups.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <div
                  className={`group flex min-h-11 items-center rounded-xl transition ${
                    group.items.some((item) => isMenuActive(item, routerState))
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Link
                    to={group.to as never}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm font-semibold"
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
                        group.items.some((item) => isMenuActive(item, routerState))
                          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      <group.icon className="h-[1.125rem] w-[1.125rem]" />
                    </span>
                    {group.label}
                  </Link>
                  <button
                    type="button"
                    aria-label={`${expandedGroups.has(group.label) ? "Recolher" : "Expandir"} ${group.label}`}
                    aria-expanded={expandedGroups.has(group.label)}
                    onClick={() => toggleGroup(group.label)}
                    className="mr-1 grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-background hover:text-foreground"
                  >
                    <ChevronRight
                      className={`h-4 w-4 transition-transform duration-200 ${expandedGroups.has(group.label) ? "rotate-90" : ""}`}
                    />
                  </button>
                </div>
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                    expandedGroups.has(group.label)
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="relative mb-1 mt-1 space-y-0.5 pl-3 before:absolute before:bottom-2 before:left-[1.3rem] before:top-2 before:border-l before:border-border">
                      {group.items.map((item) => (
                        <AdminNavItem key={item.to} item={item} pathname={routerState} nested />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </nav>

          <div className="border-t border-border px-4 py-4">
            <div className="flex items-center gap-3 px-2 py-1.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground shadow-sm shadow-primary/30">
                {(identity.name ?? identity.email).slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">
                  {identity.name ?? "Administrador"}
                </p>
                <p className="truncate text-xs text-muted-foreground">{identity.email}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Encerrar sessão
            </button>
          </div>
        </aside>
      ) : null}

      <main
        className={`relative min-w-0 px-4 pb-8 pt-5 sm:px-6 lg:px-7 lg:py-7 xl:px-8 ${standalone ? "" : "lg:ml-72"}`}
      >
        <div className="mx-auto max-w-[1440px]">
          {title ? (
            <header className="mb-4 flex min-h-9 items-center">
              <h1 className="text-xl font-black tracking-[-0.035em] sm:text-2xl">{title}</h1>
            </header>
          ) : null}
          <div className="admin-content">{children(identity)}</div>
        </div>
      </main>
    </div>
  );
}

function isMenuActive(item: MenuItem, pathname: string) {
  return item.matches
    ? item.matches.some((path) => pathname.startsWith(path))
    : item.exact
      ? pathname === item.to
      : pathname.startsWith(item.to);
}

function AdminNavItem({
  item,
  pathname,
  nested = false,
}: {
  item: MenuItem;
  pathname: string;
  nested?: boolean;
}) {
  const active = isMenuActive(item, pathname);

  return (
    <Link
      to={item.to as never}
      activeOptions={{ exact: !!item.exact }}
      className={`group relative flex min-h-10 items-center gap-3 rounded-xl px-3 transition ${
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <span
        className={`grid shrink-0 place-items-center transition ${
          nested ? "h-7 w-7" : "h-8 w-8 rounded-lg"
        } ${
          active
            ? nested
              ? "text-primary"
              : "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
            : "text-muted-foreground group-hover:text-foreground"
        }`}
      >
        <item.icon className={nested ? "h-4 w-4" : "h-[1.125rem] w-[1.125rem]"} />
      </span>
      <strong
        className={`min-w-0 flex-1 truncate ${nested ? "text-sm font-medium" : "text-base font-semibold"}`}
      >
        {item.label}
      </strong>
    </Link>
  );
}
