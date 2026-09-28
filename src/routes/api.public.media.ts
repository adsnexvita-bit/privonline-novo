import { createFileRoute } from "@tanstack/react-router";
import { createR2ReadUrl, isR2Reference, r2KeyFromReference } from "@/lib/r2.server";

// Only assets intentionally shown without customer authentication use this
// redirect. Private gallery media is signed after access is verified instead.
const PUBLIC_PREFIXES = ["model-assets/", "category-icons/", "demonstrations/"];

export const Route = createFileRoute("/api/public/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reference = new URL(request.url).searchParams.get("ref") ?? "";
        const key = isR2Reference(reference) ? r2KeyFromReference(reference) : null;
        if (!key || !PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          return new Response("Not found", { status: 404 });
        }
        const url = await createR2ReadUrl(reference, 15 * 60);
        if (!url) return new Response("Not found", { status: 404 });
        return Response.redirect(url, 302);
      },
    },
  },
});
