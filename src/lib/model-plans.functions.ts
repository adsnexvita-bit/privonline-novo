import { createServerFn } from "@tanstack/react-start";

export type PublicPlan = {
  id: string;
  promotionId: string | null;
  offerId: string | null;
  name: string;
  description: string | null;
  urgencyText: string | null;
  complementaryText: string | null;
  price: number;
  originalPrice: number | null;
  ctaText: string | null;
  startsAt: string | null;
  endsAt: string | null;
  showCountdown: boolean;
  accessType: "lifetime" | "subscription";
  durationDays: number | null;
  isFeatured: boolean;
  isHighlighted: boolean;
  buttonColor: string | null;
  eyebrowText: string | null;
  promoTagText: string | null;
  promoTagColor: string | null;
  benefitsText: string | null;
  cardBorderColor: string | null;
  countdownBgColor: string | null;
  countdownTextColor: string | null;
  titleColor: string | null;
  subtitleColor: string | null;
  priceColor: string | null;
  complementaryColor: string | null;
  campaignButtonColor: string | null;
  buttonTextColor: string | null;
  benefitsColor: string | null;
  displayOrder: number;
};

export function orderPublicPlans<T extends Pick<PublicPlan, "displayOrder">>(plans: T[]) {
  return plans
    .map((plan, index) => ({ plan, index }))
    .sort((a, b) => a.plan.displayOrder - b.plan.displayOrder || a.index - b.index)
    .map(({ plan }) => plan);
}

type PublicPlansRpcClient = {
  rpc: (
    functionName: "list_public_model_plans",
    args: { target_model_id: string },
  ) => Promise<{
    data: Array<Record<string, unknown>> | null;
    error: Error | null;
  }>;
};

export const listPublicModelPlans = createServerFn({ method: "GET" })
  .inputValidator((raw: { modelId: string }) => ({
    modelId: String(raw?.modelId ?? ""),
  }))
  .handler(async ({ data }) => {
    if (!data.modelId) return [] as PublicPlan[];
    const { supabase } = await import("@/integrations/supabase/client");
    const plansClient = supabase as unknown as PublicPlansRpcClient;
    const { data: rows, error } = await plansClient.rpc("list_public_model_plans", {
      target_model_id: data.modelId,
    });
    if (error) throw new Error("Não foi possível carregar os planos deste perfil.");

    return orderPublicPlans(((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      promotionId: row.promotion_id ? String(row.promotion_id) : null,
      offerId: row.offer_id ? String(row.offer_id) : null,
      name: String(row.name),
      description: row.description == null ? null : String(row.description),
      urgencyText: row.urgency_text == null ? null : String(row.urgency_text),
      complementaryText: row.complementary_text == null ? null : String(row.complementary_text),
      price: Number(row.price),
      originalPrice: row.original_price == null ? null : Number(row.original_price),
      ctaText: row.cta_text == null ? null : String(row.cta_text),
      startsAt: row.starts_at == null ? null : String(row.starts_at),
      endsAt: row.ends_at == null ? null : String(row.ends_at),
      showCountdown: Boolean(row.show_countdown),
      accessType:
        row.access_type === "subscription" && Number(row.duration_days) === 36500
          ? "lifetime"
          : row.access_type === "subscription"
            ? "subscription"
            : "lifetime",
      durationDays: row.duration_days == null ? null : Number(row.duration_days),
      isFeatured: Boolean(row.is_featured),
      isHighlighted: Boolean(row.is_highlighted),
      buttonColor: row.button_color == null ? null : String(row.button_color),
      eyebrowText: row.eyebrow_text == null ? null : String(row.eyebrow_text),
      promoTagText: row.promo_tag_text == null ? null : String(row.promo_tag_text),
      promoTagColor: row.promo_tag_color == null ? null : String(row.promo_tag_color),
      benefitsText: row.benefits_text == null ? null : String(row.benefits_text),
      cardBorderColor: row.card_border_color == null ? null : String(row.card_border_color),
      countdownBgColor: row.countdown_bg_color == null ? null : String(row.countdown_bg_color),
      countdownTextColor:
        row.countdown_text_color == null ? null : String(row.countdown_text_color),
      titleColor: row.title_color == null ? null : String(row.title_color),
      subtitleColor: row.subtitle_color == null ? null : String(row.subtitle_color),
      priceColor: row.price_color == null ? null : String(row.price_color),
      complementaryColor: row.complementary_color == null ? null : String(row.complementary_color),
      campaignButtonColor:
        row.campaign_button_color == null ? null : String(row.campaign_button_color),
      buttonTextColor: row.button_text_color == null ? null : String(row.button_text_color),
      benefitsColor: row.benefits_color == null ? null : String(row.benefits_color),
      displayOrder: Number(row.display_order ?? 0),
    }))) satisfies PublicPlan[];
  });
