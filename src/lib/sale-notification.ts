export type SaleNotificationContent = { title: string; body: string };

export function formatSaleAmount(amount: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount);
}

export function buildSaleNotification(modelName: string, amount: number): SaleNotificationContent {
  return {
    title: "Venda Aprovada!",
    body: `${modelName.trim() || "Modelo"} por ${formatSaleAmount(Number.isFinite(amount) ? amount : 0)}`,
  };
}
