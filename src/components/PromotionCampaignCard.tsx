import { useEffect, useState, type CSSProperties } from "react";
import { sanitizePromotionRichText } from "@/lib/promotion-rich-text";

export type PromotionCampaignVisual = {
  title: string;
  description?: string | null;
  urgencyText?: string | null;
  complementaryText?: string | null;
  benefitsText?: string | null;
  originalPrice?: number | null;
  promotionalPrice: number;
  ctaText?: string | null;
  endsAt?: string | null;
  showCountdown?: boolean;
  cardBorderColor?: string | null;
  countdownBgColor?: string | null;
  countdownTextColor?: string | null;
  titleColor?: string | null;
  subtitleColor?: string | null;
  priceColor?: string | null;
  complementaryColor?: string | null;
  buttonColor?: string | null;
  buttonTextColor?: string | null;
  benefitsColor?: string | null;
};

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

function Countdown({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(endsAt).getTime() - Date.now()),
  );
  useEffect(() => {
    const timer = window.setInterval(
      () => setRemaining(Math.max(0, new Date(endsAt).getTime() - Date.now())),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [endsAt]);
  const totalMinutes = Math.ceil(remaining / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return (
    <>
      {days ? `${days}d ` : ""}
      {hours}h {minutes}min
    </>
  );
}

function RichText({
  value,
  className,
  style,
}: {
  value?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  if (!value) return null;
  return (
    <div
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitizePromotionRichText(value) }}
    />
  );
}

export function PromotionCampaignCard({
  campaign,
  creatorName,
  creatorImage,
  onAction,
  preview = false,
}: {
  campaign: PromotionCampaignVisual;
  creatorName?: string | null;
  creatorImage?: string | null;
  onAction?: () => void;
  preview?: boolean;
}) {
  const safeCreatorName = creatorName?.trim() || "Criadora";
  const border = campaign.cardBorderColor || "#f04400";
  const countdownBg = campaign.countdownBgColor || "#f04400";
  return (
    <article
      className="relative mx-auto mt-9 w-full max-w-[660px] rounded-[28px] border-2 bg-[#fffaf6] px-5 pb-6 pt-16 text-center shadow-[0_18px_42px_rgba(47,34,28,0.08)] sm:px-10 sm:pb-8 sm:pt-20"
      style={{ borderColor: border }}
    >
      {campaign.showCountdown && campaign.endsAt ? (
        <div
          className="absolute left-1/2 top-0 flex min-h-12 w-[min(88%,420px)] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full px-5 py-2 text-base font-semibold tabular-nums shadow-sm sm:text-lg"
          style={{ backgroundColor: countdownBg, color: campaign.countdownTextColor || "#fff" }}
        >
          Oferta termina em:&nbsp;
          <Countdown endsAt={campaign.endsAt} />
        </div>
      ) : null}
      <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-full border-4 border-white bg-[#eee8e4] text-2xl font-bold text-[#7b716d] shadow-md sm:h-24 sm:w-24">
        {creatorImage ? (
          <img
            src={creatorImage}
            alt={`Foto de ${safeCreatorName}`}
            className="h-full w-full object-cover"
          />
        ) : (
          safeCreatorName.slice(0, 1).toUpperCase()
        )}
      </div>
      <RichText
        value={campaign.title || "Título da promoção"}
        className="mt-5 text-balance text-2xl font-bold leading-tight sm:text-3xl"
        style={{ color: campaign.titleColor || "#171311" }}
      />
      <div
        className="mt-3 text-base leading-7 sm:text-lg"
        style={{ color: campaign.subtitleColor || "#4f4845" }}
      >
        {campaign.urgencyText ? (
          <RichText value={campaign.urgencyText} className="inline font-bold" />
        ) : null}
        {campaign.urgencyText && campaign.description ? " " : null}
        {campaign.description ? <RichText value={campaign.description} className="inline" /> : null}
      </div>
      {campaign.originalPrice != null && campaign.originalPrice > campaign.promotionalPrice ? (
        <p className="mt-5 text-sm text-[#8a817d] line-through">
          De {money(campaign.originalPrice)}
        </p>
      ) : null}
      <p
        className={`${campaign.originalPrice ? "mt-1" : "mt-5"} text-5xl font-bold leading-none tracking-[-0.04em] tabular-nums sm:text-6xl`}
        style={{ color: campaign.priceColor || border }}
      >
        {money(campaign.promotionalPrice)}
      </p>
      <RichText
        value={campaign.complementaryText}
        className="mx-auto mt-3 max-w-[48ch] text-base leading-6 sm:text-lg"
        style={{ color: campaign.complementaryColor || "#332d2a" }}
      />
      <button
        type="button"
        onClick={onAction}
        disabled={preview && !onAction}
        className="mt-6 min-h-14 w-full rounded-2xl px-5 py-3 text-lg font-bold shadow-[0_10px_24px_rgba(20,170,56,0.18)] transition hover:-translate-y-0.5 active:scale-[0.99] disabled:cursor-default sm:text-xl"
        style={{
          backgroundColor: campaign.buttonColor || "#16b93a",
          color: campaign.buttonTextColor || "#fff",
        }}
      >
        {campaign.ctaText || "Quero aproveitar agora 🔥"}
      </button>
      <RichText
        value={campaign.benefitsText || "⭐ Pagamento único &nbsp;&nbsp; 🔥 Acesso vitalício"}
        className="mt-5 text-sm font-medium leading-6 sm:text-base"
        style={{ color: campaign.benefitsColor || "#332d2a" }}
      />
    </article>
  );
}
