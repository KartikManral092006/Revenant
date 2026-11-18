import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ALLOWED_PHRASE, findViolations, hasForbiddenTerm } from './language-guard.js';
import { assembleReport } from './assemble.js';
import { formatReport } from './format.js';
import { buildScore } from '../diff/scoring.js';
import { assembleBundle } from '../reverse-spec/bundle.js';
import type { CitableClass } from '../reverse-spec/citations.js';

const NUM_RUNS = 200;
const PHRASE = 'evidence, not proof';
const TERMS = ['proven', 'guaranteed', 'identical'] as const;

/** The spec's oracle: remove the phrase, then look for whole-word forbidden terms. */
const strip = (t: string): string => t.replace(ALLOWED_PHRASE, ' ');
const violates = (t: string): boolean => /\b(proven|guaranteed|identical)\b/i.test(strip(t));

const randomCase = (s: string, flips: boolean[]): string =>
  [...s].map((c, i) => (flips[i % Math.max(flips.length, 1)] ? c.toUpperCase() : c.toLowerCase())).join('');

const cleanWord = fc.constantFrom('returns', 'string', 'input', 'null', 'trims', 'value', 'object', 'array', 'same', 'proof', 'evidence');
const termArb = fc
  .tuple(fc.constantFrom(...TERMS), fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }))
  .map(([t, f]) => randomCase(t, f));
const phraseArb = fc.array(fc.boolean(), { minLength: 1, maxLength: 19 }).map((f) => randomCase(PHRASE, f));
const tokenArb = fc.oneof(cleanWord, cleanWord, termArb, phraseArb);
const textArb = fc
  .array(tokenArb, { minLength: 1, maxLength: 20 })
  .chain((toks) =>
    fc.array(fc.constantFrom(' ', ' ', '. ', ', ', '! '), { minLength: toks.length, maxLength: toks.length }).map((seps) =>
      toks.map((t, i) => t + seps[i]).join('').trim(),
    ),
  );
const cleanTextArb = fc
  .array(fc.oneof(cleanWord, phraseArb), { minLength: 1, maxLength: 8 })
  .map((w) => w.join(' '));

describe('Property 23: Forbidden words never appear', () => {
  it('the guard agrees with the oracle on arbitrary text', () => {
    fc.assert(
      fc.property(textArb, (text) => {
        expect(hasForbiddenTerm(text)).toBe(violates(text));
        expect(findViolations(text).length > 0).toBe(violates(text));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('the phrase alone is never a violation; a forbidden term next to it is detected', () => {
    fc.assert(
      fc.property(
        phraseArb,
        termArb,
        fc.constantFrom('', ' ', ', ', '. ', ' - '),
        fc.boolean(),
        (phrase, term, sep, before) => {
          expect(hasForbiddenTerm(phrase)).toBe(false);
          expect(hasForbiddenTerm(`Note: ${phrase}.`)).toBe(false);
          const text = before ? `${term}${sep}${phrase}` : `${phrase}${sep}${term}`;
          expect(hasForbiddenTerm(text)).toBe(true);
          expect(findViolations(text).map((v) => v.term)).toContain(term.toLowerCase());
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('generated reports contain no forbidden word outside the allowed phrase', () => {
    fc.assert(
      fc.property(
        cleanTextArb,
        cleanTextArb,
        fc.constantFrom('available', 'not available', 'adapted from upstream' as const),
        fc.nat(2000),
        fc.nat(50),
        fc.nat(100),
        fc.boolean(),
        (reason, detail, label, matched, mismatches, covered, partial) => {
          const total = matched + covered + mismatches;
          const summary = buildScore(
            { total, matched, intentional: covered, mismatches, scored: total - covered, perRule: { r1: covered } },
            partial,
          );
          const report = assembleReport({
            run: {
              seed: 1,
              n: total + 5,
              summary,
              partial,
              samples: mismatches
                ? [{ index: 0, input: ['x'], original: { outcome: { kind: 'returned' } }, rebuild: { outcome: { kind: 'threw' } }, reasons: ['outcome'] }]
                : [],
            } as never,
            manifest: { name: 'pkg', originalTestSuite: { label, detail } },
            rules: [{ id: 'r1', reason, advisory: 'CVE-2020-8203', when: { original: {}, rebuild: {} } } as never],
            exportName: 'fn',
            source: 'stored',
            generatedAt: '2026-01-01T00:00:00.000Z',
            osvVulnerabilities: [{ id: 'CVE-2020-8203' }],
          });
          const text = formatReport(report);
          expect(violates(text)).toBe(false);
          expect(hasForbiddenTerm(text)).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('assembled spec bundles contain no forbidden word in any document or statement', () => {
    const classes: CitableClass[] = [{ classId: 'p:f:a', count: 7, evidenceIds: ['E1', 'E2'], representatives: ['E1'] }];
    fc.assert(
      fc.property(fc.array(textArb, { minLength: 1, maxLength: 4 }), (statements) => {
        const b = assembleBundle({
          package: 'p',
          model: 'm',
          generatedAt: '2025-01-01T00:00:00.000Z',
          classes,
          requirements: statements.map((s, i) => ({ id: `R${i + 1}`, statement: s, classIds: ['p:f:a'] })),
        });
        for (const [name, doc] of Object.entries(b.documents)) {
          expect(violates(doc), name).toBe(false);
        }
        for (const r of b.requirements) expect(violates(r.statement)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('stored spec-bundle fixtures under data/ contain no forbidden word', () => {
    const dataDir = join(process.cwd(), 'data');
    const files = readdirSync(dataDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(dataDir, d.name, 'reverse-spec.json'))
      .filter((f) => existsSync(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const bundle = JSON.parse(readFileSync(f, 'utf8')) as { documents: Record<string, string> };
      for (const [name, doc] of Object.entries(bundle.documents)) {
        expect(violates(doc), `${f}:${name}`).toBe(false);
      }
    }
  });
});
