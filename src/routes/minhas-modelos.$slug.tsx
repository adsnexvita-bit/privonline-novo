import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Flame, Play, X, AlertTriangle, Images, Film, Volume2, VolumeX } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { ProgressiveImage } from "@/components/ProgressiveImage";
import { RouteLoadingOverlay } from "@/components/ui/RouteLoadingOverlay";
import { getSession } from "@/lib/session";
import { listMyModelMedia, type PrivateMediaItem } from "@/lib/access.functions";

export const Route = createFileRoute("/minhas-modelos/$slug")({
  head: () => ({
    meta: [
      { title: "Galeria privada — Privadinhos Online" },
      { name: "description", content: "Acesse a galeria privada do criador liberada para você." },
      { property: "og:title", content: "Galeria privada — Privadinhos Online" },
      { property: "og:description", content: "Conteúdo privado liberado com pagamento único." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrivateGallery,
});

function PrivateGallery() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const fetchMedia = useServerFn(listMyModelMedia);
  const [session, setSession] = useState(() => getSession());
  const [viewer, setViewer] = useState<PrivateMediaItem | null>(null);
  const [filter, setFilter] = useState<"all" | "video" | "image">("all");

  useEffect(() => {
    const onChange = () => setSession(getSession());
    window.addEventListener("famaflix:session", onChange);
    return () => window.removeEventListener("famaflix:session", onChange);
  }, []);

  useEffect(() => {
    if (!session) navigate({ to: "/acesso" });
  }, [session, navigate]);

  const query = useQuery({
    queryKey: ["private-media", slug, session?.token],
    queryFn: () => fetchMedia({ data: { token: session!.token, modelSlug: slug } }),
    enabled: !!session,
    retry: false,
    // Signed URLs expire — keep short freshness window.
    staleTime: 5 * 60 * 1000,
  });

  const contents = query.data?.media ?? [];
  const filteredContents = useMemo(
    () => (filter === "all" ? contents : contents.filter((item) => item.media_type === filter)),
    [contents, filter],
  );

  if (!session) return null;

  return (
    <PageShell>
      <Link
        to="/minhas-modelos"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para minhas galerias
      </Link>

      {query.isPending ? (
        <RouteLoadingOverlay />
      ) : query.isError ? (
        <div className="mt-8 rounded-3xl border border-destructive/40 bg-destructive/5 py-16 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="mt-4 text-xl font-bold">Não foi possível abrir a galeria</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {query.error instanceof Error ? query.error.message : "Erro desconhecido"}
          </p>
        </div>
      ) : (
        <>
          <header className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                {query.data.model.name}
              </h1>
              <p className="text-sm text-muted-foreground">@{query.data.model.username}</p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
              <Flame className="h-3.5 w-3.5" />
              {contents.length} conteúdos secretos
            </div>
          </header>

          <nav className="mt-6 flex w-fit items-center rounded-2xl border border-border bg-surface p-1" aria-label="Filtrar conteúdos">
            {([
              ["all", "Todos"],
              ["video", "Vídeos"],
              ["image", "Fotos"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`min-h-10 rounded-xl px-4 text-sm font-bold transition sm:px-5 ${filter === value ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </nav>

          {filteredContents.length === 0 ? (
            <div className="mt-10 rounded-3xl border border-dashed border-border bg-surface/50 py-16 text-center">
              <Images className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                Nenhum conteúdo neste filtro ainda.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {filteredContents.map((m) => (
                <PrivateTile key={m.id} media={m} onOpen={() => setViewer(m)} />
              ))}
            </div>
          )}
        </>
      )}

      {viewer && query.data ? (
        <Viewer media={viewer} maskedPhone={query.data.maskedPhone} onClose={() => setViewer(null)} />
      ) : null}
    </PageShell>
  );
}

function PrivateTile({ media, onOpen }: { media: PrivateMediaItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus-visible:translate-y-0"
    >
      {media.media_type === "video" ? (
        <>
          <video
            src={media.url}
            className="absolute inset-0 h-full w-full object-cover object-center"
            muted
            playsInline
            preload="metadata"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-primary shadow-xl backdrop-blur transition duration-300 group-hover:scale-110">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </div>
          </div>
          <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-bold uppercase text-foreground backdrop-blur">
            <Film className="h-3 w-3" /> Vídeo
          </span>
        </>
      ) : (
        <ProgressiveImage
          src={media.url}
          alt={media.title ?? ""}
          className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
        />
      )}
    </button>
  );
}

function Viewer({
  media,
  maskedPhone,
  onClose,
}: {
  media: PrivateMediaItem;
  maskedPhone: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Navegadores permitem autoplay de vídeo somente sem som; o botão inferior
  // libera o áudio quando a pessoa decidir ativá-lo.
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(media.media_type === "video");
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black p-0 sm:bg-black/95 sm:p-6"
      onClick={onClose}
    >
      <div className="relative h-[100dvh] w-full max-w-[min(100vw,620px)] overflow-hidden bg-black sm:h-[min(92vh,900px)] sm:rounded-[28px] sm:border sm:border-white/15" onClick={(e) => e.stopPropagation()}>
        <div className="absolute inset-x-5 top-5 z-20 flex gap-1.5">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
            <span className="block h-full origin-left bg-white transition-transform duration-200" style={{ transform: `scaleX(${media.media_type === "video" ? progress : 1})` }} />
          </span>
        </div>
        <div className="absolute inset-x-5 top-9 z-20 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3 text-white drop-shadow-md">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/30 bg-white/10 text-sm font-black backdrop-blur">{media.title?.slice(0, 1).toUpperCase() ?? "P"}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black">Conteúdo privado</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/75">Privadinhos Online</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-black/35 text-white backdrop-blur transition hover:bg-black/55"><X className="h-6 w-6" /></button>
        </div>
        {media.media_type === "video" ? (
          <>
            <video
              ref={videoRef}
              src={media.url}
              autoPlay
              muted={muted}
              playsInline
              controlsList="nodownload"
              onContextMenu={(e) => e.preventDefault()}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(event) => setProgress(event.currentTarget.duration ? event.currentTarget.currentTime / event.currentTarget.duration : 0)}
              className="h-full w-full object-contain"
            />
            {!playing ? <button type="button" onClick={() => void videoRef.current?.play()} aria-label="Reproduzir vídeo" className="absolute inset-0 z-10 grid place-items-center bg-black/15"><span className="grid h-16 w-16 place-items-center rounded-full bg-white/90 text-primary shadow-2xl"><Play className="ml-1 h-7 w-7 fill-current" /></span></button> : null}
          </>
        ) : (
          <ProgressiveImage
            src={media.url}
            alt={media.title ?? ""}
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
            priority
            className="h-full w-full object-contain"
          />
        )}
        <Watermark identifier={maskedPhone} />
        {media.media_type === "video" ? <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Ativar som" : "Desativar som"} className="absolute bottom-6 right-5 z-20 grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur transition hover:bg-black/65">{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button> : null}
      </div>
    </div>
  );
}

function Watermark({ identifier }: { identifier: string }) {
  // Discreet, non-obscuring watermark repeated across the viewer.
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      style={{
        backgroundImage: `repeating-linear-gradient(-30deg, transparent 0 140px, transparent 140px 141px)`,
      }}
    >
      <div
        className="absolute inset-0 flex flex-wrap content-around justify-around gap-4 p-6 text-[11px] font-semibold uppercase tracking-widest text-white/25 mix-blend-overlay"
        style={{ transform: "rotate(-24deg) scale(1.2)" }}
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className="whitespace-nowrap">
            Privadinhos Online · {identifier}
          </span>
        ))}
      </div>
    </div>
  );
}
