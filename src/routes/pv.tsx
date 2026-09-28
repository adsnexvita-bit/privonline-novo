import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { Logo } from "@/components/Logo";

const META_PIXEL_ID = "2553822528391189";
const META_PIXEL_SCRIPT_ID = "famaflix-pv-meta-pixel";
const PRESELL_SESSION_KEY = "famaflix:entered-via-pv";

type MetaPixelFunction = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: (...args: unknown[]) => void;
};

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
  }
}

export const Route = createFileRoute("/pv")({
  head: () => ({
    meta: [
      { title: "Conteúdos exclusivos — Privadinhos Online" },
      {
        name: "description",
        content: "Conheça a plataforma Privadinhos Online e acesse conteúdos exclusivos.",
      },
      { name: "robots", content: "index,follow" },
      { property: "og:title", content: "Conteúdos exclusivos — Privadinhos Online" },
      {
        property: "og:description",
        content: "Conheça a plataforma Privadinhos Online e acesse conteúdos exclusivos.",
      },
    ],
  }),
  component: PreSellPage,
});

function PreSellPage() {
  useEffect(() => {
    if (window.location.pathname !== "/pv") return;

    try {
      sessionStorage.setItem(PRESELL_SESSION_KEY, "1");
    } catch {
      // The page still works when browser storage is unavailable.
    }

    if (!window.fbq) {
      const fbq = function (...args: unknown[]) {
        if (fbq.callMethod) {
          fbq.callMethod(...args);
        } else {
          fbq.queue.push(args);
        }
      } as MetaPixelFunction;
      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = "2.0";
      fbq.push = (...args: unknown[]) => fbq(...args);
      window.fbq = fbq;
      window._fbq = fbq;
    }

    if (!document.getElementById(META_PIXEL_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = META_PIXEL_SCRIPT_ID;
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(script);
    }

    window.fbq("init", META_PIXEL_ID);
    window.fbq("track", "PageView");

    return () => {
      document.getElementById(META_PIXEL_SCRIPT_ID)?.remove();
    };
  }, []);

  return (
    <main className="public-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 text-foreground sm:px-6">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-24 top-[8%] h-72 w-72 rounded-full bg-primary/15 blur-[100px]" />
        <div className="absolute -right-28 bottom-[5%] h-80 w-80 rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      </div>

      <section className="relative w-full max-w-6xl px-1 py-8 text-center sm:px-8 sm:py-14">
        <Logo className="relative mx-auto h-12 sm:h-16" />

        <h1 className="relative mx-auto mt-12 max-w-5xl text-balance text-[2.55rem] font-[300] leading-[1.03] tracking-[-0.055em] text-foreground sm:mt-16 sm:text-6xl lg:text-[5rem]">
          Tenha acesso a{" "}
          <span className="font-[550] text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/.28)]">
            conteúdos secretos e picantes
          </span>{" "}
          jamais postados antes na internet.
        </h1>

        <p className="relative mx-auto mt-8 max-w-2xl px-4 text-pretty text-base font-medium leading-[1.75] text-muted-foreground sm:mt-10 sm:text-xl">
          Toque no botão abaixo e acesse a plataforma imediatamente.
        </p>

        <Link
          to="/"
          className="btn-primary relative mx-auto mt-8 flex min-h-14 w-full max-w-md items-center justify-center gap-2 rounded-2xl px-6 text-base font-black shadow-[0_18px_45px_-18px_hsl(var(--primary))] transition hover:-translate-y-0.5 hover:brightness-110 sm:mt-10 sm:min-h-16 sm:text-lg"
        >
          Continuar
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>

        <p className="relative mt-5 text-xs font-medium text-muted-foreground">
          Conteúdo destinado exclusivamente a maiores de 18 anos.
        </p>

        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
      </section>
    </main>
  );
}
