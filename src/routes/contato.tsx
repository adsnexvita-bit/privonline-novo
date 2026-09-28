import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/contato")({
  head: () => ({
    meta: [
      { title: "Contato — Privadinhos Online" },
      { name: "description", content: "Fale com a equipe Privadinhos Online." },
      { property: "og:title", content: "Contato — Privadinhos Online" },
      {
        property: "og:description",
        content: "Canais oficiais de atendimento da Privadinhos Online.",
      },
      { property: "og:type", content: "article" },
    ],
  }),
  component: () => (
    <LegalPage
      title="Contato"
      subtitle="Canais oficiais para suporte, dúvidas, denúncias e solicitações."
      sections={[
        {
          title: "Suporte ao cliente",
          body: "E-mail: suporte@famaflix.com\nHorário: seg. a sex., 9h às 18h (horário de Brasília).",
        },
        { title: "Denúncias e remoção", body: "E-mail: denuncia@famaflix.com" },
        { title: "Privacidade e LGPD", body: "E-mail: privacidade@famaflix.com" },
        {
          title: "Encarregado (DPO)",
          body: "Envie sua solicitação ao e-mail de privacidade indicando 'DPO' no assunto.",
        },
      ]}
    />
  ),
});
