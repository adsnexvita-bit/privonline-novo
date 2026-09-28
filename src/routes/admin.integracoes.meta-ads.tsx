import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, ExternalLink, History, LockKeyhole, Megaphone, RefreshCw, RotateCcw, Save } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useConfirmDialog } from "@/components/admin/ConfirmDialog";
import { auditMetaPurchases, getMetaAdsStatus, resendMetaPurchases, updateMetaAdsCredentials, updateMetaAdsTestMode } from "@/lib/meta-capi.functions";

export const Route = createFileRoute("/admin/integracoes/meta-ads")({
  head: () => ({
    meta: [
      { title: "Meta Ads — Privadinhos Online Admin" },
      {
        name: "description",
        content: "Status da integração segura com a Meta Conversions API.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MetaAdsPage,
});

function MetaAdsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"configuration" | "reconciliation">("configuration");
  const [testCode, setTestCode] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [credentialFeedback, setCredentialFeedback] = useState("");
  const status = useQuery({
    queryKey: ["admin", "integrations", "meta-ads"],
    queryFn: () => getMetaAdsStatus(),
  });
  useEffect(() => {
    if (status.data?.testEventCode) setTestCode(status.data.testEventCode);
  }, [status.data?.testEventCode]);
  useEffect(() => {
    if (status.data?.pixelId) setPixelId(status.data.pixelId);
  }, [status.data?.pixelId]);
  const updateCredentials = useMutation({
    mutationFn: () =>
      updateMetaAdsCredentials({ data: { pixelId, accessToken } }),
    onSuccess: async () => {
      setAccessToken("");
      setCredentialFeedback("Credenciais salvas. O novo Pixel já está ativo.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "integrations", "meta-ads"] });
    },
    onError: (error) => {
      setCredentialFeedback(
        error instanceof Error ? error.message : "Não foi possível salvar as credenciais.",
      );
    },
  });
  const updateTestMode = useMutation({
    mutationFn: (enabled: boolean) =>
      updateMetaAdsTestMode({ data: { enabled, testEventCode: testCode } }),
    onSuccess: async (_, enabled) => {
      setFeedback(enabled ? "Modo de teste ativado." : "Modo de teste desativado.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "integrations", "meta-ads"] });
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar.");
    },
  });

  return (
    <AdminLayout
      title="Meta Ads"
      subtitle="Conversões de compras enviadas pelo servidor, sem expor galerias, modelos ou dados sensíveis."
    >
      {() => (
        <div className="space-y-5">
        <div className="inline-flex rounded-xl border border-border bg-muted/60 p-1" role="tablist" aria-label="Seções da integração Meta Ads">
          <button type="button" role="tab" aria-selected={activeTab === "configuration"} onClick={() => setActiveTab("configuration")} className={`min-h-10 rounded-lg px-4 text-sm font-black transition ${activeTab === "configuration" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Configuração</button>
          <button type="button" role="tab" aria-selected={activeTab === "reconciliation"} onClick={() => setActiveTab("reconciliation")} className={`min-h-10 rounded-lg px-4 text-sm font-black transition ${activeTab === "reconciliation" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Reconciliação</button>
        </div>
        <div role="tabpanel" className={activeTab === "configuration" ? "block" : "hidden"}>
        <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
          <section className="card-premium rounded-3xl p-5 sm:p-7">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
                <Megaphone className="h-6 w-6" />
              </span>
              <div>
                <p className="text-lg font-black">Conversions API</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  O evento Purchase é disparado somente depois que a SyncPay confirma o pagamento.
                </p>
              </div>
            </div>

            {status.isPending ? (
              <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-muted/60 p-4 text-sm text-muted-foreground">
                <CircleDashed className="h-5 w-5 animate-spin" />
                Verificando o servidor…
              </div>
            ) : status.isError ? (
              <div className="mt-6 rounded-2xl border border-destructive/25 bg-destructive/8 p-4 text-sm text-destructive">
                Não foi possível consultar a configuração do servidor.
              </div>
            ) : (
              <div className="mt-6">
                <StatusBanner configured={status.data.configured} />
                <div className="mt-5 rounded-2xl border border-border bg-muted/35 p-4 sm:p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-xs font-bold text-muted-foreground">
                        ID do Pixel/Dataset
                      </span>
                      <input
                        value={pixelId}
                        onChange={(event) => setPixelId(event.target.value.replace(/\D/g, ""))}
                        inputMode="numeric"
                        placeholder="Ex.: 123456789012345"
                        disabled={updateCredentials.isPending}
                        className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-sm font-semibold outline-none transition focus:border-primary/60 disabled:opacity-50"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-bold text-muted-foreground">
                        Token privado da Conversions API
                      </span>
                      <input
                        type="password"
                        value={accessToken}
                        onChange={(event) => setAccessToken(event.target.value)}
                        placeholder={
                          status.data.tokenConfigured
                            ? `${status.data.tokenHint ?? "Token configurado"} — deixe vazio para manter`
                            : "Cole o token gerado pela Meta"
                        }
                        autoComplete="new-password"
                        disabled={updateCredentials.isPending}
                        className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-sm font-semibold outline-none transition focus:border-primary/60 disabled:opacity-50"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      O token fica criptografado. Deixe o campo vazio para manter o atual.
                    </p>
                    <button
                      type="button"
                      disabled={updateCredentials.isPending || !pixelId.trim()}
                      onClick={() => {
                        setCredentialFeedback("");
                        updateCredentials.mutate();
                      }}
                      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {updateCredentials.isPending ? (
                        <CircleDashed className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {updateCredentials.isPending ? "Salvando…" : "Salvar e ativar"}
                    </button>
                  </div>
                  {credentialFeedback ? (
                    <p className="mt-3 text-xs font-bold text-primary">{credentialFeedback}</p>
                  ) : null}
                </div>
                <div className="mt-4 divide-y divide-border border-y border-border">
                <StatusRow label="URL pública enviada" ready value={status.data.eventSourceUrl} />
                <StatusRow label="Versão da Graph API" ready value={status.data.graphVersion} />
                </div>
                <div className="mt-5 rounded-2xl border border-border bg-muted/45 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div><p className="text-sm font-black">Modo de teste</p><p className="mt-1 text-xs text-muted-foreground">Status: <b className="text-foreground">{status.data.testMode ? "Ativado" : "Desativado"}</b></p></div>
                    <span className={`h-2.5 w-2.5 rounded-full ${status.data.testMode ? "bg-amber-400" : "bg-emerald-400"}`} />
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                    <label className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-muted-foreground">
                        Código de evento de teste da Meta
                      </span>
                      <input
                        value={testCode}
                        onChange={(event) => setTestCode(event.target.value)}
                        placeholder="Ex.: TEST12342"
                        disabled={updateTestMode.isPending}
                        className="mt-2 min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-sm font-semibold outline-none transition focus:border-primary/60 disabled:opacity-50"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={
                        updateTestMode.isPending || (!status.data.testMode && !testCode.trim())
                      }
                      onClick={() => updateTestMode.mutate(!status.data.testMode)}
                      className={`min-h-12 rounded-xl px-5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        status.data.testMode
                          ? "border border-border bg-muted hover:bg-secondary"
                          : "bg-primary text-primary-foreground shadow-[0_12px_30px_-15px_hsl(var(--primary))] hover:brightness-110"
                      }`}
                    >
                      {updateTestMode.isPending
                        ? "Salvando…"
                        : status.data.testMode
                          ? "Desativar modo de teste"
                          : "Ativar modo de teste"}
                    </button>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Desativado, as compras continuam sendo enviadas normalmente e passam a alimentar
                    os relatórios reais das campanhas.
                  </p>
                  {feedback ? (
                    <p className="mt-2 text-xs font-bold text-primary">{feedback}</p>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <section className="card-premium rounded-3xl p-5 sm:p-7">
              <div className="flex items-center gap-3">
                <LockKeyhole className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-black">Dados necessários</h2>
              </div>
              <ol className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
                <Step number="1" text="ID do Pixel ou Dataset criado no Gerenciador de Eventos." />
                <Step number="2" text="Token da Conversions API gerado pela Meta." />
                <Step
                  number="3"
                  text="Código de evento de teste, apenas durante a validação inicial."
                />
              </ol>
              <a
                href="https://www.facebook.com/events_manager2/"
                target="_blank"
                rel="noreferrer"
                className="mt-6 flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-muted px-4 text-sm font-bold transition hover:bg-secondary"
              >
                Abrir Gerenciador de Eventos
                <ExternalLink className="h-4 w-4" />
              </a>
            </section>

            <section className="rounded-3xl border border-emerald-500/15 bg-emerald-500/7 p-5">
              <p className="font-black text-emerald-400">Privacidade preservada</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Não são enviados CPF, nome da modelo, slug, endereço de galeria ou caminho de
                arquivo. O identificador do cliente é convertido em hash irreversível.
              </p>
            </section>
          </aside>
        </div>
        </div>
        <div role="tabpanel" className={activeTab === "reconciliation" ? "block" : "hidden"}>
        <MetaReconciliationPanel />
        </div>
        </div>
      )}
    </AdminLayout>
  );
}

type PeriodPreset = "today" | "yesterday" | "7d" | "30d" | "custom";
type MetaFilter = "all" | "sent" | "missing" | "failed" | "ambiguous";

function presetRange(preset: PeriodPreset, customFrom: string, customTo: string) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "custom") {
    return { from: new Date(`${customFrom}T00:00:00`).toISOString(), to: new Date(`${customTo}T23:59:59.999`).toISOString() };
  }
  if (preset === "yesterday") {
    const from = new Date(startToday.getTime() - 86_400_000);
    return { from: from.toISOString(), to: new Date(startToday.getTime() - 1).toISOString() };
  }
  const days = preset === "30d" ? 30 : preset === "7d" ? 7 : 1;
  return { from: new Date(startToday.getTime() - (days - 1) * 86_400_000).toISOString(), to: now.toISOString() };
}

function MetaReconciliationPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const [preset, setPreset] = useState<PeriodPreset>("today");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [filter, setFilter] = useState<MetaFilter>("all");
  const [result, setResult] = useState<any>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const { confirmAction, confirmDialog } = useConfirmDialog();
  const range = presetRange(preset, customFrom, customTo);

  const audit = useMutation({
    mutationFn: () => auditMetaPurchases({ data: range }),
    onSuccess: (data) => setResult(data),
  });
  const resend = useMutation({
    mutationFn: (orderIds: string[]) => resendMetaPurchases({ data: { ...range, orderIds } }),
    onSuccess: async () => setResult(await auditMetaPurchases({ data: range })),
  });
  const eligible = useMemo(() => (result?.rows ?? []).filter((row: any) => row.status === "missing" || row.status === "failed"), [result]);
  const visibleRows = useMemo(() => (result?.rows ?? []).filter((row: any) => filter === "all" || row.status === filter), [filter, result]);

  async function confirmResend(rows: any[]) {
    const value = rows.reduce((sum, row) => sum + row.value, 0);
    const confirmed = await confirmAction({
      title: "Reenviar eventos Meta?",
      description: `Foram encontrados ${rows.length} eventos Purchase elegíveis, correspondentes a ${value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Somente eventos sem confirmação de entrega serão processados.`,
      confirmText: `Enviar ${rows.length} evento${rows.length === 1 ? "" : "s"}`,
    });
    if (confirmed) resend.mutate(rows.map((row) => row.orderId));
  }

  return (
    <section className="card-premium rounded-3xl p-5 sm:p-7">
      <div className="flex flex-col gap-3">
        <div>
          <div className="flex items-center gap-3"><RefreshCw className="h-5 w-5 text-primary" /><h2 className="text-lg font-black">Reconciliação Meta CAPI</h2></div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Audite compras aprovadas antes de recuperar somente eventos ausentes ou comprovadamente falhos.</p>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
            Período
            <select value={preset} onChange={(event) => setPreset(event.target.value as PeriodPreset)} className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground sm:w-auto">
              <option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="custom">Personalizado</option>
            </select>
          </label>
          {preset === "custom" ? <><label className="grid gap-1.5 text-xs font-bold text-muted-foreground">Inicial<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-foreground" /></label><label className="grid gap-1.5 text-xs font-bold text-muted-foreground">Final<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-foreground" /></label></> : null}
          <button type="button" disabled={audit.isPending || resend.isPending} onClick={() => audit.mutate()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50">
            {audit.isPending ? <CircleDashed className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{result ? "Verificar novamente" : "Verificar eventos Meta"}
          </button>
        </div>
      </div>

      {audit.isError || resend.isError ? <div role="alert" className="mt-5 flex gap-2 rounded-xl border border-destructive/20 bg-destructive/8 p-4 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />{String((audit.error ?? resend.error) instanceof Error ? (audit.error ?? resend.error)?.message : "Não foi possível concluir a operação.")}</div> : null}

      {result ? <>
        <p className="mt-5 text-xs font-semibold text-muted-foreground">Última verificação: {new Date(result.period.to).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Summary label="Compras aprovadas" value={result.approvedPurchases} />
          <Summary label="Eventos enviados" value={result.sent} tone="success" />
          <Summary label="Pendentes / falhos" value={result.missing + result.failed} tone={result.missing + result.failed ? "warning" : "success"} />
          <Summary label="Ambíguos" value={result.ambiguous} tone={result.ambiguous ? "warning" : "success"} />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">{([['all','Todos'],['sent','Enviados'],['missing','Não enviados'],['failed','Falhos'],['ambiguous','Ambíguos']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`min-h-10 rounded-lg px-3 text-xs font-bold ${filter === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{label}</button>)}</div>
          {eligible.length ? <button type="button" disabled={resend.isPending} onClick={() => confirmResend(eligible)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50"><RotateCcw className={`h-4 w-4 ${resend.isPending ? "animate-spin" : ""}`} />Enviar eventos pendentes</button> : null}
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-border">
          <div className="hidden grid-cols-[7rem_minmax(9rem,1fr)_7rem_7rem_9rem_minmax(12rem,1fr)_auto] gap-3 bg-muted/60 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground xl:grid"><span>Data</span><span>Modelo</span><span>Valor</span><span>Pagamento</span><span>Meta CAPI</span><span>Event ID</span><span>Ação</span></div>
          <ul className="divide-y divide-border">{visibleRows.map((row: any) => <li key={row.orderId} className="p-4">
            <div className="grid gap-3 xl:grid-cols-[7rem_minmax(9rem,1fr)_7rem_7rem_9rem_minmax(12rem,1fr)_auto] xl:items-center">
              <span className="text-xs font-semibold">{row.paidAt ? new Date(row.paidAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}</span><span className="text-sm font-bold">{row.models.join(", ") || "Modelo indisponível"}</span><span className="text-sm font-black">{row.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span><span className="text-xs font-bold text-emerald-500">Pago</span><MetaStatus status={row.status} /><code className="truncate text-xs text-muted-foreground" title={row.eventId}>{row.eventId}</code>
              <div className="flex justify-end gap-2">{row.status === "missing" || row.status === "failed" ? <button type="button" disabled={resend.isPending} onClick={() => confirmResend([row])} className="min-h-10 rounded-lg border border-primary/25 px-3 text-xs font-black text-primary">Reenviar Purchase</button> : null}<button type="button" onClick={() => setExpandedOrder(expandedOrder === row.orderId ? null : row.orderId)} aria-label="Ver histórico" className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted-foreground"><History className="h-4 w-4" /></button></div>
            </div>
            {expandedOrder === row.orderId ? <div className="mt-3 flex items-start gap-3 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground"><ChevronDown className="h-4 w-4 shrink-0" /><div className="min-w-0 flex-1"><b className="text-foreground">Purchase · {row.attempts} tentativa{row.attempts === 1 ? "" : "s"}</b><code className="mt-1 block break-all">{row.eventId}</code>{row.history?.length ? <ol className="mt-3 divide-y divide-border">{row.history.map((attempt: any) => <li key={attempt.attempt} className="grid gap-1 py-2 sm:grid-cols-[7rem_1fr_auto]"><b className="text-foreground">Tentativa {attempt.attempt}</b><span>{new Date(attempt.at).toLocaleString("pt-BR")} · {attempt.status === "sent" ? "Enviado" : "Falhou"}{attempt.error ? ` · ${attempt.error}` : ""}</span><span className="font-semibold">{attempt.eventsReceived != null ? `events_received: ${attempt.eventsReceived}` : attempt.httpStatus ? `HTTP ${attempt.httpStatus}` : ""}</span></li>)}</ol> : <p className="mt-2">{row.lastAttemptAt ? new Date(row.lastAttemptAt).toLocaleString("pt-BR") : "Nenhuma tentativa registrada"} · {row.reason}</p>}</div></div> : null}
          </li>)}</ul>
          {!visibleRows.length ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhum evento encontrado neste filtro.</p> : null}
        </div>
      </> : <div className="mt-5 rounded-2xl border border-dashed border-border p-6 text-center"><RefreshCw className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-3 text-sm font-bold">Nenhuma auditoria executada</p><p className="mt-1 text-xs text-muted-foreground">Escolha um período e clique em “Verificar eventos Meta”. Nenhum evento será enviado durante a verificação.</p></div>}
      {confirmDialog}
    </section>
  );
}

function Summary({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "warning" }) { return <div className="rounded-2xl bg-muted/60 p-4"><p className="text-xs font-bold text-muted-foreground">{label}</p><p className={`mt-2 text-xl font-black ${tone === "success" ? "text-emerald-500" : tone === "warning" ? "text-amber-500" : ""}`}>{value}</p></div>; }
function MetaStatus({ status }: { status: string }) { const map: Record<string,[string,string]> = { sent:["Enviado","text-emerald-500"], missing:["Não enviado","text-amber-500"], failed:["Falhou","text-destructive"], ambiguous:["Ambíguo","text-muted-foreground"] }; const [label, classes] = map[status] ?? [status,"text-muted-foreground"]; return <span className={`text-xs font-black ${classes}`}>{label}</span>; }

function StatusBanner({ configured }: { configured: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border p-4 ${
        configured
          ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-400"
          : "border-amber-500/20 bg-amber-500/8 text-amber-300"
      }`}
    >
      {configured ? <CheckCircle2 className="h-5 w-5" /> : <CircleDashed className="h-5 w-5" />}
      <span className="text-sm font-black">
        {configured ? "Integração ativa" : "Aguardando credenciais da Meta"}
      </span>
    </div>
  );
}

function StatusRow({ label, ready, value }: { label: string; ready: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-1 py-3">
      <div className="min-w-0">
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold">{value}</p>
      </div>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          ready ? "bg-emerald-400 shadow-[0_0_10px_currentColor]" : "bg-amber-400"
        }`}
      />
    </div>
  );
}

function Step({ number, text }: { number: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-black text-primary">
        {number}
      </span>
      <span>{text}</span>
    </li>
  );
}
