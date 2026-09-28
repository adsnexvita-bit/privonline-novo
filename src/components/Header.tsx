import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LogOut, Menu, UserCircle2, X } from "lucide-react";
import { Logo } from "./Logo";
import { getSession, clearSession, type CpfSession } from "@/lib/session";
import { useServerFn } from "@tanstack/react-start";
import { endPhoneSession } from "@/lib/access.functions";
import { usePublicText } from "@/lib/locale";

const navLinks = [
  { to: "/", labelKey: "library" },
  { to: "/categorias", labelKey: "categories" },
  { to: "/minhas-modelos", labelKey: "myGalleries" },
] as const;

export function Header() {
  const text = usePublicText();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<CpfSession | null>(null);
  const endSession = useServerFn(endPhoneSession);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isHome = pathname === "/";

  useEffect(() => {
    const refreshAccountState = async () => {
      const nextSession = getSession();
      setSession(nextSession);
    };
    void refreshAccountState();
    const onChange = () => void refreshAccountState();
    window.addEventListener("famaflix:session", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("famaflix:session", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function logout() {
    const token = session?.token;
    clearSession();
    setSession(null);
    setOpen(false);
    if (token) {
      try {
        await endSession({ data: { token } });
      } catch {
        // ignore
      }
    }
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur-xl">
        <div
          className={`relative mx-auto h-16 max-w-[78rem] items-center gap-3 px-4 sm:px-6 md:h-[72px] md:px-8 ${
            isHome
              ? "grid grid-cols-[3rem_1fr_3rem] md:grid-cols-[1fr_auto_1fr]"
              : "flex justify-between"
          }`}
        >
          {isHome ? <span className="block h-11 w-11 md:hidden" aria-hidden /> : null}

          {isHome ? (
            <nav className="hidden items-center gap-7 justify-self-start md:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="border-b-2 border-transparent py-6 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "border-primary text-foreground" }}
                >
                  {text.nav[link.labelKey]}
                </Link>
              ))}
            </nav>
          ) : null}

          <Link
            to="/"
            aria-label={text.nav.home}
            className={`${isHome ? "mx-auto" : "mr-auto"} flex shrink-0 items-center`}
          >
            <Logo className="h-8 sm:h-9 md:h-10" />
          </Link>

          {isHome ? (
            <div className="hidden items-center gap-2 justify-self-end md:flex">
              <Link
                to="/acesso"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary"
              >
                <UserCircle2 className="h-4 w-4 text-primary" />
                {text.nav.myAccount}
              </Link>
              {session ? (
                <button
                  onClick={logout}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary"
                >
                  <LogOut className="h-3.5 w-3.5" /> {text.nav.logout}
                </button>
              ) : null}
            </div>
          ) : (
            <Link
              to="/acesso"
              className="inline-flex min-h-11 items-center gap-1.5 justify-self-end rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:px-4 sm:text-sm"
            >
              <UserCircle2 className="h-4 w-4 text-primary" />
              {text.nav.myAccount}
            </Link>
          )}

          {isHome ? (
            <button
              aria-label={text.nav.openMenu}
              className="grid h-11 w-11 place-items-center rounded-full border border-border bg-white text-foreground md:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </header>

      {open && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                aria-label={text.nav.closeMenu}
                className="fixed inset-0 z-[90] bg-black/35 backdrop-blur-sm md:hidden"
                onClick={() => setOpen(false)}
              />
              <div
                className="public-theme public-glass fixed inset-x-3 top-3 z-[100] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl p-4 md:hidden"
                role="dialog"
                aria-modal="true"
                aria-label={text.nav.mainMenu}
              >
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <Link to="/" onClick={() => setOpen(false)}>
                    <Logo className="h-9" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={text.nav.closeMenu}
                    className="grid h-12 w-12 place-items-center rounded-full border border-primary/50 bg-surface text-foreground shadow-[0_0_0_3px_rgba(255,92,0,0.14)]"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <nav className="mt-3 flex flex-col gap-1" aria-label={text.nav.mainMenu}>
                  {navLinks.map((l) => (
                    <Link
                      key={l.to}
                      to={l.to}
                      onClick={() => setOpen(false)}
                      className="flex min-h-12 items-center rounded-xl px-4 py-3 text-base font-semibold text-muted-foreground hover:bg-surface hover:text-foreground"
                    >
                      {text.nav[l.labelKey]}
                    </Link>
                  ))}
                </nav>
                <Link
                  to="/acesso"
                  onClick={() => setOpen(false)}
                  className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-base font-semibold text-foreground"
                >
                  <UserCircle2 className="h-4 w-4 text-primary" /> {text.nav.myAccount}
                </Link>
                {session ? (
                  <button
                    onClick={logout}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-base font-semibold text-foreground"
                  >
                    <LogOut className="h-4 w-4" /> {text.nav.logout} ({session.name.split(" ")[0]})
                  </button>
                ) : null}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
