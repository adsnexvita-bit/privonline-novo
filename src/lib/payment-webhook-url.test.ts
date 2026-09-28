import { afterEach, describe, expect, it } from "vitest";
import { buildPaymentWebhookUrl } from "./payment-webhook-url";

const previousProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

afterEach(() => {
  if (previousProductionUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  else process.env.VERCEL_PROJECT_PRODUCTION_URL = previousProductionUrl;
});

describe("payment webhook URLs", () => {
  it("uses the domain that received the checkout request", () => {
    expect(
      buildPaymentWebhookUrl("syncpay", "order 1", "https://checkout.example.com/path?old=1"),
    ).toBe("https://checkout.example.com/api/webhooks/syncpay?order_id=order+1");
    expect(buildPaymentWebhookUrl("pushinpay", "order-2", "https://another.example.com")).toBe(
      "https://another.example.com/api/public/webhooks/pushinpay?order_id=order-2",
    );
  });

  it("replaces Vercel domains with the primary public domain", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "project.example.vercel.app";
    expect(buildPaymentWebhookUrl("syncpay", "order-3")).toBe(
      "https://privadinhos.store/api/webhooks/syncpay?order_id=order-3",
    );
    expect(
      buildPaymentWebhookUrl("onpay", undefined, "https://privonline.vercel.app/checkout"),
    ).toBe("https://privadinhos.store/api/public/webhooks/onpay");
  });

  it("rejects an insecure non-local webhook domain", () => {
    expect(() => buildPaymentWebhookUrl("syncpay", "order-4", "http://example.com")).toThrow(
      "HTTPS",
    );
  });
});
