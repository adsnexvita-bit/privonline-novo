import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { getSession } from "@/lib/session";

const KEY = "famaflix:age-confirmed-at";
const PRESELL_SESSION_KEY = "famaflix:entered-via-pv";
const AGE_CONFIRMATION_DURATION = 4 * 60 * 60 * 1000;

export function AgeGate() {
  const [ready, setReady] = useState(false);
  const [confirmed, setConfirmed] = useState(true);
  const accepting = useRef(false);

  useEffect(() => {
    if (window.location.pathname === "/pv") {
      setConfirmed(true);
      setReady(true);
      return;
    }
    const checkConfirmation = () => {
      try {
        if (sessionStorage.getItem(PRESELL_SESSION_KEY) === "1") {
          setConfirmed(true);
          return;
        }
        if (getSession()) {
          setConfirmed(true);
          return;
        }
        const confirmedAt = Number(localStorage.getItem(KEY));
        setConfirmed(
          Number.isFinite(confirmedAt) && Date.now() - confirmedAt < AGE_CONFIRMATION_DURATION,
        );
      } catch {
        setConfirmed(false);
      }
    };
    checkConfirmation();
    const expiryTimer = window.setInterval(checkConfirmation, 60_000);
    window.addEventListener("famaflix:session", checkConfirmation);
    window.addEventListener("storage", checkConfirmation);
    setReady(true);
    return () => {
      window.clearInterval(expiryTimer);
      window.removeEventListener("famaflix:session", checkConfirmation);
      window.removeEventListener("storage", checkConfirmation);
    };
  }, []);

  if (!ready || confirmed) return null;

  function accept() {
    if (accepting.current) return;
    accepting.current = true;
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setConfirmed(true);
  }

  return (
    <div className="fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-center bg-black px-5 py-10 text-center">
      <div className="w-full max-w-xl rounded-[2rem] bg-white px-6 py-10 text-[#111] shadow-2xl sm:rounded-[2.5rem] sm:px-12 sm:py-14">
        <Logo className="mx-auto h-10 sm:h-12" />
        <h2 className="mt-12 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
          Confirmação de Idade
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-[#666] sm:text-xl">
          Por favor, confirme sua idade para continuar.
        </p>
        <div className="mt-9">
          <button
            type="button"
            onPointerUp={accept}
            onClick={accept}
            className="min-h-16 w-full touch-manipulation rounded-2xl bg-[#ff7818] px-5 py-4 text-lg font-black text-white transition hover:bg-[#f1690b] active:scale-[0.99] sm:text-xl"
          >
            Tenho mais de 18 anos
          </button>
        </div>
      </div>
      <nav className="mt-10 flex items-center justify-center gap-2 text-base text-white/65 sm:text-lg">
        <a href="/privacidade" className="transition hover:text-white">
          Política de Privacidade
        </a>
        <span aria-hidden>•</span>
        <a href="/termos" className="transition hover:text-white">
          Termos de Uso
        </a>
      </nav>
    </div>
  );
}
