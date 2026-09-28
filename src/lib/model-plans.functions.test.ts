import { describe, expect, it } from "vitest";
import { orderPublicPlans } from "./model-plans.functions";

describe("orderPublicPlans", () => {
  it("preserves the order configured in the admin regardless of highlights", () => {
    const plans = [
      { name: "6 Meses", displayOrder: 2, isHighlighted: true },
      { name: "1 Mês", displayOrder: 0, isHighlighted: false },
      { name: "3 Meses", displayOrder: 1, isHighlighted: false },
    ];

    expect(orderPublicPlans(plans).map((plan) => plan.name)).toEqual([
      "1 Mês",
      "3 Meses",
      "6 Meses",
    ]);
  });

  it("keeps the server order when two records have the same position", () => {
    const plans = [
      { name: "Primeiro", displayOrder: 0 },
      { name: "Segundo", displayOrder: 0 },
    ];

    expect(orderPublicPlans(plans).map((plan) => plan.name)).toEqual(["Primeiro", "Segundo"]);
  });
});
