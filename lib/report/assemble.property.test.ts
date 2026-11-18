import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { assembleReport } from './assemble.js';
import { formatReport } from './format.js';
import { buildScore, formatCount } from '../diff/scoring.js';

const LABELS = ['available', 'not available', 'adapted from upstream'] as const;

const ruleArb = fc.record({
  reason: fc.stringMatching(/^[a-z ]{1,20}$/),
  advisory: fc.constantFrom('CVE-2020-8203', 'CVE-2020-8204', 'GHSA-aaaa-bbbb-cccc', 'CVE-2018-3721'),
  covered: fc.nat(500),
});

const runArb = fc
  .record({
    rules: fc.array(ruleArb, { maxLength: 5 }),
    matched: fc.nat(2000),
    mismatches: fc.nat(50),
    seed: fc.nat(),
    extra: fc.nat(100),
    partial: fc.boolean(),
    label: fc.constantFrom(...LABELS),
    detail: fc.stringMatching(/^[a-z ]{1,30}$/),
    osv: fc.array(fc.constantFrom('CVE-2020-8203', 'CVE-2020-8204', 'GHSA-aaaa-bbbb-cccc', 'CVE-1999-0001'), {
      maxLength: 4,
    }),
    inputs: fc.array(fc.jsonValue(), { minLength: 1, maxLength: 3 }),
  })
  .map((g) => {
    const rules = g.rules.map((r, i) => ({
      id: `rule-${i}`,
      reason: r.reason,
      advisory: r.advisory,
      when: { original: {}, rebuild: {} },
    }));
    const perRule: Record<string, number> = {};
    let intentional = 0;
    g.rules.forEach((r, i) => {
      perRule[`rule-${i}`] = r.covered;
      intentional += r.covered;
    });
    const total = g.matched + intentional + g.mismatches;
    const summary = buildScore(
      { total, matched: g.matched, intentional, mismatches: g.mismatches, scored: total - intentional, perRule },
      g.partial,
    );
    const samples = g.mismatches > 0
      ? g.inputs.slice(0, g.mismatches).map((input, index) => ({
          index,
          input: [input],
          original: { outcome: { kind: 'returned' } },
          rebuild: { outcome: { kind: 'threw' } },
          reasons: ['outcome'],
        }))
      : [];
    return { g, rules, summary, samples, total };
  });

describe('Property 22: Report completeness', () => {
  it('contains score, rules with counts, vulnerabilities, suite label, and mismatches', () => {
    fc.assert(
      fc.property(runArb, ({ g, rules, summary, samples, total }) => {
        const report = assembleReport({
          run: { seed: g.seed, n: total + g.extra, summary, partial: g.partial, samples } as never,
          manifest: { name: 'pkg', originalTestSuite: { label: g.label, detail: g.detail } },
          rules,
          exportName: 'fn',
          source: 'stored',
          generatedAt: '2026-01-01T00:00:00.000Z',
          osvVulnerabilities: g.osv.map((id) => ({ id })),
        });
        const text = formatReport(report);

        // Score with denominator
        expect(report.scoreText).toMatch(/^[\d,]+ \/ [\d,]+ inputs matched$/);
        expect(report.score.scored).toBe(total - summary.intentional);
        expect(text).toContain(report.scoreText);
        expect(text).toContain(`/ ${formatCount(report.score.scored)} inputs`);

        // Every rule with its covered count
        expect(report.intentionalDifferences).toHaveLength(rules.length);
        for (const r of rules) {
          const d = report.intentionalDifferences.find((x) => x.id === r.id)!;
          expect(d.covered).toBe(summary.perRule[r.id]);
          expect(text).toContain(`${r.id} [${r.advisory}]: ${r.reason} (covered ${formatCount(d.covered)})`);
        }

        // Vulnerabilities removed section is present; each entry is rendered
        expect(text).toContain('Vulnerabilities removed:');
        for (const v of report.vulnerabilitiesRemoved) {
          expect(text).toContain(`${v.advisory}: ${v.basis}`);
        }

        // Test-suite label is one of the three allowed values and is shown
        expect(LABELS).toContain(report.originalTestSuite.label);
        expect(text).toContain(`Original test suite: ${g.label}`);

        // Mismatch count and samples
        if (g.mismatches > 0) {
          expect(text).toContain(`${formatCount(g.mismatches)} mismatches`);
          expect(report.mismatchSamples.length).toBeGreaterThan(0);
          for (const m of report.mismatchSamples) expect(text).toContain(m.evidenceId);
        }
      }),
      { numRuns: 150 },
    );
  });
});
