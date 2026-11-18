import { describe, expect, it } from 'vitest';
import { assembleReport } from './assemble.js';
import { formatReport } from './format.js';
import { hasForbiddenTerm } from './language-guard.js';
import { buildScore, emptyCounts, addVerdict } from '../diff/scoring.js';

const rules = [
  { id: 'r1', reason: 'fixes pollution', advisory: 'CVE-2020-8203', when: { original: {}, rebuild: {} } },
  { id: 'r2', reason: 'unused', advisory: 'CVE-2020-8204', when: { original: {}, rebuild: {} } },
];

function makeRun() {
  let c = emptyCounts();
  c = addVerdict(c, { kind: 'match' });
  c = addVerdict(c, { kind: 'match' });
  c = addVerdict(c, { kind: 'intentional', ruleId: 'r1' });
  c = addVerdict(c, { kind: 'mismatch', reasons: ['outcome'] });
  const ok = { outcome: { kind: 'returned' } };
  return {
    seed: 7,
    n: 10,
    partial: true,
    summary: buildScore(c, true),
    samples: [
      { index: 3, input: [{ a: 1 }], original: ok, rebuild: { outcome: { kind: 'threw' } }, reasons: ['outcome'] },
    ],
  } as never;
}

describe('assembleReport', () => {
  const report = assembleReport({
    run: makeRun(),
    manifest: { name: 'lodash.set', originalTestSuite: { label: 'not available', detail: 'No tests shipped.' } },
    rules,
    exportName: 'set',
    source: 'stored',
    generatedAt: '2026-01-01T00:00:00.000Z',
  });

  it('reports score with denominator and excludes intentional cases', () => {
    expect(report.scoreText).toBe('2 / 3 inputs matched');
    expect(report.score).toEqual({ matched: 2, scored: 3, total: 4, excluded: 1, mismatches: 1 });
  });

  it('lists every rule separately with covered counts', () => {
    expect(report.intentionalDifferences.map((d) => [d.id, d.covered])).toEqual([
      ['r1', 1],
      ['r2', 0],
    ]);
  });

  it('includes mismatch samples with evidence IDs and the test-suite label', () => {
    expect(report.mismatchSamples[0].evidenceId).toMatch(/^lodash\.set:set:[0-9a-f]{12}$/);
    expect(report.originalTestSuite.label).toBe('not available');
  });

  it('lists only advisories reported by OSV and covered by a rule', () => {
    const r = assembleReport({
      run: makeRun(),
      manifest: { name: 'lodash.set', originalTestSuite: { label: 'not available', detail: 'x' } },
      rules,
      exportName: 'set',
      source: 'stored',
      osvVulnerabilities: [
        { id: 'GHSA-p6mc-m468-83gw', aliases: ['CVE-2020-8203'] },
        { id: 'CVE-2020-8204' }, // reported but rule covered 0 inputs
        { id: 'CVE-1999-0001' }, // reported but no rule
      ],
    });
    expect(r.vulnerabilitiesRemoved).toEqual([
      { advisory: 'CVE-2020-8203', basis: 'behavior no longer observed in 1 inputs' },
    ]);
  });

  it('lists nothing when OSV does not report the rule advisory', () => {
    const r = assembleReport({
      run: makeRun(),
      manifest: { name: 'lodash.set', originalTestSuite: { label: 'not available', detail: 'x' } },
      rules,
      exportName: 'set',
      source: 'stored',
      osvVulnerabilities: [],
    });
    expect(r.vulnerabilitiesRemoved).toEqual([]);
  });

  it('formats text without forbidden terms and shows the partial note', () => {
    const text = formatReport(report);
    expect(text).toContain('2 / 3 inputs matched');
    expect(text).toContain('Partial: 4 of 10 inputs completed');
    expect(hasForbiddenTerm(text)).toBe(false);
  });
});
