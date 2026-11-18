import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Stub the Groq SDK module: no network. The fake echoes one requirement per real class id.
const classIds: string[] = JSON.parse(
  readFileSync(path.join(process.cwd(), 'data', 'lodash.set', 'classes.json'), 'utf8'),
).classes.map((c: { classId: string }) => c.classId);

const create = vi.hoisted(() => vi.fn());
vi.mock('groq-sdk', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { POST } from '../../app/api/reverse-spec/[package]/route';

const SECRET = 'gsk_route_test_secret_value';
const call = (name: string, ip: string) =>
  POST(new Request(`http://x/api/reverse-spec/${name}`, { method: 'POST', headers: { 'cf-connecting-ip': ip } }), {
    params: Promise.resolve({ package: name }),
  });

beforeAll(() => {
  vi.stubEnv('GROQ_API_KEY', SECRET);
  create.mockImplementation(async () => ({
    choices: [
      {
        message: {
          content: JSON.stringify({
            requirements: classIds.map((id, i) => ({ id: `R${i + 1}`, statement: 'mocked statement', classIds: [id] })),
          }),
        },
      },
    ],
  }));
});
afterAll(() => vi.unstubAllEnvs());

describe('POST /api/reverse-spec/[package] (real route, stubbed Groq)', () => {
  it('returns all four document kinds from a live call', async () => {
    const text = await (await call('lodash.set', '10.0.0.1')).text();
    const body = JSON.parse(text);
    expect(body.source).toBe('live');
    expect(create).toHaveBeenCalled();
    expect(Object.keys(body.bundle.documents)).toEqual(
      expect.arrayContaining(['requirements.md', 'design.md', 'tasks.md', 'steering/product.md']),
    );
    expect(body.bundle.documents['requirements.md']).toContain('mocked statement');
    expect(text).not.toContain(SECRET);
  });

  it('returns the stored bundle and cap message once the per-IP limit is hit, key absent', async () => {
    let last = '';
    for (let i = 0; i < 6; i++) last = await (await call('lodash.pick', '10.0.0.2')).text();
    const body = JSON.parse(last);
    expect(body.source).toBe('cached');
    expect(body.message).toMatch(/cap reached/);
    expect(body.remainingForIp).toBe(0);
    expect(Object.keys(body.bundle.documents)).toContain('requirements.md');
    expect(last).not.toContain(SECRET);
  });

  it('never leaks the key when Groq throws an error containing it', async () => {
    create.mockRejectedValueOnce(new Error(`401 invalid key ${SECRET}`));
    const text = await (await call('string', '10.0.0.3')).text();
    expect(JSON.parse(text).source).toBe('cached');
    expect(text).not.toContain(SECRET);
  });
});
