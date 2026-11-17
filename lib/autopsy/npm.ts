/** npm registry client: last publish, deprecation, license, repository URL. */
import { fetchJson, known, unknownField, type Field, type HttpResult } from './http';

export interface NpmInfo {
  lastPublish: Field<string>;
  /** `null` means the version exists and is not deprecated. */
  deprecation: Field<string | null>;
  license: Field<string>;
  repositoryUrl: Field<string>;
}

const REGISTRY = 'https://registry.npmjs.org/';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Latest publish time in the registry `time` map, excluding `created` and `modified`. */
export function latestPublish(time: unknown): string | undefined {
  if (!isRecord(time)) return undefined;
  let best: string | undefined;
  let bestMs = -Infinity;
  for (const [key, value] of Object.entries(time)) {
    if (key === 'created' || key === 'modified' || key === 'unpublished') continue;
    if (typeof value !== 'string') continue;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = value;
    }
  }
  return best;
}

function licenseOf(doc: Record<string, unknown>, version: Record<string, unknown> | undefined): Field<string> {
  for (const source of [version?.license, doc.license]) {
    if (typeof source === 'string' && source) return known(source);
    if (isRecord(source) && typeof source.type === 'string' && source.type) return known(source.type);
  }
  return unknownField('registry lists no license');
}

function repositoryOf(doc: Record<string, unknown>, version: Record<string, unknown> | undefined): Field<string> {
  for (const source of [version?.repository, doc.repository]) {
    if (typeof source === 'string' && source) return known(source);
    if (isRecord(source) && typeof source.url === 'string' && source.url) return known(source.url);
  }
  return unknownField('registry lists no repository');
}

/** Parse a registry document for the given pinned version. */
export function parseNpmDocument(body: unknown, version: string): HttpResult<NpmInfo> {
  if (!isRecord(body)) return { ok: false, reason: 'unexpected registry response shape' };
  const versions = isRecord(body.versions) ? body.versions : undefined;
  const entry = versions && isRecord(versions[version]) ? (versions[version] as Record<string, unknown>) : undefined;

  const published = latestPublish(body.time);
  const lastPublish: Field<string> = published
    ? known(published)
    : unknownField('registry has no publish times');

  let deprecation: Field<string | null>;
  if (!entry) {
    deprecation = unknownField(`version ${version} not found in registry`);
  } else if (typeof entry.deprecated === 'string' && entry.deprecated) {
    deprecation = known(entry.deprecated);
  } else {
    deprecation = known(null);
  }

  return {
    ok: true,
    value: { lastPublish, deprecation, license: licenseOf(body, entry), repositoryUrl: repositoryOf(body, entry) },
  };
}

export async function fetchNpmInfo(name: string, version: string): Promise<HttpResult<NpmInfo>> {
  const result = await fetchJson(`${REGISTRY}${encodeURIComponent(name).replace(/^%40/, '@')}`);
  if (!result.ok) return result;
  return parseNpmDocument(result.value, version);
}
