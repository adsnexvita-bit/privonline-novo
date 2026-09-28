const STORAGE_KEY = "famaflix.marketing_attribution.v1";

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
  Record<(typeof PARAMETER_NAMES)[number], string>
>;

function clean(value: string | null, max = 500) {
  return (value ?? "").trim().slice(0, max);
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

  const next: MarketingAttribution = {};
  for (const name of PARAMETER_NAMES) {
    if (previous[name]) next[name] = previous[name];
  }
  for (const name of PARAMETER_NAMES) {
    const value = clean(search.get(name));
    if (value) next[name] = value;
  }

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getMarketingAttribution(): MarketingAttribution | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!stored || typeof stored !== "object") return undefined;
    const attribution: MarketingAttribution = {};
    for (const name of PARAMETER_NAMES) {
      if (typeof stored[name] === "string") attribution[name] = clean(stored[name]);
    }
    return attribution;
  } catch {
    return undefined;
  }
}
