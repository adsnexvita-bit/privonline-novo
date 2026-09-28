import { describe, expect, it } from "vitest";
import { chooseSplitPaymentProvider, readCheckoutSettings } from "./checkout-settings.functions";

describe("checkout gateway distribution", () => {
  it("keeps the previous two-gateway distribution compatible", () => {
    expect(
      readCheckoutSettings({ payment_provider_mode: "split", syncpay_percentage: 40 }),
    ).toMatchObject({
      paymentProviderMode: "split",
      syncPayPercentage: 40,
      pushinPayPercentage: 60,
      onPayPercentage: 0,
    });
  });

  it("loads all three gateway percentages", () => {
    expect(
      readCheckoutSettings({
        payment_provider_mode: "split",
        syncpay_percentage: 35,
        pushinpay_percentage: 25,
        onpay_percentage: 40,
      }),
    ).toMatchObject({
      syncPayPercentage: 35,
      pushinPayPercentage: 25,
      onPayPercentage: 40,
    });
  });

  it("falls back safely when a stored distribution does not total 100", () => {
    expect(
      readCheckoutSettings({
        syncpay_percentage: 30,
        pushinpay_percentage: 30,
        onpay_percentage: 30,
      }),
    ).toMatchObject({
      syncPayPercentage: 30,
      pushinPayPercentage: 70,
      onPayPercentage: 0,
    });
  });

  it("routes the full percentage range across all three gateways", () => {
    const settings = {
      syncPayPercentage: 30,
      pushinPayPercentage: 25,
    };

    expect(chooseSplitPaymentProvider(settings, 0)).toBe("syncpay");
    expect(chooseSplitPaymentProvider(settings, 29.99)).toBe("syncpay");
    expect(chooseSplitPaymentProvider(settings, 30)).toBe("pushinpay");
    expect(chooseSplitPaymentProvider(settings, 54.99)).toBe("pushinpay");
    expect(chooseSplitPaymentProvider(settings, 55)).toBe("onpay");
    expect(chooseSplitPaymentProvider(settings, 99.99)).toBe("onpay");
  });
});
