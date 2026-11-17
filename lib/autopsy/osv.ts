/**
 * OSV client. Lists vulnerabilities that affect one exact package version.
 * Never throws: failures become an `unknown` field with a reason.
 */
import { fetchJson, known, unknownField, type Field } from './http';

export const OSV_QUERY_URL = 'https://api.osv.dev/v1/query';

export interface Vulnerability {
  id: string;
  aliases: string[];
  summary?: string;
}

export interface OsvOptions {
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse an OSV query response. An empty object `{}` means no known vulnerabilities. */
export function parseOsvResponse(body: unknown): Field<Vulnerability[]> {
  if (!isRecord(body)) return unknownField('unexpected OSV response shape');
  if (body.vulns === undefined) return known([]);
  if (!Array.isArray(body.vulns)) return unknownField('unexpected OSV response shape');

  const result: Vulnerability[] = [];
  for (const entry of body.vulns) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '') {
      return unknownField('unexpected OSV response shape');
    }
    const aliases = Array.isArray(entry.aliases)
      ? entry.aliases.filter((a): a is string => typeof a === 'string')
      : [];
    const vuln: Vulnerability = { id: entry.id, aliases };
    if (typeof entry.summary === 'string' && entry.summary !== '') {
      vuln.summary = entry.summary;
    }
    result.push(vuln);
  }
  return known(result);
}

/** Query OSV for vulnerabilities affecting `name@version` in the npm ecosystem. */
export async function fetchVulnerabilities(
  name: string,
  version: string,
  options: OsvOptions = {},
): Promise<Field<Vulnerability[]>> {
  const res = await fetchJson(OSV_QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package: { name, ecosystem: 'npm' }, version }),
    timeoutMs: options.timeoutMs,
  });
  if (!res.ok) return unknownField(`OSV: ${res.reason}`);
  return parseOsvResponse(res.value);
}
