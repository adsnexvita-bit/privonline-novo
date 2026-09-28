import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/remocao")({
  head: () => ({
    meta: [
      { title: "Solicitação de Remoção — Privadinhos Online" },
      {
        name: "description",
        content: "Solicite a remoção de conteúdo ou dados na Privadinhos Online.",
      },
      { property: "og:title", content: "Solicitação de Remoção — Privadinhos Online" },
      { property: "og:description", content: "Canal para pedidos de remoção de conteúdo." },
      { property: "og:type", content: "article" },
    ],
  }),
  component: () => (
    <LegalPage
      title="Solicitação de Remoção"
      subtitle="Peça a remoção de conteúdo, imagem ou dados pessoais."
      sections={[
        {
          title: "Quem pode solicitar",
          body: "Titulares de imagem, representantes legais, autoridades competentes e qualquer pessoa cujos direitos estejam sendo violados.",
        },
        {
          title: "Como enviar",
          body: "Encaminhe um pedido formal para o canal de contato informando: nome completo, documento oficial, descrição do conteúdo, link/URL e justificativa.",
        },
        {
          title: "Prazo",
          body: "Analisaremos e responderemos em até 5 dias úteis. Conteúdos flagrantemente ilegais são removidos imediatamente após verificação.",
        },
        {
          title: "Confidencialidade",
          body: "As solicitações são tratadas de forma sigilosa e usadas somente para atender o pedido.",
        },
      ]}
    />
  ),
});
