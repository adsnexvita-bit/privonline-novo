import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { fetchAdminIdentity } from "@/lib/admin-helpers";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Privadinhos Online Admin" },
      { name: "description", content: "Painel administrativo Privadinhos Online." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already signed in as admin, jump to dashboard.
  useEffect(() => {
    fetchAdminIdentity()
      .then((ident) => {
        if (ident) navigate({ to: "/admin", replace: true });
      })
      .catch(() => {
        // Keep the login form usable when the session check times out/offline.
      });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const signIn = await supabase.auth.signInWithPassword({ email, password });
      if (signIn.error) throw signIn.error;

      const ident = await fetchAdminIdentity();
      if (!ident) {
        await supabase.auth.signOut();
        throw new Error("Este usuário não possui acesso ao painel.");
      }
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-shell grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Link to="/">
            <Logo className="h-12" />
          </Link>
          <p className="mt-1 text-sm font-bold text-muted-foreground">Painel administrativo</p>
        </div>

        <form onSubmit={onSubmit} className="admin-glass rounded-3xl p-6 sm:p-8">
          <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-black">Entrar</h1>

          <label className="mt-5 block text-sm font-bold text-foreground">E-mail</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 min-h-12 w-full rounded-xl border border-border bg-input px-4 py-3 text-base outline-none focus:border-primary"
            placeholder="voce@privacy.com"
          />

          <label className="mt-4 block text-sm font-bold text-foreground">Senha</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 min-h-12 w-full rounded-xl border border-border bg-input px-4 py-3 text-base outline-none focus:border-primary"
            placeholder="••••••••"
          />

          {error && (
            <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary mt-6 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-bold disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Acessar painel
          </button>
        </form>
      </div>
    </div>
  );
}
