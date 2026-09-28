import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { X, Loader2, CheckCircle2, RefreshCw, Timer, ArrowRight } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  confirmPurchasePayment,
  createPurchase,
  getPromotionOrderBumps,
} from "@/lib/purchase.functions";
import { trackMetaCheckoutEvent } from "@/lib/meta-capi.functions";
import { getCheckoutIdentity } from "@/lib/access.functions";
import { getSession, setPaidAccountFlow, setSession } from "@/lib/session";
import { onlyDigits } from "@/lib/cpf";
import { formatPrice, resolveMediaUrl, type PublicModel } from "@/lib/models";
import { getMarketingAttribution, getMarketingBrowserId } from "@/lib/marketing-attribution";
import type { PublicPlan } from "@/lib/model-plans.functions";
import { parsePaymentProvider, type PaymentProvider } from "@/lib/payment-provider";

type PurchaseResult = {
  orderId: string;
  transactionId: string;
  pixCode: string;
  status: string;
  amount: number;
  modelSlug: string;
  sessionToken: string;
  customerId: string | null;
  customerName: string;
};

function friendlyPurchaseError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/supabase|service_role|chave privada|configuração.+ausente/i.test(message)) {
    return "O pagamento está temporariamente indisponível. Aguarde alguns instantes e tente novamente.";
  }
  return message || "Falha ao gerar pagamento. Tente novamente.";
}

function isLocalPreview() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function canUseLocalPixPreview(error: unknown) {
  if (!isLocalPreview()) return false;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /supabase|service_role|chave privada|configuração.+ausente|temporariamente indisponível|timeout|aborted/i.test(
    message,
  );
}

function formatPhoneMask(value: string) {
  const rawDigits = onlyDigits(value);
  const digits = (
    rawDigits.length > 11 && rawDigits.startsWith("55") ? rawDigits.slice(2) : rawDigits
  ).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function capitalizeNameWords(value: string) {
  return value
    .slice(0, 120)
    .replace(/(^|[\s'-])(\p{L})/gu, (_match, separator: string, letter: string) => {
      return `${separator}${letter.toLocaleUpperCase("pt-BR")}`;
    });
}

export function PurchaseModal({
  model,
  profileImage,
  onClose,
  onPaid,
  offerCode,
  plan,
  forcedGateway,
}: {
  model: PublicModel;
  profileImage: string;
  onClose: () => void;
  onPaid?: () => void;
  offerCode?: "profile-retention-30";
  plan?: PublicPlan | null;
  forcedGateway?: PaymentProvider;
}) {
  const purchase = useServerFn(createPurchase);
  const confirmPayment = useServerFn(confirmPurchasePayment);
  const checkoutIdentity = useServerFn(getCheckoutIdentity);
  const trackCheckoutEvent = useServerFn(trackMetaCheckoutEvent);
  const loadOrderBumps = useServerFn(getPromotionOrderBumps);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [messageOptIn, setMessageOptIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkoutPhase, setCheckoutPhase] = useState<"form" | "generating">("form");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    orderId: string;
    transactionId: string;
    pixCode: string;
    amount: number;
    modelSlug: string;
  } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentCheckError, setPaymentCheckError] = useState<string | null>(null);
  const [orderBump, setOrderBump] = useState<{
    enabled: boolean;
    title: string;
    description: string;
    maxVisible: number;
    items: Array<{
      id: string;
      name: string;
      username: string;
      profileImagePath: string | null;
      price: number;
    }>;
  } | null>(null);
  const [selectedBumps, setSelectedBumps] = useState<Set<string>>(new Set());
  const [showAllBumps, setShowAllBumps] = useState(false);
  const addPaymentInfoSent = useRef(false);
  const paidNotified = useRef(false);
  const pendingToken = useRef<string | null>(null);

  function applyConfirmedAccountFlow(result: {
    status: string;
    accountSession: { token: string; customerId: string; customerName: string } | null;
    accountNextStep: "setup_password" | "login" | "open_model" | null;
  }) {
    if (result.accountSession) {
      setSession({
        token: result.accountSession.token,
        customerId: result.accountSession.customerId,
        name: result.accountSession.customerName,
      });
    }
    if (result.status === "paid" && result.accountNextStep === "open_model") {
      window.location.assign(`/${encodeURIComponent(model.username)}`);
      return;
    }
    if (
      result.status === "paid" &&
      success &&
      pendingToken.current &&
      (result.accountNextStep === "setup_password" || result.accountNextStep === "login")
    ) {
      setPaidAccountFlow({
        orderId: success.orderId,
        checkoutToken: pendingToken.current,
        nextStep: result.accountNextStep,
      });
      window.location.assign("/acesso?compra=aprovada");
    }
  }

  const phoneDigits = onlyDigits(phone);
  const canSubmit =
    name.trim().length >= 2 && phoneDigits.length >= 10 && phoneDigits.length <= 11 && !loading;
  const basePrice = plan?.price ?? model.price;
  const mainPrice =
    !plan?.promotionId && offerCode === "profile-retention-30"
      ? Math.max(0.01, Math.round(basePrice * 0.7 * 100) / 100)
      : basePrice;
  const checkoutPrice =
    Math.round(
      (mainPrice +
        (orderBump?.items ?? [])
          .filter((item) => selectedBumps.has(item.id))
          .reduce((sum, item) => sum + item.price, 0)) *
        100,
    ) / 100;
  const checkoutAttemptKey = [
    "privacy.meta.ic.v1",
    model.id,
    plan?.id ?? "model",
    plan?.offerId ?? "default",
    offerCode ?? "regular",
  ].join(":");

  function eventExternalId() {
    return getSession()?.customerId || getMarketingBrowserId();
  }

  function eventId(eventName: "InitiateCheckout" | "AddPaymentInfo") {
    return [
      "privacy",
      eventName === "InitiateCheckout" ? "ic" : "api",
      model.id,
      plan?.id ?? "model",
      plan?.offerId ?? "default",
      offerCode ?? "regular",
      eventExternalId(),
    ].join("-");
  }

  async function sendCheckoutEventOnce(eventName: "InitiateCheckout" | "AddPaymentInfo") {
    if (eventName === "InitiateCheckout" && typeof sessionStorage !== "undefined") {
      const existing = sessionStorage.getItem(checkoutAttemptKey);
      if (existing) return;
      sessionStorage.setItem(checkoutAttemptKey, eventId(eventName));
    }
    if (eventName === "AddPaymentInfo") {
      if (addPaymentInfoSent.current) return;
      addPaymentInfoSent.current = true;
    }
    try {
      await trackCheckoutEvent({
        data: {
          eventName,
          eventId:
            eventName === "InitiateCheckout" && typeof sessionStorage !== "undefined"
              ? sessionStorage.getItem(checkoutAttemptKey) || eventId(eventName)
              : eventId(eventName),
          value: checkoutPrice,
          externalId: eventExternalId(),
          attribution: getMarketingAttribution(),
        },
      });
    } catch {
      // Eventos de marketing não podem bloquear checkout ou pagamento.
    }
  }

  function applyPurchase(res: PurchaseResult) {
    pendingToken.current = res.sessionToken;
    setSuccess({
      orderId: res.orderId,
      transactionId: res.transactionId,
      pixCode: res.pixCode,
      amount: res.amount,
      modelSlug: res.modelSlug,
    });
    setPaymentStatus(res.status);
  }

  function applyLocalPreviewPurchase() {
    const previewId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `preview-${Date.now()}`;
    setSession({
      token: `preview-session-${previewId}`,
      customerId: `preview-customer-${model.id}`,
      name: "Cliente Preview",
    });
    setSuccess({
      orderId: `preview-order-${previewId}`,
      transactionId: `preview-transaction-${previewId}`,
      pixCode:
        "00020126580014br.gov.bcb.pix0136preview-local-privacy52040000530398654049.905802BR5913PRIVACY LOCAL6009SAO PAULO62070503***6304ABCD",
      amount: checkoutPrice,
      modelSlug: model.slug,
    });
    setPaymentStatus("pending");
    setError(null);
  }

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    let active = true;
    checkoutIdentity({ data: { token: session.token } })
      .then((identity) => {
        if (active && identity) {
          if (!identity.anonymous) setName(capitalizeNameWords(identity.name ?? ""));
          if (identity.phone) setPhone(formatPhoneMask(identity.phone));
        }
      })
      .catch(() => {
        // O preenchimento automático nunca pode bloquear o checkout.
      });
    return () => {
      active = false;
    };
  }, [checkoutIdentity]);

  useEffect(() => {
    if (!plan?.promotionId) return;
    let active = true;
    loadOrderBumps({
      data: { promotionId: plan.promotionId, modelId: model.id, sessionToken: getSession()?.token },
    })
      .then((result) => {
        if (active) setOrderBump(result);
      })
      .catch(() => {
        if (active) setOrderBump(null);
      });
    return () => {
      active = false;
    };
  }, [loadOrderBumps, model.id, plan?.promotionId]);

  useEffect(() => {
    if (checkoutPhase !== "form" || success) return;
    void sendCheckoutEventOnce("InitiateCheckout");
    // The event must fire only when a new checkout form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutPhase, success]);

  useEffect(() => {
    if (!success || paymentStatus === "paid") return;
    let active = true;
    let requestInFlight = false;
    const check = async () => {
      if (requestInFlight) return;
      const token = pendingToken.current;
      if (!token) return;
      requestInFlight = true;
      try {
        const result = await confirmPayment({
          data: {
            orderId: success.orderId,
            transactionId: success.transactionId,
            sessionToken: token,
          },
        });
        if (active) {
          setPaymentStatus(result.status);
          applyConfirmedAccountFlow(result);
        }
      } catch {
        // A próxima consulta tenta novamente.
      } finally {
        requestInFlight = false;
      }
    };
    void check();
    const timer = window.setInterval(check, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [confirmPayment, paymentStatus, success]);

  useEffect(() => {
    if (paymentStatus !== "paid" || paidNotified.current) return;
    paidNotified.current = true;
    onPaid?.();
  }, [onPaid, paymentStatus]);

  async function checkPaymentNow() {
    if (!success || checkingPayment) return;
    const token = pendingToken.current;
    if (!token) {
      setPaymentCheckError("Sua sessão expirou. Entre novamente em Minha conta.");
      return;
    }
    setCheckingPayment(true);
    setPaymentCheckError(null);
    try {
      const result = await confirmPayment({
        data: {
          orderId: success.orderId,
          transactionId: success.transactionId,
          sessionToken: token,
        },
      });
      setPaymentStatus(result.status);
      applyConfirmedAccountFlow(result);
      if (result.status !== "paid") {
        setPaymentCheckError(
          "Ainda não consta o pagamento no sistema. Caso já tenha pagado, espere mais alguns segundos e tente novamente. Caso ainda não tenha pago, efetue o pagamento.",
        );
      }
    } catch (err) {
      setPaymentCheckError(
        err instanceof Error
          ? err.message
          : "Não foi possível confirmar agora. Aguarde alguns segundos e tente novamente.",
      );
    } finally {
      setCheckingPayment(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError(
        name.trim().length < 2
          ? "Informe seu nome e sobrenome."
          : "Informe um telefone válido com DDD.",
      );
      return;
    }
    setLoading(true);
    setCheckoutPhase("generating");
    try {
      await sendCheckoutEventOnce("AddPaymentInfo");
      const res = await purchase({
        data: {
          modelId: model.id,
          planId: plan?.promotionId ? undefined : plan?.id,
          promotionId: plan?.promotionId ?? undefined,
          offerId: plan?.offerId ?? undefined,
          orderBumpModelIds: Array.from(selectedBumps),
          sessionToken: getSession()?.token,
          name: name.trim() || undefined,
          phone: phoneDigits,
          messageOptIn,
          // Mantém o fallback interno de identidade/CPF já usado pelo checkout.
          anonymousCheckout: true,
          offerCode,
          attribution: getMarketingAttribution(),
          gateway:
            forcedGateway ??
            parsePaymentProvider(
              typeof window === "undefined"
                ? undefined
                : new URLSearchParams(window.location.search).get("gateway"),
            ),
        },
      });
      applyPurchase(res);
    } catch (err) {
      if (canUseLocalPixPreview(err)) {
        applyLocalPreviewPurchase();
        return;
      }
      setError(friendlyPurchaseError(err));
      setCheckoutPhase("form");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-[2px] sm:p-5"
      onClick={onClose}
    >
      <div
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-x-hidden overflow-y-auto rounded-[1.75rem] bg-white px-5 py-7 pb-[max(1.75rem,env(safe-area-inset-bottom))] text-[#333] shadow-2xl sm:max-h-[94dvh] sm:rounded-[2.25rem] sm:px-9 sm:py-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full text-[#999] transition hover:bg-[#f4f4f4] hover:text-[#444] sm:right-6 sm:top-6"
        >
          <X className="h-7 w-7" />
        </button>

        {paymentStatus === "paid" && success ? (
          <ApprovedView modelName={model.name} modelUsername={model.username} />
        ) : success ? (
          <SuccessView
            pixCode={success.pixCode}
            amount={success.amount}
            checkingPayment={checkingPayment}
            paymentCheckError={paymentCheckError}
            onCheckPayment={checkPaymentNow}
          />
        ) : checkoutPhase !== "form" ? (
          <div className="grid min-h-64 place-items-center px-4 text-center">
            <div>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#fff1e9] text-primary">
                <Loader2 className="h-8 w-8 animate-spin" />
              </span>
              <h2 className="mt-5 text-xl font-bold text-[#333]">Gerando PIX...</h2>
            </div>
          </div>
        ) : (
          <>
            <div className="pr-10">
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={profileImage}
                  alt={`Foto de perfil de ${model.name}`}
                  className="h-12 w-12 shrink-0 rounded-full border border-[#f0ddd5] bg-[#f7f3f1] object-cover shadow-sm sm:h-14 sm:w-14"
                />
                <h2 className="min-w-0 text-xl font-extrabold leading-tight text-[#252525] sm:text-2xl">
                  🔥 Desbloqueie acesso aos conteúdos de {model.name}
                </h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[#666]">
                Informe seu nome e telefone para gerar o PIX e liberar o acesso ao conteúdo de{" "}
                {model.name}.
              </p>
            </div>

            <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
              <Field label="Nome e sobrenome" required>
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(capitalizeNameWords(event.target.value))}
                  placeholder="Como podemos te chamar?"
                  className={inputCls}
                />
              </Field>
              <Field label="Telefone" required>
                <div className="flex min-h-14 w-full items-stretch overflow-hidden rounded-2xl border-2 border-[#dedede] bg-white transition focus-within:border-primary">
                  <span
                    className="flex shrink-0 items-center gap-2 border-r border-[#e5e1df] px-3 text-base font-bold text-[#383230] sm:px-4"
                    aria-hidden="true"
                  >
                    <span className="text-xl leading-none">🇧🇷</span>
                    <span className="tabular-nums">+55</span>
                  </span>
                  <input
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={phone}
                    onChange={(event) => setPhone(formatPhoneMask(event.target.value))}
                    placeholder="(11) 99999-9999"
                    className="min-w-0 flex-1 bg-transparent px-3 py-3 text-lg text-black outline-none placeholder:text-[#aaa] sm:px-4"
                    aria-describedby="checkout-phone-help"
                  />
                </div>
              </Field>
              <p id="checkout-phone-help" className="text-sm leading-relaxed text-[#666]">
                Usaremos seu telefone para identificar sua compra e liberar o acesso com segurança.
              </p>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-[#dedede] bg-white px-4 py-3 text-sm font-semibold text-[#333] transition hover:border-primary/60">
                <input
                  type="checkbox"
                  checked={messageOptIn}
                  onChange={(event) => {
                    setMessageOptIn(event.target.checked);
                  }}
                  className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                />
                Quero receber mensagens e novidades pelo WhatsApp.
              </label>

              {orderBump?.enabled && orderBump.items.length ? (
                <section className="rounded-2xl border border-[#eadfd8] bg-[#fffaf7] p-4">
                  <h3 className="text-base font-extrabold text-[#292929]">{orderBump.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#746e6b]">{orderBump.description}</p>
                  <div className="mt-3 space-y-2">
                    {orderBump.items
                      .slice(0, showAllBumps ? undefined : orderBump.maxVisible)
                      .map((item) => {
                        const selected = selectedBumps.has(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              setSelectedBumps((current) => {
                                const next = new Set(current);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                return next;
                              })
                            }
                            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selected ? "border-primary bg-primary/5" : "border-[#e4ddd9] bg-white hover:border-primary/50"}`}
                          >
                            <img
                              src={resolveMediaUrl(item.profileImagePath)}
                              alt={`Foto de ${item.name}`}
                              className="h-11 w-11 rounded-full bg-[#f2eeeb] object-cover"
                            />
                            <span className="min-w-0 flex-1">
                              <strong className="block truncate text-sm text-[#292929]">
                                {item.name}
                              </strong>
                              <small className="text-[#777]">Acesso vitalício</small>
                            </span>
                            <span className="text-right">
                              <b className="block text-sm tabular-nums text-primary">
                                + {formatPrice(item.price)}
                              </b>
                              <small
                                className={`font-bold ${selected ? "text-emerald-600" : "text-[#777]"}`}
                              >
                                {selected ? "✓ Adicionado" : "+ Adicionar"}
                              </small>
                            </span>
                          </button>
                        );
                      })}
                  </div>
                  {orderBump.items.length > orderBump.maxVisible ? (
                    <button
                      type="button"
                      onClick={() => setShowAllBumps((value) => !value)}
                      className="mt-3 w-full text-center text-sm font-bold text-primary"
                    >
                      {showAllBumps ? "Ver menos modelos" : "Ver mais modelos"}
                    </button>
                  ) : null}
                </section>
              ) : null}

              {selectedBumps.size ? (
                <div className="rounded-xl bg-[#f6f3f1] px-4 py-3 text-sm">
                  <div className="flex justify-between text-[#666]">
                    <span>Promoção principal</span>
                    <b>{formatPrice(mainPrice)}</b>
                  </div>
                  {(orderBump?.items ?? [])
                    .filter((item) => selectedBumps.has(item.id))
                    .map((item) => (
                      <div key={item.id} className="mt-1 flex justify-between text-[#666]">
                        <span>{item.name}</span>
                        <b>+ {formatPrice(item.price)}</b>
                      </div>
                    ))}
                  <div className="mt-2 flex justify-between border-t border-[#ddd5d0] pt-2 text-base font-extrabold text-[#292929]">
                    <span>Total</span>
                    <span>{formatPrice(checkoutPrice)}</span>
                  </div>
                </div>
              ) : null}

              {error && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#ff6542] to-[#ff7b22] px-5 py-4 text-base font-extrabold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:px-7 sm:text-lg"
              >
                {loading ? (
                  <span className="flex w-full items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gerando PIX...
                  </span>
                ) : (
                  <>
                    <span>
                      {plan?.promotionId ? plan.ctaText || "Aproveitar promoção" : "Gerar PIX"}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      {formatPrice(checkoutPrice)}
                      <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
                    </span>
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function SuccessView({
  pixCode,
  amount,
  checkingPayment,
  paymentCheckError,
  onCheckPayment,
}: {
  pixCode: string;
  amount: number;
  checkingPayment: boolean;
  paymentCheckError: string | null;
  onCheckPayment: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(5 * 60);

  useEffect(() => {
    const countdown = window.setInterval(() => {
      setSecondsRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(countdown);
          return 0;
        }
        return current - 1;
      });
    }, 1_000);

    return () => window.clearInterval(countdown);
  }, []);

  const countdownLabel = `${String(Math.floor(secondsRemaining / 60)).padStart(2, "0")}:${String(
    secondsRemaining % 60,
  ).padStart(2, "0")}`;

  async function copyPix() {
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="text-center text-[#333]" data-pix-layout="unified-v2">
      <div
        className={`mx-auto mt-2 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-lg font-extrabold leading-tight shadow-sm sm:gap-3 sm:py-4 sm:text-2xl sm:leading-normal ${
          secondsRemaining > 0
            ? "bg-[#fff2e9] text-[#d95b2f] ring-1 ring-[#ffd7c4]"
            : "bg-destructive/10 text-destructive"
        }`}
        role="timer"
        aria-live="off"
      >
        <Timer className="h-5 w-5 sm:h-7 sm:w-7" />
        {secondsRemaining > 0
          ? `Garanta seu acesso nos próximos ${countdownLabel}`
          : "Tempo encerrado, pague agora para não perder descontos especiais"}
      </div>
      <div className="mt-3 w-full rounded-2xl border border-[#ffd7c4] bg-[#fff7f1] p-3 text-left shadow-sm sm:mt-4 sm:p-4">
        <p className="text-sm font-semibold leading-relaxed text-[#4f443f] sm:text-base">
          🎁 Pague agora e receba meu contato exclusivo de presente.
        </p>
      </div>
      <div className="mt-2 text-center leading-tight sm:mt-3">
        <p className="text-xs font-medium text-[#777]">Total</p>
        <p className="mt-1 text-lg font-extrabold text-[#333]">{formatPrice(amount)}</p>
      </div>
      <div className="mx-auto mt-2 w-fit rounded-2xl border border-[#e2e2e2] bg-white p-2 sm:mt-3">
        <QRCodeSVG
          value={pixCode}
          size={160}
          level="M"
          marginSize={1}
          title={`QR Code Pix de ${formatPrice(amount)}`}
          className="h-auto w-[min(46vw,160px)]"
        />
      </div>
      <div className="mt-2 rounded-2xl border-2 border-[#dedede] bg-white p-3 sm:mt-3">
        <code className="block h-12 overflow-hidden break-all text-left font-mono text-sm leading-6 text-black">
          {pixCode}
        </code>
      </div>
      <button
        onClick={copyPix}
        className="mt-2 min-h-14 w-full rounded-2xl bg-gradient-to-r from-[#ff6542] to-[#ff7b22] px-4 py-3 text-base font-extrabold text-white shadow-sm sm:mt-3"
      >
        {copied ? "✓ CÓDIGO PIX COPIADO" : "📋 COPIAR CÓDIGO PIX"}
      </button>
      <p className="mt-2 text-center text-[13px] font-medium text-[#747474]">
        🔒 Pagamento seguro&nbsp; • &nbsp;⚡ Liberação automática
      </p>
      <button
        type="button"
        onClick={onCheckPayment}
        disabled={checkingPayment}
        className={`mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition sm:mt-3 ${
          checkingPayment
            ? "border-[#ff9c73] bg-[#fff1e9] text-[#d95b2f]"
            : "border-[#dedede] bg-white text-[#666] hover:border-primary/50 hover:text-primary"
        } disabled:cursor-wait`}
      >
        {checkingPayment ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Confirmando pagamento...
          </>
        ) : (
          <>
            <RefreshCw className="h-5 w-5" />
            Verificar pagamento
          </>
        )}
      </button>
      {paymentCheckError ? (
        <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-left text-sm leading-relaxed text-destructive">
          {paymentCheckError}
        </p>
      ) : null}
    </div>
  );
}

function ApprovedView({ modelName, modelUsername }: { modelName: string; modelUsername: string }) {
  return (
    <div className="grid min-h-[32rem] place-items-center px-2 py-8 text-center">
      <div>
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/30">
          <CheckCircle2 className="h-11 w-11" />
        </div>
        <p className="mt-6 text-sm font-black uppercase tracking-[0.16em] text-emerald-400">
          Pagamento aprovado
        </p>
        <h2 className="mt-2 text-2xl font-black sm:text-3xl">Seu acesso está liberado</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base">
          A galeria de <b className="text-foreground">{modelName}</b> já pertence à sua conta e
          ficará disponível permanentemente em Minhas Galerias.
        </p>
        <button
          onClick={() => {
            window.location.href = `/${encodeURIComponent(modelUsername)}`;
          }}
          className="btn-primary mt-8 min-h-14 w-full rounded-2xl px-6 py-4 text-base font-black shadow-lg shadow-primary/20"
        >
          Acessar
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "min-h-14 w-full rounded-2xl border-2 border-[#dedede] bg-white px-4 py-3 text-lg text-black outline-none placeholder:text-[#aaa] focus:border-primary";

function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-[#333]">
        {label} {required && <span className="text-primary">*</span>}
        {optional && <span className="ml-1 font-medium text-[#777]">(opcional)</span>}
      </span>
      {children}
    </label>
  );
}
