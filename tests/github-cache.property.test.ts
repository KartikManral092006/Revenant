import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";
import {
  clearGithubCache,
  fetchRepoInfo,
  GITHUB_CACHE_TTL_MS,
} from "../lib/autopsy/github";

// Feature: revenant-mvp, Property 4: GitHub cache limits upstream calls
describe("Property 4: GitHub cache limits upstream calls", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearGithubCache();
    fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ archived: false, pushed_at: "2024-01-01T00:00:00Z" }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearGithubCache();
  });

  it("makes at most one upstream request for any lookup sequence within the TTL", async () => {
    /** Validates: Requirements 2.6 */
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("a/b", "lodash/lodash", "Foo/Bar"),
        fc.array(fc.integer({ min: 0, max: GITHUB_CACHE_TTL_MS - 1 }), {
          minLength: 1,
          maxLength: 30,
        }),
        fc.boolean(),
        async (slug, offsets, concurrent) => {
          clearGithubCache();
          fetchMock.mockClear();
          const start = 1_700_000_000_000;
          const sorted = [...offsets].sort((x, y) => x - y);
          // Cache timestamp is taken when the first lookup completes, at `start`.
          let clock = start;
          const options = { now: () => clock, token: undefined };
          // Vary URL spelling and case: all name the same repository.
          const urls = [
            `https://github.com/${slug}`,
            `git+https://github.com/${slug}.git`,
            `https://github.com/${slug.toUpperCase()}`,
          ];

          await fetchRepoInfo(urls[0], options);
          if (concurrent) {
            clock = start + sorted[0]!;
            await Promise.all(
              sorted.map((_, i) => fetchRepoInfo(urls[i % urls.length], options)),
            );
          } else {
            for (const [i, off] of sorted.entries()) {
              clock = start + off;
              await fetchRepoInfo(urls[i % urls.length], options);
            }
          }
          expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("shares one upstream request between concurrent first lookups", async () => {
    /** Validates: Requirements 2.6 */
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (n) => {
        clearGithubCache();
        fetchMock.mockClear();
        await Promise.all(
          Array.from({ length: n }, () =>
            fetchRepoInfo("https://github.com/a/b", { token: undefined }),
          ),
        );
        expect(fetchMock.mock.calls.length).toBe(1);
      }),
      { numRuns: 100 },
    );
  });
});
