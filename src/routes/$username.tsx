import { createFileRoute, notFound } from "@tanstack/react-router";
import { ModelProfile } from "@/components/ModelProfile";
import { getPublicModelByUsername, resolveMediaUrl } from "@/lib/models";
import { isReservedModelUsername, normalizeModelUsername } from "@/lib/model-usernames";
import { publicUrl } from "@/lib/public-origin";

export const Route = createFileRoute("/$username")({
  loader: async ({ params, context }) => {
    const username = normalizeModelUsername(params.username);
    if (isReservedModelUsername(username)) throw notFound();

    const model = await context.queryClient.fetchQuery({
      queryKey: ["public-model-username", username],
      queryFn: () => getPublicModelByUsername(username),
      staleTime: 10 * 60 * 1000,
    });

    if (!model) throw notFound();
    return { model };
  },
  head: ({ loaderData }) => {
    const model = loaderData?.model;
    const coverPath = model?.profile_cover_image_path ?? model?.cover_image_path;
    const cover = coverPath ? resolveMediaUrl(coverPath) : null;
    const isAbsolute = cover && /^https?:\/\//i.test(cover);

    return {
      meta: [
        { title: model ? `${model.name} — Privadinhos Online` : "Criador — Privadinhos Online" },
        {
          name: "description",
          content:
            model?.short_description ??
            `Conheça o perfil de ${model?.name ?? "um criador"} na Privadinhos Online.`,
        },
        {
          property: "og:title",
          content: model ? `${model.name} — Privadinhos Online` : "Privadinhos Online",
        },
        ...(isAbsolute ? [{ property: "og:image", content: cover! }] : []),
      ],
      links: model
        ? [{ rel: "canonical", href: publicUrl(`/${encodeURIComponent(model.username)}`) }]
        : [],
    };
  },
  component: UsernameProfilePage,
});

function UsernameProfilePage() {
  const { model } = Route.useLoaderData();
  return <ModelProfile model={model} />;
}
