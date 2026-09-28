import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { putR2Object } from "@/lib/r2.server";

function getInstagramUsername(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !/^(?:www\.)?instagram\.com$/i.test(url.hostname)) return null;
    const username = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[a-z0-9._]+$/i.test(username) ? username : null;
  } catch {
    return null;
  }
}

function getOpenGraphImage(html: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/(?:property|name)=["']og:image(?::secure_url)?["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
    if (!content?.startsWith("https://")) continue;
    const imageUrl = content.replace(/&amp;/g, "&");
    try {
      const host = new URL(imageUrl).hostname.toLowerCase();
      // The Instagram logo is hosted on static.cdninstagram.com. Profile
      // pictures use the scontent CDN, which is the only source we accept.
      if (host === "scontent.cdninstagram.com" || host.startsWith("scontent-")) {
        return imageUrl;
      }
    } catch {
      // Continue looking for a usable Open Graph image.
    }
  }
  return null;
}

export const fetchInstagramProfileImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { instagramUrl?: unknown; modelId?: unknown }) => ({
    instagramUrl: String(raw?.instagramUrl ?? "").trim(),
    modelId: String(raw?.modelId ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    const username = getInstagramUsername(data.instagramUrl);
    if (!username) throw new Error("Use um link válido de perfil do Instagram.");
    if (!/^[a-f0-9-]{36}$/i.test(data.modelId)) throw new Error("Modelo inválida.");
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin", {
      _auth_user_id: context.userId,
    });
    if (roleError) throw roleError;
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const response = await fetch(`https://www.instagram.com/${username}/`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FamaFlixProfileFetcher/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Não foi possível consultar o perfil do Instagram agora.");
    const imageUrl = getOpenGraphImage(await response.text());
    if (!imageUrl)
      throw new Error("O Instagram não disponibilizou uma foto pública para este perfil.");

    const imageResponse = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FamaFlixProfileFetcher/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    const contentType = imageResponse.headers.get("content-type")?.split(";")[0] ?? "";
    if (!imageResponse.ok || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      throw new Error("Não foi possível baixar a foto pública do Instagram.");
    }

    const extension =
      contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const key = `model-assets/instagram/${data.modelId}-${crypto.randomUUID()}.${extension}`;
    const imagePath = await putR2Object({ key, body: await imageResponse.blob(), contentType });
    return { imagePath };
  });
