import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Lock, Flame, AlertTriangle, LogOut, IdCard } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { getSession, clearSession, type CpfSession } from "@/lib/session";
import { listMyAccesses, endPhoneSession } from "@/lib/access.functions";
import { resolveMediaUrl } from "@/lib/models";
import { ProgressiveImage } from "@/components/ProgressiveImage";
import { RouteLoadingOverlay } from "@/components/ui/RouteLoadingOverlay";

export const Route = createFileRoute("/minhas-modelos")({
  head: () => ({
    meta: [
      { title: "Minhas Galerias — Privadinhos Online" },
      {
        name: "description",
        content: "Acompanhe as galerias de criadores que você já adquiriu na Privadinhos Online.",
      },
      { property: "og:title", content: "Minhas Galerias — Privadinhos Online" },
      { property: "og:description", content: "Suas galerias adquiridas em um só lugar." },
    ],
  }),
  component: MinhasModelos,
});

function MinhasModelos() {
  const navigate = useNavigate();
  const fetchAccesses = useServerFn(listMyAccesses);
  const endSession = useServerFn(endPhoneSession);
  const [session, setSessionState] = useState<CpfSession | null>(() => getSession());

  useEffect(() => {
    const onChange = () => setSessionState(getSession());
    window.addEventListener("famaflix:session", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("famaflix:session", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const query = useQuery({
    queryKey: ["my-accesses", session?.token],
    queryFn: () => fetchAccesses({ data: { token: session!.token } }),
    enabled: !!session,
    retry: false,
  });

  async function onLogout() {
    const token = session?.token;
    clearSession();
    setSessionState(null);
    if (token) {
      try {
        await endSession({ data: { token } });
      } catch {
        // ignore
      }
    }
    navigate({ to: "/acesso" });
  }

  return (
    <PageShell>
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Minhas Galerias</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {session
              ? `Olá, ${session.name}. Suas galerias liberadas aparecem aqui.`
              : "Acesse com seu telefone para ver as galerias liberadas."}
          </p>
        </div>
        {session ? (
          <button
            onClick={onLogout}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 self-start rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:border-primary sm:self-auto"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        ) : null}
      </header>

      {!session ? (
        <NotLoggedIn />
      ) : query.isPending ? (
        <RouteLoadingOverlay />
      ) : query.isError ? (
        <ErrorBox
          message={query.error instanceof Error ? query.error.message : "Erro ao carregar"}
          onRetry={() => query.refetch()}
        />
      ) : query.data.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((a) => (
            <AccessCard key={a.accessId} item={a} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function AccessCard({ item }: { item: Awaited<ReturnType<typeof listMyAccesses>>[number] }) {
  const cover = resolveMediaUrl(item.model.cover_image_path, 0);
  const date = new Date(item.grantedAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return (
    <article className="card-premium overflow-hidden rounded-2xl">
      <div className="relative aspect-[3/4] w-full overflow-hidden">
        <ProgressiveImage
          src={cover}
          alt={item.model.name}
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="truncate text-lg font-bold text-foreground">{item.model.name}</h3>
          <p className="truncate text-xs text-muted-foreground">@{item.model.username}</p>
        </div>
      </div>
      <div className="p-4">
        <p className="text-xs text-muted-foreground">
          Liberado em <span className="font-semibold text-foreground">{date}</span>
        </p>
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-foreground">
              {item.model.photo_count + item.model.video_count}
            </span>{" "}
            conteúdos secretos
          </span>
        </div>
        <Link
          to="/$username"
          params={{ username: item.model.username }}
          className="btn-primary mt-4 flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-bold"
        >
          Acessar conteúdo
        </Link>
      </div>
    </article>
  );
}

function NotLoggedIn() {
  return (
    <div className="card-premium mx-auto max-w-lg rounded-3xl p-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <IdCard className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-xl font-bold">Entre na sua conta</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Suas galerias adquiridas ficam disponíveis após validar o telefone utilizado na compra.
      </p>
      <Link
        to="/acesso"
        className="btn-primary mt-6 inline-flex rounded-full px-5 py-2.5 text-sm font-bold"
      >
        Ir para Minha conta
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card-premium mx-auto max-w-lg rounded-3xl p-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Lock className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-xl font-bold">Nenhuma galeria adquirida ainda</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Explore a biblioteca e adquira acesso vitalício às galerias dos seus criadores favoritos.
      </p>
      <Link
        to="/biblioteca"
        className="btn-primary mt-6 inline-flex rounded-full px-5 py-2.5 text-sm font-bold"
      >
        Explorar biblioteca
      </Link>
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-3xl border border-destructive/40 bg-destructive/5 py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
      <h2 className="mt-4 text-xl font-bold">Não conseguimos carregar suas galerias</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <button
        onClick={onRetry}
        className="btn-primary mt-6 inline-flex rounded-full px-5 py-2.5 text-sm font-bold"
      >
        Tentar novamente
      </button>
    </div>
  );
}
