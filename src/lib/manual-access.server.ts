import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ManualAccessSelection = {
  modelId: string;
  planId: string;
};

export function calculateAccessExpiry(grantedAt: Date, durationDays: number | null) {
  return durationDays == null
    ? null
    : new Date(grantedAt.getTime() + durationDays * 86_400_000).toISOString();
}

export async function grantManualPlanAccesses(
  db: SupabaseClient<Database>,
  customerId: string,
  selections: ManualAccessSelection[],
) {
  const modelIds = selections.map((selection) => selection.modelId);
  const { data: assignments, error: assignmentError } = await db
    .from("plan_models")
    .select("model_id,plan_id,plans(id,name,duration_days,access_type,is_active)")
    .in("model_id", modelIds);
  if (assignmentError) throw assignmentError;

  const planByPair = new Map<string, { id: string; durationDays: number | null }>();
  for (const assignment of assignments ?? []) {
    const plan = assignment.plans as unknown as {
      id: string;
      duration_days: number | null;
      is_active: boolean;
    } | null;
    if (plan?.is_active) {
      planByPair.set(`${assignment.model_id}:${assignment.plan_id}`, {
        id: plan.id,
        durationDays: plan.duration_days == null ? null : Number(plan.duration_days),
      });
    }
  }

  for (const selection of selections) {
    if (!planByPair.has(`${selection.modelId}:${selection.planId}`)) {
      throw new Error("Um dos planos selecionados não está ativo para a modelo informada.");
    }
  }

  const { data: rows, error } = await db
    .from("customer_access")
    .select("id,model_id,access_status,granted_at")
    .eq("customer_id", customerId)
    .in("model_id", modelIds)
    .order("granted_at", { ascending: false });
  if (error) throw error;

  const grantedAt = new Date();
  let granted = 0;
  for (const selection of selections) {
    const plan = planByPair.get(`${selection.modelId}:${selection.planId}`)!;
    const matches = (rows ?? []).filter((row) => row.model_id === selection.modelId);
    const existing = matches.find((row) => row.access_status === "active") ?? matches[0];
    const payload: Database["public"]["Tables"]["customer_access"]["Update"] = {
      access_status: "active",
      order_id: null,
      plan_id: plan.id,
      expires_at: calculateAccessExpiry(grantedAt, plan.durationDays),
      revoked_at: null,
      revocation_reason: null,
      granted_at: grantedAt.toISOString(),
    };
    const result = existing
      ? await db.from("customer_access").update(payload).eq("id", existing.id)
      : await db.from("customer_access").insert({
          customer_id: customerId,
          model_id: selection.modelId,
          ...payload,
        });
    if (result.error) throw result.error;
    granted += 1;
  }
  return granted;
}
