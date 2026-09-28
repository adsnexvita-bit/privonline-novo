const TRANSIENT_ERROR_PATTERN =
  /failed to fetch|fetch failed|networkerror|network request failed|load failed|timeout|timed out|econnreset|etimedout|temporarily unavailable|service unavailable|bad gateway|gateway timeout/i;

const CHUNK_ERROR_PATTERN =
  /chunkloaderror|loading chunk|failed to fetch dynamically imported module|importing a module script failed|css_chunk_load_failed/i;

function readStatus(error: unknown): number | null {
  if (error instanceof Response) return error.status;
  if (!error || typeof error !== "object") return null;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const value = candidate.status ?? candidate.statusCode;
  return typeof value === "number" ? value : null;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error instanceof Response) return `${error.status} ${error.statusText}`;
  if (typeof error === "string") return error;
  return "";
}

export function isChunkLoadError(error: unknown): boolean {
  return CHUNK_ERROR_PATTERN.test(getErrorMessage(error));
}

export function isTransientError(error: unknown): boolean {
  const status = readStatus(error);
  if (status !== null && [408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  return isChunkLoadError(error) || TRANSIENT_ERROR_PATTERN.test(getErrorMessage(error));
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 3 && isTransientError(error);
}

export function transientRetryDelay(attempt: number): number {
  return Math.min(400 * 2 ** attempt, 2_000);
}
