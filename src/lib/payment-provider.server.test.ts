import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSyncPayCashIn, getSyncPayTransactionState } = vi.hoisted(() => ({
  createSyncPayCashIn: vi.fn(),
  getSyncPayTransactionState: vi.fn(),
}));

vi.mock("./syncpay.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./syncpay.server")>();
  return { ...actual, createSyncPayCashIn, getSyncPayTransactionState };
});

import { createPixCharge, verifyPixCharge } from "./payment-provider.server";

describe("SyncPay payment verification", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["completed", "PAID_OUT"])("accepts the documented paid status %s", async (status) => {
    getSyncPayTransactionState.mockResolvedValue({
      transactionId: "txn-1",
      providerStatus: status,
      isPaid: true,
      amount: 10.9,
      transactionDate: null,
      rawShapeVersion: "root",
    });

    await expect(verifyPixCharge("syncpay", "txn-1", 10.9)).resolves.toMatchObject({
      status: "paid",
      gatewayStatus: status,
    });
  });

  it("rejects a divergent amount", async () => {
    getSyncPayTransactionState.mockResolvedValue({
      transactionId: "txn-1",
      providerStatus: "completed",
      isPaid: true,
      amount: 9.9,
      transactionDate: null,
      rawShapeVersion: "root",
    });

    await expect(verifyPixCharge("syncpay", "txn-1", 10.9)).rejects.toThrow("valor confirmado");
  });
});

describe("gateway product identity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("always sends a generic fixed product description and preserves buyer data", async () => {
    createSyncPayCashIn.mockResolvedValue({ identifier: "txn-1", pixCode: "pix" });
    const client = {
      cpf: "12345678909",
      name: "Cliente Real",
      email: "cliente@example.com",
      phone: "11999999999",
    };

    await createPixCharge("syncpay", { orderId: "order-1", amount: 19.9, client });

    expect(createSyncPayCashIn).toHaveBeenCalledWith({
      orderId: "order-1",
      amount: 19.9,
      description: "Feverby System Access",
      client,
    });
  });
});
