import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/conteudos")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/modelos" });
  },
  component: () => null,
});
