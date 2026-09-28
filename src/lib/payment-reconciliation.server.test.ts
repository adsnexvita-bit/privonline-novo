import { describe, expect, it } from "vitest";
import { shouldRetryStoredWebhook } from "./payment-reconciliation.server";

describe("stored webhook retry limit", () => {
  it("allows the fifth attempt and stops after it", () => {
    expect(shouldRetryStoredWebhook(4)).toBe(true);
    expect(shouldRetryStoredWebhook(5)).toBe(false);
    expect(shouldRetryStoredWebhook(6)).toBe(false);
  });
});
