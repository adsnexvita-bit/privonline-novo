import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  verifyPixCharge,
  grantedOrders,
  grantOrderAccess,
  sendMetaPurchaseForOrder,
  notifyAdminsAboutApprovedSale,
} = vi.hoisted(() => {
  const grantedOrders = new Set<string>();
  return {
    verifyPixCharge: vi.fn(),
    grantedOrders,
    grantOrderAccess: vi.fn(async (_db: unknown, orderId: string) => {
      grantedOrders.add(orderId);
    }),
    sendMetaPurchaseForOrder: vi.fn(),
    notifyAdminsAboutApprovedSale: vi.fn(),
  };
});

vi.mock("./payment-provider.server", () => ({ verifyPixCharge }));
vi.mock("./admin-orders.functions", () => ({ grantOrderAccess }));
vi.mock("./meta-capi.server", () => ({ sendMetaPurchaseForOrder }));
vi.mock("./admin-push.server", () => ({ notifyAdminsAboutApprovedSale }));

import { processPaymentConfirmation } from "./payment-processing.server";

type Order = {
  id: string;
  total_amount: number;
  payment_status: string;
  payment_provider: string;
  paid_at: string | null;
  payment_confirmed_by: string | null;
  transaction_identifier: string;
};

function fakeDb(initial: Order | null) {
  let order = initial ? { ...initial } : null;
  return {
    client: {
      from: () => {
        let pendingPatch: Record<string, unknown> | null = null;
        const filters = new Map<string, unknown>();
        // Each request gets an independent fluent builder while all builders
        // share the same order, matching concurrent conditional updates.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          select: () => chain,
          eq: (field: string, value: unknown) => {
            filters.set(field, value);
            return chain;
          },
          update: (patch: Record<string, unknown>) => {
            pendingPatch = patch;
            return chain;
          },
          maybeSingle: async () => {
            if (!order) return { data: null, error: null };
            for (const [field, value] of filters) {
              if ((order as unknown as Record<string, unknown>)[field] !== value) {
                return { data: null, error: null };
              }
            }
            if (pendingPatch) order = { ...order, ...pendingPatch } as Order;
            return { data: { ...order }, error: null };
          },
        };
        return chain;
      },
    } as unknown as SupabaseClient<Database>,
    current: () => order,
  };
}

function pendingOrder(): Order {
  return {
    id: "order-1",
    total_amount: 8.9,
    payment_status: "pending",
    payment_provider: "syncpay",
    paid_at: null,
    payment_confirmed_by: null,
    transaction_identifier: "txn-1",
  };
}

describe("processPaymentConfirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grantedOrders.clear();
  });

  it("keeps a pending PIX pending", async () => {
    verifyPixCharge.mockResolvedValue({
      status: "pending",
      gatewayStatus: "pending",
      transactionDate: null,
    });
    const db = fakeDb(pendingOrder());
    const result = await processPaymentConfirmation(db.client, {
      provider: "syncpay",
      transactionId: "txn-1",
      confirmationSource: "webhook",
    });
    expect(result.status).toBe("pending");
    expect(db.current()?.payment_status).toBe("pending");
    expect(grantOrderAccess).not.toHaveBeenCalled();
  });

  it("marks a webhook-confirmed PIX paid and grants access once", async () => {
    verifyPixCharge.mockResolvedValue({
      status: "paid",
      gatewayStatus: "completed",
      transactionDate: "2026-08-19T12:00:00Z",
    });
    const db = fakeDb(pendingOrder());
    const result = await processPaymentConfirmation(db.client, {
      provider: "syncpay",
      transactionId: "txn-1",
      confirmationSource: "webhook",
    });
    expect(result.transitionedToPaid).toBe(true);
    expect(db.current()).toMatchObject({
      payment_status: "paid",
      paid_at: "2026-08-19T12:00:00Z",
      payment_confirmed_by: "webhook",
    });
    expect(grantedOrders.size).toBe(1);
    expect(notifyAdminsAboutApprovedSale).toHaveBeenCalledTimes(1);
  });

  it("makes a duplicate paid delivery a no-op with stable paid_at", async () => {
    verifyPixCharge.mockResolvedValue({
      status: "paid",
      gatewayStatus: "completed",
      transactionDate: "2026-08-19T13:00:00Z",
    });
    const original = {
      ...pendingOrder(),
      payment_status: "paid",
      paid_at: "2026-08-19T12:00:00Z",
      payment_confirmed_by: "webhook",
    };
    const db = fakeDb(original);
    const result = await processPaymentConfirmation(db.client, {
      provider: "syncpay",
      transactionId: "txn-1",
      confirmationSource: "webhook",
    });
    expect(result.transitionedToPaid).toBe(false);
    expect(db.current()?.paid_at).toBe("2026-08-19T12:00:00Z");
    expect(notifyAdminsAboutApprovedSale).not.toHaveBeenCalled();
    expect(grantedOrders.size).toBe(1);
  });

  it("recovers a missed webhook through API reconciliation", async () => {
    verifyPixCharge.mockResolvedValue({
      status: "paid",
      gatewayStatus: "completed",
      transactionDate: null,
    });
    const db = fakeDb(pendingOrder());
    await processPaymentConfirmation(db.client, {
      provider: "syncpay",
      transactionId: "txn-1",
      confirmationSource: "api_reconciliation",
    });
    expect(db.current()).toMatchObject({
      payment_status: "paid",
      payment_confirmed_by: "api_reconciliation",
    });
  });

  it("does not change webhook attribution when reconciliation runs later", async () => {
    verifyPixCharge.mockResolvedValue({
      status: "paid",
      gatewayStatus: "completed",
      transactionDate: "2026-08-19T12:00:00Z",
    });
    const db = fakeDb(pendingOrder());
    await processPaymentConfirmation(db.client, {
      provider: "syncpay",
      transactionId: "txn-1",
      confirmationSource: "webhook",
    });
    await processPaymentConfirmation(db.client, {
      provider: "syncpay",
      transactionId: "txn-1",
      confirmationSource: "api_reconciliation",
    });
    expect(db.current()).toMatchObject({
      paid_at: "2026-08-19T12:00:00Z",
      payment_confirmed_by: "webhook",
    });
    expect(notifyAdminsAboutApprovedSale).toHaveBeenCalledTimes(1);
    expect(sendMetaPurchaseForOrder).toHaveBeenCalledTimes(1);
  });

  it("lets only one of webhook, polling and reconciliation run paid effects", async () => {
    verifyPixCharge.mockResolvedValue({
      status: "paid",
      gatewayStatus: "completed",
      transactionDate: "2026-08-19T12:00:00Z",
    });
    const db = fakeDb(pendingOrder());

    const results = await Promise.all([
      processPaymentConfirmation(db.client, {
        provider: "syncpay",
        transactionId: "txn-1",
        confirmationSource: "webhook",
      }),
      processPaymentConfirmation(db.client, {
        provider: "syncpay",
        transactionId: "txn-1",
        confirmationSource: "polling",
      }),
      processPaymentConfirmation(db.client, {
        provider: "syncpay",
        transactionId: "txn-1",
        confirmationSource: "api_reconciliation",
      }),
    ]);

    expect(results.filter((result) => result.transitionedToPaid)).toHaveLength(1);
    expect(grantOrderAccess).toHaveBeenCalledTimes(1);
    expect(sendMetaPurchaseForOrder).toHaveBeenCalledTimes(1);
    expect(notifyAdminsAboutApprovedSale).toHaveBeenCalledTimes(1);
    expect(db.current()?.paid_at).toBe("2026-08-19T12:00:00Z");
  });

  it("rejects an unknown transaction without granting access", async () => {
    const db = fakeDb(null);
    await expect(
      processPaymentConfirmation(db.client, {
        provider: "syncpay",
        transactionId: "missing",
        confirmationSource: "webhook",
      }),
    ).rejects.toThrow("Pedido não encontrado");
    expect(grantOrderAccess).not.toHaveBeenCalled();
  });

  it.each([
    "SyncPay timeout",
    "SyncPay 401",
    "SyncPay 500",
    "O identificador retornado pela SyncPay diverge da transação consultada",
    "O valor confirmado pela operadora é diferente do valor do pedido",
  ])("leaves the order pending when verification fails: %s", async (message) => {
    verifyPixCharge.mockRejectedValue(new Error(message));
    const db = fakeDb(pendingOrder());
    await expect(
      processPaymentConfirmation(db.client, {
        provider: "syncpay",
        transactionId: "txn-1",
        confirmationSource: "api_reconciliation",
      }),
    ).rejects.toThrow(message);
    expect(db.current()?.payment_status).toBe("pending");
    expect(grantOrderAccess).not.toHaveBeenCalled();
  });
});
