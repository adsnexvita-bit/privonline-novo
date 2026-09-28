import { createFileRoute, notFound } from "@tanstack/react-router";
import { ModelProfile } from "@/components/ModelProfile";
import { resolvePublicCampaignLink } from "@/lib/campaign-links.functions";
import { getPublicModelByUsername, resolveMediaUrl } from "@/lib/models";
import { publicUrl } from "@/lib/public-origin";

export const Route = createFileRoute("/c/$token")({
  loader: async ({ params, context }) => {
    let campaign;
    try {
      campaign = await resolvePublicCampaignLink({ data: { token: params.token } });
    } catch {
      throw notFound();
    }
    if (!campaign) throw notFound();

    const model = await context.queryClient.fetchQuery({
      queryKey: ["public-model-campaign", campaign.modelId],
      queryFn: () => getPublicModelByUsername(campaign.username),
      staleTime: 10 * 60 * 1000,
    });
    if (!model) throw notFound();
    return { model, gateway: campaign.provider };
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
        ...(isAbsolute ? [{ property: "og:image", content: cover! }] : []),
      ],
      links: model
        ? [{ rel: "canonical", href: publicUrl(`/${encodeURIComponent(model.username)}`) }]
        : [],
    };
  },
  component: CampaignProfilePage,
});

function CampaignProfilePage() {
  const { model, gateway } = Route.useLoaderData();
  return <ModelProfile model={model} forcedGateway={gateway} />;
}
