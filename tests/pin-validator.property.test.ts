import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { validatePins } from '../lib/graveyard/check-pins';

// Feature: revenant-mvp, Property 1: Pin validator accepts exactly pinned versions
// **Validates: Requirements 1.2, 1.6**

// Independent oracle: the exact-version rule from design.md.
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** A fully consistent Graveyard (package.json, manifest, lockfile) that uses `version` everywhere. */
function consistent(version: string) {
  return validatePins({
    dependencies: { pkg: version },
    manifests: [{ dir: 'pkg', name: 'pkg', version }],
    lockfile: { packages: { 'node_modules/pkg': { version } } },
  });
}

const num = fc.nat({ max: 999 });
const exact = fc
  .tuple(num, num, num, fc.option(fc.stringMatching(/^[0-9A-Za-z.-]{1,8}$/), { nil: undefined }))
  .map(([a, b, c, pre]) => `${a}.${b}.${c}${pre === undefined ? '' : `-${pre}`}`);

const notExact = fc.oneof(
  // range operators and prefixes
  fc.tuple(fc.constantFrom('^', '~', '>', '>=', '<', '<=', '=', 'v', ' '), exact).map(([p, v]) => p + v),
  // wildcards, partial versions, tags, ranges, URLs, aliases
  fc.constantFrom(
    '*', 'x', '1.x', '1.2.x', '1', '1.2', 'latest', 'next', '',
    '1.0.0 - 2.0.0', '>=1.0.0 <2.0.0', '1.0.0 || 2.0.0',
    'github:user/repo', 'git+https://github.com/u/r.git', 'https://example.com/p.tgz',
    'file:../p', 'npm:other@1.0.0', '1.2.3+build', '1.2.3\n', '-1.2.3', '1.2.3-',
  ),
  fc.string(),
);

describe('Property 1: pin validator accepts exactly pinned versions', () => {
  it('accepts a consistent Graveyard iff the specifier is an exact version', () => {
    fc.assert(
      fc.property(fc.oneof(exact, notExact), (v) => {
        const result = consistent(v);
        expect(result.ok).toBe(EXACT.test(v));
        expect(result.ok).toBe(result.errors.length === 0);
      }),
      { numRuns: 200 },
    );
  });

  it('always accepts generated exact versions', () => {
    fc.assert(
      fc.property(exact, (v) => {
        expect(consistent(v).ok).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('always rejects non-exact specifiers, naming the offending version', () => {
    fc.assert(
      fc.property(notExact.filter((v) => !EXACT.test(v)), (v) => {
        const result = consistent(v);
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes(JSON.stringify(v)))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects a lockfile version that differs from an exact manifest version', () => {
    fc.assert(
      fc.property(exact, exact, (v, locked) => {
        fc.pre(v !== locked);
        const result = validatePins({
          dependencies: { pkg: v },
          manifests: [{ dir: 'pkg', name: 'pkg', version: v }],
          lockfile: { packages: { 'node_modules/pkg': { version: locked } } },
        });
        expect(result.ok).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects a missing lockfile', () => {
    const result = validatePins({
      dependencies: { pkg: '1.0.0' },
      manifests: [{ dir: 'pkg', name: 'pkg', version: '1.0.0' }],
      lockfile: null,
    });
    expect(result.ok).toBe(false);
  });
});
