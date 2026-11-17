/** npm downloads client: weekly downloads. */
import { fetchJson, type HttpResult } from './http';

const BASE = 'https://api.npmjs.org/downloads/point/last-week/';

export function parseDownloads(body: unknown): HttpResult<number> {
  const n = typeof body === 'object' && body !== null ? (body as { downloads?: unknown }).downloads : undefined;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    return { ok: false, reason: 'unexpected downloads response shape' };
  }
  return { ok: true, value: n };
}

export async function fetchWeeklyDownloads(name: string): Promise<HttpResult<number>> {
  const result = await fetchJson(`${BASE}${encodeURIComponent(name).replace(/^%40/, '@')}`);
  if (!result.ok) return result;
  return parseDownloads(result.value);
}
