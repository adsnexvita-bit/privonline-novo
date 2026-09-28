import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/politica-conteudo")({
  head: () => ({
    meta: [
      { title: "Política de Conteúdo — Privadinhos Online" },
      { name: "description", content: "Regras de conteúdo publicado na Privadinhos Online." },
      { property: "og:title", content: "Política de Conteúdo — Privadinhos Online" },
      { property: "og:description", content: "Conteúdo legal, autorizado e não explícito." },
      { property: "og:type", content: "article" },
    ],
  }),
  component: () => (
    <LegalPage
      title="Política de Conteúdo"
      subtitle="A Privadinhos Online hospeda apenas conteúdo legal, autorizado e não explícito."
      sections={[
        {
          title: "Conteúdo permitido",
          body: "Portfólios digitais, fotos de moda, editoriais, ensaios profissionais, vídeos de bastidores e materiais autorais devidamente autorizados.",
        },
        {
          title: "Conteúdo proibido",
          body: "Conteúdo sexual explícito, nudez integral, apologia ao crime, incitação ao ódio, violência, material envolvendo menores de idade em contexto inadequado, ou qualquer conteúdo ilegal.",
        },
        {
          title: "Autorizações",
          body: "Todo criador deve possuir maioridade comprovada, autorização de uso de imagem assinada e documento de identidade arquivado privadamente na plataforma.",
        },
        {
          title: "Moderação",
          body: "A equipe Privadinhos Online pode remover conteúdos que violem esta política sem aviso prévio.",
        },
        {
          title: "Denúncias",
          body: "Qualquer usuário pode reportar conteúdos inadequados pelo canal de denúncia.",
        },
      ]}
    />
  ),
});
