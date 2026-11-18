import { describe, expect, it, vi } from 'vitest';
import { assembleBundle } from './bundle';
import { CAP_MESSAGE, clientIp, handleReverseSpec, type ReverseSpecDeps } from './handler';
import { createRateLimiter } from './rate-limit';

const classes = [
  { classId: 'p:f:class:a', features: {}, count: 2, evidenceIds: ['p:f:aaaaaaaaaaaa'], representatives: ['p:f:aaaaaaaaaaaa'] },
];
const cached = assembleBundle({
  package: 'p',
  model: 'm',
  requirements: [{ id: 'R1', statement: 'cached', classIds: ['p:f:class:a'] }],
  classes,
});
const req = (h: Record<string, string> = { 'cf-connecting-ip': '1.1.1.1' }) =>
  new Request('http://x/api/reverse-spec/p', { method: 'POST', headers: h });

function deps(over: Partial<ReverseSpecDeps> = {}): Partial<ReverseSpecDeps> {
  return {
    limiter: createRateLimiter(),
    isAllowed: (n) => n === 'p',
    readCache: () => cached,
    readClasses: () => ({ version: '1.0.0', classes: classes as never }),
    generate: vi.fn(async () => ({
      ok: true as const,
      model: 'mock',
      attempts: 1 as const,
      requirements: [{ id: 'R1', statement: 'live', classIds: ['p:f:class:a'] }],
    })),
    ...over,
  };
}

describe('clientIp', () => {
  it('prefers cf-connecting-ip', () => {
    expect(clientIp(new Headers({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.2.3.4,5.5.5.5,6.6.6.6,7.7.7.7' }))).toBe('9.9.9.9');
  });
  it('uses the 3rd entry from the right, never the leftmost', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4,49.43.155.220, 104.23.160.112, 10.197.188.141' }))).toBe('49.43.155.220');
    expect(clientIp(new Headers({ 'x-forwarded-for': '49.43.155.220, 104.23.160.198, 10.196.96.2' }))).toBe('49.43.155.220');
  });
  it('falls back to a shared key with too few entries', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4' }))).toBe('unknown');
  });
});

describe('handleReverseSpec', () => {
  it('returns 404 for a package outside the allowlist without calling Groq', async () => {
    const d = deps();
    const res = await handleReverseSpec(req(), 'nope', d);
    expect(res.status).toBe(404);
    expect(d.generate).not.toHaveBeenCalled();
  });

  it('builds a live bundle with all four document kinds and the budget', async () => {
    const res = await handleReverseSpec(req(), 'p', deps());
    const body = await res.json();
    expect(body.source).toBe('live');
    const names = Object.keys(body.bundle.documents);
    expect(names).toEqual(expect.arrayContaining(['requirements.md', 'design.md', 'tasks.md', 'steering/product.md']));
    expect(body.remainingForIp).toBe(4);
    expect(body.remainingTotal).toBe(49);
  });

  it('returns the cached bundle and cap message when the limit is reached', async () => {
    const d = deps({ limiter: createRateLimiter(1, 50) });
    await handleReverseSpec(req(), 'p', d);
    const res = await handleReverseSpec(req(), 'p', d);
    const body = await res.json();
    expect(body.source).toBe('cached');
    expect(body.message).toBe(CAP_MESSAGE);
    expect(body.bundle.documents['requirements.md']).toContain('cached');
    expect(body).toHaveProperty('remainingForIp', 0);
    expect(body).toHaveProperty('remainingTotal', 49);
    expect(d.generate).toHaveBeenCalledTimes(1);
  });

  it('falls back to the cached bundle when Groq fails, without leaking the key', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_secret_value');
    const d = deps({ generate: async () => ({ ok: false as const, reason: 'request-failed' as const }) });
    const text = await (await handleReverseSpec(req(), 'p', d)).text();
    expect(JSON.parse(text).source).toBe('cached');
    expect(text).not.toContain('gsk_secret_value');
    vi.unstubAllEnvs();
  });

  it('never includes the key in a live response', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_secret_value');
    const text = await (await handleReverseSpec(req(), 'p', deps())).text();
    expect(text).not.toContain('gsk_secret_value');
    vi.unstubAllEnvs();
  });

  it('returns 503 with the budget when capped and no cached bundle exists', async () => {
    const d = deps({ limiter: createRateLimiter(0, 50), readCache: () => null });
    const res = await handleReverseSpec(req(), 'p', d);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ remainingForIp: 0, message: CAP_MESSAGE });
  });
});
