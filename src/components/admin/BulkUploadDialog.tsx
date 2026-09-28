import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileImage, FileVideo, Loader2, Plus, RefreshCw, Trash2, UploadCloud, X } from "lucide-react";

type UploadState = "queued" | "uploading" | "success" | "error";
type QueueItem = { id: string; file: File; state: UploadState; error?: string };

type BulkUploadDialogProps = {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  accept: string;
  title?: string;
  helper?: string;
  multiple?: boolean;
};

function createId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível enviar este arquivo.";
}

export function BulkUploadDialog({
  open,
  onClose,
  onUpload,
  accept,
  title = "Enviar arquivos",
  helper = "JPG, PNG, WEBP, GIF, MP4 ou WEBM",
  multiple = true,
}: BulkUploadDialogProps) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const isProcessing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<QueueItem[]>([]);

  useEffect(() => { itemsRef.current = items; }, [items]);

  const processQueue = async () => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    try {
      while (true) {
        const next = itemsRef.current.find((item) => item.state === "queued");
        if (!next) break;
        setItems((current) => current.map((item) => item.id === next.id ? { ...item, state: "uploading", error: undefined } : item));
        try {
          await onUpload(next.file);
          setItems((current) => current.map((item) => item.id === next.id ? { ...item, state: "success" } : item));
        } catch (error) {
          setItems((current) => current.map((item) => item.id === next.id ? { ...item, state: "error", error: errorText(error) } : item));
        }
      }
    } finally {
      isProcessing.current = false;
      if (itemsRef.current.some((item) => item.state === "queued")) void processQueue();
    }
  };

  const addFiles = (files: FileList | File[] | null) => {
    const incoming = files ? Array.from(files) : [];
    if (!incoming.length) return;
    const next = multiple ? incoming : incoming.slice(0, 1);
    setItems((current) => {
      const known = new Set(current.map((item) => `${item.file.name}-${item.file.size}-${item.file.lastModified}`));
      const additions = next
        .filter((file) => !known.has(`${file.name}-${file.size}-${file.lastModified}`))
        .map((file) => ({ id: createId(file), file, state: "queued" as const }));
      return multiple ? [...current, ...additions] : additions;
    });
    window.setTimeout(() => void processQueue(), 0);
  };

  if (!open) return null;
  const active = items.some((item) => item.state === "uploading" || item.state === "queued");
  const complete = items.filter((item) => item.state === "success").length;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-foreground/45 p-4 backdrop-blur-sm" role="presentation">
      <section className="max-h-[min(760px,calc(100vh-2rem))] w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl" role="dialog" aria-modal="true" aria-label={title}>
        <header className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-black tracking-tight">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Adicione arquivos a qualquer momento — a fila continua enviando.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Fechar upload">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="space-y-4 overflow-y-auto p-5 sm:p-6">
          <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
            className={`flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed px-5 text-center transition ${dragging ? "border-primary bg-primary/10" : "border-border bg-muted/35"}`}
          >
            <UploadCloud className="h-8 w-8 text-primary" />
            <p className="mt-3 text-sm font-black">Arraste seus arquivos aqui</p>
            <p className="mt-1 text-xs text-muted-foreground">ou clique no botão para selecionar</p>
            <span className="mt-3 text-[11px] font-semibold text-muted-foreground">{helper}</span>
            <button type="button" onClick={() => inputRef.current?.click()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-bold transition hover:border-primary/45 hover:text-primary">
              <Plus className="h-4 w-4" /> Selecionar arquivos
            </button>
            <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} />
          </div>

          {items.length ? (
            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="flex items-center justify-between border-b border-border bg-muted/35 px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                <span>{active ? "Enviando em segundo plano" : `${complete} arquivo(s) concluído(s)`}</span>
                <button type="button" onClick={() => inputRef.current?.click()} className="font-bold text-primary hover:underline">Adicionar mais</button>
              </div>
              <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    {item.file.type.startsWith("video/") ? <FileVideo className="h-5 w-5 shrink-0 text-primary" /> : <FileImage className="h-5 w-5 shrink-0 text-primary" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{item.file.name}</p>
                      <p className={`mt-0.5 text-xs ${item.state === "error" ? "text-destructive" : "text-muted-foreground"}`}>{item.state === "uploading" ? "Enviando…" : item.state === "queued" ? "Na fila" : item.state === "success" ? "Concluído" : item.error}</p>
                    </div>
                    {item.state === "uploading" ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : item.state === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : item.state === "error" ? <button type="button" onClick={() => { setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, state: "queued", error: undefined } : entry)); window.setTimeout(() => void processQueue(), 0); }} className="rounded-lg p-2 text-primary hover:bg-primary/10" aria-label="Tentar novamente"><RefreshCw className="h-4 w-4" /></button> : <button type="button" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remover da fila"><Trash2 className="h-4 w-4" /></button>}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
