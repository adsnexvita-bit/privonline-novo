// Only an opaque token and display metadata are stored on the client. Customer
// identity and access authorization are always resolved on the backend.

const KEY = "famaflix.session";
const COOKIE_KEY = "famaflix_session";
const SESSION_DURATION_MS = 180 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_SECONDS = SESSION_DURATION_MS / 1000;
const PAID_ACCOUNT_FLOW_KEY = "privadinhos.paid-account-flow";

export type CustomerSession = {
  token: string;
  customerId: string;
  name: string;
  expiresAt?: number;
};

function readCookie() {
  const prefix = `${COOKIE_KEY}=`;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return value ? decodeURIComponent(value) : null;
}

function removeStoredSession() {
  window.localStorage.removeItem(KEY);
  document.cookie = `${COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function getSession(): CustomerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY) ?? readCookie();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CustomerSession> & Record<string, unknown>;
    if (!parsed?.token || !parsed?.customerId || !parsed?.name) return null;
    if (typeof parsed.expiresAt === "number" && parsed.expiresAt <= Date.now()) {
      removeStoredSession();
      return null;
    }
    // Defensive: strip any legacy identity fields.
    return {
      token: parsed.token,
      customerId: parsed.customerId,
      name: parsed.name,
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : undefined,
    };
  } catch {
    return null;
  }
}

export function setSession(s: CustomerSession) {
  if (typeof window === "undefined") return;
  const stored = JSON.stringify({
    token: s.token,
    customerId: s.customerId,
    name: s.name,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  });
  window.localStorage.setItem(KEY, stored);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(stored)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event("famaflix:session"));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  removeStoredSession();
  window.dispatchEvent(new Event("famaflix:session"));
}

export type PaidAccountFlow = {
  orderId: string;
  checkoutToken: string;
  nextStep: "setup_password" | "login";
};

export function setPaidAccountFlow(flow: PaidAccountFlow) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PAID_ACCOUNT_FLOW_KEY, JSON.stringify(flow));
}

export function getPaidAccountFlow(): PaidAccountFlow | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(PAID_ACCOUNT_FLOW_KEY) ?? "null") as Partial<PaidAccountFlow> | null;
    if (!parsed?.orderId || !parsed.checkoutToken || !["setup_password", "login"].includes(String(parsed.nextStep))) return null;
    return parsed as PaidAccountFlow;
  } catch {
    return null;
  }
}

export function clearPaidAccountFlow() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PAID_ACCOUNT_FLOW_KEY);
}
