export const PAYMENT_PROVIDERS = [
  { value: "syncpay", label: "SyncPay" },
  { value: "pushinpay", label: "Pushin Pay" },
  { value: "onpay", label: "ONPAY" },
] as const;

export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number]["value"];

export function parsePaymentProvider(value: unknown): PaymentProvider | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return PAYMENT_PROVIDERS.some((provider) => provider.value === normalized)
    ? (normalized as PaymentProvider)
    : undefined;
}

export function campaignGatewayLink(origin: string, username: string, provider: PaymentProvider) {
  const url = new URL(`/${encodeURIComponent(username)}`, origin);
  url.searchParams.set("gateway", provider);
  return url.toString();
}
