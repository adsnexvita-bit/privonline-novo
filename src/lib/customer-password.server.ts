const PASSWORD_ITERATIONS = 210_000;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  return new Uint8Array(value.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

async function verifier(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function safeEqual(first: string, second: string) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  return difference === 0;
}

export function validateFourDigitPassword(password: string) {
  if (!/^\d{4}$/.test(password)) throw new Error("A senha deve ter exatamente 4 números.");
  return password;
}

export async function createPasswordCredentials(password: string) {
  validateFourDigitPassword(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { passwordHash: await verifier(password, salt), passwordSalt: bytesToHex(salt) };
}

export async function verifyPassword(password: string, passwordHash: string, passwordSalt: string) {
  const candidate = await verifier(password, hexToBytes(passwordSalt));
  return safeEqual(candidate, passwordHash);
}
