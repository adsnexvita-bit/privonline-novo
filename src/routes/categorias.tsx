import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Tags } from "lucide-react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { PageShell } from "@/components/PageShell";
import { listPublicCategories } from "@/lib/categories";
import { categoryGradient, parseCategoryColor } from "@/lib/category-color";

export const Route = createFileRoute("/categorias")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["public", "categories"],
      queryFn: listPublicCategories,
      staleTime: 10 * 60 * 1000,
    }),
  head: () => ({
    meta: [
      { title: "Categorias — Privadinhos Online" },
      {
        name: "description",
        content: "Explore todas as categorias disponíveis na Privadinhos Online.",
      },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const categories = useQuery({
    queryKey: ["public", "categories"],
    queryFn: listPublicCategories,
    staleTime: 10 * 60 * 1000,
  });

  return (
    <PageShell>
      <header className="mb-8 border-b border-border pb-6 text-left">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Tags className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Categorias</h1>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Encontre rapidamente o tipo de galeria que deseja explorar.
        </p>
      </header>

      {categories.isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-xl border border-border bg-surface"
            />
          ))}
        </div>
      ) : categories.data?.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.data.map((category) => {
            const color = parseCategoryColor(category.color);
            return (
              <Link
                key={category.id}
                to="/"
                hash={category.slug}
                className="group flex min-h-24 items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-card transition duration-200 hover:border-primary/35"
              >
                <span
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
                  style={{
                    color: "#fff",
                    background: categoryGradient(color),
                    border: `1px solid ${color.primary}70`,
                  }}
                >
                  <CategoryIcon
                    name={category.icon_name}
                    path={category.icon_path}
                    className="h-7 w-7"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{category.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {category.models.length} {category.models.length === 1 ? "perfil" : "perfis"}
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhuma categoria disponível no momento.
        </div>
      )}
    </PageShell>
  );
}
