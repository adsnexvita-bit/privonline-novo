import { supabase } from "@/integrations/supabase/client";

export type Demonstration = {
  id: string;
  demonstration_type: "image" | "video";
  title: string | null;
  file_path: string;
  thumbnail_path: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
};

export function resolveDemonstrationUrl(path: string | null | undefined) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || path.startsWith("blob:") || path.startsWith("data:")) {
    return path;
  }
  if (path.startsWith("r2://")) return `/api/public/media?ref=${encodeURIComponent(path)}`;
  const [bucket, ...parts] = path.split("/");
  if (!bucket || !parts.length) return "";
  return supabase.storage.from(bucket).getPublicUrl(parts.join("/")).data.publicUrl;
}
