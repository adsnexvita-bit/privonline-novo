export const PRIMARY_PUBLIC_ORIGIN = "https://privadinhos.online";

export function resolvePublicOrigin(origin?: string | null) {
  const value = origin?.trim();
  if (!value) return PRIMARY_PUBLIC_ORIGIN;

  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.hostname === "vercel.app" || url.hostname.endsWith(".vercel.app")) {
      return PRIMARY_PUBLIC_ORIGIN;
    }
    return url.origin;
  } catch {
    return PRIMARY_PUBLIC_ORIGIN;
  }
}

export function publicUrl(path = "/", origin?: string | null) {
  return new URL(path, `${resolvePublicOrigin(origin)}/`).toString();
}
