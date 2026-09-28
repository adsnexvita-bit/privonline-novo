export type PlanDurationUnit = "days" | "weeks" | "months" | "years";

export const PLAN_DURATION_UNITS: Array<{ value: PlanDurationUnit; label: string }> = [
  { value: "days", label: "Dias" },
  { value: "weeks", label: "Semanas" },
  { value: "months", label: "Meses" },
  { value: "years", label: "Anos" },
];

const UNIT_DAYS: Record<PlanDurationUnit, number> = {
  days: 1,
  weeks: 7,
  months: 30,
  years: 365,
};

export function planDurationToDays(value: number, unit: PlanDurationUnit) {
  return Math.round(value * UNIT_DAYS[unit]);
}

export function planDurationFromDays(days: number): {
  value: number;
  unit: PlanDurationUnit;
} {
  if (days >= 365 && days % 365 === 0) return { value: days / 365, unit: "years" };
  if (days >= 30 && days % 30 === 0) return { value: days / 30, unit: "months" };
  if (days >= 7 && days % 7 === 0) return { value: days / 7, unit: "weeks" };
  return { value: days, unit: "days" };
}

export function formatPlanDurationDays(days: number, locale: "pt-BR" | "es" = "pt-BR") {
  const duration = planDurationFromDays(days);
  const labels: Record<PlanDurationUnit, [string, string]> =
    locale === "es"
      ? {
          days: ["Día", "Días"],
          weeks: ["Semana", "Semanas"],
          months: ["Mes", "Meses"],
          years: ["Año", "Años"],
        }
      : {
          days: ["Dia", "Dias"],
          weeks: ["Semana", "Semanas"],
          months: ["Mês", "Meses"],
          years: ["Ano", "Anos"],
        };
  return `${duration.value} ${labels[duration.unit][duration.value === 1 ? 0 : 1]}`;
}
