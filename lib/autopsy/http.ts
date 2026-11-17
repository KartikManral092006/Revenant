/**
 * Shared fetch wrapper for the Autopsy clients. Applies a timeout and
 * converts every failure into a value so callers never throw.
 */

export const DEFAULT_TIMEOUT_MS = 10_000;

export type HttpResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** A Death Certificate field: either a real value or an explicit "unknown" with a reason. */
export type Field<T> = { value: T } | { unknown: true; reason: string };

export interface FetchJsonOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/** Fetch a URL and parse JSON. Never throws; timeouts, network errors, non-2xx and bad JSON return `{ ok: false, reason }`. */
export async function fetchJson(
  url: string,
  options: FetchJsonOptions = {},
): Promise<HttpResult<unknown>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }
    try {
      return { ok: true, value: (await response.json()) as unknown };
    } catch (err) {
      if (timedOut) return { ok: false, reason: `timeout after ${timeoutMs} ms` };
      return { ok: false, reason: 'malformed response body' };
    }
  } catch (err) {
    if (timedOut) return { ok: false, reason: `timeout after ${timeoutMs} ms` };
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `request failed: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

export function known<T>(value: T): Field<T> {
  return { value };
}

export function unknownField<T = never>(reason: string): Field<T> {
  return { unknown: true, reason };
}
