import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/compras")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/clientes" });
  },
  component: () => null,
});
