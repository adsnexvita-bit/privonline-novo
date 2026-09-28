import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";

export function PageShell({
  children,
  fullBleed = false,
  whiteBackground = false,
  hideFooter = false,
  hideFooterBorder = false,
  hideHeader = false,
}: {
  children: ReactNode;
  fullBleed?: boolean;
  whiteBackground?: boolean;
  hideFooter?: boolean;
  hideFooterBorder?: boolean;
  hideHeader?: boolean;
}) {
  return (
    <div
      className={`public-theme ${whiteBackground ? "bg-background" : "public-shell"} flex min-h-screen min-h-dvh flex-col pb-[env(safe-area-inset-bottom)] text-foreground`}
    >
      {!hideHeader ? <Header /> : null}
      <main
        className={`public-content relative w-full flex-1 ${
          fullBleed
            ? ""
            : "mx-auto max-w-[78rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10"
        }`}
      >
        {children}
      </main>
      {!hideFooter ? <Footer bordered={!hideFooterBorder} /> : null}
    </div>
  );
}
