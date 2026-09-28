import { describe, expect, it } from "vitest";
import { hasLinkedCustomerOrder } from "./access.functions";

describe("profile Telegram support eligibility", () => {
  it("allows an account without linked orders", () => {
    expect(hasLinkedCustomerOrder([])).toBe(false);
  });

  it("detects an account with any linked order", () => {
    expect(hasLinkedCustomerOrder([{ id: "order-1" }])).toBe(true);
  });

  it("fails closed when purchase lookup is unavailable", () => {
    expect(hasLinkedCustomerOrder([], true)).toBe(true);
  });
});
