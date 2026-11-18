import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchNpmInfo } from './npm';
import { fetchWeeklyDownloads } from './downloads';
import { fetchVulnerabilities } from './osv';
import { clearGithubCache, fetchRepoInfo } from './github';

type FetchMock = ReturnType<typeof vi.fn>;
let fetchMock: FetchMock;

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const badBodyResponse = (): Response => new Response('<html>not json', { status: 200 });
/** A fetch that never resolves and rejects when the request is aborted. */
const hangUntilAbort = (_url: unknown, init?: RequestInit): Promise<Response> =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  clearGithubCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function runWithTimeout<T>(call: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  fetchMock.mockImplementation(hangUntilAbort);
  const pending = call();
  await vi.advanceTimersByTimeAsync(10_001);
  return pending;
}

describe('npm client', () => {
  const doc = {
    time: { created: '2010-01-01T00:00:00Z', modified: '2025-01-01T00:00:00Z', '1.0.0': '2015-05-05T00:00:00Z' },
    license: 'MIT',
    repository: { url: 'git+https://github.com/a/b.git' },
    versions: { '1.0.0': { deprecated: 'use other' } },
  };

  it('parses a successful response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(doc));
    const r = await fetchNpmInfo('pkg', '1.0.0');
    expect(r).toEqual({
      ok: true,
      value: {
        lastPublish: { value: '2015-05-05T00:00:00Z' },
        deprecation: { value: 'use other' },
        license: { value: 'MIT' },
        repositoryUrl: { value: 'git+https://github.com/a/b.git' },
      },
    });
  });

  it('reports a timeout', async () => {
    const r = await runWithTimeout(() => fetchNpmInfo('pkg', '1.0.0'));
    expect(r).toEqual({ ok: false, reason: 'timeout after 10000 ms' });
  });

  it('reports HTTP 500', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));
    expect(await fetchNpmInfo('pkg', '1.0.0')).toEqual({ ok: false, reason: 'HTTP 500' });
  });

  it('reports a malformed body', async () => {
    fetchMock.mockResolvedValue(badBodyResponse());
    expect(await fetchNpmInfo('pkg', '1.0.0')).toEqual({ ok: false, reason: 'malformed response body' });
    fetchMock.mockResolvedValue(jsonResponse([1, 2]));
    expect((await fetchNpmInfo('pkg', '1.0.0')).ok).toBe(false);
  });
});

describe('downloads client', () => {
  it('parses a successful response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ downloads: 1234 }));
    expect(await fetchWeeklyDownloads('pkg')).toEqual({ ok: true, value: 1234 });
  });

  it('reports a timeout', async () => {
    const r = await runWithTimeout(() => fetchWeeklyDownloads('pkg'));
    expect(r).toEqual({ ok: false, reason: 'timeout after 10000 ms' });
  });

  it('reports HTTP 500', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));
    expect(await fetchWeeklyDownloads('pkg')).toEqual({ ok: false, reason: 'HTTP 500' });
  });

  it('reports a malformed body', async () => {
    fetchMock.mockResolvedValue(badBodyResponse());
    expect(await fetchWeeklyDownloads('pkg')).toEqual({ ok: false, reason: 'malformed response body' });
    fetchMock.mockResolvedValue(jsonResponse({ downloads: 'many' }));
    expect((await fetchWeeklyDownloads('pkg')).ok).toBe(false);
  });
});

describe('osv client', () => {
  it('parses a successful response and posts name and version', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ vulns: [{ id: 'GHSA-1', aliases: ['CVE-1'], summary: 's' }] }));
    const r = await fetchVulnerabilities('pkg', '1.0.0');
    expect(r).toEqual({ value: [{ id: 'GHSA-1', aliases: ['CVE-1'], summary: 's' }] });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ package: { name: 'pkg', ecosystem: 'npm' }, version: '1.0.0' });
  });

  it('treats an empty object as no vulnerabilities', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    expect(await fetchVulnerabilities('pkg', '1.0.0')).toEqual({ value: [] });
  });

  it('reports a timeout as unknown', async () => {
    const r = await runWithTimeout(() => fetchVulnerabilities('pkg', '1.0.0'));
    expect(r).toEqual({ unknown: true, reason: 'OSV: timeout after 10000 ms' });
  });

  it('reports HTTP 500 as unknown', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));
    expect(await fetchVulnerabilities('pkg', '1.0.0')).toEqual({ unknown: true, reason: 'OSV: HTTP 500' });
  });

  it('reports a malformed body as unknown', async () => {
    fetchMock.mockResolvedValue(badBodyResponse());
    expect(await fetchVulnerabilities('pkg', '1.0.0')).toEqual({
      unknown: true,
      reason: 'OSV: malformed response body',
    });
    fetchMock.mockResolvedValue(jsonResponse({ vulns: 'nope' }));
    expect(await fetchVulnerabilities('pkg', '1.0.0')).toHaveProperty('unknown', true);
  });
});

describe('github client', () => {
  const url = 'https://github.com/a/b';
  const repoBody = { archived: true, pushed_at: '2020-01-01T00:00:00Z' };
  const headersOf = (): Record<string, string> =>
    (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;

  it('parses a successful response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(repoBody));
    const r = await fetchRepoInfo(url, { token: undefined });
    expect(r.repo).toEqual({ value: { archived: true, pushedAt: '2020-01-01T00:00:00Z' } });
    expect(r.fetchedAt).toBeDefined();
    expect(r.stale).toBeUndefined();
  });

  it('reports a timeout as unknown', async () => {
    const r = await runWithTimeout(() => fetchRepoInfo(url, { token: undefined }));
    expect(r.repo).toEqual({ unknown: true, reason: 'GitHub lookup failed: timeout after 10000 ms' });
  });

  it('reports HTTP 500 as unknown', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));
    const r = await fetchRepoInfo(url, { token: undefined });
    expect(r.repo).toEqual({ unknown: true, reason: 'GitHub lookup failed: HTTP 500' });
  });

  it('reports a malformed body as unknown', async () => {
    fetchMock.mockResolvedValue(badBodyResponse());
    const r = await fetchRepoInfo(url, { token: undefined });
    expect(r.repo).toEqual({ unknown: true, reason: 'GitHub lookup failed: malformed response body' });
    clearGithubCache();
    fetchMock.mockResolvedValue(jsonResponse({ archived: 'yes' }));
    expect((await fetchRepoInfo(url, { token: undefined })).repo).toHaveProperty('unknown', true);
  });

  it('serves a stale snapshot when a live call fails after expiry', async () => {
    let t = 0;
    fetchMock.mockResolvedValueOnce(jsonResponse(repoBody));
    await fetchRepoInfo(url, { token: undefined, now: () => t });
    t = 2 * 60 * 60 * 1000;
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    const r = await fetchRepoInfo(url, { token: undefined, now: () => t });
    expect(r.stale).toBe(true);
    expect(r.repo).toHaveProperty('value');
  });

  it('sends Authorization only when a token is set', async () => {
    fetchMock.mockResolvedValue(jsonResponse(repoBody));
    await fetchRepoInfo(url, { token: 'abc' });
    expect(headersOf().Authorization).toBe('Bearer abc');

    fetchMock.mockClear();
    clearGithubCache();
    await fetchRepoInfo(url, { token: undefined });
    expect(headersOf()).not.toHaveProperty('Authorization');
  });

  it('reads GITHUB_TOKEN from the environment by default', async () => {
    fetchMock.mockResolvedValue(jsonResponse(repoBody));
    vi.stubEnv('GITHUB_TOKEN', 'envtok');
    await fetchRepoInfo(url);
    expect(headersOf().Authorization).toBe('Bearer envtok');

    fetchMock.mockClear();
    clearGithubCache();
    vi.stubEnv('GITHUB_TOKEN', '');
    await fetchRepoInfo(url);
    expect(headersOf()).not.toHaveProperty('Authorization');
    vi.unstubAllEnvs();
  });
});
