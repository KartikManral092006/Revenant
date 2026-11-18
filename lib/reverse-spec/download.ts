/**
 * Spec bundle download (Req 10). Packs the cached data/<package>/reverse-spec.json into a ZIP.
 * No Groq call and no network access, so the download works without GROQ_API_KEY.
 */
import { isAllowlisted } from '../graveyard/loader';
import { readBundle, type StoredBundle } from './bundle';
import { createZip, type ZipEntry } from './zip';

export interface DownloadDeps {
  isAllowed: (name: unknown) => boolean;
  readCache: (pkg: string) => StoredBundle | null;
}

const defaultDeps: DownloadDeps = {
  isAllowed: (name) => isAllowlisted(name),
  readCache: (pkg) => readBundle(pkg),
};

const json = (body: unknown, status: number): Response =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** EVIDENCE.json: every cited class with its Evidence IDs, grouped by requirement. */
export function buildEvidence(bundle: StoredBundle) {
  return {
    package: bundle.package,
    generatedAt: bundle.generatedAt,
    traceability: bundle.traceability,
    requirements: bundle.requirements.map((r) => ({
      id: r.id,
      unsupported: r.unsupported,
      classes: r.resolved.map((c) => ({
        classId: c.classId,
        memberCount: c.memberCount,
        evidenceIds: c.evidenceIds,
      })),
      missingClassIds: r.missing,
    })),
    citationIssues: bundle.citationIssues,
  };
}

export function buildReadme(bundle: StoredBundle): string {
  return [
    `# Spec bundle: ${bundle.package}`,
    '',
    `Generated: ${bundle.generatedAt}`,
    '',
    `Traceability: ${bundle.traceability.text}`,
    '',
    'EVIDENCE.json lists the behavior classes and Evidence IDs cited by each requirement.',
    '',
  ].join('\n');
}

export function buildEntries(bundle: StoredBundle): ZipEntry[] {
  const docs = Object.entries(bundle.documents).map(([name, data]) => ({ name, data }));
  return [
    ...docs,
    { name: 'EVIDENCE.json', data: `${JSON.stringify(buildEvidence(bundle), null, 2)}\n` },
    { name: 'README.md', data: buildReadme(bundle) },
  ];
}

export function handleSpecBundleDownload(pkg: string, overrides: Partial<DownloadDeps> = {}): Response {
  const d = { ...defaultDeps, ...overrides };
  if (!d.isAllowed(pkg)) return json({ error: 'package is not in the Graveyard' }, 404);
  const bundle = d.readCache(pkg);
  if (!bundle) return json({ error: 'no stored bundle is available for this package' }, 404);
  const zip = createZip(buildEntries(bundle));
  return new Response(new Uint8Array(zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${pkg}-spec-bundle.zip"`,
      'Content-Length': String(zip.length),
      'Cache-Control': 'no-store',
    },
  });
}
