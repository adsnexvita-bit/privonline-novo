import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/reembolso")({
  head: () => ({
    meta: [
      { title: "Política de Reembolso — Privadinhos Online" },
      { name: "description", content: "Como funciona o reembolso na Privadinhos Online." },
      { property: "og:title", content: "Política de Reembolso — Privadinhos Online" },
      { property: "og:description", content: "Regras de reembolso conforme o CDC." },
      { property: "og:type", content: "article" },
    ],
  }),
  component: () => (
    <LegalPage
      title="Política de Reembolso"
      subtitle="Regras de reembolso de acesso a galerias na Privadinhos Online."
      sections={[
        {
          title: "Direito de arrependimento",
          body: "Conforme o art. 49 do CDC, você pode solicitar o reembolso em até 7 dias corridos após a compra, desde que ainda não tenha consumido significativamente o conteúdo.",
        },
        {
          title: "Como solicitar",
          body: "Envie a solicitação pelo canal de contato informando o telefone usado na compra, criador e motivo. O prazo de resposta é de até 5 dias úteis.",
        },
        {
          title: "Cancelamento após aprovação",
          body: "Ao aprovar o reembolso, o acesso à galeria correspondente é revogado automaticamente.",
        },
        {
          title: "Chargebacks",
          body: "Casos de chargeback também resultam em revogação automática do acesso.",
        },
      ]}
    />
  ),
});
