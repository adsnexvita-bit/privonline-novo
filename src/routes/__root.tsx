import { QueryClient, QueryClientProvider, useIsFetching } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AgeGate } from "../components/AgeGate";
import { AnonymousPresenceTracker } from "../components/AnonymousPresenceTracker";
import { captureMarketingAttribution } from "../lib/marketing-attribution";
import { getErrorMessage, isChunkLoadError } from "../lib/error-recovery";
import { ADMIN_PWA_BOOTSTRAP_SCRIPT } from "../lib/admin-pwa-bootstrap";
import { RouteLoadingOverlay } from "../components/ui/RouteLoadingOverlay";
import { UtmifyTracking } from "../components/UtmifyTracking";

const CLARITY_PROJECT_ID = "xu390fh7gy";
const GOOGLE_TAG_ID = "G-N90DLL0BJ4";

type AnalyticsWindow = Window &
  typeof globalThis & {
    __privadinhosAnalyticsStarted?: boolean;
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] };
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  };

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  useEffect(() => {
    if (!isChunkLoadError(error)) return;
    const fingerprint = `${window.location.pathname}:${getErrorMessage(error).slice(0, 120)}`;
    const storageKey = "privadinhos:chunk-page-recovery";
    let alreadyRetried = false;

    try {
      alreadyRetried = sessionStorage.getItem(storageKey) === fingerprint;
      if (!alreadyRetried) sessionStorage.setItem(storageKey, fingerprint);
    } catch {
      alreadyRetried = true;
    }

    if (alreadyRetried) return;
    const timer = window.setTimeout(() => window.location.reload(), 500);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight">Não foi possível carregar esta tela</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Sua sessão continua segura. Tente carregar o conteúdo novamente.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-12 rounded-xl bg-primary px-6 font-semibold text-white"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "Privadinhos Online" },
      {
        name: "description",
        content:
          "Compre uma única vez e tenha acesso completo à galeria dos seus criadores favoritos. Sem assinatura mensal.",
      },
      { property: "og:title", content: "Privadinhos Online" },
      { name: "twitter:title", content: "Privadinhos Online" },
      {
        property: "og:description",
        content:
          "Compre uma única vez e tenha acesso completo à galeria dos seus criadores favoritos. Sem assinatura mensal.",
      },
      {
        name: "twitter:description",
        content:
          "Compre uma única vez e tenha acesso completo à galeria dos seus criadores favoritos. Sem assinatura mensal.",
      },
      {
        property: "og:image",
        content: "https://privadinhos.online/social-share.jpg",
      },
      {
        property: "og:image:secure_url",
        content: "https://privadinhos.online/social-share.jpg",
      },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1150" },
      { property: "og:image:height", content: "500" },
      { property: "og:image:alt", content: "Privadinhos" },
      {
        name: "twitter:image",
        content: "https://privadinhos.online/social-share.jpg",
      },
      { name: "twitter:image:alt", content: "Privadinhos" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: ADMIN_PWA_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function DeferredAnalytics() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const analyticsWindow = window as AnalyticsWindow;
    if (analyticsWindow.__privadinhosAnalyticsStarted) return;

    const start = () => {
      if (analyticsWindow.__privadinhosAnalyticsStarted) return;
      analyticsWindow.__privadinhosAnalyticsStarted = true;

      analyticsWindow.dataLayer ??= [];
      analyticsWindow.gtag = (...args: unknown[]) => analyticsWindow.dataLayer?.push(args);
      analyticsWindow.gtag("js", new Date());
      analyticsWindow.gtag("config", GOOGLE_TAG_ID);

      const googleScript = document.createElement("script");
      googleScript.async = true;
      googleScript.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`;
      document.head.appendChild(googleScript);

      const clarity = ((...args: unknown[]) => {
        clarity.q ??= [];
        clarity.q.push(args);
      }) as AnalyticsWindow["clarity"];
      analyticsWindow.clarity = clarity;
      const clarityScript = document.createElement("script");
      clarityScript.async = true;
      clarityScript.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
      document.head.appendChild(clarityScript);
    };

    const timeout = window.setTimeout(start, 1_200);
    return () => window.clearTimeout(timeout);
  }, [pathname]);

  return null;
}

function PublicContentProtection() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (pathname.startsWith("/admin")) {
      document.body.classList.remove("content-protected");
      return;
    }

    const prevent = (event: Event) => event.preventDefault();
    const preventProtectedShortcuts = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const inspectShortcut =
        event.key === "F12" ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && ["c", "i", "j"].includes(key)) ||
        (event.metaKey && event.altKey && ["c", "i", "j", "u"].includes(key));
      const documentShortcut = (event.ctrlKey || event.metaKey) && ["p", "s", "u"].includes(key);

      if (inspectShortcut || documentShortcut) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.body.classList.add("content-protected");
    document.addEventListener("contextmenu", prevent, { capture: true });
    document.addEventListener("dragstart", prevent, { capture: true });
    document.addEventListener("keydown", preventProtectedShortcuts, { capture: true });

    return () => {
      document.body.classList.remove("content-protected");
      document.removeEventListener("contextmenu", prevent, { capture: true });
      document.removeEventListener("dragstart", prevent, { capture: true });
      document.removeEventListener("keydown", preventProtectedShortcuts, { capture: true });
    };
  }, [pathname]);

  return null;
}

function GlobalNavigationLoading() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const routerStatus = useRouterState({ select: (state) => state.status });
  const fetchingCount = useIsFetching();
  const previousPathname = useRef(pathname);
  const navigationStartedAt = useRef(0);
  const [navigationActive, setNavigationActive] = useState(false);

  useEffect(() => {
    const handleNavigationIntent = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      if (nextUrl.origin !== currentUrl.origin) return;
      if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) return;

      navigationStartedAt.current = performance.now();
      document.body.classList.add("route-navigation-pending");
      setNavigationActive(true);
    };

    document.addEventListener("click", handleNavigationIntent, true);
    return () => document.removeEventListener("click", handleNavigationIntent, true);
  }, []);

  useEffect(() => {
    if (routerStatus === "pending") {
      if (!navigationStartedAt.current) navigationStartedAt.current = performance.now();
      document.body.classList.add("route-navigation-pending");
      setNavigationActive(true);
    }
  }, [routerStatus]);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    if (!navigationStartedAt.current) navigationStartedAt.current = performance.now();
    document.body.classList.add("route-navigation-pending");
    setNavigationActive(true);
  }, [pathname]);

  useEffect(() => {
    if (!navigationActive || routerStatus === "pending" || fetchingCount > 0) return;
    const elapsed = performance.now() - navigationStartedAt.current;
    const delay = Math.max(0, 360 - elapsed);
    const timer = window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          navigationStartedAt.current = 0;
          document.body.classList.remove("route-navigation-pending");
          setNavigationActive(false);
        });
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [fetchingCount, navigationActive, routerStatus]);

  useEffect(() => () => document.body.classList.remove("route-navigation-pending"), []);

  return <RouteLoadingOverlay visible={navigationActive} />;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    captureMarketingAttribution();

    // A successful render releases the recovery budget for a future, unrelated failure.
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem("privadinhos:chunk-page-recovery");
        sessionStorage.removeItem(`privadinhos:server-auto-recovery:${window.location.pathname}`);
      } catch {
        // Ignore storage restrictions in private browsing.
      }
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <GlobalNavigationLoading />
      <AnonymousPresenceTracker />
      <AgeGate />
      <DeferredAnalytics />
      <UtmifyTracking />
      <PublicContentProtection />
    </QueryClientProvider>
  );
}
