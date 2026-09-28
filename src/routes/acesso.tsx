import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, LogOut, ShieldCheck, UserPlus } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { createManualCustomerAccount, startPhoneSession } from "@/lib/likes.functions";
import { endPhoneSession } from "@/lib/access.functions";
import { clearPaidAccountFlow, clearSession, getPaidAccountFlow, getSession, setSession, type PaidAccountFlow } from "@/lib/session";
import { formatBrazilPhoneInput, normalizeBrazilPhone } from "@/lib/phone";
import { configurePaidOrderPassword, getPaidOrderAccountContext, resolvePaidOrderDestination } from "@/lib/purchase.functions";

export const Route = createFileRoute("/acesso")({
  head: () => ({ meta: [{ title: "Minha conta — Privadinhos Online" }, { name: "description", content: "Acesse suas galerias usando telefone e senha." }] }),
  component: Acesso,
});

function BrazilFlag() {
  return <svg viewBox="0 0 28 20" className="h-5 w-7" role="img" aria-label="Brasil"><rect width="28" height="20" rx="2" fill="#229E45" /><path d="M14 2.5 25 10 14 17.5 3 10Z" fill="#F8E52B" /><circle cx="14" cy="10" r="4.2" fill="#2455A4" /><path d="M10.4 9.2c2.5-.8 5.1-.4 7.3 1.2" fill="none" stroke="#fff" strokeWidth=".7" /></svg>;
}

type PaidContext = Awaited<ReturnType<typeof getPaidOrderAccountContext>>;

function Acesso() {
  const navigate = useNavigate();
  const startSession = useServerFn(startPhoneSession);
  const createAccount = useServerFn(createManualCustomerAccount);
  const endSession = useServerFn(endPhoneSession);
  const loadPaidContext = useServerFn(getPaidOrderAccountContext);
  const configurePaidPassword = useServerFn(configurePaidOrderPassword);
  const resolvePaidDestination = useServerFn(resolvePaidOrderDestination);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(() => getSession());
  const [paidFlow, setPaidFlow] = useState<PaidAccountFlow | null>(null);
  const [paidContext, setPaidContext] = useState<PaidContext | null>(null);
  const [firstAccess, setFirstAccess] = useState(false);
  const [validatingPurchase, setValidatingPurchase] = useState(false);
  const [showRecoverySupport, setShowRecoverySupport] = useState(false);

  useEffect(() => {
    const flow = getPaidAccountFlow();
    if (!flow || !new URLSearchParams(window.location.search).has("compra")) return;
    setPaidFlow(flow);
    setValidatingPurchase(true);
    loadPaidContext({ data: { orderId: flow.orderId, checkoutToken: flow.checkoutToken } })
      .then((context) => {
        setPaidContext(context);
        setName(context.name);
        setPhone(formatBrazilPhoneInput(context.phone).replace(/^\+55\s*/, ""));
        setMode(flow.nextStep === "login" ? "login" : "register");
        setFirstAccess(flow.nextStep === "setup_password");
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível validar sua compra."))
      .finally(() => setValidatingPurchase(false));
  }, [loadPaidContext]);

  const normalizedPhone = normalizeBrazilPhone(phone);
  const creatingPassword = mode === "register" || firstAccess;
  const canSubmit = Boolean(normalizedPhone) && /^\d{4}$/.test(password) && !loading && (!creatingPassword || (name.trim().length >= 2 && /^\d{4}$/.test(confirmation)));
  const errorField = error?.toLowerCase().includes("senha") ? "password" : error?.toLowerCase().includes("telefone") ? "phone" : error?.toLowerCase().includes("nome") ? "name" : null;

  function resetPasswords() { setPassword(""); setConfirmation(""); setError(null); setShowRecoverySupport(false); }
  function changeMode(next: "login" | "register") { setMode(next); setFirstAccess(false); resetPasswords(); }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!normalizedPhone) return setError("Informe um telefone válido com DDD.");
    if (!/^\d{4}$/.test(password)) return setError("A senha deve ter exatamente 4 números.");
    if (creatingPassword && password !== confirmation) return setError("As senhas não são iguais.");
    setLoading(true);
    try {
      if (firstAccess && paidFlow) {
        const result = await configurePaidPassword({ data: { orderId: paidFlow.orderId, checkoutToken: paidFlow.checkoutToken, password, passwordConfirmation: confirmation } });
        setSession({ token: result.token, customerId: result.customerId, name: result.name });
        clearPaidAccountFlow();
        window.location.assign(`/${encodeURIComponent(result.modelUsername)}`);
        return;
      }
      const result = mode === "register"
        ? await createAccount({ data: { name, phone: normalizedPhone, password, passwordConfirmation: confirmation } })
        : await startSession({ data: { phone: normalizedPhone, password } });
      setSession({ token: result.token, customerId: result.customerId, name: result.name });
      setCurrent({ token: result.token, customerId: result.customerId, name: result.name });
      if (paidFlow) {
        const destination = await resolvePaidDestination({ data: { orderId: paidFlow.orderId, checkoutToken: paidFlow.checkoutToken, sessionToken: result.token } });
        clearPaidAccountFlow();
        window.location.assign(`/${encodeURIComponent(destination.modelUsername)}`);
      } else navigate({ to: "/minhas-modelos" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao acessar"); }
    finally { setLoading(false); }
  }

  function forgotPassword() {
    if (paidFlow && paidContext?.canConfigurePassword) { setMode("register"); setFirstAccess(true); resetPasswords(); }
    else {
      setError("Para redefinir sua senha com segurança, precisamos validar seu telefone e suas compras.");
      setShowRecoverySupport(true);
    }
  }

  async function logout() {
    const token = current?.token;
    clearSession(); setCurrent(null);
    if (token) await endSession({ data: { token } }).catch(() => undefined);
  }

  return <PageShell><div className="mx-auto max-w-md">
    <h1 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Minha conta</h1>
    <p className="mx-auto mt-2 max-w-sm text-center text-base leading-relaxed text-muted-foreground">{firstAccess ? "Seu acesso já está liberado. Crie sua senha para entrar quando quiser." : mode === "register" ? "Crie sua conta para acompanhar suas compras e galerias em um só lugar." : "Entre com seu telefone e sua senha de 4 números."}</p>
    {current && !paidFlow ? <div className="card-premium mt-8 rounded-2xl p-6"><p className="text-sm text-muted-foreground">Você está conectado como</p><p className="mt-1 text-lg font-bold">{current.name}</p><div className="mt-5 flex gap-2"><button onClick={() => navigate({ to: "/minhas-modelos" })} className="btn-primary flex-1 rounded-xl py-3 text-sm font-bold">Ir para minhas galerias</button><button onClick={logout} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold"><LogOut className="h-4 w-4" /> Sair</button></div></div> :
    <form className="card-premium mt-8 rounded-2xl p-6" onSubmit={onSubmit} noValidate>
      {validatingPurchase ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm font-semibold text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin text-primary" /> Validando sua compra…</div> : null}
      {!validatingPurchase && firstAccess ? <div className="mb-6 rounded-xl bg-primary/10 px-4 py-3"><p className="font-black">Falta só criar sua senha</p><p className="mt-1 text-sm text-muted-foreground">Use 4 números fáceis de lembrar para acessar seus conteúdos novamente.</p></div> : null}
      {!validatingPurchase && !firstAccess ? <div className="mb-6 grid grid-cols-2 rounded-xl bg-muted p-1" aria-label="Escolha entre entrar e criar conta"><ModeButton active={mode === "login"} onClick={() => changeMode("login")}>Entrar</ModeButton><ModeButton active={mode === "register"} onClick={() => changeMode("register")}>Criar conta</ModeButton></div> : null}
      {!validatingPurchase && creatingPassword ? <TextField value={name} onChange={setName} readOnly={firstAccess} invalid={errorField === "name"} /> : null}
      {!validatingPurchase ? <PhoneField value={phone} onChange={setPhone} readOnly={firstAccess || Boolean(paidFlow)} invalid={errorField === "phone"} /> : null}
      {!validatingPurchase ? <><PasswordField label={creatingPassword ? "Crie sua senha" : "Senha"} value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} invalid={errorField === "password"} />{creatingPassword ? <PasswordField label="Confirmar senha" value={confirmation} onChange={setConfirmation} visible={showPassword} invalid={Boolean(error?.includes("não são iguais"))} /> : null}{error ? <p id="account-form-error" role="alert" className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}{showRecoverySupport ? <a href="/contato" className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-primary/30 px-4 text-sm font-bold text-primary hover:bg-primary/5">Validar identidade com o suporte</a> : null}<button disabled={!canSubmit} className="btn-primary mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-bold disabled:cursor-not-allowed disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : creatingPassword ? <UserPlus className="h-4 w-4" /> : null}{firstAccess ? "Criar minha senha" : mode === "register" ? "Criar minha conta" : "Entrar"}</button>{mode === "login" ? <button type="button" onClick={forgotPassword} className="mt-3 min-h-10 w-full text-sm font-bold text-primary hover:underline">Esqueci minha senha</button> : null}<p className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> {creatingPassword ? "Senha protegida e processada no servidor" : "Consulta feita com segurança no servidor"}</p></> : null}
    </form>}
  </div></PageShell>;
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`min-h-11 rounded-lg px-3 text-sm font-bold transition ${active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} aria-pressed={active}>{children}</button>; }
function TextField({ value, onChange, readOnly, invalid }: { value: string; onChange: (value: string) => void; readOnly: boolean; invalid: boolean }) { return <label className="mb-5 block text-sm font-bold">Nome <span className="text-primary">*</span><input autoComplete="name" value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} placeholder="Como podemos te chamar?" maxLength={100} className={`mt-2 min-h-14 w-full rounded-2xl border-2 bg-input px-4 py-3 outline-none focus:border-primary read-only:bg-muted/60 ${invalid ? "border-destructive" : "border-border"}`} aria-invalid={invalid || undefined} aria-describedby={invalid ? "account-form-error" : undefined} /></label>; }
function PhoneField({ value, onChange, readOnly, invalid }: { value: string; onChange: (value: string) => void; readOnly: boolean; invalid: boolean }) { return <label className="block text-sm font-bold">Telefone <span className="text-primary">*</span><div className={`mt-2 flex min-h-14 overflow-hidden rounded-2xl border-2 bg-input focus-within:border-primary ${invalid ? "border-destructive" : "border-border"}`}><span className="flex shrink-0 items-center gap-2 border-r border-border px-3" aria-hidden="true"><BrazilFlag /><b>+55</b></span><input inputMode="tel" autoComplete="tel-national" value={value} onChange={(event) => onChange(formatBrazilPhoneInput(event.target.value).replace(/^\+55\s*/, ""))} readOnly={readOnly} placeholder="(11) 99999-9999" className="min-w-0 flex-1 bg-transparent px-3 py-3 outline-none read-only:bg-muted/60" aria-invalid={invalid || undefined} aria-describedby={invalid ? "account-form-error" : undefined} /></div></label>; }
function PasswordField({ label, value, onChange, visible, onToggle, invalid }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggle?: () => void; invalid: boolean }) { return <label className="mt-5 block text-sm font-bold">{label} <span className="text-primary">*</span><div className={`mt-2 flex min-h-14 items-center rounded-2xl border-2 bg-input focus-within:border-primary ${invalid ? "border-destructive" : "border-border"}`}><input type={visible ? "text" : "password"} inputMode="numeric" pattern="[0-9]{4}" autoComplete={label === "Senha" ? "current-password" : "new-password"} value={value} onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Digite 4 números" maxLength={4} className="min-w-0 flex-1 bg-transparent px-4 py-3 outline-none" aria-invalid={invalid || undefined} aria-describedby={invalid ? "account-form-error" : undefined} />{onToggle ? <button type="button" onClick={onToggle} className="mr-2 inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={visible ? "Ocultar senha" : "Mostrar senha"}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button> : null}</div></label>; }
