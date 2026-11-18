// Writes data/<package>/autopsy.json for every Graveyard package from LIVE npm, OSV,
// downloads and GitHub responses. Requires network. Nothing is invented: a source that
// fails is stored as `unknown` with its reason, and a package whose npm lookup failed
// is not written at all.
//
// Run: npm run autopsy:snapshots   (optionally with GITHUB_TOKEN in the environment)
// Node-run code: relative imports only, with .js extensions.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildCertificate } from '../lib/autopsy/certificate.js';
import { listGraveyard } from '../lib/graveyard/loader.js';

export const AUTOPSY_SCHEMA_VERSION = 1;

async function main(): Promise<number> {
  const root = process.cwd();
  const manifests = listGraveyard({ root });
  let failures = 0;
  for (const m of manifests) {
    const cert = await buildCertificate(m.name, m.version, { monorepo: m.monorepo });
    if (!('value' in cert.lastPublish)) {
      console.error(`${m.name}: npm lookup failed (${cert.lastPublish.reason}); snapshot not written`);
      failures++;
      continue;
    }
    const snapshot = {
      ...cert,
      source: 'snapshot' as const,
      generatedAt: cert.fetchedAt,
      schemaVersion: AUTOPSY_SCHEMA_VERSION,
    };
    const dir = path.join(root, 'data', m.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'autopsy.json'), JSON.stringify(snapshot, null, 2) + '\n');
    const unknownFields = Object.entries(cert)
      .filter(([, v]) => typeof v === 'object' && v !== null && 'unknown' in v)
      .map(([k]) => k);
    console.log(
      `${m.name}@${m.version}: written` + (unknownFields.length ? ` (unknown: ${unknownFields.join(', ')})` : ''),
    );
  }
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : 'unexpected failure');
    process.exitCode = 3;
  },
);
