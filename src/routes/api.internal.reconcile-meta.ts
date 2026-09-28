import { createFileRoute } from "@tanstack/react-router";
import { reconcileMetaPurchases } from "@/lib/meta-reconciliation.server";

function authorized(request: Request) {
  const expected = process.env.META_RECONCILIATION_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(expected && supplied && supplied === expected);
}

async function run(request: Request, dryRun: boolean) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const url = new URL(request.url);
  const result = await reconcileMetaPurchases(supabaseAdmin, {
    dryRun,
    hours: Number(url.searchParams.get("hours") ?? 36),
    limit: Number(url.searchParams.get("limit") ?? 100),
  });
  return Response.json({ ok: result.errors === 0, ...result });
}

export const Route = createFileRoute("/api/internal/reconcile-meta")({
  server: { handlers: { GET: ({ request }) => run(request, true), POST: ({ request }) => run(request, false) } },
});
