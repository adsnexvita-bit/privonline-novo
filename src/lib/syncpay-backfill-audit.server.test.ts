import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const { verifyPixCharge } = vi.hoisted(() => ({
  verifyPixCharge: vi.fn(),
}));

vi.mock("./payment-provider.server", () => ({ verifyPixCharge }));

import {
  auditPendingSyncPayBatch,
  classifySyncPayAuditError,
  classifySyncPayAuditSuccess,
} from "./syncpay-backfill-audit.server";

function fakeDb() {
  const rows = [
    {
      id: "a",
      transaction_identifier: "txn-a",
      total_amount: 10,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "b",
      transaction_identifier: "txn-b",
      total_amount: 10,
      created_at: "2026-01-02T00:00:00Z",
    },
    {
      id: "c",
      transaction_identifier: "txn-c",
      total_amount: 10,
      created_at: "2026-01-03T00:00:00Z",
    },
  ];
  return {
    from: () => {
      let cursor: string | null = null;
      let limit = Number.POSITIVE_INFINITY;
      let head = false;
      const chain = {
        select: (_columns: string, options?: { head?: boolean }) => {
          head = Boolean(options?.head);
          return chain;
        },
        eq: () => chain,
        not: () => chain,
        lte: () => chain,
        order: () => chain,
        gt: (_field: string, value: string) => {
          cursor = value;
          return chain;
        },
        limit: (value: number) => {
          limit = value;
          return chain;
        },
        then: (resolve: (value: unknown) => void) => {
          if (head) return resolve({ count: rows.length, error: null });
          return resolve({
            data: rows.filter((row) => !cursor || row.id > cursor).slice(0, limit),
            error: null,
          });
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
}

describe("SyncPay historical dry-run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyPixCharge.mockResolvedValue({
      status: "pending",
      gatewayStatus: "pending",
      transactionDate: null,
    });
  });

  it("uses a stable cursor and never requests live processing", async () => {
    const first = await auditPendingSyncPayBatch(fakeDb(), {
      cutoffCreatedAt: "2026-08-20T00:00:00Z",
      limit: 2,
      concurrency: 2,
    });
    expect(first).toMatchObject({ audited: 2, nextCursorId: "b", pendingReal: 2 });
    expect(verifyPixCharge).toHaveBeenCalledTimes(2);
    expect(verifyPixCharge).toHaveBeenCalledWith("syncpay", "txn-a", 10);

    vi.clearAllMocks();
    verifyPixCharge.mockResolvedValue({
      status: "pending",
      gatewayStatus: "pending",
      transactionDate: null,
    });
    const second = await auditPendingSyncPayBatch(fakeDb(), {
      cutoffCreatedAt: "2026-08-20T00:00:00Z",
      cursorId: first.nextCursorId,
      limit: 2,
    });
    expect(second).toMatchObject({ audited: 1, nextCursorId: null, pendingReal: 1 });
    expect(verifyPixCharge).toHaveBeenCalledWith("syncpay", "txn-c", 10);
  });

  it.each([
    ["SyncPay (404): missing", "not_found"],
    ["SyncPay (401): unauthorized", "api_error"],
    ["SyncPay (429): slow down", "api_error"],
    ["SyncPay (500): unavailable", "api_error"],
    ["The operation timed out", "api_error"],
    ["O valor confirmado pela operadora é diferente do valor do pedido.", "amount_mismatch"],
    [
      "O identificador retornado pela SyncPay diverge da transação consultada.",
      "transaction_mismatch",
    ],
  ])("classifies %s", (message, classification) => {
    expect(classifySyncPayAuditError(new Error(message)).classification).toBe(classification);
  });

  it.each([
    ["pending", "pending", "pending_real"],
    ["paid", "completed", "completed"],
    ["paid", "PAID_OUT", "paid_out"],
  ])("classifies provider result %s/%s", (status, gatewayStatus, classification) => {
    expect(
      classifySyncPayAuditSuccess({
        status,
        gatewayStatus,
      }),
    ).toBe(classification);
  });
});
