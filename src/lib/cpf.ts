export function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}

export function formatCpfMask(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

// Standard Brazilian CPF checksum validation.
export function isValidCpf(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcCheck = (base: string, factor: number) => {
    let sum = 0;
    for (const digit of base) {
      sum += Number(digit) * factor--;
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calcCheck(cpf.slice(0, 9), 10);
  if (d1 !== Number(cpf[9])) return false;
  const d2 = calcCheck(cpf.slice(0, 10), 11);
  if (d2 !== Number(cpf[10])) return false;
  return true;
}
