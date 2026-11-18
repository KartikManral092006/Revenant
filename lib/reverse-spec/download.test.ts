import { describe, expect, it } from 'vitest';
import { assembleBundle } from './bundle';
import { handleSpecBundleDownload } from './download';
import { GET } from '../../app/api/spec-bundle/[package]/route';

const classes = [
  { classId: 'p:f:class:a', count: 2, evidenceIds: ['p:f:aaaaaaaaaaaa'], representatives: ['p:f:aaaaaaaaaaaa'] },
];
const bundle = assembleBundle({
  package: 'p',
  model: 'm',
  generatedAt: '2026-01-02T03:04:05.000Z',
  requirements: [
    { id: 'R1', statement: 'cited', classIds: ['p:f:class:a'] },
    { id: 'R2', statement: 'uncited', classIds: ['p:f:class:zzz'] },
  ],
  classes,
});

/** Minimal reader for store-only archives: walks local headers. */
function readZip(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let o = 0;
  while (buf.readUInt32LE(o) === 0x04034b50) {
    const size = buf.readUInt32LE(o + 18);
    const nameLen = buf.readUInt16LE(o + 26);
    const extraLen = buf.readUInt16LE(o + 28);
    const name = buf.toString('utf8', o + 30, o + 30 + nameLen);
    const start = o + 30 + nameLen + extraLen;
    out[name] = buf.toString('utf8', start, start + size);
    o = start + size;
  }
  return out;
}

const deps = { isAllowed: (n: unknown) => n === 'p', readCache: () => bundle };

describe('spec bundle download', () => {
  it('returns a zip attachment with all documents, EVIDENCE.json and README.md', async () => {
    const res = handleSpecBundleDownload('p', deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment/);
    const files = readZip(Buffer.from(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(
      [
        'EVIDENCE.json',
        'README.md',
        'design.md',
        'requirements.md',
        'steering/product.md',
        'steering/structure.md',
        'steering/tech.md',
        'tasks.md',
      ].sort(),
    );
    expect(files['README.md']).toContain('2026-01-02');
    expect(files['README.md']).toContain(bundle.traceability.text);
    const ev = JSON.parse(files['EVIDENCE.json']);
    expect(ev.requirements[0].classes[0].evidenceIds).toEqual(['p:f:aaaaaaaaaaaa']);
  });

  it('returns 404 for a package outside the allowlist', () => {
    expect(handleSpecBundleDownload('nope', deps).status).toBe(404);
  });

  it('returns 404 with a clear message when no cached bundle exists', async () => {
    const res = handleSpecBundleDownload('p', { ...deps, readCache: () => null });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/no stored bundle/);
  });

  it('route rejects an unknown package and needs no GROQ_API_KEY', async () => {
    delete process.env.GROQ_API_KEY;
    const res = await GET(new Request('http://x/api/spec-bundle/evil'), {
      params: Promise.resolve({ package: '../evil' }),
    });
    expect(res.status).toBe(404);
  });
});
