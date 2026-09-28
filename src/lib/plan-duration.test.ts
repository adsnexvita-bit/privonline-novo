import { describe, expect, it } from "vitest";
import { formatPlanDurationDays, planDurationFromDays, planDurationToDays } from "./plan-duration";

describe("plan duration", () => {
  it("converts every supported unit to days", () => {
    expect(planDurationToDays(10, "days")).toBe(10);
    expect(planDurationToDays(2, "weeks")).toBe(14);
    expect(planDurationToDays(3, "months")).toBe(90);
    expect(planDurationToDays(2, "years")).toBe(730);
  });

  it("restores a friendly unit from stored days", () => {
    expect(planDurationFromDays(14)).toEqual({ value: 2, unit: "weeks" });
    expect(planDurationFromDays(180)).toEqual({ value: 6, unit: "months" });
    expect(planDurationFromDays(730)).toEqual({ value: 2, unit: "years" });
  });

  it("formats singular and plural durations", () => {
    expect(formatPlanDurationDays(1)).toBe("1 Dia");
    expect(formatPlanDurationDays(7)).toBe("1 Semana");
    expect(formatPlanDurationDays(30)).toBe("1 Mês");
    expect(formatPlanDurationDays(365)).toBe("1 Ano");
  });
});
