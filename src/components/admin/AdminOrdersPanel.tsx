import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  auditPendingSyncPayBatchAsAdmin,
  getPendingSyncPayAuditCheckpointAsAdmin,
  reconcilePendingPaymentsAsAdmin,
  updateOrderStatus,
} from "@/lib/admin-orders.functions";
import { formatBrazilPhone } from "@/lib/phone";
import { RouteLoadingOverlay } from "@/components/ui/RouteLoadingOverlay";

const STATUSES = ["pending", "paid", "failed", "cancelled", "refunded", "chargeback"] as const;
type Status = (typeof STATUSES)[number];

type Order = {
  id: string;
  customer_id: string | null;
  transaction_identifier: string | null;
  total_amount: number;
  payment_method: string | null;
  payment_status: Status;
  created_at: string;
  paid_at: string | null;
  customers?: { name: string; phone: string | null } | null;
};

export function AdminOrdersPanel() {
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState<"dry" | "full_dry" | "live" | null>(null);
  const [reconciliationSummary, setReconciliationSummary] = useState<string | null>(null);
  const updateStatus = useServerFn(updateOrderStatus);
  const reconcilePending = useServerFn(reconcilePendingPaymentsAsAdmin);
  const auditPendingBatch = useServerFn(auditPendingSyncPayBatchAsAdmin);
  const getAuditCheckpoint = useServerFn(getPendingSyncPayAuditCheckpointAsAdmin);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("*, customers(name,phone)")
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data ?? []) as unknown as Order[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(id: string, status: Status) {
    setUpdating(id);
    try {
      await updateStatus({ data: { orderId: id, status } });
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, payment_status: status } : row)),
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "Falha ao atualizar");
    } finally {
      setUpdating(null);
    }
  }

  async function reconcile(dryRun: boolean) {
    setReconciling(dryRun ? "dry" : "live");
    setReconciliationSummary(null);
    try {
      const result = await reconcilePending({ data: { dryRun, limit: 10 } });
      setReconciliationSummary(
        `${dryRun ? "Auditoria" : "Processamento"}: ${result.audited} consultados, ${result.paidAtProvider} pagos na SyncPay, ${result.recovered} recuperados, ${result.errors} erros.`,
      );
      if (!dryRun) await load();
    } catch (error) {
      setReconciliationSummary(
        error instanceof Error ? error.message : "Falha ao verificar pagamentos pendentes.",
      );
    } finally {
      setReconciling(null);
    }
  }

  async function auditAllPending() {
    setReconciling("full_dry");
    setReconciliationSummary(null);
    const checkpoint = await getAuditCheckpoint();
    const cutoffCreatedAt = checkpoint?.cutoffCreatedAt ?? new Date().toISOString();
    let cursorId: string | null = null;
    if (checkpoint) cursorId = checkpoint.nextCursorId;
    let concurrency = checkpoint?.totals.rateLimited ? 1 : 6;
    let snapshotPending = checkpoint?.snapshotPending ?? 0;
    const totals = {
      audited: checkpoint?.totals.audited ?? 0,
      pendingReal: checkpoint?.totals.pendingReal ?? 0,
      completed: checkpoint?.totals.completed ?? 0,
      paidOut: checkpoint?.totals.paidOut ?? 0,
      notFound: checkpoint?.totals.notFound ?? 0,
      apiErrors: checkpoint?.totals.apiErrors ?? 0,
      unauthorized: checkpoint?.totals.unauthorized ?? 0,
      rateLimited: checkpoint?.totals.rateLimited ?? 0,
      amountMismatch: checkpoint?.totals.amountMismatch ?? 0,
      transactionMismatch: checkpoint?.totals.transactionMismatch ?? 0,
      otherInconsistencies: checkpoint?.totals.otherInconsistencies ?? 0,
      recoverable: checkpoint?.totals.recoverable ?? 0,
    };
    try {
      do {
        let result: Awaited<ReturnType<typeof auditPendingBatch>> | null = null;
        for (let attempt = 0; attempt < 3 && !result; attempt += 1) {
          try {
            result = await auditPendingBatch({
              data: { cutoffCreatedAt, cursorId, limit: 25, concurrency },
            });
          } catch (error) {
            if (attempt === 2) throw error;
            await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
          }
        }
        if (!result) throw new Error("Lote não retornou resultado.");
        if (snapshotPending === 0) snapshotPending = result.eligiblePending;
        totals.audited += result.audited;
        totals.pendingReal += result.pendingReal;
        totals.completed += result.completed;
        totals.paidOut += result.paidOut;
        totals.notFound += result.notFound;
        totals.apiErrors += result.apiErrors;
        totals.unauthorized += result.unauthorized;
        totals.rateLimited += result.rateLimited;
        totals.amountMismatch += result.amountMismatch;
        totals.transactionMismatch += result.transactionMismatch;
        totals.otherInconsistencies += result.otherInconsistencies;
        totals.recoverable += result.recoverable.length;
        setReconciliationSummary(
          `Auditoria read-only em andamento: ${totals.audited}/${snapshotPending} analisados; ${totals.recoverable} recuperáveis; ${totals.apiErrors} erros de API.`,
        );
        if (result.unauthorized === result.audited && result.audited > 0) {
          throw new Error("A SyncPay recusou todas as consultas do lote; auditoria interrompida.");
        }
        if (result.rateLimited > 0) {
          concurrency = Math.max(1, Math.floor(concurrency / 2));
          await new Promise((resolve) => setTimeout(resolve, 3_000));
        }
        cursorId = result.nextCursorId;
      } while (cursorId);
      const resolvedDuringAudit = Math.max(0, snapshotPending - totals.audited);
      setReconciliationSummary(
        `DRY-RUN CONCLUÍDO — snapshot ${snapshotPending}; analisados ${totals.audited}; pending real ${totals.pendingReal}; completed ${totals.completed}; PAID_OUT ${totals.paidOut}; não encontrados ${totals.notFound}; erros API ${totals.apiErrors}; valor divergente ${totals.amountMismatch}; ID divergente ${totals.transactionMismatch}; outras inconsistências ${totals.otherInconsistencies}; recuperáveis ${totals.recoverable}; resolvidos durante auditoria ${resolvedDuringAudit}.`,
      );
    } catch (error) {
      setReconciliationSummary(
        `Auditoria interrompida após ${totals.audited} pedidos: ${error instanceof Error ? error.message : "falha desconhecida"}`,
      );
    } finally {
      setReconciling(null);
    }
  }

  if (loading) {
    return <RouteLoadingOverlay />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={reconciling !== null}
          onClick={auditAllPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold disabled:opacity-50"
        >
          {reconciling === "full_dry" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Auditar todos (read-only)
        </button>
        <button
          type="button"
          disabled={reconciling !== null}
          onClick={() => reconcile(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold disabled:opacity-50"
        >
          {reconciling === "dry" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Auditar pendentes
        </button>
        <button
          type="button"
          disabled={reconciling !== null}
          onClick={() => reconcile(false)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {reconciling === "live" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Verificar pagamentos pendentes
        </button>
        {reconciliationSummary ? (
          <p className="text-xs text-muted-foreground">{reconciliationSummary}</p>
        ) : null}
      </div>
      <div className="card-premium overflow-x-auto rounded-2xl">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Comprador</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Transação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => (
              <tr key={order.id} className="border-t border-border">
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3 font-semibold">
                  {order.customers?.name ??
                    order.customer_id?.slice(0, 8) ??
                    "Cliente não vinculado"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {order.customers?.phone ? formatBrazilPhone(order.customers.phone) : "—"}
                </td>
                <td className="px-4 py-3">R$ {Number(order.total_amount).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={badgeClass(order.payment_status)}>{order.payment_status}</span>
                    <select
                      value={order.payment_status}
                      disabled={updating === order.id}
                      onChange={(event) => changeStatus(order.id, event.target.value as Status)}
                      className="min-h-11 rounded-lg border border-border bg-input px-2 py-1 text-xs"
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    {updating === order.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {order.transaction_identifier ?? "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Nenhuma compra registrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function badgeClass(status: string) {
  const base = "rounded-full px-2 py-1 text-xs font-bold";
  if (status === "paid") return `${base} bg-emerald-500/15 text-emerald-400`;
  if (status === "pending") return `${base} bg-amber-500/15 text-amber-400`;
  if (status === "refunded" || status === "chargeback") {
    return `${base} bg-destructive/20 text-destructive`;
  }
  return `${base} bg-muted text-muted-foreground`;
}
