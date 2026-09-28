import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CategoryIcon } from "@/components/CategoryIcon";
import { PageShell } from "@/components/PageShell";
import { ModelCard } from "@/components/ModelCard";
import { listPublicCategories } from "@/lib/categories";
import { parseCategoryColor } from "@/lib/category-color";

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["public", "categories"],
      queryFn: listPublicCategories,
      staleTime: 10 * 60 * 1000,
    }),
  head: () => ({
    meta: [
      { title: "Privadinhos Online" },
      {
        name: "description",
        content: "Explore categorias e libere galerias completas com pagamento único via Pix.",
      },
      { property: "og:title", content: "Privadinhos Online" },
      {
        property: "og:description",
        content: "Explore categorias e libere galerias completas com pagamento único via Pix.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const categories = useQuery({
    queryKey: ["public", "categories"],
    queryFn: listPublicCategories,
    staleTime: 10 * 60 * 1000,
  });
  return (
    <PageShell hideFooter>
      {categories.isPending ? (
        <LoadingGrid />
      ) : categories.data?.length ? (
        <div className="space-y-10 sm:space-y-12">
          {categories.data.map((category, categoryIndex) => {
            const color = parseCategoryColor(category.color);
            return (
              <section
                key={category.id}
                id={category.slug}
                className="scroll-mt-28"
                style={
                  categoryIndex > 0
                    ? { contentVisibility: "auto", containIntrinsicSize: "720px" }
                    : undefined
                }
              >
                <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
                  <span
                    className="grid shrink-0 place-items-center"
                    style={{
                      color: color.primary,
                    }}
                  >
                    <CategoryIcon
                      name={category.icon_name}
                      path={category.icon_path}
                      className="h-7 w-7 sm:h-8 sm:w-8"
                    />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold leading-tight tracking-[-0.025em] text-foreground sm:text-2xl">
                      {category.name}
                    </h2>
                    {category.description ? (
                      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                        {category.description}
                      </p>
                    ) : null}
                  </div>
                </div>
                {category.models.length ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {category.models.map(({ model }, index) => (
                      <ModelCard
                        key={model.id}
                        model={model}
                        index={index}
                        priority={categoryIndex === 0 && index < 2}
                        variant="home"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-white p-8 text-center text-sm text-muted-foreground">
                    Novos perfis serão adicionados em breve.
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-white p-10 text-center text-sm text-muted-foreground">
          As categorias de modelos estão sendo organizadas.
        </div>
      )}
    </PageShell>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="h-40 animate-pulse bg-surface-elevated" />
          <div className="space-y-3 px-5 pb-5 pt-10">
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-elevated" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-elevated" />
            <div className="h-11 animate-pulse rounded-xl bg-surface-elevated" />
          </div>
        </div>
      ))}
    </div>
  );
}
