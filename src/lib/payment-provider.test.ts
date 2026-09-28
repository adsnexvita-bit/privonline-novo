import { describe, expect, it } from "vitest";
import { campaignGatewayLink, parsePaymentProvider } from "./payment-provider";

describe("payment provider campaign links", () => {
  it.each(["syncpay", "pushinpay", "onpay"] as const)(
    "accepts the supported %s gateway",
    (provider) => {
      expect(parsePaymentProvider(provider)).toBe(provider);
    },
  );

  it("ignores unknown or missing gateway overrides", () => {
    expect(parsePaymentProvider("unknown")).toBeUndefined();
    expect(parsePaymentProvider(null)).toBeUndefined();
  });

  it("creates a profile URL that can receive additional campaign parameters", () => {
    const value = campaignGatewayLink("https://privadinhos.online", "ana linda", "onpay");
    const url = new URL(value);

    expect(url.pathname).toBe("/ana%20linda");
    expect(url.searchParams.get("gateway")).toBe("onpay");
    url.searchParams.set("utm_campaign", "teste-onpay");
    expect(url.searchParams.get("utm_campaign")).toBe("teste-onpay");
  });
});
