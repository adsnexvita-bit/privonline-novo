import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseOnPayWebhook, validateOnPayWebhookSignature } from "./onpay-webhook.server";

describe("ONPAY webhook", () => {
  it("valida a assinatura HMAC sobre o corpo bruto", () => {
    const raw = JSON.stringify({ event: "payment.paid" });
    const signature = `sha256=${createHmac("sha256", "secret").update(raw).digest("hex")}`;
    expect(() => validateOnPayWebhookSignature(raw, signature, "secret")).not.toThrow();
    expect(() => validateOnPayWebhookSignature(raw, `${signature}0`, "secret")).toThrow();
  });

  it("aceita evento PIX documentado", () => {
    const parsed = parseOnPayWebhook(new Headers({ "x-onpay-event": "payment.paid" }), {
      id: "evt_1",
      data: { id: "pay_1", method: "PIX", status: "PAID", amount: 10 },
    });
    expect(parsed).toMatchObject({ eventType: "payment.paid", transactionId: "pay_1", externalEventId: "evt_1" });
  });

  it("rejeita método que não seja PIX", () => {
    expect(() => parseOnPayWebhook(new Headers(), {
      event: "payment.paid",
      data: { id: "pay_1", method: "CARD", status: "PAID" },
    })).toThrow();
  });
});
