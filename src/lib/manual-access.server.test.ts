import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { calculateAccessExpiry, grantManualPlanAccesses } from "./manual-access.server";

describe("manual plan access", () => {
  it("calculates timed and lifetime validity from the real plan duration", () => {
    const start = new Date("2026-08-19T12:00:00.000Z");
    expect(calculateAccessExpiry(start, 30)).toBe("2026-09-18T12:00:00.000Z");
    expect(calculateAccessExpiry(start, null)).toBeNull();
  });

  it("grants two models with independent plans and renews an existing access", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    const db = {
      from(table: string) {
        if (table === "plan_models") {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  {
                    model_id: "model-a",
                    plan_id: "plan-7",
                    plans: {
                      id: "plan-7",
                      name: "7 dias",
                      duration_days: 7,
                      is_active: true,
                    },
                  },
                  {
                    model_id: "model-b",
                    plan_id: "plan-life",
                    plans: {
                      id: "plan-life",
                      name: "Vitalício",
                      duration_days: null,
                      is_active: true,
                    },
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: async () => ({
                  data: [
                    {
                      id: "access-a",
                      model_id: "model-a",
                      access_status: "active",
                      granted_at: "2026-08-01T00:00:00.000Z",
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              updates.push(payload);
              return { error: null };
            },
          }),
          insert: async (payload: Record<string, unknown>) => {
            inserts.push(payload);
            return { error: null };
          },
        };
      },
    } as unknown as SupabaseClient<Database>;

    const granted = await grantManualPlanAccesses(db, "customer-1", [
      { modelId: "model-a", planId: "plan-7" },
      { modelId: "model-b", planId: "plan-life" },
    ]);

    expect(granted).toBe(2);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ plan_id: "plan-7", access_status: "active" });
    expect(new Date(String(updates[0].expires_at)).getTime()).toBeGreaterThan(Date.now());
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      customer_id: "customer-1",
      model_id: "model-b",
      plan_id: "plan-life",
      expires_at: null,
    });
  });

  it("rejects a plan that is not assigned to the selected model", async () => {
    const db = {
      from: () => ({
        select: () => ({ in: async () => ({ data: [], error: null }) }),
      }),
    } as unknown as SupabaseClient<Database>;
    await expect(
      grantManualPlanAccesses(db, "customer-1", [
        { modelId: "model-a", planId: "plan-from-another-model" },
      ]),
    ).rejects.toThrow("não está ativo para a modelo");
  });
});
