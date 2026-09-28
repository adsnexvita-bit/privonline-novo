export type CategoryColorConfig =
  | { mode: "solid"; primary: string }
  | {
      mode: "gradient";
      primary: string;
      secondary: string;
      angle: number;
      scale: number;
    };

export const DEFAULT_CATEGORY_COLOR = "#ff5c00";
export const DEFAULT_CATEGORY_SECONDARY = "#ff9a00";

function safeHex(value: string | null | undefined, fallback: string) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized === "#ff003c" ? DEFAULT_CATEGORY_COLOR : normalized;
  }
  return fallback;
}

export function parseCategoryColor(value: string | null | undefined): CategoryColorConfig {
  const raw = String(value ?? "");
  if (raw.startsWith("gradient|")) {
    const [, first, second, rawAngle, rawScale] = raw.split("|");
    return {
      mode: "gradient",
      primary: safeHex(first, DEFAULT_CATEGORY_COLOR),
      secondary: safeHex(second, DEFAULT_CATEGORY_SECONDARY),
      angle: Math.min(360, Math.max(0, Number(rawAngle) || 135)),
      scale: Math.min(100, Math.max(10, Number(rawScale) || 70)),
    };
  }
  return { mode: "solid", primary: safeHex(raw, DEFAULT_CATEGORY_COLOR) };
}

export function serializeCategoryColor(config: CategoryColorConfig) {
  if (config.mode === "solid") return config.primary;
  return `gradient|${config.primary}|${config.secondary}|${Math.round(config.angle)}|${Math.round(config.scale)}`;
}

export function categoryGradient(config: CategoryColorConfig) {
  if (config.mode === "solid") return config.primary;
  const start = Math.max(0, 50 - config.scale / 2);
  const end = Math.min(100, 50 + config.scale / 2);
  return `linear-gradient(${config.angle}deg, ${config.primary} ${start}%, ${config.secondary} ${end}%)`;
}
