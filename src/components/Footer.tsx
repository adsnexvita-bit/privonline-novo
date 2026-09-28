import { Logo } from "./Logo";
import { Link } from "@tanstack/react-router";

export function Footer({ bordered = true }: { bordered?: boolean }) {
  return (
    <footer
      className={`relative mt-auto w-full bg-white ${bordered ? "border-t border-border" : ""}`}
    >
      <div className="mx-auto flex max-w-[78rem] flex-col items-center gap-4 px-5 py-8 text-center sm:px-8">
        <Link
          to="/"
          aria-label="Ir para a página inicial"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
        >
          <Logo className="h-7 sm:h-8" />
        </Link>
        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
          © {new Date().getFullYear()} Privadinhos Online. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
