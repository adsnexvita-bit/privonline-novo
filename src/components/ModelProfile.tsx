/**
 * Direction — Privadinhos creator profile
 * World: a compact creator page, inspired by the supplied reference's quiet,
 * media-first profile card and deliberate vertical rhythm.
 * Hierarchy: cover and identity establish trust; public visitors meet offers
 * before locked previews, while paid visitors move directly into their library.
 * Brand: Privadinhos' existing orange, logo, and top navigation remain the
 * only brand authority; no reference copy, marks, or assets are reused.
 * Interaction: the paid and public states share one profile frame; locks and
 * purchase actions change the state without changing the underlying media flow.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Video,
  Images,
  FileText,
  LockKeyhole,
  BadgeCheck,
  Heart,
  Play,
  X,
  Volume2,
  VolumeX,
  ArrowRight,
  Instagram,
  Send,
  ArrowLeft,
  UserCircle2,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Logo } from "@/components/Logo";
import { ProgressiveImage } from "@/components/ProgressiveImage";
import { formatPrice, resolveMediaUrl, type PublicModel } from "@/lib/models";
import { listModelPreviewMedia } from "@/lib/preview-media.functions";
import { getSession } from "@/lib/session";
import { hasAnyCustomerOrder, listMyModelMedia } from "@/lib/access.functions";
import { listPublicModelPlans, type PublicPlan } from "@/lib/model-plans.functions";
import { formatPlanDurationDays } from "@/lib/plan-duration";
import { getPublicModelAssetUrls } from "@/lib/model-assets.functions";
import { listCreatorPosts } from "@/lib/creator-posts.functions";
import { CreatorPostsFeed, type CreatorPost } from "@/components/CreatorPostsFeed";
import { ProfileAudioPlayer } from "@/components/ProfileAudioPlayer";
import { TestimonialsCarousel } from "@/components/TestimonialsCarousel";
import { listPublicModelTestimonials } from "@/lib/model-testimonials.functions";
import { getPublicProfileSupportSettings } from "@/lib/profile-support-settings.functions";
import type { PaymentProvider } from "@/lib/payment-provider";
import { usePublicLocale, usePublicText } from "@/lib/locale";

const PurchaseModal = lazy(async () => {
  const module = await import("@/components/PurchaseModal");
  return { default: module.PurchaseModal };
});

type GalleryMedia = {
  id: string;
  media_type: "image" | "video";
  title: string | null;
  is_free_preview: boolean;
  display_order: number;
  like_count: number;
  comment_count: number;
  url: string;
};

function isAnimatedGif(media: GalleryMedia): boolean {
  return media.media_type === "image" && /\.gif(?:$|[?#])/i.test(media.url);
}

function AnimatedGif({
  src,
  alt,
  priority = false,
  className,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="sync"
      className={className}
    />
  );
}

function VideoThumbnail({
  src,
  className,
  alt = "",
}: {
  src: string;
  className: string;
  alt?: string;
}) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad) return;
    let cancelled = false;
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    let attempts = 0;

    const captureFrame = (time: number) => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context || !canvas.width || !canvas.height) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const sample = context.getImageData(
          0,
          0,
          Math.min(8, canvas.width),
          Math.min(8, canvas.height),
        );
        let brightness = 0;
        for (let index = 0; index < sample.data.length; index += 4) {
          brightness += sample.data[index] + sample.data[index + 1] + sample.data[index + 2];
        }
        const averageBrightness = brightness / (sample.data.length / 4) / 3;
        const nextTime = Math.min(video.duration - 0.05, time + 0.6);

        if (averageBrightness < 8 && attempts < 2 && Number.isFinite(nextTime) && nextTime > time) {
          attempts += 1;
          video.currentTime = nextTime;
          return;
        }
        if (!cancelled) setThumbnail(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        // A thumbnail is an enhancement: the video remains available if the browser blocks canvas capture.
      }
    };

    const onLoadedMetadata = () => {
      const initialTime = Math.min(0.25, Math.max(0.05, video.duration / 10));
      video.currentTime = initialTime;
    };
    const onSeeked = () => captureFrame(video.currentTime);

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("seeked", onSeeked);
    video.src = src;
    video.load();
    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("seeked", onSeeked);
      video.removeAttribute("src");
      video.load();
    };
  }, [shouldLoad, src]);

  return (
    <div ref={containerRef} className="h-full w-full">
      {thumbnail ? (
        <img src={thumbnail} alt={alt} className={className} />
      ) : (
        <div aria-hidden className={`${className} bg-[#e9edf2]`} />
      )}
    </div>
  );
}

export function ModelProfile({
  model,
  forcedGateway,
}: {
  model: PublicModel;
  forcedGateway?: PaymentProvider;
}) {
  const text = usePublicText();
  const locale = usePublicLocale();
  const navigate = useNavigate();
  const fetchPreviewMedia = useServerFn(listModelPreviewMedia);
  const fetchPrivateMedia = useServerFn(listMyModelMedia);
  const checkCustomerOrders = useServerFn(hasAnyCustomerOrder);
  const fetchProfileSupportSettings = useServerFn(getPublicProfileSupportSettings);
  const fetchPlans = useServerFn(listPublicModelPlans);
  const fetchModelAssets = useServerFn(getPublicModelAssetUrls);
  const fetchCreatorPosts = useServerFn(listCreatorPosts);
  const fetchTestimonials = useServerFn(listPublicModelTestimonials);

  const mediaQuery = useQuery({
    queryKey: ["model-media-original-previews", model.id],
    queryFn: () => fetchPreviewMedia({ data: { modelId: model.id } }),
    staleTime: 10 * 60 * 1000,
  });
  const plansQuery = useQuery({
    queryKey: ["public-model-plans", model.id],
    queryFn: () => fetchPlans({ data: { modelId: model.id } }),
    staleTime: 10 * 60 * 1000,
  });
  const availablePlans = plansQuery.data ?? [];
  const featuredPlan = availablePlans.find((plan) => plan.isFeatured) ?? availablePlans[0] ?? null;
  const testimonialsQuery = useQuery({
    queryKey: ["public-model-testimonials", model.id],
    queryFn: () => fetchTestimonials({ data: { modelId: model.id } }),
    staleTime: 10 * 60 * 1000,
  });

  const [session, setSessionState] = useState(() => getSession());
  const [paidPreview, setPaidPreview] = useState(false);
  useEffect(() => {
    const onChange = () => setSessionState(getSession());
    window.addEventListener("famaflix:session", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("famaflix:session", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    setPaidPreview(new URLSearchParams(window.location.search).get("preview") === "paid");
  }, []);

  const accessQuery = useQuery({
    queryKey: ["profile-private-media", model.slug, session?.token],
    queryFn: () =>
      fetchPrivateMedia({
        data: { token: session!.token, modelSlug: model.slug },
      }),
    enabled: !!session,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const customerOrdersQuery = useQuery({
    queryKey: ["customer-has-any-order", session?.token],
    queryFn: () => checkCustomerOrders({ data: { token: session!.token } }),
    enabled: !!session,
    retry: false,
    staleTime: 60 * 1000,
  });
  const profileSupportSettingsQuery = useQuery({
    queryKey: ["public-profile-support-settings"],
    queryFn: () => fetchProfileSupportSettings(),
    retry: false,
    staleTime: 60 * 1000,
  });

  const hasRealAccess = !!accessQuery.data;
  const hasAccess = hasRealAccess || paidPreview;
  const showMemberHeader = (hasRealAccess && !!session) || paidPreview;
  const showTelegramSupport =
    !hasAccess &&
    profileSupportSettingsQuery.data?.enabled === true &&
    (!session || (customerOrdersQuery.isSuccess && customerOrdersQuery.data === false));
  const profileAudio = hasRealAccess
    ? (accessQuery.data?.profileAudio ?? null)
    : model.public_audio_enabled && model.public_audio_title && model.public_audio_path
      ? {
          title: model.public_audio_title,
          url: resolveMediaUrl(model.public_audio_path),
        }
      : null;
  const gallery = useMemo<GalleryMedia[]>(() => {
    const source = hasRealAccess ? (accessQuery.data?.media ?? []) : (mediaQuery.data ?? []);
    return source
      .map((media) => ({
        id: media.id,
        media_type: media.media_type,
        title: media.title,
        is_free_preview: hasRealAccess ? media.is_free_preview : true,
        display_order: media.display_order,
        like_count: media.like_count,
        comment_count: media.comment_count,
        url: hasRealAccess ? media.url : media.file_url,
      }))
      .sort((a, b) => a.display_order - b.display_order);
  }, [accessQuery.data?.media, hasRealAccess, mediaQuery.data]);

  const viewableGallery = gallery;
  const [paidMediaFilter, setPaidMediaFilter] = useState<"posts" | "video" | "image">("video");
  useEffect(() => {
    if (paidPreview) setPaidMediaFilter("image");
  }, [paidPreview]);
  const filteredPaidGallery = useMemo(
    () =>
      paidMediaFilter === "posts"
        ? []
        : viewableGallery.filter((media) => media.media_type === paidMediaFilter),
    [paidMediaFilter, viewableGallery],
  );
  const postsQuery = useQuery({
    queryKey: ["creator-posts", model.id, session?.token],
    queryFn: () => fetchCreatorPosts({ data: { token: session!.token, creatorId: model.id } }),
    enabled: hasAccess && paidMediaFilter === "posts" && !!session,
    retry: false,
  });

  const displayedPhotoCount = model.custom_photo_count ?? model.photo_count;
  const displayedVideoCount = model.custom_video_count ?? model.video_count;
  const displayedPostsCount = model.custom_posts_count ?? displayedPhotoCount + displayedVideoCount;

  const [needsLoginOpen, setNeedsLoginOpen] = useState(false);
  const [lightbox, setLightbox] = useState<GalleryMedia | null>(null);
  const [mobileViewerIndex, setMobileViewerIndex] = useState<number | null>(null);

  function openMedia(media: GalleryMedia) {
    if (!hasAccess) {
      showPlans();
      return;
    }
    if (window.matchMedia("(max-width: 767px)").matches) {
      const index = filteredPaidGallery.findIndex((item) => item.id === media.id);
      setMobileViewerIndex(Math.max(0, index));
      return;
    }
    setLightbox(media);
  }

  const rawCoverPath = model.profile_cover_image_path ?? model.cover_image_path;
  const rawAvatarPath = model.profile_image_path;
  const assetQuery = useQuery({
    queryKey: ["public-model-assets", model.id, rawAvatarPath, rawCoverPath],
    queryFn: () =>
      fetchModelAssets({
        data: {
          profileImagePath: rawAvatarPath,
          coverImagePath: rawCoverPath,
        },
      }),
    staleTime: 55 * 60 * 1000,
    retry: 1,
  });
  const cover = assetQuery.data?.coverImageUrl ?? resolveMediaUrl(rawCoverPath, 0);
  const avatar = assetQuery.data?.profileImageUrl ?? resolveMediaUrl(rawAvatarPath, 1);

  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchasePlan, setPurchasePlan] = useState<PublicPlan | null>(null);

  function handlePurchase(selectedPlan: PublicPlan | null = featuredPlan) {
    setPurchasePlan(selectedPlan);
    setPurchaseOpen(true);
  }

  function showPlans() {
    if (!hasAccess && model.price > 0) {
      document.getElementById("planos")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function closeLightbox() {
    const shouldOffer = lightbox?.is_free_preview;
    setLightbox(null);
    if (shouldOffer) showPlans();
  }

  function closeMobileViewer() {
    const viewedMedia = mobileViewerIndex === null ? null : viewableGallery[mobileViewerIndex];
    setMobileViewerIndex(null);
    if (viewedMedia?.is_free_preview) showPlans();
  }

  return (
    <PageShell fullBleed whiteBackground hideHeader hideFooterBorder>
      {showMemberHeader ? (
        <header className="fixed inset-x-0 top-0 z-50 bg-white/95 shadow-[0_2px_14px_rgba(30,24,20,0.07)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-full max-w-[750px] items-center justify-between px-4 sm:px-6">
            <Link to="/" aria-label={text.nav.home} className="inline-flex min-h-11 items-center">
              <Logo className="h-8" />
            </Link>
            <Link
              to="/acesso"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <UserCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
              {text.nav.myAccount}
            </Link>
          </div>
        </header>
      ) : null}
      <div className={`model-profile-page w-full bg-white ${showMemberHeader ? "pt-16" : ""}`}>
        <div className="mx-auto w-full max-w-[750px] pb-0 sm:pt-4">
          <header className="profile-identity-card overflow-hidden border-x-0 bg-white sm:border-x">
            <div className="relative h-40 w-full overflow-hidden">
              <ProgressiveImage
                src={cover}
                alt={`Capa de ${model.name}`}
                priority
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/5" />
              <button
                type="button"
                onClick={() =>
                  window.history.length > 1 ? window.history.back() : navigate({ to: "/" })
                }
                aria-label={text.profile.back}
                className="absolute left-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-foreground shadow-sm backdrop-blur-sm transition hover:bg-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            </div>

            <div className="relative z-10 px-6 pb-5">
              <div className="flex min-h-16 items-start justify-end">
                <span className="absolute -top-14 left-6 block h-28 w-28 rounded-full border-[3.5px] border-white bg-white shadow-sm">
                  <span className="absolute inset-0 overflow-hidden rounded-full">
                    <ProgressiveImage
                      src={avatar}
                      alt={`Foto de perfil de ${model.name}`}
                      priority
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </span>
                  <span
                    className="absolute bottom-1 right-1 z-10 h-4 w-4 rounded-full border-2 border-white bg-emerald-400"
                    aria-label="Online"
                  />
                </span>
                <div className="flex items-center gap-3 pt-3 text-sm font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Video className="h-4 w-4" /> {displayedVideoCount}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Images className="h-4 w-4" /> {displayedPhotoCount}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-4 w-4" /> {displayedPostsCount}
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <h1 className="flex min-w-0 items-center gap-1.5 text-xl font-bold leading-7 text-[#23201f]">
                  <span className="truncate">{model.name}</span>
                  <BadgeCheck
                    className="h-5 w-5 shrink-0 text-primary"
                    fill="currentColor"
                    stroke="white"
                    aria-label={text.profile.verified}
                  />
                </h1>
                <a
                  href={`/${encodeURIComponent(model.username)}`}
                  className="my-1 inline-flex text-base font-normal text-muted-foreground transition hover:text-primary"
                >
                  @{model.username}
                </a>
                <span className="ml-2 text-sm text-emerald-500">• {text.profile.availableNow}</span>
              </div>

              {!hasAccess && model.short_description ? (
                <p className="mt-3 max-w-[66ch] text-sm leading-5 text-[#3f3d3c]">
                  {model.short_description}
                </p>
              ) : null}
              {!hasAccess && model.full_description ? (
                <a
                  href="#sobre"
                  className="mt-2 inline-flex text-sm font-semibold text-primary transition hover:text-primary-glow"
                >
                  {text.profile.moreInfo}
                </a>
              ) : null}
              {model.instagram_enabled && model.instagram_url ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <a
                    href={model.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-medium text-foreground transition hover:bg-surface-elevated"
                  >
                    <Instagram className="h-4 w-4 text-[#e1306c]" /> Instagram
                  </a>
                </div>
              ) : null}
            </div>
            {profileAudio ? (
              <ProfileAudioPlayer title={profileAudio.title} src={profileAudio.url} />
            ) : null}
            {!hasAccess && (featuredPlan || model.price > 0) ? (
              <div
                id="planos"
                className="scroll-mt-24 border-t-[8px] border-[#f5f5f5] bg-white px-6 py-5"
              >
                <AccessPlansCard
                  plans={availablePlans}
                  fallbackPrice={model.price}
                  onSelect={handlePurchase}
                />
              </div>
            ) : null}
          </header>

          <section className="profile-flow mx-auto flex max-w-[750px] flex-col gap-0">
            {mediaQuery.isPending || (!!session && accessQuery.isPending) ? (
              <div className="mx-auto grid max-w-2xl gap-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[3/4] w-full animate-pulse rounded-3xl bg-surface-elevated"
                  />
                ))}
              </div>
            ) : mediaQuery.isError && !hasAccess ? (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-muted-foreground">
                {text.profile.noGallery}
              </div>
            ) : gallery.length && hasAccess ? (
              <section className="profile-library-section" aria-labelledby="paid-library-title">
                <h2 id="paid-library-title" className="sr-only">
                  {text.profile.unlockedContent}
                </h2>
                <PrivateContentLibrary
                  media={filteredPaidGallery}
                  filter={paidMediaFilter}
                  onFilterChange={setPaidMediaFilter}
                  onOpen={openMedia}
                />
                {paidMediaFilter === "posts" ? (
                  postsQuery.isPending && postsQuery.fetchStatus !== "idle" ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      {text.profile.loadingPosts}
                    </div>
                  ) : postsQuery.isError ? (
                    <div className="rounded-2xl border border-destructive/30 p-6 text-center">
                      <p className="text-sm text-destructive">{text.profile.noPosts}</p>
                      <button
                        onClick={() => postsQuery.refetch()}
                        className="mt-3 font-bold text-primary"
                      >
                        {text.profile.tryAgain}
                      </button>
                    </div>
                  ) : (
                    <CreatorPostsFeed
                      posts={(postsQuery.data ?? []) as CreatorPost[]}
                      creator={{ id: model.id, name: model.name, username: model.username, avatar }}
                      token={session?.token ?? ""}
                    />
                  )
                ) : null}
              </section>
            ) : gallery.length ? (
              <section
                className="profile-preview-section overflow-hidden bg-white"
                aria-labelledby="preview-title"
              >
                <h2 id="preview-title" className="sr-only">
                  {text.profile.previewContent}
                </h2>
                <div className="grid grid-cols-2">
                  <button
                    type="button"
                    className="inline-flex min-h-14 items-center justify-center gap-2 border-b-2 border-transparent text-sm font-medium text-muted-foreground"
                  >
                    <FileText className="h-5 w-5" />
                    {displayedPostsCount} {text.profile.posts}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-14 items-center justify-center gap-2 border-b-2 border-primary text-sm font-semibold text-primary"
                  >
                    <Images className="h-5 w-5" />
                    {displayedPhotoCount + displayedVideoCount} {text.profile.media}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-0.5 bg-white">
                  {gallery.map((media, index) => (
                    <PreviewPostCard
                      key={media.id}
                      media={media}
                      priority={index < 4}
                      locked={!hasAccess}
                      onOpen={() => openMedia(media)}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <div className="bg-white px-8 py-20 text-center">
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-muted text-muted-foreground">
                  <Camera className="h-9 w-9" />
                </div>
                <p className="mt-4 font-bold">{text.profile.noMediaTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">{text.profile.noMediaBody}</p>
              </div>
            )}

            {!hasAccess && testimonialsQuery.data?.length ? (
              <TestimonialsCarousel items={testimonialsQuery.data} />
            ) : null}

            {hasAccess && accessQuery.data?.community ? (
              <PurchasedCommunityCard community={accessQuery.data.community} />
            ) : null}

            {hasAccess && model.instagram_enabled && model.instagram_url ? (
              <InstagramProfileCard
                url={model.instagram_url}
                imageUrl={
                  model.instagram_profile_image_url
                    ? resolveMediaUrl(model.instagram_profile_image_url)
                    : null
                }
              />
            ) : null}
          </section>

          {!hasAccess && model.full_description ? (
            <section
              id="sobre"
              className="mt-10 max-w-5xl scroll-mt-40 rounded-xl border border-border bg-card p-5 shadow-card sm:mx-auto sm:p-6"
            >
              <h2 className="text-xl font-medium">
                {text.profile.about} {model.name}
              </h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground sm:text-base">
                {model.full_description}
              </p>
            </section>
          ) : null}
          {showTelegramSupport ? <ProfileTelegramSupport /> : null}
        </div>
      </div>

      {needsLoginOpen && (
        <NeedsLoginModal
          onClose={() => setNeedsLoginOpen(false)}
          onConfirm={() => {
            setNeedsLoginOpen(false);
            navigate({ to: "/acesso" });
          }}
        />
      )}

      {lightbox && (
        <Lightbox media={lightbox} model={model} avatar={avatar} onClose={closeLightbox} />
      )}
      {mobileViewerIndex !== null && filteredPaidGallery.length > 0 ? (
        <MobileMediaViewer
          media={filteredPaidGallery}
          initialIndex={mobileViewerIndex}
          model={model}
          avatar={avatar}
          onClose={closeMobileViewer}
        />
      ) : null}
      {purchaseOpen && (purchasePlan?.price ?? model.price) > 0 && (
        <Suspense fallback={null}>
          <PurchaseModal
            model={model}
            profileImage={avatar}
            plan={purchasePlan}
            forcedGateway={forcedGateway}
            onClose={() => setPurchaseOpen(false)}
            onPaid={() => {
              void accessQuery.refetch();
              void customerOrdersQuery.refetch();
            }}
          />
        </Suspense>
      )}
    </PageShell>
  );
}

function ProfileTelegramSupport() {
  const text = usePublicText();
  return (
    <section
      aria-labelledby="telegram-support-title"
      className="mx-auto mt-10 mb-8 max-w-[600px] border-t border-border/70 px-2 pt-8 text-center sm:mt-12 sm:mb-10 sm:px-5 sm:pt-10"
    >
      <h2
        id="telegram-support-title"
        className="mx-auto max-w-md text-base font-semibold leading-relaxed tracking-[-0.015em] text-foreground sm:text-lg"
      >
        {text.profile.supportTitle}
      </h2>
      <a
        href="https://t.me/feverbyoficial"
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary mx-auto mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold sm:text-base"
      >
        <Send className="h-4 w-4" aria-hidden />
        {text.profile.contact}
      </a>
    </section>
  );
}

function InstagramProfileCard({ url, imageUrl }: { url: string; imageUrl: string | null }) {
  const text = usePublicText();
  const [imageFailed, setImageFailed] = useState(false);
  const username = getInstagramUsername(url);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <section className="mx-auto mt-5 max-w-2xl rounded-3xl border border-[#f2a0b5]/55 bg-white p-4 shadow-[0_6px_18px_rgba(225,48,108,0.07)] sm:mt-6 sm:p-5">
      <div className="flex items-center gap-3.5">
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt="Foto de perfil do Instagram"
            onError={() => setImageFailed(true)}
            className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-[#f2a0b5]/45 sm:h-14 sm:w-14"
          />
        ) : (
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white sm:h-14 sm:w-14">
            <Instagram className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-[-0.02em] text-[#172033] sm:text-xl">
            @{username ?? "instagram"}
          </h2>
          <p className="mt-0.5 text-sm leading-snug text-[#667085]">{text.profile.instagramBody}</p>
        </div>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#e1306c]/35 bg-[#fff7fa] px-4 py-2.5 text-center text-sm font-semibold text-[#c52f68] transition hover:bg-[#fff0f5] active:scale-[0.99] sm:mt-4 sm:w-auto"
      >
        <Instagram className="h-4 w-4" aria-hidden />
        {text.profile.instagramButton}
      </a>
    </section>
  );
}

function getInstagramUsername(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/^(?:www\.)?instagram\.com$/i.test(url.hostname)) return null;
    const username = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[a-z0-9._]+$/i.test(username) ? username : null;
  } catch {
    return null;
  }
}

function PurchasedCommunityCard({
  community,
}: {
  community: {
    telegramUrl: string;
    title: string;
    description: string;
    buttonText: string;
  };
}) {
  return (
    <section className="mx-auto max-w-2xl overflow-hidden rounded-[1.75rem] border border-[#2AABEE]/45 bg-white p-5 shadow-[0_14px_34px_rgba(42,171,238,0.15)] sm:p-7">
      <div className="flex items-start gap-4">
        <img
          src="/assets/telegram-icon.png"
          alt=""
          className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-[0_10px_22px_rgba(42,171,238,0.28)] sm:h-16 sm:w-16"
          loading="eager"
          decoding="async"
        />
        <div className="min-w-0">
          <h2 className="text-xl font-medium tracking-[-0.02em] text-[#172033] sm:text-2xl">
            {community.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#667085] sm:text-base">
            {community.description}
          </p>
        </div>
      </div>
      <a
        href={community.telegramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#229ED9] px-5 py-3.5 text-center text-base font-semibold text-white shadow-[0_12px_22px_rgba(42,171,238,0.30)] transition hover:bg-[#168bc4] active:scale-[0.99]"
      >
        <img src="/assets/telegram-icon.png" alt="" className="h-6 w-6 rounded-full object-cover" />
        {community.buttonText}
      </a>
    </section>
  );
}

function AccessPlansCard({
  plans,
  fallbackPrice,
  onSelect,
}: {
  plans: PublicPlan[];
  fallbackPrice: number;
  onSelect: (plan: PublicPlan | null) => void;
}) {
  const text = usePublicText();
  const planKey = (plan: PublicPlan) => `${plan.id}:${plan.offerId ?? "base"}`;
  const visiblePlans = plans.filter((plan) => plan.price > 0);
  const primary = visiblePlans[0] ?? null;
  const bundles = visiblePlans.slice(1);
  const primaryDuration = primary?.durationDays ?? 30;
  const primaryMonthlyPrice = primary
    ? primary.price / Math.max(1, primaryDuration / 30)
    : fallbackPrice;

  function bundleDiscount(plan: PublicPlan) {
    if (plan.accessType === "lifetime" || !plan.durationDays || primaryMonthlyPrice <= 0)
      return null;
    const regularPrice = primaryMonthlyPrice * Math.max(1, plan.durationDays / 30);
    const discount = Math.round((1 - plan.price / regularPrice) * 100);
    return discount > 0 ? `${discount}% off` : null;
  }

  return (
    <section data-offer-layout="profile-subscription" aria-labelledby="subscription-title">
      <h2 id="subscription-title" className="mb-2 text-base font-medium text-foreground">
        {text.profile.subscription}
      </h2>
      <button
        type="button"
        onClick={() => onSelect(primary)}
        className="flex h-11 w-full items-center justify-between gap-4 rounded-full bg-primary p-3 text-left text-sm font-medium leading-5 text-white transition hover:bg-primary/80 active:scale-[0.99]"
      >
        <span>
          {primary
            ? formatPlanDuration(primary, locale).toLocaleUpperCase(locale)
            : text.profile.oneMonth}
        </span>
        <span className="shrink-0 text-right">{formatPrice(primary?.price ?? fallbackPrice)}</span>
      </button>

      {bundles.length ? (
        <div className="mt-2">
          <div className="grid gap-2">
            {bundles.map((plan) => {
              const discount = bundleDiscount(plan);
              return (
                <button
                  key={planKey(plan)}
                  type="button"
                  onClick={() => onSelect(plan)}
                  className="flex h-11 w-full items-center justify-between gap-4 rounded-full bg-primary p-3 text-left text-sm font-medium leading-5 text-white transition hover:bg-primary/80 active:scale-[0.99]"
                >
                  <span>
                    {plan.accessType === "lifetime"
                      ? text.profile.lifetime
                      : formatPlanDuration(plan, locale).toLocaleUpperCase(locale)}
                    {discount ? <small className="ml-1.5 font-medium">({discount})</small> : null}
                  </span>
                  <span className="shrink-0">{formatPrice(plan.price)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatPlanDuration(plan: PublicPlan, locale: "pt-BR" | "es") {
  return formatPlanDurationDays(plan.durationDays ?? 30, locale);
}

function PrivateContentLibrary({
  media,
  filter,
  onFilterChange,
  onOpen,
}: {
  media: GalleryMedia[];
  filter: "posts" | "video" | "image";
  onFilterChange: (filter: "posts" | "video" | "image") => void;
  onOpen: (media: GalleryMedia) => void;
}) {
  const text = usePublicText();
  const filters = [
    { id: "posts" as const, label: text.profile.filters.posts, icon: FileText },
    { id: "video" as const, label: text.profile.filters.videos, icon: Video },
    { id: "image" as const, label: text.profile.filters.photos, icon: Images },
  ];

  return (
    <section
      className="mx-auto w-full max-w-3xl overflow-hidden bg-white"
      aria-label={text.profile.filters.released}
    >
      <div className="grid grid-cols-3">
        {filters.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(item.id)}
              aria-pressed={filter === item.id}
              className={`inline-flex min-h-14 items-center justify-center gap-2 border-b-2 px-3 text-sm font-semibold transition ${
                filter === item.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      {filter === "posts" ? null : media.length ? (
        <div className="grid grid-cols-3 gap-0.5">
          {media.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item)}
              className="group relative aspect-square overflow-hidden bg-[#151515] text-left focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={
                item.title ??
                (item.media_type === "video"
                  ? text.profile.filters.watchVideo
                  : text.profile.filters.openPhoto)
              }
            >
              {item.media_type === "video" ? (
                <VideoThumbnail
                  src={item.url}
                  alt={item.title ?? ""}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
              ) : isAnimatedGif(item) ? (
                <AnimatedGif
                  src={item.url}
                  alt={item.title ?? ""}
                  priority={index < 6}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <ProgressiveImage
                  src={item.url}
                  alt={item.title ?? ""}
                  priority={index < 6}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
              )}
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/5" />
              {item.media_type === "video" ? (
                <span className="pointer-events-none absolute inset-0 grid place-items-center">
                  <Play className="ml-0.5 h-9 w-9 fill-white text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)] sm:h-10 sm:w-10" />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          {text.profile.filters.empty(filter)}
        </div>
      )}
    </section>
  );
}

function PreviewPostCard({
  media,
  priority,
  locked,
  onOpen,
}: {
  media: GalleryMedia;
  priority: boolean;
  locked: boolean;
  onOpen: () => void;
}) {
  const text = usePublicText();
  return (
    <article className="relative aspect-square overflow-hidden bg-[#edf0f2]">
      <button
        type="button"
        onClick={onOpen}
        className="group relative block h-full w-full overflow-hidden"
        aria-label={
          locked ? text.profile.preview.unlock : (media.title ?? text.profile.preview.open)
        }
      >
        {media.media_type === "video" ? (
          <VideoThumbnail
            src={media.url}
            alt={media.title ?? ""}
            className="h-full w-full object-cover object-center transition duration-300 group-hover:scale-[1.025]"
          />
        ) : isAnimatedGif(media) ? (
          <AnimatedGif
            src={media.url}
            alt={media.title ?? ""}
            priority={priority}
            className="h-full w-full object-cover object-center transition duration-300 group-hover:scale-[1.025]"
          />
        ) : (
          <ProgressiveImage
            src={media.url}
            alt={media.title ?? ""}
            priority={priority}
            className="h-full w-full object-cover object-center transition duration-300 group-hover:scale-[1.025]"
          />
        )}
        {locked ? (
          <span className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-black/20 text-white">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
              <LockKeyhole className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="text-[11px] font-semibold drop-shadow">
              {text.profile.preview.exclusive}
            </span>
          </span>
        ) : null}
      </button>
    </article>
  );
}

function NeedsLoginModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const text = usePublicText();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="card-premium w-full max-w-sm rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Heart className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold">{text.profile.login.title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{text.profile.login.body}</p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground hover:border-primary"
          >
            {text.profile.login.later}
          </button>
          <button
            onClick={onConfirm}
            className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-bold"
          >
            {text.profile.login.access}
          </button>
        </div>
      </div>
    </div>
  );
}

function Lightbox({
  media,
  model,
  avatar,
  onClose,
}: {
  media: GalleryMedia;
  model: PublicModel;
  avatar: string;
  onClose: () => void;
}) {
  const text = usePublicText();
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black p-4 text-white"
      onClick={onClose}
    >
      <div
        className="relative h-full max-h-[900px] w-full max-w-[620px] overflow-hidden rounded-[2rem] border border-white/15 bg-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-5 top-5 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={avatar}
                alt=""
                className="h-10 w-10 rounded-full border border-white/30 object-cover"
              />
              <p className="text-sm font-black">{model.name}</p>
            </div>
            <button
              onClick={onClose}
              className="grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/65"
              aria-label={text.profile.audio.close}
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
        {media.media_type === "video" ? (
          <video
            src={media.url}
            autoPlay
            muted={muted}
            loop
            playsInline
            className="h-full w-full object-contain"
          />
        ) : isAnimatedGif(media) ? (
          <AnimatedGif
            src={media.url}
            alt={media.title ?? ""}
            priority
            className="h-full w-full object-contain"
          />
        ) : (
          <ProgressiveImage
            src={media.url}
            alt={media.title ?? ""}
            priority
            className="h-full w-full object-contain"
          />
        )}
        {media.media_type === "video" ? (
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            className="absolute bottom-5 right-5 z-20 grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
            aria-label={muted ? text.profile.audio.soundOn : text.profile.audio.mute}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}

const MOBILE_MEDIA_DURATION = 15_000;

function MobileMediaViewer({
  media,
  initialIndex,
  model,
  avatar,
  onClose,
}: {
  media: GalleryMedia[];
  initialIndex: number;
  model: PublicModel;
  avatar: string;
  onClose: () => void;
}) {
  const text = usePublicText();
  const [index, setIndex] = useState(Math.min(initialIndex, media.length - 1));
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const elapsedRef = useRef(0);
  const pointerStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartDistance = useRef(0);
  const pinchStartZoom = useRef(1);
  const pinchGesture = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const goNext = useCallback(() => {
    setIndex((current) => (current + 1) % media.length);
  }, [media.length]);

  const goPrevious = useCallback(() => {
    setIndex((current) => (current - 1 + media.length) % media.length);
  }, [media.length]);

  useEffect(() => {
    elapsedRef.current = 0;
    setProgress(0);
    setMuted(false);
    setDragY(0);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    activePointers.current.clear();
    pinchGesture.current = false;
  }, [index]);

  useEffect(() => {
    if (zoom === 1) {
      setPan({ x: 0, y: 0 });
      return;
    }
    const maxX = (window.innerWidth * (zoom - 1)) / 2;
    const maxY = (window.innerHeight * (zoom - 1)) / 2;
    setPan((current) => ({
      x: Math.min(maxX, Math.max(-maxX, current.x)),
      y: Math.min(maxY, Math.max(-maxY, current.y)),
    }));
  }, [zoom]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    window.history.pushState(
      { ...(window.history.state ?? {}), famaflixMediaViewer: true },
      "",
      window.location.href,
    );
    const handleBrowserBack = () => onCloseRef.current();
    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  }, []);

  useEffect(() => {
    if (paused) return;
    let previous = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      elapsedRef.current += now - previous;
      previous = now;
      if (elapsedRef.current >= MOBILE_MEDIA_DURATION) {
        elapsedRef.current = 0;
        setProgress(0);
        goNext();
        return;
      }
      setProgress(elapsedRef.current / MOBILE_MEDIA_DURATION);
    }, 50);
    return () => window.clearInterval(timer);
  }, [goNext, index, paused]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) video.pause();
    else
      video.play().catch(() => {
        if (!muted) setMuted(true);
      });
  }, [index, muted, paused]);

  const current = media[index];
  const movementOpacity = Math.max(0.35, 1 - Math.abs(dragY) / 500);

  function distanceBetweenPointers() {
    const points = Array.from(activePointers.current.values());
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  function releasePointer(event: React.PointerEvent<HTMLDivElement>) {
    activePointers.current.delete(event.pointerId);
    if (activePointers.current.size > 0) return;

    const deltaX = event.clientX - pointerStart.current.x;
    const deltaY = event.clientY - pointerStart.current.y;
    const isVerticalSwipe =
      !pinchGesture.current &&
      zoom === 1 &&
      Math.abs(deltaY) > 60 &&
      Math.abs(deltaY) > Math.abs(deltaX);
    if (isVerticalSwipe) {
      if (deltaY < 0) goNext();
      else goPrevious();
    } else if (
      !pinchGesture.current &&
      current.media_type === "video" &&
      Math.abs(deltaX) < 12 &&
      Math.abs(deltaY) < 12
    ) {
      setMuted((value) => !value);
    }
    setDragY(0);
    setPaused(false);
    pinchGesture.current = false;
  }

  return (
    <div
      className="fixed inset-0 z-[100] select-none overflow-hidden bg-black text-white md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador de fotos e vídeos"
      style={{
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        pointerStart.current = { x: event.clientX, y: event.clientY };
        panStart.current = pan;
        event.currentTarget.setPointerCapture(event.pointerId);
        if (activePointers.current.size === 2) {
          pinchGesture.current = true;
          pinchStartDistance.current = distanceBetweenPointers();
          pinchStartZoom.current = zoom;
          setDragY(0);
        }
        setPaused(true);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (activePointers.current.size >= 2 && current.media_type === "image") {
          const distance = distanceBetweenPointers();
          if (pinchStartDistance.current > 0) {
            const nextZoom = pinchStartZoom.current * (distance / pinchStartDistance.current);
            setZoom(Math.min(4, Math.max(1, nextZoom)));
          }
          return;
        }
        if (zoom === 1 && !pinchGesture.current) {
          setDragY(event.clientY - pointerStart.current.y);
        } else if (zoom > 1 && !pinchGesture.current) {
          const maxX = (window.innerWidth * (zoom - 1)) / 2;
          const maxY = (window.innerHeight * (zoom - 1)) / 2;
          setPan({
            x: Math.min(
              maxX,
              Math.max(-maxX, panStart.current.x + event.clientX - pointerStart.current.x),
            ),
            y: Math.min(
              maxY,
              Math.max(-maxY, panStart.current.y + event.clientY - pointerStart.current.y),
            ),
          });
        }
      }}
      onPointerUp={releasePointer}
      onPointerCancel={(event) => {
        activePointers.current.delete(event.pointerId);
        if (activePointers.current.size === 0) {
          setDragY(0);
          setPaused(false);
          pinchGesture.current = false;
        }
      }}
    >
      <div className="absolute inset-x-3 top-[max(.75rem,env(safe-area-inset-top))] z-30">
        <div className="h-1 overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-75"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={avatar}
              alt=""
              className="h-9 w-9 rounded-full border border-white/30 object-cover"
            />
            <p className="text-sm font-black">{model.name}</p>
          </div>
          <button
            type="button"
            aria-label={text.profile.audio.close}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => window.history.back()}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/45 backdrop-blur"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        key={current.id}
        className="absolute inset-0 animate-[mobileMediaEnter_.22s_ease-out]"
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y + dragY}px, 0) scale(${
            zoom * (1 - Math.min(Math.abs(dragY) / 3000, 0.035))
          })`,
          opacity: movementOpacity,
          transformOrigin: "center",
        }}
      >
        {current.media_type === "video" ? (
          <video
            ref={videoRef}
            src={current.url}
            autoPlay
            muted={muted}
            loop
            playsInline
            preload="auto"
            className="pointer-events-none h-full w-full select-none object-contain"
          />
        ) : isAnimatedGif(current) ? (
          <AnimatedGif
            src={current.url}
            alt={current.title ?? ""}
            priority
            className="pointer-events-none h-full w-full select-none object-contain"
          />
        ) : (
          <ProgressiveImage
            src={current.url}
            alt={current.title ?? ""}
            draggable={false}
            priority
            className="pointer-events-none h-full w-full select-none object-contain"
          />
        )}
      </div>

      {current.media_type === "video" ? (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setMuted((value) => !value)}
          className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-5 z-30 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
          aria-label={muted ? text.profile.audio.soundOn : text.profile.audio.mute}
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-10 ring-1 ring-inset ring-white/5" />
      <style>{`
        @keyframes mobileMediaEnter {
          from { opacity: .35; transform: translate3d(0, 7%, 0) scale(.985); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
      `}</style>
    </div>
  );
}
