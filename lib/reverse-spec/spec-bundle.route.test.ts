import { describe, expect, it } from 'vitest';
import { GET } from '../../app/api/spec-bundle/[package]/route';

const PACKAGES = ['lodash.set', 'lodash.pick', 'deep-extend', 'string'];

const call = (name: string) =>
  GET(new Request(`http://x/api/spec-bundle/${encodeURIComponent(name)}`), {
    params: Promise.resolve({ package: name }),
  });

describe('GET /api/spec-bundle/[package] (real data)', () => {
  it.each(PACKAGES)('returns a ZIP for %s', async (name) => {
    const res = await call(name);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toContain(`${name}-spec-bundle.zip`);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.readUInt32LE(0)).toBe(0x04034b50); // ZIP local file header signature
  });

  it.each(['left-pad', '../etc/passwd', 'LODASH.SET', ''])('returns 404 for %j', async (name) => {
    const res = await call(name);
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).not.toBe('application/zip');
  });
});
