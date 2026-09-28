import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Search, ChevronLeft, ChevronRight, AlertTriangle, Frown } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { ModelCard } from "@/components/ModelCard";
import { listPublicModels, PAGE_SIZE, type SortOption } from "@/lib/models";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({
    meta: [
      { title: "Biblioteca — Privadinhos Online" },
      { name: "description", content: "Explore todos os criadores da Privadinhos Online." },
      { property: "og:title", content: "Biblioteca — Privadinhos Online" },
      { property: "og:description", content: "Explore todos os criadores da Privadinhos Online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Biblioteca,
});

function Biblioteca() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState<SortOption>("featured");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["public-models", { search, sort, page }],
    queryFn: () => listPublicModels({ search, sort, page }),
    placeholderData: keepPreviousData,
  });

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <PageShell>
      <header className="mb-6 border-b border-border pb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Biblioteca</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todo o portfólio de criadores disponíveis na plataforma.
        </p>
      </header>

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={submitSearch} className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nome ou usuário"
            className="min-h-12 w-full rounded-xl border border-border bg-surface py-3 pl-11 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </form>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as SortOption);
            setPage(1);
          }}
          className="min-h-12 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
        >
          <option value="featured">Destaques</option>
          <option value="newest">Mais recentes</option>
          <option value="price_asc">Menor preço</option>
          <option value="price_desc">Maior preço</option>
        </select>
      </div>

      {query.isPending ? (
        <LoadingGrid />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.data.rows.length === 0 ? (
        <EmptyState hasSearch={search.length > 0} />
      ) : (
        <>
          <div
            className={`grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5 ${
              query.isFetching ? "opacity-60 transition-opacity" : ""
            }`}
          >
            {query.data.rows.map((m, i) => (
              <ModelCard key={m.id} model={m} index={i} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="mt-10 grid grid-cols-2 items-center gap-2 sm:flex sm:justify-center">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
              <span className="col-span-2 row-start-1 text-center text-sm text-muted-foreground sm:order-none sm:col-auto sm:row-auto">
                Página <span className="font-bold text-foreground">{page}</span> de{" "}
                <span className="font-bold text-foreground">{totalPages}</span>
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </button>
            </nav>
          )}
        </>
      )}
    </PageShell>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="card-premium rounded-[22px] p-1.5 sm:rounded-[30px] sm:p-2">
          <div className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-surface-elevated sm:rounded-3xl" />
          <div className="mt-1.5 space-y-3 rounded-2xl border border-border bg-background/55 p-3 sm:mt-2 sm:rounded-3xl sm:p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-elevated" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-elevated" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface-elevated" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-surface/50 py-16 text-center">
      <Frown className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="mt-4 text-xl font-bold">Nenhum criador encontrado</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasSearch
          ? "Tente ajustar a busca ou o filtro de ordenação."
          : "Ainda não há criadores disponíveis. Volte em breve."}
      </p>
      <Link
        to="/biblioteca"
        className="btn-primary mt-6 inline-flex rounded-full px-5 py-2.5 text-sm font-bold"
      >
        Limpar filtros
      </Link>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-3xl border border-destructive/40 bg-destructive/5 py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
      <h2 className="mt-4 text-xl font-bold">Não conseguimos carregar a biblioteca</h2>
      <p className="mt-2 text-sm text-muted-foreground">Verifique sua conexão e tente novamente.</p>
      <button
        onClick={onRetry}
        className="btn-primary mt-6 inline-flex rounded-full px-5 py-2.5 text-sm font-bold"
      >
        Tentar novamente
      </button>
    </div>
  );
}
