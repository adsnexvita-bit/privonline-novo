import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ActiveUserPeak = {
  day: string;
  peakUsers: number;
};

type PresenceAdminClient = {
  from: (table: "anonymous_presence_pulses") => {
    select: (columns: "bucket_at") => {
      gte: (
        column: "bucket_at",
        value: string,
      ) => {
        order: (
          column: "bucket_at",
          options: { ascending: boolean },
        ) => {
          limit: (count: number) => Promise<{
            data: Array<{ bucket_at: string }> | null;
            error: Error | null;
          }>;
        };
      };
    };
  };
};

function startOfLocalDay(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .split("-");

  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

export const getAdminActiveUserPeaks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { days?: unknown }) => {
    const parsed = Number(raw?.days ?? 7);
    const days = Number.isFinite(parsed) ? Math.trunc(parsed) : 7;
    return { days: Math.min(Math.max(days, 1), 90) };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const presenceClient = supabaseAdmin as unknown as PresenceAdminClient;
    const { data: pulses, error } = await presenceClient
      .from("anonymous_presence_pulses")
      .select("bucket_at")
      .gte("bucket_at", since)
      .order("bucket_at", { ascending: true })
      .limit(50_000);

    if (error) throw error;

    const byDayAndBucket = new Map<string, Map<string, number>>();
    for (const pulse of pulses ?? []) {
      const bucket = pulse.bucket_at;
      const day = startOfLocalDay(new Date(bucket), "America/Sao_Paulo");
      const buckets = byDayAndBucket.get(day) ?? new Map<string, number>();
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
      byDayAndBucket.set(day, buckets);
    }

    const result: ActiveUserPeak[] = [];
    for (const [day, buckets] of byDayAndBucket) {
      result.push({
        day,
        peakUsers: Math.max(0, ...buckets.values()),
      });
    }

    return result.sort((a, b) => a.day.localeCompare(b.day));
  });
