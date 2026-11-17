/**
 * GitHub repository client for Autopsy. Server-side only: it reads
 * `GITHUB_TOKEN` and must never be imported into client components.
 *
 * Responses are cached in memory per repository. Within the TTL no further
 * upstream request is made. When a live call fails, the last stored snapshot
 * is served and labelled with its timestamp; without one the fields are unknown.
 */

import { fetchJson, known, unknownField, type Field } from './http';

export const GITHUB_API_BASE = 'https://api.github.com/repos';
/** Proposed 1 hour, to stay under 60 unauthenticated requests per hour per IP. */
export const GITHUB_CACHE_TTL_MS = 60 * 60 * 1000;

export interface RepoInfo {
  archived: boolean;
  /** ISO timestamp of the last push. */
  pushedAt: string;
}

export interface RepoLookup {
  repo: Field<RepoInfo>;
  /** ISO timestamp of when the data was fetched from GitHub. Present when `repo` has a value. */
  fetchedAt?: string;
  /** True when the live call failed and `repo` comes from an older stored snapshot. */
  stale?: boolean;
}

export interface GithubClientOptions {
  /** Clock, injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
  ttlMs?: number;
  /** Token override. Defaults to `process.env.GITHUB_TOKEN`. */
  token?: string | undefined;
  timeoutMs?: number;
}

interface CacheEntry {
  info: RepoInfo;
  fetchedAtMs: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<RepoLookup>>();

/** Clear the in-memory cache (for tests). */
export function clearGithubCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * Extract `{ owner, repo }` from a repository URL such as
 * `git+https://github.com/lodash/lodash.git`, `https://github.com/a/b`,
 * `git://github.com/a/b.git`, `git@github.com:a/b.git` or `github:a/b`.
 * Returns null for anything that is not a GitHub repository.
 */
export function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim();
  const match =
    /^(?:git\+)?(?:(?:https?|git|ssh):\/\/(?:[^@/]+@)?)?(?:www\.)?github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?].*)?$/i.exec(
      trimmed,
    ) ?? /^(?:git@)github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i.exec(trimmed) ??
    /^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i.exec(trimmed);
  if (!match) return null;
  const [, owner, repo] = match;
  if (!owner || !repo) return null;
  return { owner, repo };
}

function parseRepoBody(body: unknown): RepoInfo | null {
  if (typeof body !== 'object' || body === null) return null;
  const { archived, pushed_at: pushedAt } = body as Record<string, unknown>;
  if (typeof archived !== 'boolean' || typeof pushedAt !== 'string') return null;
  return { archived, pushedAt };
}

/** Look up archived flag and last push for a repository URL. Never throws. */
export async function fetchRepoInfo(
  repositoryUrl: string | undefined,
  options: GithubClientOptions = {},
): Promise<RepoLookup> {
  if (!repositoryUrl) return { repo: unknownField('no repository URL in the package metadata') };
  const parsed = parseGithubRepo(repositoryUrl);
  if (!parsed) return { repo: unknownField('repository is not hosted on GitHub') };

  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? GITHUB_CACHE_TTL_MS;
  const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();

  const cached = cache.get(key);
  if (cached && now() - cached.fetchedAtMs < ttlMs) {
    return {
      repo: known(cached.info),
      fetchedAt: new Date(cached.fetchedAtMs).toISOString(),
    };
  }

  // Concurrent lookups for the same repository share one upstream request.
  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async (): Promise<RepoLookup> => {
    const token = 'token' in options ? options.token : process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'revenant-autopsy',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const result = await fetchJson(`${GITHUB_API_BASE}/${parsed.owner}/${parsed.repo}`, {
      headers,
      timeoutMs: options.timeoutMs,
    });

    const info = result.ok ? parseRepoBody(result.value) : null;
    if (info) {
      const fetchedAtMs = now();
      cache.set(key, { info, fetchedAtMs });
      return { repo: known(info), fetchedAt: new Date(fetchedAtMs).toISOString() };
    }

    const reason = result.ok ? 'unexpected response shape from GitHub' : result.reason;
    if (cached) {
      return {
        repo: known(cached.info),
        fetchedAt: new Date(cached.fetchedAtMs).toISOString(),
        stale: true,
      };
    }
    return { repo: unknownField(`GitHub lookup failed: ${reason}`) };
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, request);
  return request;
}
