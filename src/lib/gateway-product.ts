/**
 * Public product identity shared with payment and marketing providers.
 *
 * Keep this deliberately generic: creator names, profile names, promotion
 * titles and purchased content must never be included in an external event.
 */
export const GATEWAY_PRODUCT = {
  id: "feverby_system_access",
  name: "Feverby",
  description: "Feverby System Access",
} as const;
