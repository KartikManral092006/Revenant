import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { scoreVerdicts } from "../lib/diff/scoring";
import type { Verdict } from "../lib/diff/rules";

const NUM_RUNS = 200;

const verdictArb: fc.Arbitrary<Verdict> = fc.oneof(
  fc.constant<Verdict>({ kind: "match" }),
  fc
    .constantFrom("R1", "R2", "R3", "R4")
    .map((ruleId): Verdict => ({ kind: "intentional", ruleId })),
  fc.constant<Verdict>({ kind: "mismatch", reasons: [] }),
);

function parseScore(text: string): { m: number; s: number } {
  const match = /^([\d,]+) \/ ([\d,]+) inputs matched$/.exec(text);
  if (!match) throw new Error(`unparseable score: ${text}`);
  return { m: Number(match[1].replace(/,/g, "")), s: Number(match[2].replace(/,/g, "")) };
}

describe("Property 20: Score arithmetic and exclusion of intentional differences", () => {
  /** **Validates: Requirements 8.2, 9.4, 9.5** */
  it("satisfies S = T - I, M + X = S, per-rule sums to I, and text round-trips", () => {
    fc.assert(
      fc.property(fc.array(verdictArb, { maxLength: 300 }), (verdicts) => {
        const score = scoreVerdicts(verdicts);
        const T = verdicts.length;
        const M = verdicts.filter((v) => v.kind === "match").length;
        const I = verdicts.filter((v) => v.kind === "intentional").length;
        const X = verdicts.filter((v) => v.kind === "mismatch").length;

        expect(score.total).toBe(T);
        expect(score.matched).toBe(M);
        expect(score.intentional).toBe(I);
        expect(score.mismatches).toBe(X);
        expect(score.scored).toBe(T - I);
        expect(score.matched + score.mismatches).toBe(score.scored);
        expect(Object.values(score.perRule).reduce((a, b) => a + b, 0)).toBe(I);

        const parsed = parseScore(score.scoreText);
        expect(parsed.m).toBe(M);
        expect(parsed.s).toBe(T - I);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 9.4, 9.5** */
  it("rule-explained cases change neither numerator nor denominator", () => {
    fc.assert(
      fc.property(
        fc.array(verdictArb, { maxLength: 100 }),
        fc.array(fc.constantFrom("R1", "R2"), { maxLength: 50 }),
        (verdicts, extraRules) => {
          const base = scoreVerdicts(verdicts);
          const extra: Verdict[] = extraRules.map((ruleId) => ({ kind: "intentional", ruleId }));
          const withExtra = scoreVerdicts([...verdicts, ...extra]);
          expect(withExtra.matched).toBe(base.matched);
          expect(withExtra.scored).toBe(base.scored);
          expect(withExtra.scoreText).toBe(base.scoreText);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("formats thousands separators and the empty case", () => {
    const verdicts: Verdict[] = Array.from({ length: 1234 }, () => ({ kind: "match" }));
    expect(scoreVerdicts(verdicts).scoreText).toBe("1,234 / 1,234 inputs matched");
    expect(scoreVerdicts([]).scoreText).toBe("0 / 0 inputs matched");
  });
});
