import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Minus,
  RefreshCw,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPwaControls } from "@/components/admin/AdminPwaControls";
import rankingBronze from "@/assets/ranking-bronze.png";
import rankingGold from "@/assets/ranking-ouro.png";
import rankingSilver from "@/assets/ranking-prata.png";
import { supabase } from "@/integrations/supabase/client";
import { resolveMediaUrl } from "@/lib/models";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Privadinhos Online Admin" },
      { name: "description", content: "Visão geral do painel Privadinhos Online." },
      { name: "robots", content: "noindex" },
      { name: "theme-color", content: "#f04400" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "manifest", href: "/admin.webmanifest" },
      { rel: "apple-touch-icon", href: "/assets/pwa/privadinhos-admin-apple.png" },
    ],
  }),
  component: () => (
    <AdminLayout>
      {() => <DashboardBody />}
    </AdminLayout>
  ),
});

type Stats = {
  totalUsers: number;
  newUsersToday: number;
  newUsersYesterday: number;
  newUsersThisMonth: number;
  revenueToday: number;
  revenueYesterday: number;
  revenueThisMonth: number;
  revenueSamePeriodLastMonth: number;
  salesToday: number;
  salesYesterday: number;
  pendingCount: number;
  pendingAmount: number;
  creatorRanking: { id: string; name: string; profileImagePath: string | null; count: number }[];
  customerOrders: {
    id: string;
    total_amount: number;
    payment_status: string;
    created_at: string;
    customer: string | null;
    phone: string | null;
    modelNames: string[];
    utm: {
      source: string | null;
      medium: string | null;
      campaign: string | null;
      content: string | null;
      term: string | null;
    } | null;
  }[];
};

type CustomerStatusFilter = "all" | "pending" | "paid";

type AttributionPopoverState = {
  orderId: string;
  customer: string | null;
  entries: [string, string][];
  anchor: { top: number; right: number };
};

type DashboardCustomerOrderRow = {
  id: string;
  total_amount: number | null;
  payment_status: string;
  created_at: string;
  checkout_phone: string | null;
  customers: { name: string | null; email: string | null } | null;
  order_items:
    | Array<{
        models: { name: string | null } | null;
      }>
    | null;
  order_attributions:
    | {
        utm_source: string | null;
        utm_medium: string | null;
        utm_campaign: string | null;
        utm_content: string | null;
        utm_term: string | null;
      }
    | Array<{
        utm_source: string | null;
        utm_medium: string | null;
        utm_campaign: string | null;
        utm_content: string | null;
        utm_term: string | null;
      }>
    | null;
};

type DashboardMetricCardProps = {
  label: string;
  value: string | number;
  trend?: MetricTrend | null;
  detail: ReactNode;
};

type MetricTrend = {
  label: string;
  className: string;
  Icon: typeof ArrowUpRight;
};

function DashboardMetricCard({ label, value, trend, detail }: DashboardMetricCardProps) {
  return (
    <article className="flex h-full min-h-0 flex-col rounded-[18px] border border-border bg-card px-5 py-[18px] shadow-[0_1px_4px_hsl(var(--foreground)/.035)] transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[0_8px_20px_hsl(var(--foreground)/.045)]">
      <h3 className="text-sm font-semibold leading-5 tracking-[-0.015em] text-muted-foreground">{label}</h3>
      <div className="flex min-h-16 min-w-0 flex-1 flex-wrap items-center gap-2 py-3">
        <p className="dashboard-sensitive min-w-0 text-[1.875rem] font-bold leading-none tracking-[-0.045em] text-foreground sm:text-[2rem]">{value ?? "—"}</p>
        {trend ? (
          <span className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-semibold ${trend.className}`}>
            <trend.Icon className="h-3 w-3" />
            <span className="dashboard-sensitive">{trend.label}</span>
          </span>
        ) : null}
      </div>
      <div className="mt-3.5 border-t border-border pt-3 text-[13px] leading-5 text-muted-foreground lg:mt-auto">{detail}</div>
    </article>
  );
}

function statusLabel(status: string) {
  if (status === "paid") return "Pago";
  if (status === "pending") return "Pendente";
  if (status === "failed") return "Falhou";
  if (status === "refunded") return "Reembolsado";
  if (status === "chargeback") return "Chargeback";
  return status;
}

function attributionEntries(utm: Stats["customerOrders"][number]["utm"]) {
  if (!utm) return [];
  return [
    ["utm_source", utm.source],
    ["utm_medium", utm.medium],
    ["utm_campaign", utm.campaign],
    ["utm_content", utm.content],
    ["utm_term", utm.term],
  ].filter(([, value]) => Boolean(value)) as [string, string][];
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

function creatorInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function RankingAvatar({
  creator,
  rank,
  className,
  alt,
}: {
  creator: Stats["creatorRanking"][number];
  rank: number;
  className: string;
  alt: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = creator.profileImagePath ? resolveMediaUrl(creator.profileImagePath, rank) : null;

  return (
    <span className={className}>
      {imageUrl && !imageFailed ? (
        <img
          src={imageUrl}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        creatorInitials(creator.name)
      )}
    </span>
  );
}

function RankingMedal({ rank, className = "" }: { rank: number; className?: string }) {
  const medal = rank === 0 ? rankingGold : rank === 1 ? rankingSilver : rank === 2 ? rankingBronze : null;
  if (!medal) return null;

  return <img src={medal} alt={`${rank + 1}º lugar`} className={`object-contain ${className}`} />;
}

function brazilDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: Number(value("year")), month: Number(value("month")), day: Number(value("day")) };
}

function brazilMidnight({ year, month, day }: { year: number; month: number; day: number }) {
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00-03:00`);
}

function addBrazilDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function dashboardPeriods() {
  const today = brazilDateParts();
  const todayStart = brazilMidnight(today);
  const tomorrowStart = addBrazilDays(todayStart, 1);
  const yesterdayStart = addBrazilDays(todayStart, -1);
  const currentMonthStart = brazilMidnight({ ...today, day: 1 });
  const previousMonthDate = new Date(Date.UTC(today.year, today.month - 2, 1));
  const previousMonth = { year: previousMonthDate.getUTCFullYear(), month: previousMonthDate.getUTCMonth() + 1 };
  const previousMonthStart = brazilMidnight({ ...previousMonth, day: 1 });
  const previousMonthLastDay = new Date(Date.UTC(previousMonth.year, previousMonth.month, 0)).getUTCDate();
  const previousSamePeriodEnd = brazilMidnight({
    ...previousMonth,
    day: Math.min(today.day, previousMonthLastDay) + 1,
  });

  return {
    today: { start: todayStart.toISOString(), end: tomorrowStart.toISOString() },
    yesterday: { start: yesterdayStart.toISOString(), end: todayStart.toISOString() },
    thisMonth: { start: currentMonthStart.toISOString(), end: tomorrowStart.toISOString() },
    previousSamePeriod: { start: previousMonthStart.toISOString(), end: previousSamePeriodEnd.toISOString() },
  };
}

function metricTrend(current: number, previous: number): MetricTrend | null {
  if (previous === 0) return null;
  const percentage = ((current - previous) / previous) * 100;
  if (percentage > 0) {
    return {
      label: `+${percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
      Icon: ArrowUpRight,
      className: "bg-emerald-500/12 text-emerald-700",
    };
  }
  if (percentage < 0) {
    return {
      label: `${percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
      Icon: ArrowDownRight,
      className: "bg-destructive/10 text-destructive",
    };
  }
  return {
    label: "0%",
    Icon: Minus,
    className: "bg-muted text-muted-foreground",
  };
}

function DashboardBody() {
  const [s, setS] = useState<Stats | null>(null);
  const [rankingPage, setRankingPage] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [customerFilter, setCustomerFilter] = useState<CustomerStatusFilter>("all");
  const [activeAttributionPopover, setActiveAttributionPopover] = useState<AttributionPopoverState | null>(null);
  const attributionCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [privacyMode, setPrivacyMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem("admin-dashboard-privacy") === "on";
  });

  const togglePrivacyMode = () => {
    setPrivacyMode((current) => {
      const next = !current;
      window.sessionStorage.setItem("admin-dashboard-privacy", next ? "on" : "off");
      return next;
    });
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshTick((current) => current + 1);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil((s?.creatorRanking.length ?? 0) / 3) - 1);
    setRankingPage((current) => Math.min(current, lastPage));
  }, [s?.creatorRanking.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsRefreshing(true);
      setLoadError(null);
      try {
        const periods = dashboardPeriods();
        const fetchAllPaidItems = async () => {
          const rows: any[] = [];
          for (let from = 0; ; from += 1000) {
            const page = await supabase.from("order_items").select("model_id, models(name), orders!inner(payment_status)").eq("orders.payment_status", "paid").range(from, from + 999);
            if (page.error) return page;
            rows.push(...(page.data ?? []));
            if ((page.data?.length ?? 0) < 1000) return { data: rows, error: null };
          }
        };
        const [paidToday, paidYesterday, paidThisMonth, paidPreviousPeriod, pendingOrders, allItems, allModels, customerOrders, totalUsers, newUsersToday, newUsersYesterday, newUsersThisMonth] = await Promise.all([
        supabase.from("orders").select("total_amount").eq("payment_status", "paid").gte("paid_at", periods.today.start).lt("paid_at", periods.today.end),
        supabase.from("orders").select("total_amount").eq("payment_status", "paid").gte("paid_at", periods.yesterday.start).lt("paid_at", periods.yesterday.end),
        supabase.from("orders").select("total_amount").eq("payment_status", "paid").gte("paid_at", periods.thisMonth.start).lt("paid_at", periods.thisMonth.end),
        supabase.from("orders").select("total_amount").eq("payment_status", "paid").gte("paid_at", periods.previousSamePeriod.start).lt("paid_at", periods.previousSamePeriod.end),
        supabase.from("orders").select("total_amount").eq("payment_status", "pending"),
        fetchAllPaidItems(),
        supabase.from("models").select("id,name,profile_image_path").order("name", { ascending: true }),
        supabase
          .from("orders")
          .select(
            "id,total_amount,payment_status,created_at,checkout_phone,customers(name,email),order_items(models(name)),order_attributions(utm_source,utm_medium,utm_campaign,utm_content,utm_term)",
          )
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .gte("created_at", periods.today.start)
          .lt("created_at", periods.today.end),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .gte("created_at", periods.yesterday.start)
          .lt("created_at", periods.yesterday.end),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .gte("created_at", periods.thisMonth.start)
          .lt("created_at", periods.thisMonth.end),
        ]);
        if (cancelled) return;

        const requestError = [
          paidToday.error,
          paidYesterday.error,
          paidThisMonth.error,
          paidPreviousPeriod.error,
          pendingOrders.error,
          allItems.error,
          allModels.error,
          customerOrders.error,
          totalUsers.error,
          newUsersToday.error,
          newUsersYesterday.error,
          newUsersThisMonth.error,
        ]
          .find(Boolean);
        if (requestError) throw requestError;

        const amountSum = (rows: { total_amount: number | null }[] | null) =>
          (rows ?? []).reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
        const todayRows = (paidToday.data ?? []) as { total_amount: number | null }[];
        const yesterdayRows = (paidYesterday.data ?? []) as { total_amount: number | null }[];
        const thisMonthRows = (paidThisMonth.data ?? []) as { total_amount: number | null }[];
        const previousPeriodRows = (paidPreviousPeriod.data ?? []) as { total_amount: number | null }[];
        const pendingRows = (pendingOrders.data ?? []) as { total_amount: number | null }[];

        const counter = new Map<string, { id: string; name: string; profileImagePath: string | null; count: number }>();
        for (const model of (allModels.data ?? []) as { id: string; name: string; profile_image_path: string | null }[]) {
          counter.set(model.id, {
            id: model.id,
            name: model.name,
            profileImagePath: model.profile_image_path,
            count: 0,
          });
        }
        for (const it of (allItems.data ?? []) as {
          model_id: string;
          models: { name: string } | null;
          orders: { payment_status: string } | null;
        }[]) {
          const key = it.model_id;
          const name = it.models?.name ?? "—";
          const prev = counter.get(key) ?? { id: key, name, profileImagePath: null, count: 0 };
          prev.count += 1;
          counter.set(key, prev);
        }
        const creatorRanking = Array.from(counter.values()).sort(
          (a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"),
        );

        const customerOrderRows = ((customerOrders.data ?? []) as DashboardCustomerOrderRow[]).map(
        (r) => {
          const attribution = Array.isArray(r.order_attributions)
            ? r.order_attributions[0]
            : r.order_attributions;
          return {
            id: String(r.id),
            total_amount: Number(r.total_amount ?? 0),
            payment_status: String(r.payment_status),
            created_at: String(r.created_at),
            customer: (r.customers?.name as string | undefined) ?? null,
            phone: r.checkout_phone ?? null,
            modelNames: Array.from(
              new Set(
                (r.order_items ?? [])
                  .map((item) => item.models?.name?.trim())
                  .filter((name): name is string => Boolean(name)),
              ),
            ),
            utm: attribution
              ? {
                  source: attribution.utm_source ?? null,
                  medium: attribution.utm_medium ?? null,
                  campaign: attribution.utm_campaign ?? null,
                  content: attribution.utm_content ?? null,
                  term: attribution.utm_term ?? null,
                }
              : null,
          };
        },
        );

        setS({
          totalUsers: totalUsers.count ?? 0,
          newUsersToday: newUsersToday.count ?? 0,
          newUsersYesterday: newUsersYesterday.count ?? 0,
          newUsersThisMonth: newUsersThisMonth.count ?? 0,
          revenueToday: amountSum(todayRows),
          revenueYesterday: amountSum(yesterdayRows),
          revenueThisMonth: amountSum(thisMonthRows),
          revenueSamePeriodLastMonth: amountSum(previousPeriodRows),
          salesToday: todayRows.length,
          salesYesterday: yesterdayRows.length,
          pendingCount: pendingRows.length,
          pendingAmount: amountSum(pendingRows),
          creatorRanking,
          customerOrders: customerOrderRows,
        });
      } catch (reason) {
        if (!cancelled) {
          setLoadError(reason instanceof Error ? reason.message : "Não foi possível atualizar os dados do painel.");
        }
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  if (!s && !loadError) {
    return (
      <section aria-label="Carregando métricas" className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="animate-pulse rounded-[18px] border border-border bg-card px-5 py-[18px]">
            <div className="h-4 w-28 rounded bg-muted" />
            <div className="mt-3 h-8 w-36 rounded bg-muted" />
            <div className="mt-3.5 h-px bg-border" />
            <div className="mt-3 h-3 w-40 rounded bg-muted" />
          </div>
        ))}
      </section>
    );
  }

  if (!s) {
    return (
      <div className="card-premium flex flex-col items-start gap-3 rounded-2xl p-5">
        <TriangleAlert className="h-5 w-5 text-destructive" />
        <div>
          <h2 className="font-bold">Não foi possível carregar o painel</h2>
          <p className="mt-1 text-sm text-muted-foreground">Verifique sua conexão e tente atualizar os dados.</p>
        </div>
        <button type="button" onClick={() => setRefreshTick((current) => current + 1)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </button>
      </div>
    );
  }

  const cards = [
    {
      label: "Faturamento hoje",
      value: formatCurrency(s.revenueToday),
      trend: metricTrend(s.revenueToday, s.revenueYesterday),
      detail: <>Ontem: <strong className="dashboard-sensitive font-semibold text-foreground">{formatCurrency(s.revenueYesterday)}</strong></>,
    },
    {
      label: "Faturamento mensal",
      value: formatCurrency(s.revenueThisMonth),
      trend: metricTrend(s.revenueThisMonth, s.revenueSamePeriodLastMonth),
      detail: <>Mesmo período anterior: <strong className="dashboard-sensitive font-semibold text-foreground">{formatCurrency(s.revenueSamePeriodLastMonth)}</strong></>,
    },
    {
      label: "Vendas hoje",
      value: s.salesToday,
      trend: metricTrend(s.salesToday, s.salesYesterday),
      detail: <>Ontem: <strong className="dashboard-sensitive font-semibold text-foreground">{s.salesYesterday} venda{s.salesYesterday === 1 ? "" : "s"}</strong></>,
    },
    {
      label: "PIX pendentes",
      value: s.pendingCount,
      detail: <>Pedidos aguardando pagamento <strong className="dashboard-sensitive font-semibold text-foreground">· {formatCurrency(s.pendingAmount)}</strong></>,
    },
    {
      label: "Novos usuários",
      value: s.newUsersToday,
      trend: metricTrend(s.newUsersToday, s.newUsersYesterday),
      detail: <>Ontem: <strong className="dashboard-sensitive font-semibold text-foreground">{s.newUsersYesterday} usuário{s.newUsersYesterday === 1 ? "" : "s"}</strong></>,
    },
    {
      label: "Usuários totais",
      value: s.totalUsers.toLocaleString("pt-BR"),
      detail: <><strong className="dashboard-sensitive font-semibold text-foreground">+{s.newUsersThisMonth}</strong> este mês</>,
    },
  ];
  const visibleCustomers = s.customerOrders.filter(
    (order) => customerFilter === "all" || order.payment_status === customerFilter,
  );
  const rankingPageCount = Math.max(1, Math.ceil(s.creatorRanking.length / 3));
  const visibleRankingPage = Math.min(rankingPage, rankingPageCount - 1);
  const visibleRankingCreators = s.creatorRanking.slice(visibleRankingPage * 3, visibleRankingPage * 3 + 3);
  const cancelAttributionClose = () => {
    if (attributionCloseTimer.current) {
      clearTimeout(attributionCloseTimer.current);
      attributionCloseTimer.current = null;
    }
  };
  const closeAttributionPopover = () => {
    cancelAttributionClose();
    setActiveAttributionPopover(null);
  };
  const scheduleAttributionClose = () => {
    cancelAttributionClose();
    attributionCloseTimer.current = setTimeout(() => setActiveAttributionPopover(null), 100);
  };
  const openAttributionPopover = (
    order: Stats["customerOrders"][number],
    entries: [string, string][],
    anchorElement: HTMLElement,
  ) => {
    cancelAttributionClose();
    const rect = anchorElement.getBoundingClientRect();
    setActiveAttributionPopover({
      orderId: order.id,
      customer: order.customer,
      entries,
      anchor: { top: rect.top, right: rect.right },
    });
  };

  return (
    <div className={`space-y-5 [&_.dashboard-sensitive]:max-w-full [&_.dashboard-sensitive]:w-fit [&_.dashboard-sensitive]:transition-[filter,opacity] [&_.dashboard-sensitive]:duration-200 ${privacyMode ? "[&_.dashboard-sensitive]:pointer-events-none [&_.dashboard-sensitive]:select-none [&_.dashboard-sensitive]:blur-[5px] [&_.dashboard-sensitive]:opacity-80" : ""}`}>
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <AdminPwaControls />
          <button
            type="button"
            onClick={togglePrivacyMode}
            aria-pressed={privacyMode}
            aria-label={privacyMode ? "Mostrar dados da dashboard" : "Ocultar dados da dashboard"}
            title={privacyMode ? "Mostrar dados" : "Ocultar dados"}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 font-semibold transition ${
              privacyMode ? "bg-primary/10 text-primary hover:bg-primary/15" : "hover:bg-muted"
            }`}
          >
            {privacyMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span className="sr-only">{privacyMode ? "Mostrar dados" : "Ocultar dados"}</span>
          </button>
          <button
            type="button"
            onClick={() => setRefreshTick((current) => current + 1)}
            disabled={isRefreshing}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 font-semibold transition hover:bg-muted disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Atualizando" : "Atualizar"}
          </button>
        </div>
      </div>

      {loadError ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Os dados exibidos podem estar desatualizados. Não foi possível concluir a última atualização.</p>
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        <div className="contents">
          <section aria-label="Resumo da plataforma" className="order-1 grid min-w-0 gap-4 md:grid-cols-2 lg:col-start-1 lg:row-start-1 lg:h-full lg:auto-rows-fr">
            {cards.map((card) => <DashboardMetricCard key={card.label} {...card} />)}
          </section>

          <div className="card-premium order-3 w-full rounded-2xl p-5 lg:col-span-2 lg:row-start-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold">Clientes</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Acompanhe os pedidos e a origem de cada cliente.
              </p>
            </div>
            <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
              {(
                [
                  ["all", "Todos"],
                  ["pending", "Pendentes"],
                  ["paid", "Pagos"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCustomerFilter(value)}
                  className={`min-h-11 px-3 font-semibold transition-colors ${
                    customerFilter === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {visibleCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente encontrado neste filtro.</p>
          ) : (
            <ul className="max-h-[36rem] divide-y divide-border overflow-y-auto px-2 text-sm">
              <li className="hidden grid-cols-[8rem_minmax(0,1.35fr)_minmax(0,1fr)_8rem_8rem_8rem] items-center gap-x-4 border-b border-border px-1 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground xl:grid">
                <span className="col-start-1 justify-self-start">Data</span>
                <span className="col-start-2 justify-self-start">Cliente</span>
                <span className="col-start-3 justify-self-start">Modelo</span>
                <span className="col-start-4 justify-self-start">Status</span>
                <span className="col-start-5 justify-self-start text-left">Valor</span>
                <span className="col-start-6 justify-self-start text-left">UTMs</span>
              </li>
              {visibleCustomers.map((order) => {
                const utmEntries = attributionEntries(order.utm);
                const hasAttribution = utmEntries.length > 0;
                const isAttributionPopoverOpen = activeAttributionPopover?.orderId === order.id;
                return (
                  <li key={order.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 py-3 xl:grid-cols-[8rem_minmax(0,1.35fr)_minmax(0,1fr)_8rem_8rem_8rem] xl:items-center xl:gap-x-4">
                    <div className="hidden text-xs xl:col-start-1 xl:row-start-1 xl:block xl:justify-self-start">
                      <p className="dashboard-sensitive font-semibold text-foreground">{new Date(order.created_at).toLocaleDateString("pt-BR")}</p>
                      <p className="dashboard-sensitive mt-0.5 text-[10px] text-muted-foreground">{new Date(order.created_at).toLocaleTimeString("pt-BR")}</p>
                    </div>
                    <div className="min-w-0 flex-1 xl:col-start-2 xl:row-start-1 xl:justify-self-stretch">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="-m-1.5 truncate p-1.5 font-semibold text-foreground">
                          <span className="dashboard-sensitive">{order.customer ?? "Cliente"}</span>
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold xl:hidden ${
                            order.payment_status === "paid"
                              ? "bg-emerald-500/15 text-emerald-500"
                              : order.payment_status === "pending"
                                ? "bg-amber-500/15 text-amber-500"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {statusLabel(order.payment_status)}
                        </span>
                      </div>
                      <p className="-mx-1.5 -mb-1.5 mt-0 truncate p-1.5 text-[11px] text-muted-foreground">
                        <span className="dashboard-sensitive">{order.phone ? formatPhone(order.phone) : "Telefone não disponível"}</span>
                      </p>
                    </div>
                    <div className="min-w-0 justify-self-start text-left xl:col-start-3 xl:row-start-1">
                      <p className="-m-1.5 truncate p-1.5 text-xs font-semibold text-foreground">
                        <span className="dashboard-sensitive">{order.modelNames.length > 0 ? order.modelNames.join(", ") : "Modelo indisponível"}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground xl:hidden">Modelo</p>
                    </div>
                    <span
                      className={`hidden rounded-full px-2 py-0.5 text-[10px] font-bold xl:col-start-4 xl:row-start-1 xl:inline-flex xl:justify-self-start ${
                        order.payment_status === "paid"
                          ? "bg-emerald-500/15 text-emerald-500"
                          : order.payment_status === "pending"
                            ? "bg-amber-500/15 text-amber-500"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {statusLabel(order.payment_status)}
                    </span>
                    <div className="shrink-0 text-left xl:col-start-5 xl:row-start-1 xl:justify-self-start">
                      <p className="dashboard-sensitive font-bold">{formatCurrency(order.total_amount)}</p>
                      <p className="dashboard-sensitive text-[10px] text-muted-foreground xl:hidden">{new Date(order.created_at).toLocaleString("pt-BR")}</p>
                    </div>
                    {hasAttribution ? (
                      <div
                        className="relative shrink-0 justify-self-start text-left xl:col-start-6 xl:row-start-1"
                        onMouseEnter={(event) => openAttributionPopover(order, utmEntries, event.currentTarget)}
                        onMouseLeave={scheduleAttributionClose}
                        onFocus={(event) => openAttributionPopover(order, utmEntries, event.currentTarget)}
                        onBlur={scheduleAttributionClose}
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            if (isAttributionPopoverOpen) closeAttributionPopover();
                            else openAttributionPopover(order, utmEntries, event.currentTarget);
                          }}
                          aria-expanded={isAttributionPopoverOpen}
                          aria-describedby={isAttributionPopoverOpen ? `utm-popover-${order.id}` : undefined}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/35 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        >
                          UTMs (<span className="dashboard-sensitive">{utmEntries.length}</span>)
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ) : <span className="hidden xl:col-start-6 xl:block xl:justify-self-start" aria-hidden="true" />}
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        </div>

        <aside className="card-premium order-2 w-full rounded-2xl p-5 lg:col-start-2 lg:row-start-1 lg:h-full">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                <h3 className="text-base font-black tracking-tight">Ranking de criadoras</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Ordenado por vendas aprovadas.</p>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">
              Geral
            </span>
          </div>

          {s.creatorRanking.length > 0 ? (
            <>
              {visibleRankingPage === 0 ? <ol className="mt-6 grid grid-cols-3 items-end gap-2" aria-label="Pódio das três primeiras criadoras">
                {[1, 0, 2].map((index) => {
                  const creator = s.creatorRanking[index];
                  if (!creator) return <li key={`empty-${index}`} aria-hidden="true" />;
                  const isLeader = index === 0;
                  return (
                    <li key={creator.id} className="min-w-0 text-center">
                      <div className="relative mx-auto h-12 w-12">
                        <RankingAvatar
                          creator={creator}
                          rank={index}
                          alt={`Foto de perfil de ${creator.name}`}
                          className="grid h-full w-full place-items-center overflow-hidden rounded-full border-2 border-background bg-muted text-sm font-black text-foreground shadow-sm"
                        />
                        <RankingMedal rank={index} className="absolute -bottom-2 -right-2 h-7 w-7" />
                      </div>
                      <p className="dashboard-sensitive mt-2 truncate text-xs font-bold">{creator.name}</p>
                      <p className="dashboard-sensitive mt-0.5 text-[10px] text-muted-foreground">
                        {creator.count} venda{creator.count === 1 ? "" : "s"}
                      </p>
                      <div className={`mx-auto mt-2 grid place-items-center rounded-t-xl text-sm font-black ${
                        index === 0 ? "h-20 bg-primary text-primary-foreground" : index === 1 ? "h-14 bg-slate-200 text-slate-800" : "h-10 bg-amber-700/15 text-amber-900"
                      }`}>
                        <span className="dashboard-sensitive">{index + 1}</span>
                      </div>
                    </li>
                  );
                })}
              </ol> : null}

              <div className="mt-5 overflow-hidden rounded-xl border border-border bg-background">
                <ol className="divide-y divide-border">
                  {visibleRankingCreators.map((creator, index) => {
                    const absoluteRank = visibleRankingPage * 3 + index;
                    return (
                    <li key={creator.id} className="flex min-h-16 items-center gap-3 px-3 py-2.5">
                      {absoluteRank < 3 ? (
                        <RankingMedal rank={absoluteRank} className="h-8 w-8 shrink-0" />
                      ) : (
                        <span className="grid h-7 w-7 shrink-0 place-items-center text-[11px] font-black text-muted-foreground">
                          {absoluteRank + 1}
                        </span>
                      )}
                      <RankingAvatar
                        creator={creator}
                        rank={absoluteRank}
                        alt=""
                        className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs font-black text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1">
                        <b className="dashboard-sensitive block truncate text-sm">{creator.name}</b>
                        <small className="dashboard-sensitive block text-[10px] text-muted-foreground">
                          {creator.count} venda{creator.count === 1 ? " aprovada" : "s aprovadas"}
                        </small>
                      </span>
                      <b className="dashboard-sensitive shrink-0 text-sm tabular-nums">{creator.count}</b>
                    </li>
                    );
                  })}
                </ol>
              </div>

              {rankingPageCount > 1 ? (
                <nav className="mt-4 flex items-center justify-center gap-2" aria-label="Paginação do ranking">
                  <button
                    type="button"
                    onClick={() => setRankingPage((current) => Math.max(0, current - 1))}
                    disabled={visibleRankingPage === 0}
                    aria-label="Página anterior do ranking"
                    className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/30 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-14 text-center text-xs font-bold tabular-nums text-muted-foreground">
                    {visibleRankingPage + 1} / {rankingPageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRankingPage((current) => Math.min(rankingPageCount - 1, current + 1))}
                    disabled={visibleRankingPage === rankingPageCount - 1}
                    aria-label="Próxima página do ranking"
                    className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/30 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </nav>
              ) : null}
            </>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <Trophy className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">Ainda não há vendas aprovadas.</p>
              <p className="mt-1 text-xs text-muted-foreground">O ranking será exibido quando as primeiras vendas forem confirmadas.</p>
            </div>
          )}
        </aside>
      </div>
      {activeAttributionPopover ? (
        <div
          id={`utm-popover-${activeAttributionPopover.orderId}`}
          role="tooltip"
          onMouseEnter={cancelAttributionClose}
          onMouseLeave={scheduleAttributionClose}
          className="fixed z-50 w-64 -translate-x-full -translate-y-full rounded-lg border border-border bg-background p-3 text-left shadow-[0_12px_28px_hsl(var(--foreground)/.12)]"
          style={{ top: Math.max(12, activeAttributionPopover.anchor.top - 8), left: activeAttributionPopover.anchor.right }}
        >
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Origem do pedido
          </p>
          <div className="grid gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {activeAttributionPopover.entries.map(([key, value]) => (
              <p key={key} className="break-all">
                <span className="font-semibold text-foreground/80">{key}:</span> {value}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
