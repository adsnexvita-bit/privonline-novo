import { supabase } from "@/integrations/supabase/client";
import type { PublicModel } from "@/lib/models";
import { parseCategoryColor, serializeCategoryColor } from "@/lib/category-color";

export type PublicCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon_name: string | null;
  icon_path: string | null;
  display_order: number;
  models: Array<{
    isFeatured: boolean;
    displayOrder: number;
    model: PublicModel;
  }>;
};

export type PublicCategoryLink = Pick<
  PublicCategory,
  "id" | "name" | "slug" | "color" | "icon_name" | "icon_path"
>;

const BRAND_ORANGE = "#ff5c00";

function normalizeBrandColor(color: string) {
  return serializeCategoryColor(parseCategoryColor(color || BRAND_ORANGE));
}

export async function listPublicCategoryLinks(): Promise<PublicCategoryLink[]> {
  const categories = await listPublicCategories();
  return categories.map(({ id, name, slug, color, icon_name, icon_path }) => ({
    id,
    name,
    slug,
    color,
    icon_name,
    icon_path,
  }));
}

export async function listPublicCategories(): Promise<PublicCategory[]> {
  const { data: categories, error } = await supabase
    .from("categories")
    .select("id,name,slug,description,color,icon_name,icon_path,display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  if (error) return [];
  const ids = (categories ?? []).map((category) => category.id);
  if (!ids.length) return [];
  const { data: links, error: linksError } = await supabase
    .from("category_models")
    .select("category_id,model_id,is_featured,display_order")
    .in("category_id", ids);
  if (linksError) return [];

  const modelIds = [...new Set((links ?? []).map((link) => link.model_id))];
  if (!modelIds.length) return [];

  // Use the public view so inactive profiles never keep a category visible.
  const { data: models, error: modelsError } = await supabase
    .from("models_public")
    .select("*")
    .in("id", modelIds)
    .eq("show_in_library", true);
  if (modelsError) return [];

  const modelsById = new Map(((models ?? []) as PublicModel[]).map((model) => [model.id, model]));

  return (categories ?? [])
    .map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      color: normalizeBrandColor(category.color),
      icon_name: category.icon_name,
      icon_path: category.icon_path,
      display_order: category.display_order,
      models: (links ?? [])
        .filter((link) => link.category_id === category.id && modelsById.has(link.model_id))
        .map((link) => ({
          isFeatured: link.is_featured,
          displayOrder: link.display_order,
          model: modelsById.get(link.model_id)!,
        }))
        .sort((a, b) => a.displayOrder - b.displayOrder),
    }))
    .filter((category) => category.models.length > 0);
}
