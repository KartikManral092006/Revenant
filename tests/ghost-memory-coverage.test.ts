import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { listGraveyard } from '../lib/graveyard/loader';
import { recordPackage } from '../lib/ghost-memory/recorder';
import {
  measureCoverage,
  summarizeBranches,
  summarizeExports,
  writeCoverage,
} from '../lib/ghost-memory/coverage';

const manifest = listGraveyard().find((m) => m.name === 'lodash.set')!;
const dir = path.resolve('graveyard/node_modules/lodash.set');
const url = `file://${dir}/index.js`;

describe('coverage summaries', () => {
  it('counts ranges with count > 0 for package files only', () => {
    const files = [
      {
        result: [
          { url, functions: [{ ranges: [{ startOffset: 0, endOffset: 10, count: 1 }, { startOffset: 2, endOffset: 4, count: 0 }] }] },
          { url: `file://${dir}/node_modules/x/i.js`, functions: [{ ranges: [{ startOffset: 0, endOffset: 1, count: 0 }] }] },
          { url: 'node:internal/foo', functions: [{ ranges: [{ startOffset: 0, endOffset: 1, count: 0 }] }] },
        ],
      },
      { result: [{ url, functions: [{ ranges: [{ startOffset: 2, endOffset: 4, count: 3 }] }] }] },
    ];
    expect(summarizeBranches(files, dir)).toEqual({ covered: 2, total: 2, percent: 100 });
  });

  it('property: bounds hold for any ranges and exports', () => {
    const range = fc.record({ startOffset: fc.nat(50), endOffset: fc.nat(50), count: fc.nat(3) });
    fc.assert(
      fc.property(
        fc.array(fc.record({ result: fc.array(fc.record({ url: fc.constant(url), functions: fc.array(fc.record({ ranges: fc.array(range) })) })) })),
        fc.array(fc.string(), { maxLength: 6 }),
        fc.array(fc.string(), { maxLength: 6 }),
        (files, exps, seen) => {
          const b = summarizeBranches(files, dir);
          expect(b.percent).toBeGreaterThanOrEqual(0);
          expect(b.percent).toBeLessThanOrEqual(100);
          expect(b.covered).toBeLessThanOrEqual(b.total);
          const e = summarizeExports(seen.map((export_) => ({ export: export_ })), exps.map((name) => ({ name })));
          expect(e.exercised).toBeLessThanOrEqual(e.total);
          expect(e.percent).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('offline coverage pass', () => {
  it('replays a lodash.set recording under V8 coverage and writes coverage.json', async () => {
    const recording = await recordPackage({ manifest, n: 30 });
    const cov = await measureCoverage({ manifest, recording, now: () => new Date('2030-01-01T00:00:00Z') });
    expect(cov.measuredAt).toBe('2030-01-01T00:00:00.000Z');
    expect(cov.exportedFunctions).toEqual({ exercised: 1, total: 1, percent: 100 });
    expect(cov.branches).not.toBeNull();
    expect(cov.branches!.percent).toBeGreaterThan(0);

    const tmp = mkdtempSync(path.join(os.tmpdir(), 'revenant-cov-'));
    try {
      const file = writeCoverage(cov, tmp);
      expect(JSON.parse(readFileSync(file, 'utf8')).package).toBe('lodash.set');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 90_000);

  it('sets branches to null when the V8 pass fails', async () => {
    const recording = await recordPackage({ manifest, n: 3 });
    const cov = await measureCoverage({ manifest, recording, repoRoot: os.tmpdir(), packageDir: dir });
    expect(cov.branches).toBeNull();
    expect(cov.branchesError).toBeTruthy();
    expect(cov.exportedFunctions.exercised).toBe(1);
  }, 60_000);
});
