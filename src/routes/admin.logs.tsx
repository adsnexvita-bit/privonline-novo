import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { RouteLoadingOverlay } from "@/components/ui/RouteLoadingOverlay";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/logs")({
  head: () => ({
    meta: [
      { title: "Logs — Privadinhos Online Admin" },
      { name: "description", content: "Logs de ações administrativas." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminLayout title="Logs" subtitle="Histórico de ações administrativas.">
      {() => <LogsBody />}
    </AdminLayout>
  ),
});

type Log = {
  id: string;
  admin_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  admin_users?: { name: string; email: string };
};

function LogsBody() {
  const [rows, setRows] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("admin_audit_logs")
        .select("*, admin_users(name,email)")
        .order("created_at", { ascending: false })
        .limit(500);
      setRows((data ?? []) as unknown as Log[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <RouteLoadingOverlay />;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>;

  return (
    <div className="card-premium overflow-x-auto rounded-2xl">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Quando</th>
            <th className="px-4 py-3">Admin</th>
            <th className="px-4 py-3">Ação</th>
            <th className="px-4 py-3">Entidade</th>
            <th className="px-4 py-3">Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border align-top">
              <td className="px-4 py-3 text-[11px] text-muted-foreground">
                {new Date(r.created_at).toLocaleString("pt-BR")}
              </td>
              <td className="px-4 py-3 text-xs">{r.admin_users?.name ?? r.admin_user_id ?? "—"}</td>
              <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {r.entity_type} {r.entity_id ? `· ${r.entity_id.slice(0, 8)}` : ""}
              </td>
              <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                {r.details ? JSON.stringify(r.details) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
