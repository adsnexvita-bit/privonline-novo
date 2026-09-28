import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { captureMarketingAttribution } from "@/lib/marketing-attribution";
import { isUtmifyConversionPath, loadUtmifyOnce } from "@/lib/utmify-tracking";

export function UtmifyTracking() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.searchStr });

  useEffect(() => {
    if (!isUtmifyConversionPath(pathname, search)) return;
    captureMarketingAttribution();
    loadUtmifyOnce();
  }, [pathname, search]);

  return null;
}
