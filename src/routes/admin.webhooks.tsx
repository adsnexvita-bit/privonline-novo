import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCcw, ChevronDown, ChevronUp } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { RouteLoadingOverlay } from "@/components/ui/RouteLoadingOverlay";
import { supabase } from "@/integrations/supabase/client";
import { reprocessWebhook } from "@/lib/admin-orders.functions";

export const Route = createFileRoute("/admin/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhooks — Privadinhos Online Admin" },
      { name: "description", content: "Eventos recebidos via webhook." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminLayout title="Webhooks" subtitle="Eventos externos recebidos e status de processamento.">
      {() => <WebhookBody />}
    </AdminLayout>
  ),
});

function WebhookBody() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const reprocess = useServerFn(reprocessWebhook);

  async function reload() {
    setLoading(true);
    const { data } = await supabase
      .from("webhook_events")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(200);
    setRows((data ?? []) as Record<string, unknown>[]);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  function toggle(id: string) {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function onReprocess(id: string) {
    setBusy(id);
    try {
      await reprocess({ data: { eventId: id } });
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha ao reprocessar");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <RouteLoadingOverlay />;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Nenhum webhook recebido ainda.</p>;

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const id = String(r.id);
        const status = String(r.processing_status ?? "—");
        const isOpen = open.has(id);
        return (
          <div key={id} className="card-premium rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold">
                  {String(r.provider)} · {String(r.event_type)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {r.received_at ? new Date(String(r.received_at)).toLocaleString("pt-BR") : "—"}
                </p>
                <p className="mt-1 truncate text-[11px] font-mono text-muted-foreground">
                  {String(r.transaction_identifier ?? r.external_event_id ?? "—")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    status === "processed"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : status === "failed"
                        ? "bg-destructive/20 text-destructive"
                        : status === "ignored"
                          ? "bg-muted text-muted-foreground"
                          : "bg-amber-500/15 text-amber-400"
                  }`}
                >
                  {status}
                </span>
                <button
                  onClick={() => onReprocess(id)}
                  disabled={busy === id}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold hover:border-primary disabled:opacity-50"
                >
                  {busy === id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5" />
                  )}
                  Reprocessar
                </button>
                <button
                  onClick={() => toggle(id)}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                  aria-label={isOpen ? "Esconder payload" : "Ver payload"}
                >
                  {isOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
            {r.error_message ? (
              <p className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                {String(r.error_message)}
              </p>
            ) : null}
            {isOpen && (
              <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-background p-3 text-[10px] leading-relaxed text-muted-foreground">
                {JSON.stringify(r.payload ?? {}, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
