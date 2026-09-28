import { PageShell } from "./PageShell";

export type LegalSection = { title: string; body: string };

export function LegalPage({
  title,
  subtitle,
  updatedAt = "22/07/2026",
  sections,
}: {
  title: string;
  subtitle?: string;
  updatedAt?: string;
  sections: LegalSection[];
}) {
  return (
    <PageShell>
      <article className="mx-auto max-w-3xl">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Documento legal</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">{subtitle}</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Última atualização: {updatedAt}</p>
        </header>

        <div className="space-y-6">
          {sections.map((s, i) => (
            <section key={i} className="card-premium rounded-2xl p-5">
              <h2 className="text-lg font-bold text-foreground">{s.title}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </section>
          ))}
        </div>
      </article>
    </PageShell>
  );
}
