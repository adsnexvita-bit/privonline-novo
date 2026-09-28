import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { getPublicModelBySlug } from "@/lib/models";

export const Route = createFileRoute("/modelo/$slug")({
  loader: async ({ params, context }) => {
    const model = await context.queryClient.fetchQuery({
      queryKey: ["public-model", params.slug],
      queryFn: () => getPublicModelBySlug(params.slug),
      staleTime: 10 * 60 * 1000,
    });

    if (!model) throw notFound();

    throw redirect({
      to: "/$username",
      params: { username: model.username },
      replace: true,
    });
  },
});
