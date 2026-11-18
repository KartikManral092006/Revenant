import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { compare, type CallOutcome, type CallResult } from "../lib/diff/comparator";
import { evaluateCase, type IntentionalDifferenceRule, type SideMatcher } from "../lib/diff/rules";
import type { PollutionReport, Tagged } from "../sandbox/protocol";

const NUM_RUNS = 200;

// Small value domains so that matches, near-misses and rule hits all occur often.
const valueArb: fc.Arbitrary<Tagged> = fc.constantFrom<Tagged>(0, 1, "a", null, true);
const nameArb = fc.constantFrom("TypeError", "RangeError", "Error");

const outcomeArb: fc.Arbitrary<CallOutcome> = fc.oneof(
  valueArb.map((value): CallOutcome => ({ kind: "returned", value })),
  nameArb.map((name): CallOutcome => ({ kind: "threw", error: { name, message: "m" } })),
  fc.constant<CallOutcome>({ kind: "timeout" }),
);

const pollution: PollutionReport = {
  detected: true,
  prototypes: ["Object.prototype"],
  keys: ["Object.prototype.x"],
  added: ["x"],
  removed: [],
  changed: [],
};

const resultArb: fc.Arbitrary<CallResult> = fc.record({
  outcome: outcomeArb,
  argsAfter: fc.array(valueArb, { maxLength: 1 }),
  pollution: fc.constantFrom<PollutionReport | null>(null, pollution),
});

const matcherArb: fc.Arbitrary<SideMatcher> = fc.record(
  {
    outcome: fc.constantFrom("returned" as const, "threw" as const, "timeout" as const),
    errorName: nameArb,
    pollution: fc.boolean(),
  },
  { requiredKeys: [] },
);

const rulesArb: fc.Arbitrary<IntentionalDifferenceRule[]> = fc
  .array(fc.record({ original: matcherArb, rebuild: matcherArb }), { maxLength: 6 })
  .map((whens) =>
    whens.map((when, i) => ({
      id: `rule-${i}`,
      reason: "r",
      advisory: "CVE-2020-0001",
      when,
    })),
  );

/** Independent statement of a side matcher. */
function sideHolds(m: SideMatcher, r: CallResult): boolean {
  if (m.outcome !== undefined && r.outcome.kind !== m.outcome) return false;
  if (m.errorName !== undefined && !(r.outcome.kind === "threw" && r.outcome.error.name === m.errorName)) {
    return false;
  }
  if (m.pollution !== undefined && (r.pollution !== null) !== m.pollution) return false;
  return true;
}

// Feature: revenant-mvp, Property 21: Rule evaluation order
describe("Property 21: Rule evaluation order", () => {
  it("never applies a rule to a plain match", () => {
    // **Validates: Requirements 8.2**
    fc.assert(
      fc.property(resultArb, rulesArb, (a, rules) => {
        expect(evaluateCase(a, structuredClone(a), rules)).toEqual({ kind: "match" });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("explains a non-match with the first holding rule, else reports a mismatch", () => {
    // **Validates: Requirements 8.2**
    fc.assert(
      fc.property(resultArb, resultArb, rulesArb, (a, b, rules) => {
        const c = compare(a, b);
        const verdict = evaluateCase(a, b, rules);
        if (c.match) {
          expect(verdict).toEqual({ kind: "match" });
          return;
        }
        const first = rules.find((r) => sideHolds(r.when.original, a) && sideHolds(r.when.rebuild, b));
        if (first) expect(verdict).toEqual({ kind: "intentional", ruleId: first.id });
        else expect(verdict).toEqual({ kind: "mismatch", reasons: c.reasons });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("picks the earlier rule when two rules both hold", () => {
    // **Validates: Requirements 8.2**
    fc.assert(
      fc.property(resultArb, resultArb, matcherArb, (a, b, _m) => {
        fc.pre(!compare(a, b).match);
        const any: SideMatcher = {};
        const rules: IntentionalDifferenceRule[] = ["first", "second"].map((id) => ({
          id,
          reason: "r",
          advisory: "CVE-2020-0001",
          when: { original: any, rebuild: any },
        }));
        expect(evaluateCase(a, b, rules)).toEqual({ kind: "intentional", ruleId: "first" });
        expect(evaluateCase(a, b, [...rules].reverse())).toEqual({ kind: "intentional", ruleId: "second" });
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
