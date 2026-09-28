import { supabase } from "@/integrations/supabase/client";
import placeholder1 from "@/assets/model-1.jpg";
import placeholder2 from "@/assets/model-2.jpg";
import placeholder3 from "@/assets/model-3.jpg";
import { normalizeModelUsername } from "@/lib/model-usernames";

const placeholders = [placeholder1, placeholder2, placeholder3];

export type PublicModel = {
  id: string;
  name: string;
  username: string;
  slug: string;
  short_description: string | null;
  full_description: string | null;
  profile_image_path: string | null;
  cover_image_path: string | null;
  profile_cover_image_path: string | null;
  price: number;
  is_featured: boolean;
  show_in_library: boolean;
  display_order: number;
  created_at: string;
  photo_count: number;
  video_count: number;
  custom_posts_count: number | null;
  custom_photo_count: number | null;
  custom_video_count: number | null;
  has_community_bonus: boolean;
  instagram_enabled: boolean;
  instagram_url: string | null;
  instagram_profile_image_url: string | null;
  public_audio_enabled: boolean;
  public_audio_title: string | null;
  public_audio_path: string | null;
};

export type PublicMedia = {
  id: string;
  media_type: "image" | "video";
  file_path: string;
  preview_path: string | null;
  file_url: string;
  preview_url: string | null;
  title: string | null;
  description: string | null;
  is_free_preview: boolean;
  display_order: number;
  like_count: number;
  comment_count: number;
};

export type SortOption = "featured" | "newest" | "price_asc" | "price_desc";

export const PAGE_SIZE = 12;

export function resolveMediaUrl(path: string | null | undefined, fallbackSeed = 0): string {
  if (!path) return placeholders[fallbackSeed % placeholders.length];
  if (/^https?:\/\//i.test(path) || path.startsWith("data:") || path.startsWith("blob:")) {
    return path;
  }
  if (path.startsWith("r2://")) {
    return `/api/public/media?ref=${encodeURIComponent(path)}`;
  }
  // Storage path: <bucket>/<key>
  const [bucket, ...rest] = path.split("/");
  if (bucket && rest.length) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(rest.join("/"));
    return data.publicUrl;
  }
  return placeholders[fallbackSeed % placeholders.length];
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

type ListArgs = {
  search?: string;
  sort?: SortOption;
  page?: number;
  featuredOnly?: boolean;
  pageSize?: number;
};

export async function listPublicModels({
  search = "",
  sort = "featured",
  page = 1,
  featuredOnly = false,
  pageSize = PAGE_SIZE,
}: ListArgs = {}): Promise<{ rows: PublicModel[]; total: number }> {
  let query = supabase
    .from("models_public")
    .select("*", { count: "exact" })
    .eq("show_in_library", true);

  if (featuredOnly) query = query.eq("is_featured", true);

  const term = search.trim();
  if (term) {
    const like = `%${term}%`;
    query = query.or(`name.ilike.${like},username.ilike.${like},short_description.ilike.${like}`);
  }

  switch (sort) {
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    case "featured":
    default:
      query = query
        .order("is_featured", { ascending: false })
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as PublicModel[], total: count ?? 0 };
}

export async function getPublicModelBySlug(slug: string): Promise<PublicModel | null> {
  const { data, error } = await supabase
    .from("models_public")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as PublicModel) ?? null;
}

export async function getPublicModelByUsername(username: string): Promise<PublicModel | null> {
  const normalizedUsername = normalizeModelUsername(username);
  const { data, error } = await supabase
    .from("models_public")
    .select("*")
    .ilike("username", normalizedUsername)
    .maybeSingle();
  if (error) throw error;
  return (data as PublicModel) ?? null;
}

export async function listFreeModels(limit = 8): Promise<PublicModel[]> {
  const { data, error } = await supabase
    .from("models_public")
    .select("*")
    .eq("price", 0)
    .eq("show_in_library", true)
    .order("display_order", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PublicModel[];
}
