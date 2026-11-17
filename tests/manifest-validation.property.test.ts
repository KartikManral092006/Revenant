import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ARG_KINDS,
  DEFAULT_N,
  effectiveN,
  validateManifest,
  type ArgKind,
} from '../lib/graveyard/manifest-schema';

// Feature: revenant-mvp, Property 26: Manifest validation
// **Validates: Requirements 12.2, 12.3, 12.4**

const REQUIRED_EDGE_CASES: unknown[][] = [['__proto__'], ['constructor.prototype'], ['a[0]']];
const evidence = { evidence: 'checked registry', checkedAt: '2025-01-01' };

function baseManifest(over: {
  version?: unknown;
  kinds?: ArgKind[];
  edgeCases?: unknown[][];
  n?: unknown;
}): Record<string, unknown> {
  const m: Record<string, unknown> = {
    name: 'pkg',
    version: 'version' in over ? over.version : '1.2.3',
    exportsUnderTest: [{ name: 'pkg', arity: 1 }],
    generator: {
      argSpecs: (over.kinds ?? ['string']).map((kind) => ({ kind })),
      seed: 42,
      edgeCases: over.edgeCases ?? REQUIRED_EDGE_CASES,
    },
    classFeatures: [{ feature: 'outcome', allowed: ['returned'] }],
    graveyardCriteria: {
      unmaintained: evidence,
      permissiveLicense: evidence,
      weeklyDownloads: evidence,
      pureFunction: { judgment: 'human', note: 'pure', reviewedBy: 'me' },
    },
    resurrection: 'full',
    originalTestSuite: { label: 'available', detail: 'x' },
  };
  if (over.n !== undefined) m.n = over.n;
  return m;
}

const exactVersion = fc
  .tuple(fc.nat(999), fc.nat(999), fc.nat(999), fc.option(fc.stringMatching(/^[0-9A-Za-z]{1,6}$/), { nil: undefined }))
  .map(([a, b, c, pre]) => `${a}.${b}.${c}${pre ? `-${pre}` : ''}`);

const inexactVersion = fc.oneof(
  exactVersion.map((v) => `^${v}`),
  exactVersion.map((v) => `~${v}`),
  exactVersion.map((v) => `>=${v}`),
  fc.tuple(fc.nat(99), fc.nat(99), fc.nat(99)).map(([a, b, c]) => `${a}.${b}.${c}.x`),
  fc.constantFrom('latest', '*', '1', '1.2', '1.x', 'x.y.z', '', ' 1.2.3', '1.2.3 ', 'https://example.com/p.tgz', 'git+https://github.com/a/b.git'),
  fc.integer(),
  fc.constant(undefined),
  fc.constant(null),
);

const needyKinds = fc.constantFrom<ArgKind>('string', 'object', 'array', 'path');
const freeKinds = fc.constantFrom<ArgKind>('number', 'any');
const anyKinds = fc.array(fc.constantFrom(...ARG_KINDS), { maxLength: 4 });

describe('Property 26: Manifest validation', () => {
  it('accepts a version only if it is exact', () => {
    fc.assert(
      fc.property(exactVersion, (v) => {
        expect(validateManifest(baseManifest({ version: v })).ok).toBe(true);
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(inexactVersion, (v) => {
        expect(validateManifest(baseManifest({ version: v })).ok).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('requires the three edge cases whenever a string/object/array/path input exists', () => {
    // Which of the required edge cases are present (as a subset), mixed with filler strings.
    const subset = fc.subarray(REQUIRED_EDGE_CASES, { minLength: 0, maxLength: 3 });
    const filler = fc.array(fc.array(fc.oneof(fc.string(), fc.integer(), fc.constant(null)), { maxLength: 2 }), { maxLength: 4 });
    fc.assert(
      fc.property(
        fc.array(needyKinds, { minLength: 1, maxLength: 3 }),
        fc.array(freeKinds, { maxLength: 2 }),
        subset,
        filler,
        (needy, free, present, extra) => {
          // Filler strings could accidentally satisfy a requirement; drop those.
          const safeExtra = extra.filter((args) =>
            args.every((a) => typeof a !== 'string' || (a !== '__proto__' && a !== 'constructor.prototype' && !/\[\d+\]|(^|\.)\d+(\.|$)/.test(a))),
          );
          const edgeCases = [...present, ...safeExtra];
          const r = validateManifest(baseManifest({ kinds: [...needy, ...free], edgeCases }));
          expect(r.ok).toBe(present.length === 3);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does not require the edge cases when no input needs them', () => {
    fc.assert(
      fc.property(fc.array(freeKinds, { maxLength: 4 }), fc.array(fc.array(fc.integer(), { maxLength: 2 }), { maxLength: 3 }), (kinds, edgeCases) => {
        expect(validateManifest(baseManifest({ kinds, edgeCases })).ok).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('accepts the array-index path in either bracket or dotted form', () => {
    fc.assert(
      fc.property(fc.nat(50), fc.constantFrom('a', 'x', 'foo'), fc.boolean(), (i, key, bracket) => {
        const path = bracket ? `${key}[${i}]` : `${key}.${i}`;
        const edgeCases = [['__proto__'], ['constructor.prototype'], [path]];
        expect(validateManifest(baseManifest({ kinds: ['path'], edgeCases })).ok).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('effective N is 1000 when n is omitted and equals n otherwise', () => {
    fc.assert(
      fc.property(fc.option(fc.integer({ min: 1, max: 1_000_000 }), { nil: undefined }), anyKinds, (n, _kinds) => {
        const r = validateManifest(baseManifest({ n }));
        expect(r.ok).toBe(true);
        if (r.ok) {
          const expected = n === undefined ? DEFAULT_N : n;
          expect(r.effectiveN).toBe(expected);
          expect(effectiveN(r.manifest)).toBe(expected);
        }
      }),
      { numRuns: 100 },
    );
    expect(DEFAULT_N).toBe(1000);
  });

  it('rejects non-positive or non-integer n', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ max: 0 }), fc.double({ noInteger: true, noNaN: true }), fc.constant(NaN), fc.string()),
        (n) => {
          expect(validateManifest(baseManifest({ n })).ok).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
