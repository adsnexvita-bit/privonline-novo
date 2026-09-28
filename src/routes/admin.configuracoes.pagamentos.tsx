import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, KeyRound, Loader2, Zap } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import pushinPayLogo from "@/assets/pushinpay-logo.png";
import syncPayLogo from "@/assets/syncpay-logo.png";
import onPayLogo from "@/assets/onpay-logo.png";
import { resolvePublicOrigin } from "@/lib/public-origin";
import {
  getAdminCheckoutSettings,
  updateCheckoutSettings,
  updateOnPayCredentials,
  updatePushinPayCredentials,
  updateSyncPayCredentials,
} from "@/lib/checkout-settings.functions";

export const Route = createFileRoute("/admin/configuracoes/pagamentos")({
  head: () => ({ meta: [{ title: "Pagamentos — Privadinhos Online Admin" }] }),
  component: PaymentSettingsPage,
});

function PaymentSettingsPage() {
  const loadSettings = useServerFn(getAdminCheckoutSettings);
  const saveSettings = useServerFn(updateCheckoutSettings);
  const saveOnPayCredentials = useServerFn(updateOnPayCredentials);
  const savePushinPayCredentials = useServerFn(updatePushinPayCredentials);
  const saveSyncPayCredentials = useServerFn(updateSyncPayCredentials);
  const [instantPixEnabled, setInstantPixEnabled] = useState(false);
  const [paymentProviderMode, setPaymentProviderMode] = useState<
    "syncpay" | "pushinpay" | "onpay" | "split"
  >("syncpay");
  const [syncPayPercentage, setSyncPayPercentage] = useState(50);
  const [pushinPayPercentage, setPushinPayPercentage] = useState(50);
  const [onPayPercentage, setOnPayPercentage] = useState(0);
  const [expandedGateway, setExpandedGateway] = useState<"syncpay" | "pushinpay" | "onpay" | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [onPayApiKey, setOnPayApiKey] = useState("");
  const [onPayWebhookSecret, setOnPayWebhookSecret] = useState("");
  const [onPayStatus, setOnPayStatus] = useState({
    apiKeyConfigured: false,
    webhookSecretConfigured: false,
    apiKeyHint: null as string | null,
    webhookSecretHint: null as string | null,
    webhookPath: "/api/public/webhooks/onpay",
  });
  const [syncPayClientId, setSyncPayClientId] = useState("");
  const [syncPayClientSecret, setSyncPayClientSecret] = useState("");
  const [syncPayWebhookToken, setSyncPayWebhookToken] = useState("");
  const [syncPayStatus, setSyncPayStatus] = useState({
    clientIdConfigured: false,
    clientSecretConfigured: false,
    webhookBearerTokenConfigured: false,
    clientIdHint: null as string | null,
    clientSecretHint: null as string | null,
    webhookBearerTokenHint: null as string | null,
    webhookPath: "/api/webhooks/syncpay",
  });
  const [pushinPayApiToken, setPushinPayApiToken] = useState("");
  const [pushinPayWebhookToken, setPushinPayWebhookToken] = useState("");
  const [pushinPayStatus, setPushinPayStatus] = useState({
    apiTokenConfigured: false,
    webhookBearerTokenConfigured: false,
    apiTokenHint: null as string | null,
    webhookBearerTokenHint: null as string | null,
    webhookPath: "/api/public/webhooks/pushinpay",
  });

  useEffect(() => {
    let active = true;
    loadSettings()
      .then((settings) => {
        if (!active) return;
        setInstantPixEnabled(settings.instantPixEnabled);
        setPaymentProviderMode(settings.paymentProviderMode);
        setSyncPayPercentage(settings.syncPayPercentage);
        setPushinPayPercentage(settings.pushinPayPercentage);
        setOnPayPercentage(settings.onPayPercentage);
        setOnPayStatus(settings.onPay);
        setSyncPayStatus(settings.syncPay);
        setPushinPayStatus(settings.pushinPay);
      })
      .catch(
        (reason) =>
          active &&
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível carregar as configurações.",
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [loadSettings]);

  async function persist(
    next: {
      instantPixEnabled?: boolean;
      paymentProviderMode?: "syncpay" | "pushinpay" | "onpay" | "split";
      syncPayPercentage?: number;
      pushinPayPercentage?: number;
      onPayPercentage?: number;
    } = {},
  ) {
    if (loading || saving) return;
    const payload = {
      instantPixEnabled: next.instantPixEnabled ?? instantPixEnabled,
      paymentProviderMode: next.paymentProviderMode ?? paymentProviderMode,
      syncPayPercentage: next.syncPayPercentage ?? syncPayPercentage,
      pushinPayPercentage: next.pushinPayPercentage ?? pushinPayPercentage,
      onPayPercentage: next.onPayPercentage ?? onPayPercentage,
    };
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveSettings({ data: payload });
      setInstantPixEnabled(payload.instantPixEnabled);
      setPaymentProviderMode(payload.paymentProviderMode);
      setSyncPayPercentage(payload.syncPayPercentage);
      setPushinPayPercentage(payload.pushinPayPercentage);
      setOnPayPercentage(payload.onPayPercentage);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível salvar as configurações.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function persistOnPayCredentials(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (
      !onPayApiKey &&
      !onPayWebhookSecret &&
      (!onPayStatus.apiKeyConfigured || !onPayStatus.webhookSecretConfigured)
    ) {
      setError("Informe a chave da API e o segredo do webhook da ONPAY.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveOnPayCredentials({
        data: { apiKey: onPayApiKey, webhookSecret: onPayWebhookSecret },
      });
      const settings = await loadSettings();
      setOnPayStatus(settings.onPay);
      setOnPayApiKey("");
      setOnPayWebhookSecret("");
      setSuccess("Credenciais da ONPAY atualizadas com segurança.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar as credenciais da ONPAY.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function persistSyncPayCredentials(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (
      !syncPayClientId &&
      !syncPayClientSecret &&
      !syncPayWebhookToken &&
      (!syncPayStatus.clientIdConfigured ||
        !syncPayStatus.clientSecretConfigured ||
        !syncPayStatus.webhookBearerTokenConfigured)
    ) {
      setError("Informe o Client ID, o Client Secret e o token do webhook da SyncPay.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveSyncPayCredentials({
        data: {
          clientId: syncPayClientId,
          clientSecret: syncPayClientSecret,
          webhookBearerToken: syncPayWebhookToken,
        },
      });
      const settings = await loadSettings();
      setSyncPayStatus(settings.syncPay);
      setSyncPayClientId("");
      setSyncPayClientSecret("");
      setSyncPayWebhookToken("");
      setSuccess("Credenciais da SyncPay atualizadas com segurança e já estão ativas.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar as credenciais da SyncPay.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function persistPushinPayCredentials(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!pushinPayApiToken && !pushinPayStatus.apiTokenConfigured) {
      setError("Informe o token da API Pushin Pay.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await savePushinPayCredentials({
        data: {
          apiToken: pushinPayApiToken,
          webhookBearerToken: pushinPayWebhookToken,
        },
      });
      const settings = await loadSettings();
      setPushinPayStatus(settings.pushinPay);
      setPushinPayApiToken("");
      setPushinPayWebhookToken("");
      setSuccess("Credenciais da Pushin Pay atualizadas com segurança e já estão ativas.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar as credenciais da Pushin Pay.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout title="Pagamentos">
      {() => (
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          {expandedGateway === "syncpay" ? (
            <section className="card-premium order-3 rounded-2xl p-5 sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-black">Credenciais da SyncPay</h2>
                  <p className="text-sm text-muted-foreground">
                    As chaves são criptografadas no servidor e passam a valer imediatamente. Deixe
                    um campo vazio para manter o valor atual.
                  </p>
                </div>
              </div>
              <form onSubmit={persistSyncPayCredentials} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="space-y-1.5 text-sm font-bold">
                    <span className="flex items-center gap-2">
                      Client ID{" "}
                      {syncPayStatus.clientIdConfigured ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : null}
                    </span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={syncPayClientId}
                      onChange={(event) => setSyncPayClientId(event.target.value)}
                      placeholder={syncPayStatus.clientIdHint ?? "Cole o Client ID"}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-bold">
                    <span className="flex items-center gap-2">
                      Client Secret{" "}
                      {syncPayStatus.clientSecretConfigured ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : null}
                    </span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={syncPayClientSecret}
                      onChange={(event) => setSyncPayClientSecret(event.target.value)}
                      placeholder={syncPayStatus.clientSecretHint ?? "Cole o Client Secret"}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-bold">
                    <span className="flex items-center gap-2">
                      Token do webhook{" "}
                      {syncPayStatus.webhookBearerTokenConfigured ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : null}
                    </span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={syncPayWebhookToken}
                      onChange={(event) => setSyncPayWebhookToken(event.target.value)}
                      placeholder={syncPayStatus.webhookBearerTokenHint ?? "Cole o Bearer token"}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary"
                    />
                  </label>
                </div>
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                  <b>URL do webhook neste domínio</b>
                  <code className="mt-1 block break-all text-xs text-muted-foreground">
                    {typeof window === "undefined"
                      ? syncPayStatus.webhookPath
                      : `${resolvePublicOrigin(window.location.origin)}${syncPayStatus.webhookPath}`}
                  </code>
                  <p className="mt-2 text-xs text-muted-foreground">
                    A URL enviada nas novas cobranças usa automaticamente o domínio pelo qual o
                    checkout foi acessado.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={saving || loading}
                  className="h-11 rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground disabled:opacity-60"
                >
                  Salvar credenciais SyncPay
                </button>
              </form>
            </section>
          ) : null}
          {expandedGateway === "pushinpay" ? (
            <section className="card-premium order-3 rounded-2xl p-5 sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/10 text-indigo-600">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-black">Credenciais da Pushin Pay</h2>
                  <p className="text-sm text-muted-foreground">
                    As chaves são criptografadas no servidor. Deixe um campo vazio para manter o
                    valor atual.
                  </p>
                </div>
              </div>
              <form onSubmit={persistPushinPayCredentials} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-bold">
                    <span className="flex items-center gap-2">
                      Token da API{" "}
                      {pushinPayStatus.apiTokenConfigured ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : null}
                    </span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={pushinPayApiToken}
                      onChange={(event) => setPushinPayApiToken(event.target.value)}
                      placeholder={pushinPayStatus.apiTokenHint ?? "Cole o token da API"}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-bold">
                    <span className="flex items-center gap-2">
                      Token do webhook{" "}
                      {pushinPayStatus.webhookBearerTokenConfigured ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : null}
                    </span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={pushinPayWebhookToken}
                      onChange={(event) => setPushinPayWebhookToken(event.target.value)}
                      placeholder={pushinPayStatus.webhookBearerTokenHint ?? "Opcional"}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary"
                    />
                  </label>
                </div>
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                  <b>URL do webhook neste domínio</b>
                  <code className="mt-1 block break-all text-xs text-muted-foreground">
                    {typeof window === "undefined"
                      ? pushinPayStatus.webhookPath
                      : `${resolvePublicOrigin(window.location.origin)}${pushinPayStatus.webhookPath}`}
                  </code>
                </div>
                <button
                  type="submit"
                  disabled={saving || loading}
                  className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white disabled:opacity-60"
                >
                  Salvar credenciais Pushin Pay
                </button>
              </form>
            </section>
          ) : null}
          <section className="card-premium order-1 rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Zap className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-black">Pix imediato</h2>
                  <p className="text-sm text-muted-foreground">
                    Libere o QR Code sem cadastro adicional.
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={instantPixEnabled}
                disabled={loading || saving}
                onClick={() => persist({ instantPixEnabled: !instantPixEnabled })}
                className={`min-h-10 rounded-xl px-4 text-sm font-black ${instantPixEnabled ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"} disabled:opacity-60`}
              >
                {instantPixEnabled ? "Ativado" : "Desativado"}
              </button>
            </div>
          </section>

          <section className="card-premium order-2 rounded-2xl p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <CreditCard className="h-5 w-5" />
              </span>
              <h2 className="font-black">Operadora de Pix</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  {
                    mode: "syncpay",
                    label: "SyncPay",
                    detail: "Todos os PIX na SyncPay.",
                    icon: syncPayLogo,
                  },
                  {
                    mode: "pushinpay",
                    label: "Pushin Pay",
                    detail: "Todos os PIX na Pushin Pay.",
                    icon: pushinPayLogo,
                  },
                  {
                    mode: "onpay",
                    label: "ONPAY",
                    detail: "Todos os PIX na ONPAY.",
                    icon: onPayLogo,
                  },
                  {
                    mode: "split",
                    label: "Alternar",
                    detail: "Distribuição por porcentagem.",
                    icon: undefined,
                  },
                ] as const
              ).map(({ mode, label, detail, icon }) => (
                <button
                  key={mode}
                  type="button"
                  disabled={loading || saving}
                  onClick={() => {
                    setExpandedGateway(mode === "split" ? null : mode);
                    persist({ paymentProviderMode: mode });
                  }}
                  className={`rounded-xl border p-4 text-left ${paymentProviderMode === mode ? (mode === "onpay" ? "border-[#1238f5] bg-[#1238f5]/10" : "border-primary bg-primary/10") : "border-border hover:border-primary/40"}`}
                >
                  <span className="flex items-center gap-2.5">
                    {mode === "split" ? (
                      <PaymentProviderStack />
                    ) : icon ? (
                      <img
                        src={icon}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-full object-cover shadow-sm"
                      />
                    ) : null}
                    <b className="block text-sm">{label}</b>
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground">{detail}</span>
                </button>
              ))}
            </div>
            {paymentProviderMode === "split" ? (
              <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["SyncPay", syncPayPercentage, setSyncPayPercentage],
                      ["Pushin Pay", pushinPayPercentage, setPushinPayPercentage],
                      ["ONPAY", onPayPercentage, setOnPayPercentage],
                    ] as const
                  ).map(([label, value, setter]) => (
                    <label key={label} className="space-y-1.5 text-sm font-bold">
                      <span>{label}</span>
                      <span className="flex h-11 items-center rounded-xl border border-border bg-background px-3 focus-within:border-primary">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={value}
                          onChange={(event) =>
                            setter(Math.max(0, Math.min(100, Number(event.target.value))))
                          }
                          className="w-full bg-transparent font-mono outline-none"
                          aria-label={`Percentual da ${label}`}
                        />
                        <span className="text-muted-foreground">%</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p
                    className={`text-sm font-bold ${syncPayPercentage + pushinPayPercentage + onPayPercentage === 100 ? "text-emerald-600" : "text-destructive"}`}
                  >
                    Total: {syncPayPercentage + pushinPayPercentage + onPayPercentage}%
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      persist({ syncPayPercentage, pushinPayPercentage, onPayPercentage })
                    }
                    disabled={
                      saving || syncPayPercentage + pushinPayPercentage + onPayPercentage !== 100
                    }
                    className="h-10 rounded-lg bg-primary px-4 text-sm font-black text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Salvar distribuição
                  </button>
                </div>
              </div>
            ) : null}
          </section>
          {expandedGateway === "onpay" ? (
            <section className="card-premium order-3 rounded-2xl p-5 sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#1238f5]">
                  <img src={onPayLogo} alt="" className="h-full w-full object-cover" />
                </span>
                <div>
                  <h2 className="font-black">Credenciais da ONPAY</h2>
                  <p className="text-sm text-muted-foreground">
                    As chaves são criptografadas no servidor. Deixe um campo vazio para manter a
                    chave atual.
                  </p>
                </div>
              </div>
              <form onSubmit={persistOnPayCredentials} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-bold">
                    <span className="flex items-center gap-2">
                      Chave da API{" "}
                      {onPayStatus.apiKeyConfigured ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : null}
                    </span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={onPayApiKey}
                      onChange={(event) => setOnPayApiKey(event.target.value)}
                      placeholder={onPayStatus.apiKeyHint ?? "Cole a x-api-key"}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-bold">
                    <span className="flex items-center gap-2">
                      Segredo do webhook{" "}
                      {onPayStatus.webhookSecretConfigured ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : null}
                    </span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={onPayWebhookSecret}
                      onChange={(event) => setOnPayWebhookSecret(event.target.value)}
                      placeholder={onPayStatus.webhookSecretHint ?? "Cole o whsec_..."}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary"
                    />
                  </label>
                </div>
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                  <b>URL do webhook</b>
                  <code className="mt-1 block break-all text-xs text-muted-foreground">
                    {typeof window === "undefined"
                      ? onPayStatus.webhookPath
                      : `${resolvePublicOrigin(window.location.origin)}${onPayStatus.webhookPath}`}
                  </code>
                </div>
                <button
                  type="submit"
                  disabled={saving || loading}
                  className="h-11 rounded-xl bg-[#1238f5] px-5 text-sm font-black text-white disabled:opacity-60"
                >
                  Salvar credenciais ONPAY
                </button>
              </form>
            </section>
          ) : null}
          {success ? (
            <p className="order-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
              {success}
            </p>
          ) : null}
          {error ? (
            <p className="order-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {loading || saving ? (
            <p className="order-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Salvando configurações…
            </p>
          ) : null}
        </div>
      )}
    </AdminLayout>
  );
}

function PaymentProviderStack() {
  return (
    <span
      className="flex h-8 shrink-0 items-center"
      aria-label="Alternar entre SyncPay, Pushin Pay e ONPAY"
    >
      <img
        src={syncPayLogo}
        alt=""
        className="h-8 w-8 rounded-full border-2 border-background object-cover shadow-sm"
      />
      <img
        src={pushinPayLogo}
        alt=""
        className="-ml-2 h-8 w-8 rounded-full border-2 border-background object-cover shadow-sm"
      />
      <img
        src={onPayLogo}
        alt=""
        className="-ml-2 h-8 w-8 rounded-full border-2 border-background object-cover shadow-sm"
      />
    </span>
  );
}
