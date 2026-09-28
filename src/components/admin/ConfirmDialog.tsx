import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const confirmAction = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setSubmitting(false);
      setPending({ ...options, resolve });
    });
  }, []);

  const close = useCallback((confirmed: boolean) => {
    setPending((current) => {
      current?.resolve(confirmed);
      return null;
    });
    setSubmitting(false);
  }, []);

  const confirmDialog = useMemo(() => {
    if (!pending) return null;

    return (
      <div
        className="fixed inset-0 z-[120] grid place-items-center bg-black/45 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) close(false);
        }}
      >
        <div className="w-full max-w-md rounded-[2rem] border border-border bg-card p-6 text-card-foreground shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <span
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                pending.destructive
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {pending.destructive ? (
                <Trash2 className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </span>
            <button
              type="button"
              disabled={submitting}
              onClick={() => close(false)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted disabled:opacity-50"
              aria-label="Cancelar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <h2 id="admin-confirm-title" className="mt-5 text-xl font-black">
            {pending.title}
          </h2>
          {pending.description ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {pending.description}
            </p>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => close(false)}
              className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-black transition hover:bg-muted disabled:opacity-50"
            >
              {pending.cancelText ?? "Cancelar"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setSubmitting(true);
                close(true);
              }}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white transition disabled:opacity-50 ${
                pending.destructive
                  ? "bg-destructive hover:bg-destructive/90"
                  : "bg-primary hover:bg-primary/90"
              }`}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending.confirmText ?? "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    );
  }, [close, pending, submitting]);

  return { confirmAction, confirmDialog };
}
