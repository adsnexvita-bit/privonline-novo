import { createFileRoute } from "@tanstack/react-router";
import { reconcileRecentPayments } from "@/lib/payment-reconciliation.server";

function authorized(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const accepted = [
    process.env.PAYMENT_RECONCILIATION_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter(Boolean);
  return Boolean(supplied && accepted.includes(supplied));
}

async function run(request: Request, requestedDryRun: boolean) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const url = new URL(request.url);
  const scheduled = url.searchParams.get("scheduled") === "1";
  const hours = Number(url.searchParams.get("hours") ?? 24 * 365);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  let dryRun = requestedDryRun;

  if (scheduled) {
    // Cron is always live. GET remains the authenticated manual dry-run.
    dryRun = false;
  }

  const result = await reconcileRecentPayments(supabaseAdmin, {
    dryRun,
    hours,
    limit,
  });

  if (scheduled) {
    const { error: auditError } = await supabaseAdmin.from("admin_audit_logs").insert({
      action: dryRun ? "payment.reconciliation.dry_run" : "payment.reconciliation.run",
      entity_type: "payment_reconciliation",
      details: { dryRun, hours, limit, ...result },
    });
    if (auditError) throw auditError;
  }
  return Response.json({ ok: result.errors === 0, dryRun, ...result });
}

export const Route = createFileRoute("/api/internal/reconcile-payments")({
  server: {
    handlers: {
      GET: ({ request }) => run(request, true),
      POST: ({ request }) => run(request, false),
    },
  },
});
