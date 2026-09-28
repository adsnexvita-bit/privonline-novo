import { Link } from "@tanstack/react-router";
import { BadgeCheck, ChevronRight, Crown, Flame, UserRound } from "lucide-react";
import { resolveMediaUrl, type PublicModel } from "@/lib/models";
import { ProgressiveImage } from "@/components/ProgressiveImage";

export function ModelCard({
  model,
  index = 0,
  priority = false,
  variant = "library",
}: {
  model: PublicModel;
  index?: number;
  priority?: boolean;
  variant?: "home" | "library";
}) {
  const cover = resolveMediaUrl(model.profile_cover_image_path ?? model.cover_image_path, index);
  const profileImage = resolveMediaUrl(model.profile_image_path, index + 1);
  const totalContent = model.custom_posts_count ?? model.photo_count + model.video_count;

  if (variant === "home") {
    return (
      <article
        className="group min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-card transition duration-200 hover:border-primary/25 hover:shadow-[0_8px_24px_-16px_rgba(24,24,27,0.28)]"
        style={{ animationDelay: `${Math.min(index, 6) * 75}ms` }}
      >
        <Link
          to="/$username"
          params={{ username: model.username }}
          className="block"
          aria-label={`Abrir perfil de ${model.name}`}
        >
          <div className="relative">
            <div className="relative h-36 overflow-hidden bg-surface-elevated sm:h-40">
              <ProgressiveImage
                src={cover}
                alt={`Capa de ${model.name}`}
                priority={priority}
                className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.025]"
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/25 to-transparent" />
            </div>
            <span className="pointer-events-none absolute left-3 top-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-white/95 px-2.5 text-xs font-bold text-foreground shadow-sm backdrop-blur-sm">
              <Crown className="h-3.5 w-3.5" strokeWidth={2} />
              #{index + 1}
            </span>
            <span className="absolute -bottom-7 left-4 h-[72px] w-[72px] overflow-hidden rounded-full border-[3px] border-card bg-surface-elevated shadow-sm">
              <ProgressiveImage
                src={profileImage}
                alt={`Foto de perfil de ${model.name}`}
                priority={priority}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </span>
          </div>

          <div className="px-4 pb-4 pt-10">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="truncate text-base font-bold tracking-[-0.015em] text-foreground">
                {model.name}
              </h3>
              <BadgeCheck className="h-[18px] w-[18px] shrink-0 text-primary" aria-label="Perfil verificado" />
            </div>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">@{model.username}</p>
            <span className="mt-3 flex min-h-10 w-full items-center justify-between border-t border-border pt-3 text-sm font-semibold text-primary">
              Ver perfil
              <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
        </Link>
      </article>
    );
  }

  return (
    <article className="group min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-card transition-[box-shadow,border-color] duration-200 hover:border-primary/25 hover:shadow-[0_8px_24px_-16px_rgba(24,24,27,0.28)] sm:rounded-2xl">
      <Link
        to="/$username"
        params={{ username: model.username }}
        className="block overflow-hidden bg-white"
        aria-label={`Abrir perfil de ${model.name}`}
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface-elevated">
          <ProgressiveImage
            src={cover}
            alt={`Capa de ${model.name}`}
            priority={priority}
            className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.025]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
          <span className="pointer-events-none absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full border border-white/30 bg-black/40 text-white backdrop-blur-sm sm:right-3 sm:top-3 sm:h-9 sm:w-9">
            <UserRound className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
          </span>
        </div>

        <div className="relative border-t border-border/70 bg-white px-3 py-3.5 transition-colors sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-surface-elevated shadow-md sm:h-12 sm:w-12">
              <ProgressiveImage
                src={profileImage}
                alt={`Foto de perfil de ${model.name}`}
                priority={priority}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold leading-tight text-foreground sm:text-base">
                {model.name}
              </h3>
              <p className="mt-1 truncate text-xs font-medium text-muted-foreground sm:text-sm">
                @{model.username}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center text-[11px] font-semibold text-muted-foreground sm:text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" />
              <span className="font-bold text-foreground">{totalContent}</span>
              <span className="truncate">conteúdos secretos</span>
            </span>
          </div>

          <span className="mt-3 flex min-h-9 w-full items-center justify-between border-t border-border pt-3 text-xs font-bold text-primary sm:text-sm">
            Ver conteúdos
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </article>
  );
}
