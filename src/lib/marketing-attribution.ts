const STORAGE_KEY = "famaflix.marketing_attribution.v1";
const BROWSER_ID_KEY = "privacy.marketing_browser_id.v1";

const PARAMETER_NAMES = [
  "fbclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "campaign_id",
  "adset_id",
  "ad_id",
] as const;

export type MarketingAttribution = Partial<
  Record<(typeof PARAMETER_NAMES)[number] | "fbc" | "fbp", string>
>;

function clean(value: string | null, max = 500) {
  return (value ?? "").trim().slice(0, max);
}

function cookieValue(name: string) {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  return (
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) ?? ""
  );
}

function createFbp() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0];
  return `fb.1.${Date.now()}.${random}`;
}

export function captureMarketingAttribution() {
  if (typeof window === "undefined") return;
  const search = new URLSearchParams(window.location.search);
  const hasCampaignParameter = PARAMETER_NAMES.some((name) => search.has(name));
  if (!hasCampaignParameter) return;

  let previous: MarketingAttribution = {};
  try {
    previous = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    previous = {};
  }

  const next: MarketingAttribution = { ...previous };
  for (const name of PARAMETER_NAMES) {
    const value = clean(search.get(name));
    if (value) next[name] = value;
  }

  const fbclid = next.fbclid;
  const cookieFbc = clean(cookieValue("_fbc"));
  const cookieFbp = clean(cookieValue("_fbp"));
  if (cookieFbc) next.fbc = cookieFbc;
  else if (fbclid) next.fbc = `fb.1.${Date.now()}.${fbclid}`;
  if (cookieFbp) next.fbp = cookieFbp;
  else if (!next.fbp) next.fbp = createFbp();

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getMarketingAttribution(): MarketingAttribution | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
    return stored && typeof stored === "object" ? stored : undefined;
  } catch {
    return undefined;
  }
}

export function getMarketingBrowserId() {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(BROWSER_ID_KEY);
    if (existing) return existing;
    const next =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(BROWSER_ID_KEY, next);
    return next;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
