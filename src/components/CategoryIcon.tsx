import { Sparkles } from "lucide-react";
import { CATEGORY_ICONS, resolveCategoryIconUrl } from "@/lib/category-icons";

export function CategoryIcon({
  name,
  path,
  className = "h-5 w-5",
}: {
  name?: string | null;
  path?: string | null;
  className?: string;
}) {
  if (path) {
    return (
      <img
        src={resolveCategoryIconUrl(path)}
        alt=""
        className={`${className} object-contain`}
        aria-hidden
      />
    );
  }
  const Icon = CATEGORY_ICONS.find((item) => item.name === name)?.icon ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}
