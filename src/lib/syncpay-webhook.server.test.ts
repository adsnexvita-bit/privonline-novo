import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeSyncPayCashInPayload,
  parseSyncPayWebhook,
  validateSyncPayWebhookAuthorization,
} from "./syncpay-webhook.server";
import { mapSyncPayStatus } from "./syncpay.server";

const previousWebhookToken = process.env.SYNC_PAY_WEBHOOK_BEARER_TOKEN;

afterEach(() => {
  if (previousWebhookToken === undefined) delete process.env.SYNC_PAY_WEBHOOK_BEARER_TOKEN;
  else process.env.SYNC_PAY_WEBHOOK_BEARER_TOKEN = previousWebhookToken;
});

describe("SyncPay webhook contract", () => {
  it("accepts the documented cashin.update payload", () => {
    const headers = new Headers({ event: "cashin.update" });
    const parsed = parseSyncPayWebhook(headers, {
      data: {
        id: "9f2a58ed-028b-4636-bda1-b366ca4913ff",
        amount: 10,
        status: "completed",
        payment_method: "PIX",
        updated_at: "2026-08-19 12:00:00",
      },
    });
    expect(parsed.transactionId).toBe("9f2a58ed-028b-4636-bda1-b366ca4913ff");
    expect(parsed.externalEventId).toContain(":cashin.update:");
  });

  it("accepts the current documented cashin.created payload without a data envelope", () => {
    const parsed = parseSyncPayWebhook(new Headers({ event: "cashin.created" }), {
      id: "9f2a58ed-028b-4636-bda1-b366ca4913ff",
      amount: "10.00",
      status: "pending",
      payment_method: "PIX",
      created_at: "2026-08-19T12:00:00.000000Z",
      updated_at: "2026-08-19T12:00:00.000000Z",
    });

    expect(parsed.transactionId).toBe("9f2a58ed-028b-4636-bda1-b366ca4913ff");
    expect(parsed.normalizedEventType).toBe("created");
  });

  it("accepts the current documented cashin.updated payload without a data envelope", () => {
    const parsed = parseSyncPayWebhook(new Headers({ event: "cashin.updated" }), {
      id: "9f2a58ed-028b-4636-bda1-b366ca4913ff",
      amount: "10.00",
      status: "completed",
      payment_method: "PIX",
      created_at: "2026-08-19T12:00:00.000000Z",
      updated_at: "2026-08-19T12:01:00.000000Z",
    });

    expect(parsed.transactionId).toBe("9f2a58ed-028b-4636-bda1-b366ca4913ff");
    expect(parsed.gatewayStatus).toBe("completed");
  });

  it("does not use undocumented identifier aliases as a transaction id", () => {
    const parsed = parseSyncPayWebhook(new Headers({ event: "cashin.update" }), {
      data: { identifier: "legacy", amount: 10, status: "completed", payment_method: "PIX" },
    });
    expect(parsed.transactionId).toBeNull();
    expect(parsed.externalEventId).toBeNull();
  });

  it("normalizes legacy and current deliveries of the same transaction to the same lookup id", () => {
    const headers = new Headers({ event: "cashin.updated" });
    const legacy = parseSyncPayWebhook(headers, {
      data: {
        id: "9f2a58ed-028b-4636-bda1-b366ca4913ff",
        amount: 10,
        status: "completed",
        payment_method: "PIX",
      },
    });
    const current = parseSyncPayWebhook(headers, {
      id: "9f2a58ed-028b-4636-bda1-b366ca4913ff",
      amount: 10,
      status: "completed",
      payment_method: "PIX",
    });

    expect(current.transactionId).toBe(legacy.transactionId);
    expect(current.externalEventId).toBe(legacy.externalEventId);
  });

  it("rejects a malformed legacy envelope instead of falling back to root fields", () => {
    expect(() =>
      normalizeSyncPayCashInPayload({
        data: null,
        id: "9f2a58ed-028b-4636-bda1-b366ca4913ff",
        amount: 10,
        status: "completed",
        payment_method: "PIX",
      }),
    ).toThrow();
  });

  it.each([
    ["cashin.create", "created"],
    ["cashin.created", "created"],
    ["cashin.update", "updated"],
    ["cashin.updated", "updated"],
  ] as const)("accepts and normalizes %s", (eventType, normalized) => {
    const parsed = parseSyncPayWebhook(new Headers({ event: eventType }), {
      data: {
        id: "9f2a58ed-028b-4636-bda1-b366ca4913ff",
        amount: 10,
        status: "pending",
        payment_method: "PIX",
        updated_at: "2026-08-19 12:00:00",
      },
    });
    expect(parsed.eventType).toBe(eventType);
    expect(parsed.normalizedEventType).toBe(normalized);
  });

  it("accepts the observed PAID_OUT gateway status without trusting it as proof", () => {
    const parsed = parseSyncPayWebhook(new Headers({ event: "cashin.update" }), {
      data: {
        id: "9f2a58ed-028b-4636-bda1-b366ca4913ff",
        amount: 10,
        status: "PAID_OUT",
        payment_method: "PIX",
      },
    });
    expect(parsed.gatewayStatus).toBe("paid_out");
  });

  it.each(["completed", "PAID_OUT"])("maps the confirmed status %s to paid", (status) => {
    expect(mapSyncPayStatus(status)).toBe("paid");
  });

  it.each(["paid", "approved", "succeeded"])(
    "does not treat the undocumented alias %s as paid",
    (status) => {
      expect(mapSyncPayStatus(status)).toBeNull();
    },
  );

  it("accepts only the configured bearer token", () => {
    process.env.SYNC_PAY_WEBHOOK_BEARER_TOKEN = "expected-secret";
    expect(() =>
      validateSyncPayWebhookAuthorization(new Headers({ authorization: "Bearer expected-secret" })),
    ).not.toThrow();
  });

  it("rejects an invalid bearer token", () => {
    process.env.SYNC_PAY_WEBHOOK_BEARER_TOKEN = "expected-secret";
    expect(() =>
      validateSyncPayWebhookAuthorization(new Headers({ authorization: "Bearer wrong-secret" })),
    ).toThrow();
  });

  it("fails closed when the required bearer token is not configured", () => {
    delete process.env.SYNC_PAY_WEBHOOK_BEARER_TOKEN;
    expect(() =>
      validateSyncPayWebhookAuthorization(new Headers({ authorization: "Bearer any-value" })),
    ).toThrow();
  });
});
