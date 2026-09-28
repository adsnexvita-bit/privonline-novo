import { describe, expect, it } from "vitest";
import { normalizeSyncPayTransactionState } from "./syncpay.server";

const transactionId = "6e7605d1-1bec-4018-8835-fa00603e1572";

describe("SyncPay transaction state", () => {
  it.each([
    ["completed", true],
    ["PAID_OUT", true],
    ["pending", false],
    ["WAITING_FOR_APPROVAL", false],
    ["paid", false],
    ["approved", false],
    ["succeeded", false],
  ])("normalizes the explicit provider status %s", (status, isPaid) => {
    expect(
      normalizeSyncPayTransactionState(
        { identifier: transactionId, amount: 10.9, status },
        transactionId,
      ),
    ).toMatchObject({ transactionId, providerStatus: status, isPaid, rawShapeVersion: "root" });
  });

  it("normalizes the legacy data envelope", () => {
    expect(
      normalizeSyncPayTransactionState(
        { data: { id: transactionId, amount: "10.90", status: "completed" } },
        transactionId,
      ),
    ).toMatchObject({
      transactionId,
      providerStatus: "completed",
      amount: 10.9,
      isPaid: true,
      rawShapeVersion: "data",
    });
  });

  it("rejects a divergent provider transaction id", () => {
    expect(() =>
      normalizeSyncPayTransactionState(
        { identifier: "different-transaction", amount: 10.9, status: "completed" },
        transactionId,
      ),
    ).toThrow("diverge");
  });

  it("rejects responses without a provider transaction id", () => {
    expect(() =>
      normalizeSyncPayTransactionState({ amount: 10.9, status: "completed" }, transactionId),
    ).toThrow("identificador");
  });
});
