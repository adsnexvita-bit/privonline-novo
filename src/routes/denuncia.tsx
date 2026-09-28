import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/denuncia")({
  head: () => ({
    meta: [
      { title: "Canal de Denúncia — Privadinhos Online" },
      { name: "description", content: "Denuncie violações ou conteúdos inadequados." },
      { property: "og:title", content: "Canal de Denúncia — Privadinhos Online" },
      {
        property: "og:description",
        content: "Reporte violações na plataforma Privadinhos Online.",
      },
      { property: "og:type", content: "article" },
    ],
  }),
  component: () => (
    <LegalPage
      title="Canal de Denúncia"
      subtitle="Reporte conteúdos ou comportamentos que violem nossas políticas."
      sections={[
        {
          title: "O que denunciar",
          body: "Conteúdo ilegal, uso não autorizado de imagem, suspeita de fraude, exploração de menores, incitação ao ódio ou qualquer violação de direitos.",
        },
        {
          title: "Como denunciar",
          body: "Envie um e-mail ao canal de contato com descrição detalhada, links, capturas de tela e sua identificação (opcional em casos anônimos, mas recomendada para acompanhamento).",
        },
        {
          title: "Sigilo",
          body: "Sua identidade é protegida. Compartilhamos informações apenas com autoridades quando exigido por lei.",
        },
        {
          title: "Ação",
          body: "Denúncias sérias resultam em remoção imediata do conteúdo e, quando aplicável, encaminhamento às autoridades.",
        },
      ]}
    />
  ),
});
