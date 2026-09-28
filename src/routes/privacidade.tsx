import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Privadinhos Online" },
      { name: "description", content: "Como a Privadinhos Online coleta e protege seus dados." },
      { property: "og:title", content: "Política de Privacidade — Privadinhos Online" },
      {
        property: "og:description",
        content: "Como a Privadinhos Online coleta e protege seus dados.",
      },
      { property: "og:type", content: "article" },
    ],
  }),
  component: () => (
    <LegalPage
      title="Política de Privacidade"
      subtitle="Como a Privadinhos Online trata seus dados pessoais, em conformidade com a LGPD."
      sections={[
        {
          title: "Dados coletados",
          body: "Coletamos o telefone informado para identificar o comprador, vincular pagamentos e recuperar compras em qualquer dispositivo. Quando um provedor de pagamento exige outros dados técnicos, eles são preenchidos pelo servidor sem ampliar o formulário exibido ao usuário.",
        },
        {
          title: "Finalidade",
          body: "Utilizamos os dados para processar compras, liberar acesso, prevenir fraudes e atender solicitações legais.",
        },
        {
          title: "Compartilhamento",
          body: "Não vendemos seus dados. Compartilhamos apenas com provedores essenciais (pagamento, armazenamento) e quando exigido por lei.",
        },
        {
          title: "Segurança",
          body: "Utilizamos criptografia em trânsito, armazenamento privado com URLs temporárias, controle de acesso por RLS e sessões seguras por token.",
        },
        {
          title: "Direitos do titular",
          body: "Você pode solicitar acesso, correção, exclusão ou portabilidade dos seus dados pelo canal de contato.",
        },
        {
          title: "Retenção",
          body: "Mantemos os dados necessários enquanto houver relação com a plataforma ou obrigação legal. O acesso pode ser recuperado pelo telefone informado na compra, sem depender do dispositivo utilizado.",
        },
      ]}
    />
  ),
});
