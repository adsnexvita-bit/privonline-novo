import { beforeEach, describe, expect, it, vi } from "vitest";

const { processPaymentConfirmation } = vi.hoisted(() => ({
  processPaymentConfirmation: vi.fn(),
}));

vi.mock("./payment-processing.server", () => ({ processPaymentConfirmation }));

import { processStoredSyncPayWebhook } from "./syncpay-webhook.server";

function retryableEvent() {
  return {
    id: "event-1",
    provider: "syncpay",
    event_type: "cashin.create",
    external_event_id: "txn-1:cashin.create:v1:pending",
    transaction_identifier: "txn-1",
    payload: { data: { id: "txn-1" } },
    processing_status: "pending",
    error_message: null,
    attempts: 0,
    received_at: "2026-08-19T12:00:00Z",
    processed_at: null,
    gateway_status: "pending",
  } as const;
}

function fakeDb(initial = retryableEvent()) {
  let current: Record<string, unknown> = { ...initial };
  return {
    // The fluent fake implements only operations used by the stored-event processor.
    client: {
      from(table: string) {
        if (table === "webhook_events") {
          return {
            update(patch: Record<string, unknown>) {
              return {
                async eq() {
                  current = { ...current, ...patch };
                  return { error: null };
                },
              };
            },
          };
        }
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return chain;
      },
    },
    current: () => current,
  };
}

describe("stored SyncPay webhook retry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps an unmatched valid transaction pending for a bounded later retry", async () => {
    processPaymentConfirmation.mockRejectedValue(
      new Error("Pedido não encontrado para a transação informada."),
    );
    const db = fakeDb();
    const result = await processStoredSyncPayWebhook(db.client as never, retryableEvent() as never);

    expect(result).toMatchObject({ ok: true, retryable: true });
    expect(db.current()).toMatchObject({
      processing_status: "pending",
      attempts: 1,
      processed_at: null,
    });
  });

  it("processes the same stored event after the order link becomes available", async () => {
    processPaymentConfirmation.mockResolvedValue({
      ok: true,
      orderId: "order-1",
      status: "paid",
      gatewayStatus: "PAID_OUT",
      transitionedToPaid: true,
      alreadyPaid: false,
    });
    const db = fakeDb({ ...retryableEvent(), attempts: 1 });
    const result = await processStoredSyncPayWebhook(
      db.client as never,
      { ...retryableEvent(), attempts: 1 } as never,
    );

    expect(result).toMatchObject({ ok: true });
    expect(db.current()).toMatchObject({
      processing_status: "processed",
      attempts: 2,
      error_message: null,
      gateway_status: "PAID_OUT",
    });
  });
});
