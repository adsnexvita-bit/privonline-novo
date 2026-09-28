export function phoneDigits(value: string): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeBrazilPhone(value: string): string | null {
  let digits = phoneDigits(value);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return null;
}

export function formatBrazilPhone(value: string): string {
  let digits = phoneDigits(value);
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  const raw = digits.slice(0, 11);
  if (!raw) return "";
  const ddd = raw.slice(0, 2);
  const local = raw.slice(2);
  if (raw.length <= 2) return `+55 (${ddd}`;
  if (local.length <= 4) return `+55 (${ddd}) ${local}`;
  const split = local.length > 8 ? 5 : 4;
  return `+55 (${ddd}) ${local.slice(0, split)}-${local.slice(split)}`;
}

export function maskBrazilPhone(value: string): string {
  const normalized = normalizeBrazilPhone(value);
  if (!normalized) return "Telefone protegido";
  const local = normalized.slice(2);
  return `+55 (${local.slice(0, 2)}) *****-${local.slice(-4)}`;
}

/** Formata progressivamente um telefone brasileiro durante a digitação. */
export function formatBrazilPhoneInput(value: string): string {
  return formatBrazilPhone(value);
}
