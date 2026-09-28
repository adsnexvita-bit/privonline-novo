import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Privadinhos Online" },
      { name: "description", content: "Termos de Uso da plataforma Privadinhos Online." },
      { property: "og:title", content: "Termos de Uso — Privadinhos Online" },
      { property: "og:description", content: "Regras e condições para uso da Privadinhos Online." },
      { property: "og:type", content: "article" },
    ],
  }),
  component: () => (
    <LegalPage
      title="Termos de Uso"
      subtitle="Regras e condições para uso da plataforma Privadinhos Online."
      sections={[
        {
          title: "1. Objeto",
          body: "A Privadinhos Online é uma plataforma de portfólios digitais e venda de acesso único a galerias de criadores. Todo o conteúdo é legal, autorizado e não explícito.",
        },
        {
          title: "2. Elegibilidade",
          body: "É necessário ter 18 anos ou mais para utilizar a plataforma. O telefone informado identifica o comprador e permite recuperar compras e acessos em outros dispositivos.",
        },
        {
          title: "3. Compras e pagamento único",
          body: "Cada acesso é adquirido individualmente e libera vitaliciamente o conteúdo do criador contratado, salvo em casos de reembolso ou chargeback.",
        },
        {
          title: "4. Uso do conteúdo",
          body: "O material disponibilizado é para consumo pessoal. É proibido redistribuir, comercializar ou copiar sem autorização.",
        },
        {
          title: "5. Suspensão de conta",
          body: "A Privadinhos Online pode suspender contas que violem estes termos ou tentem contornar mecanismos de proteção.",
        },
        {
          title: "6. Foro",
          body: "Fica eleito o foro do Brasil para dirimir eventuais controvérsias.",
        },
      ]}
    />
  ),
});
