import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    ).catch((error) => {
      // A transient module-load failure must not poison every later request
      // handled by the same warm server instance.
      serverEntryPromise = undefined;
      throw error;
    });
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "retry-after": "1",
    },
  });
}

/** Prevent browsers and CDNs from serving HTML that references an obsolete UI bundle. */
function preventStaleHtml(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("cdn-cache-control", "no-store");
  headers.set("vercel-cdn-cache-control", "no-store");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");
  headers.set("x-privacy-ui", "unified-checkout-v2");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return preventStaleHtml(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 503,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "retry-after": "1",
          "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
          "cdn-cache-control": "no-store",
          "vercel-cdn-cache-control": "no-store",
        },
      });
    }
  },
};
