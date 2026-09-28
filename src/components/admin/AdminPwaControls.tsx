import { Bell, CheckCircle2, Download, Loader2, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cancelAdminPushTestRun, disableAdminPushSubscription, getAdminPushConfig, getAdminPushTestRun, processAdminPushTestSequence, saveAdminPushSubscription, sendAdminTestPush, startAdminPushTestSequence } from "@/lib/admin-push.functions";

const NOTIFICATION_SOUND_URL = "/assets/pwa/admin-sale-notification.wav";
type Status = "loading" | "active" | "inactive" | "blocked" | "unsupported";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
function keyBytes(value: string) { const padding = "=".repeat((4 - value.length % 4) % 4); return Uint8Array.from(atob((value + padding).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)); }
function pushPayload(subscription: PushSubscription) { const json = subscription.toJSON(); if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Assinatura push inválida."); return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }; }
function matchesKey(subscription: PushSubscription, key: string) { const current = subscription.options.applicationServerKey; if (!current || !key) return false; const a = new Uint8Array(current), b = keyBytes(key); return a.length === b.length && a.every((v, i) => v === b[i]); }

export function AdminPwaControls() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [publicKey, setPublicKey] = useState("");
  const [preview, setPreview] = useState<{ modelName: string; amount: number; title: string; body: string } | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [quantity, setQuantity] = useState(3), [interval, setIntervalValue] = useState(10);
  const [unit, setUnit] = useState<"seconds" | "minutes" | "hours">("seconds");
  const [run, setRun] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  const sound = useRef<HTMLAudioElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLElement | null>(null);
  const seconds = interval * (unit === "hours" ? 3600 : unit === "minutes" ? 60 : 1);
  const valid = quantity >= 1 && quantity <= 50 && seconds >= 5 && (quantity - 1) * seconds <= 240;

  async function refresh(reg = registration, key = publicKey) {
    if (!("Notification" in window) || !("PushManager" in window) || !reg) return setStatus("unsupported");
    if (Notification.permission === "denied") return setStatus("blocked");
    const current = await reg.pushManager.getSubscription();
    setStatus(current && Notification.permission === "granted" && matchesKey(current, key) ? "active" : "inactive");
  }
  useEffect(() => {
    sound.current = new Audio(NOTIFICATION_SOUND_URL); sound.current.preload = "auto";
    if (!("serviceWorker" in navigator)) { setStatus("unsupported"); return; }
    navigator.serviceWorker.register("/admin-sw.js?v=9", { scope: "/admin", updateViaCache: "none" }).then(async () => {
      const reg = await navigator.serviceWorker.ready, config = await getAdminPushConfig();
      setRegistration(reg); setPublicKey(config.publicKey); setPreview(config.preview);
      const current = await reg.pushManager.getSubscription();
      if (current && matchesKey(current, config.publicKey)) await saveAdminPushSubscription({ data: pushPayload(current) });
      await refresh(reg, config.publicKey);
    }).catch(error => { console.error("[Admin PWA] Falha ao inicializar.", error); setStatus("unsupported"); });
    const onMessage = (event: MessageEvent) => { if (event.data?.type === "ADMIN_PUSH_RECEIVED" && document.visibilityState === "visible") { sound.current!.currentTime = 0; void sound.current!.play().catch(() => undefined); } };
    navigator.serviceWorker.addEventListener("message", onMessage); return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
  useEffect(() => { const capture = (e: Event) => { e.preventDefault(); setInstallPrompt(e as InstallPrompt); }; window.addEventListener("beforeinstallprompt", capture); return () => window.removeEventListener("beforeinstallprompt", capture); }, []);
  useEffect(() => { if (!run?.id || run.status !== "running") return; const timer = setInterval(() => getAdminPushTestRun({ data: { id: run.id } }).then(setRun).catch(() => undefined), 1000); return () => clearInterval(timer); }, [run?.id, run?.status]);
  useEffect(() => { if (!open) return; const previous = document.activeElement as HTMLElement | null; dialog.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); if (event.key !== "Tab" || !dialog.current) return; const items = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')]; if (!items.length) return; const first = items[0], last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }; document.addEventListener("keydown", onKey); return () => { document.removeEventListener("keydown", onKey); (trigger.current ?? previous)?.focus(); }; }, [open]);
  useEffect(() => { if (run?.status !== "running") return; const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, [run?.status]);
  async function subscription() { const current = await registration?.pushManager.getSubscription(); if (!current) throw new Error("Ative as notificações neste dispositivo primeiro."); return current; }
  async function toggle() { if (!registration || busy) return; setBusy(true); setFeedback(null); try { let current = await registration.pushManager.getSubscription(); if (status === "active" && current) { await disableAdminPushSubscription({ data: { endpoint: current.endpoint } }); await current.unsubscribe(); setStatus("inactive"); return; } if (Notification.permission === "denied") return setStatus("blocked"); if (!publicKey) throw new Error("Notificações não configuradas no servidor."); const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission(); if (permission !== "granted") return setStatus(permission === "denied" ? "blocked" : "inactive"); if (current && !matchesKey(current, publicKey)) { await disableAdminPushSubscription({ data: { endpoint: current.endpoint } }).catch(() => undefined); await current.unsubscribe(); current = null; } const next = current ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }); await saveAdminPushSubscription({ data: pushPayload(next) }); setStatus("active"); } catch (e) { setFeedback({ ok: false, text: e instanceof Error ? e.message : "Não foi possível configurar as notificações." }); } finally { setBusy(false); } }
  async function quickTest() { setBusy(true); setFeedback(null); try { if (!preview) throw new Error("Não foi possível encontrar uma modelo com plano ativo para o teste."); const current = await subscription(); await sendAdminTestPush({ data: { endpoint: current.endpoint, modelName: preview.modelName, amount: preview.amount } }); setFeedback({ ok: true, text: "Teste enviado para este dispositivo." }); } catch (e) { setFeedback({ ok: false, text: e instanceof Error ? e.message : "Não foi possível enviar a notificação." }); } finally { setBusy(false); } }
  async function startSequence() { if (!valid) return setFeedback({ ok: false, text: "Use até 50 envios, mínimo de 5 segundos e duração total de até 4 minutos." }); setBusy(true); try { const current = await subscription(); const created = await startAdminPushTestSequence({ data: { endpoint: current.endpoint, quantity, intervalSeconds: seconds } }); setRun({ id: created.id, quantity, sent_count: 0, status: "running" }); void processAdminPushTestSequence({ data: { id: created.id } }); } catch (e) { setFeedback({ ok: false, text: e instanceof Error ? e.message : "Não foi possível iniciar o teste." }); } finally { setBusy(false); } }
  const copy = useMemo(() => ({ active: ["Notificações ativadas", "Este dispositivo pode receber notificações."], inactive: ["Notificações desativadas", "Ative para receber avisos e atualizações."], blocked: ["Notificações bloqueadas", "Altere a permissão nas configurações do navegador."], unsupported: ["Recurso indisponível", "Este navegador não oferece suporte a Web Push."], loading: ["Verificando…", "Consultando a permissão e a assinatura deste dispositivo."] }[status]), [status]);

  return <div className="flex items-center gap-1.5">
    {installPrompt ? <button type="button" onClick={async () => { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 font-semibold hover:bg-muted"><Download className="h-4 w-4" />Instalar app</button> : null}
    <button ref={trigger} type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 font-semibold hover:bg-muted"><Bell className="h-4 w-4" />Notificações<span className={`h-2 w-2 rounded-full ${status === "active" ? "bg-emerald-500" : status === "blocked" ? "bg-red-500" : "bg-muted-foreground/40"}`} /></button>
    {open ? <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 sm:items-center sm:p-5" onMouseDown={e => e.target === e.currentTarget && setOpen(false)}><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="push-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-background p-5 shadow-2xl outline-none sm:max-w-xl sm:rounded-2xl sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><h2 id="push-title" className="text-xl font-extrabold tracking-tight">Notificações</h2><p className="mt-1 text-sm text-muted-foreground">Gerencie as notificações deste dispositivo e faça testes de funcionamento.</p></div><button onClick={() => setOpen(false)} aria-label="Fechar" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted"><X className="h-5 w-5" /></button></div>
      <div className="mt-6 flex items-center justify-between gap-4 border-y border-border py-4"><div><p className="font-bold">Receber notificações neste dispositivo</p><p className="mt-1 text-sm text-muted-foreground"><strong>{copy[0]}</strong> · {copy[1]}</p></div><button role="switch" aria-checked={status === "active"} disabled={busy || ["loading","unsupported","blocked"].includes(status)} onClick={toggle} className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${status === "active" ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${status === "active" ? "left-6" : "left-1"}`} /></button></div>
      {status === "blocked" ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">Permita notificações manualmente nas configurações deste site.</p> : null}
      <div className="mt-6">
        <h3 className="font-extrabold">Prévia da notificação</h3>
        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-muted/70 p-4 shadow-[0_8px_24px_-18px_hsl(var(--foreground)/.35)]">
          <img src="/assets/pwa/privadinhos-admin-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="font-bold leading-5 text-foreground">{preview?.title ?? "Venda Aprovada!"}</p>
              <span className="shrink-0 text-xs text-muted-foreground">Agora</span>
            </div>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{preview?.body ?? "Modelo por R$ 0,00"}</p>
          </div>
        </div>
      </div>
      {!preview ? <p className="mt-3 text-sm text-destructive">Não foi possível encontrar uma modelo com plano ativo para o teste.</p> : null}
      <div className="mt-6"><h3 className="font-extrabold">Teste rápido</h3><p className="mt-1 text-sm text-muted-foreground">Verifique o fluxo real do backend até este dispositivo.</p><button onClick={quickTest} disabled={busy || status !== "active" || !preview} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar notificação de teste</button></div>
      <div className="mt-7 border-t border-border pt-6"><h3 className="font-extrabold">Teste em sequência</h3><div className="mt-3 grid grid-cols-3 gap-2"><label className="text-xs font-bold text-muted-foreground">Quantidade<input type="number" min="1" max="50" value={quantity} onChange={e => setQuantity(+e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground" /></label><label className="text-xs font-bold text-muted-foreground">Intervalo<input type="number" min="1" value={interval} onChange={e => setIntervalValue(+e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground" /></label><label className="text-xs font-bold text-muted-foreground">Unidade<select value={unit} onChange={e => setUnit(e.target.value as typeof unit)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-2 text-sm text-foreground"><option value="seconds">Segundos</option><option value="minutes">Minutos</option><option value="hours">Horas</option></select></label></div><p className="mt-3 text-sm text-muted-foreground">{quantity} notificações · uma a cada {interval} {unit === "seconds" ? "segundos" : unit === "minutes" ? "minutos" : "horas"}</p>
        {run?.status === "running" ? <div className="mt-4 rounded-xl bg-primary/10 p-4 text-sm"><p className="font-bold text-primary">Teste em andamento</p><p className="mt-1">{run.sent_count} de {run.quantity} notificações enviadas</p>{run.next_send_at ? <p className="mt-1">Próxima em: {Math.max(0, Math.ceil((new Date(run.next_send_at).getTime() - now) / 1000))} segundos</p> : null}<button onClick={async () => { await cancelAdminPushTestRun({ data: { id: run.id } }); setRun({ ...run, status: "cancelled" }); }} className="mt-3 font-bold underline underline-offset-4">Cancelar teste</button></div> : <button onClick={startSequence} disabled={busy || status !== "active" || !valid || !preview} className="mt-4 min-h-11 w-full rounded-xl border border-primary px-4 font-bold text-primary disabled:opacity-50">Iniciar teste</button>}
      </div>
      {feedback ? <div className={`mt-5 flex gap-2 rounded-xl p-3 text-sm ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}><CheckCircle2 className="h-5 w-5 shrink-0" /><span>{feedback.text}</span></div> : null}
    </section></div> : null}
  </div>;
}
