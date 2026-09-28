import { createServerFn } from "@tanstack/react-start";
import { createR2ReadUrl, isR2Reference } from "@/lib/r2.server";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

type AssetRequest = {
  profileImagePath?: string | null;
  coverImagePath?: string | null;
};

type StorageLocation = {
  bucket: string;
  key: string;
};

function parseStorageLocation(value: string | null | undefined): StorageLocation | null {
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const marker = "/storage/v1/object/";
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex === -1) return null;

      const storagePath = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
      const parts = storagePath.split("/").filter(Boolean);
      if (parts[0] === "sign" || parts[0] === "public") parts.shift();
      const bucket = parts.shift();
      if (!bucket || parts.length === 0) return null;
      return { bucket, key: parts.join("/") };
    } catch {
      return null;
    }
  }

  if (value.startsWith("data:") || value.startsWith("blob:")) return null;

  const [bucket, ...parts] = value.split("/").filter(Boolean);
  if (!bucket || parts.length === 0) return null;
  return { bucket, key: parts.join("/") };
}

async function signAsset(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith("data:") || value.startsWith("blob:")) return value;
  if (isR2Reference(value)) return createR2ReadUrl(value, SIGNED_URL_TTL_SECONDS);

  const location = parseStorageLocation(value);
  if (!location) return value;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(location.bucket)
    .createSignedUrl(location.key, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return value;
  return data.signedUrl;
}

export const getPublicModelAssetUrls = createServerFn({ method: "POST" })
  .inputValidator((raw: AssetRequest) => ({
    profileImagePath: raw?.profileImagePath ? String(raw.profileImagePath) : null,
    coverImagePath: raw?.coverImagePath ? String(raw.coverImagePath) : null,
  }))
  .handler(async ({ data }) => {
    const [profileImageUrl, coverImageUrl] = await Promise.all([
      signAsset(data.profileImagePath),
      signAsset(data.coverImagePath),
    ]);
    return { profileImageUrl, coverImageUrl };
  });
