import {
  Camera,
  Crown,
  Flame,
  Gem,
  Heart,
  Image,
  Sparkles,
  Star,
  Users,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const CATEGORY_ICONS: Array<{
  name: string;
  label: string;
  icon: LucideIcon;
}> = [
  { name: "sparkles", label: "Brilhos", icon: Sparkles },
  { name: "star", label: "Estrela", icon: Star },
  { name: "crown", label: "Coroa", icon: Crown },
  { name: "heart", label: "Coração", icon: Heart },
  { name: "flame", label: "Em alta", icon: Flame },
  { name: "camera", label: "Câmera", icon: Camera },
  { name: "image", label: "Imagem", icon: Image },
  { name: "video", label: "Vídeo", icon: Video },
  { name: "users", label: "Perfis", icon: Users },
  { name: "gem", label: "Premium", icon: Gem },
  { name: "zap", label: "Novidades", icon: Zap },
];

export function resolveCategoryIconUrl(path: string) {
  if (path.startsWith("r2://")) return `/api/public/media?ref=${encodeURIComponent(path)}`;
  const key = path.startsWith("category-icons/") ? path.slice("category-icons/".length) : path;
  return supabase.storage.from("category-icons").getPublicUrl(key).data.publicUrl;
}
