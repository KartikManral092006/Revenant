import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { summarizeBranches, summarizeExports, type V8CoverageFile } from '../lib/ghost-memory/coverage';

// Feature: revenant-mvp, Property 8: Coverage summary bounds
// **Validates: Requirements 3.3, 3.5**

const dir = path.resolve('graveyard/node_modules/pkg');
const urls = {
  inside: [`file://${dir}/index.js`, `file://${dir}/lib/a.js`],
  nested: [`file://${dir}/node_modules/dep/i.js`],
  outside: ['node:internal/foo', 'file:///elsewhere/x.js', `file://${dir}-other/x.js`],
};

const rangeArb = fc.record({ startOffset: fc.nat(20), endOffset: fc.nat(20), count: fc.nat(3) });
const scriptArb = (pool: string[]) =>
  fc.record({
    url: fc.constantFrom(...pool),
    functions: fc.array(fc.record({ ranges: fc.array(rangeArb, { maxLength: 8 }) }), { maxLength: 4 }),
  });
const filesArb = (pool: string[]) =>
  fc.array(fc.record({ result: fc.array(scriptArb(pool), { maxLength: 4 }) }), { maxLength: 4 });

const runs = { numRuns: 150 };

describe('Property 8: coverage summary bounds', () => {
  it('branch summary stays within bounds and matches an independent model', () => {
    const all = [...urls.inside, ...urls.nested, ...urls.outside];
    fc.assert(
      fc.property(filesArb(all), (files: V8CoverageFile[]) => {
        const b = summarizeBranches(files, dir);
        expect(b.percent).toBeGreaterThanOrEqual(0);
        expect(b.percent).toBeLessThanOrEqual(100);
        expect(Number.isFinite(b.percent)).toBe(true);
        expect(b.covered).toBeGreaterThanOrEqual(0);
        expect(b.covered).toBeLessThanOrEqual(b.total);
        expect(b.total === 0 ? b.percent === 0 : Math.abs(b.percent - (b.covered / b.total) * 100) < 1e-9).toBe(true);

        const model = new Map<string, boolean>();
        for (const f of files)
          for (const s of f.result)
            if (urls.inside.includes(s.url))
              for (const fn of s.functions)
                for (const r of fn.ranges) {
                  const k = `${s.url}|${r.startOffset}|${r.endOffset}`;
                  model.set(k, (model.get(k) ?? false) || r.count > 0);
                }
        expect(b.total).toBe(model.size);
        expect(b.covered).toBe([...model.values()].filter(Boolean).length);
      }),
      runs,
    );
  });

  it('ignores scripts outside the package and in nested node_modules', () => {
    fc.assert(
      fc.property(filesArb([...urls.nested, ...urls.outside]), (files) => {
        expect(summarizeBranches(files, dir)).toEqual({ covered: 0, total: 0, percent: 0 });
      }),
      runs,
    );
  });

  it('is unchanged by merging a file with itself (idempotent) and never lowers coverage when files are added', () => {
    fc.assert(
      fc.property(filesArb(urls.inside), filesArb(urls.inside), (a, b) => {
        const base = summarizeBranches(a, dir);
        expect(summarizeBranches([...a, ...a], dir)).toEqual(base);
        const merged = summarizeBranches([...a, ...b], dir);
        expect(merged.total).toBeGreaterThanOrEqual(base.total);
        expect(merged.covered).toBeGreaterThanOrEqual(base.covered);
        expect(merged.percent).toBeLessThanOrEqual(100);
      }),
      runs,
    );
  });

  it('exported-function count never exceeds the export total', () => {
    const name = fc.constantFrom<string>('a', 'b', 'c', 'd', 'e', 'f');
    fc.assert(
      fc.property(
        fc.array(name, { maxLength: 10 }),
        fc.array(fc.constantFrom('a', 'b', 'c', 'x', 'y', 'z'), { maxLength: 20 }),
        (exps, seen) => {
          const e = summarizeExports(seen.map((x) => ({ export: x })), exps.map((n) => ({ name: n })));
          const names = new Set(exps);
          const exercised = new Set(seen.filter((s) => names.has(s)));
          expect(e.total).toBe(names.size);
          expect(e.exercised).toBe(exercised.size);
          expect(e.exercised).toBeLessThanOrEqual(e.total);
          expect(e.percent).toBeGreaterThanOrEqual(0);
          expect(e.percent).toBeLessThanOrEqual(100);
          if (e.total === 0) expect(e.percent).toBe(0);
        },
      ),
      runs,
    );
  });

  it('handles empty inputs', () => {
    expect(summarizeBranches([], dir)).toEqual({ covered: 0, total: 0, percent: 0 });
    expect(summarizeExports([], [])).toEqual({ exercised: 0, total: 0, percent: 0 });
  });
});
