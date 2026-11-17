import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isDeepStrictEqual } from "node:util";
import { compare, type CallOutcome, type CallResult } from "../lib/diff/comparator";
import type { PollutionReport, Tagged } from "../sandbox/protocol";

const NUM_RUNS = 200;

const taggedArb: fc.Arbitrary<Tagged> = fc.jsonValue() as fc.Arbitrary<Tagged>;
const nameArb = fc.constantFrom("TypeError", "RangeError", "Error", "SyntaxError");

const outcomeArb: fc.Arbitrary<CallOutcome> = fc.oneof(
  taggedArb.map((value): CallOutcome => ({ kind: "returned", value })),
  fc
    .tuple(nameArb, fc.string())
    .map(([name, message]): CallOutcome => ({ kind: "threw", error: { name, message } })),
  fc.constant<CallOutcome>({ kind: "timeout" }),
  fc.nat().map((bytes): CallOutcome => ({ kind: "output-too-large", bytes })),
);

const pollutionArb: fc.Arbitrary<PollutionReport | null> = fc.oneof(
  fc.constant(null),
  fc.string().map(
    (k): PollutionReport => ({
      detected: true,
      prototypes: ["Object.prototype"],
      keys: [`Object.prototype.${k}`],
      added: [k],
      removed: [],
      changed: [],
    }),
  ),
);

const resultArb: fc.Arbitrary<CallResult> = fc.record({
  outcome: outcomeArb,
  argsAfter: fc.array(taggedArb, { maxLength: 4 }),
  pollution: pollutionArb,
});

/** Independent statement of the match rule from the design. */
function expectedMatch(a: CallResult, b: CallResult): boolean {
  let outcomesAgree: boolean;
  if (a.outcome.kind !== b.outcome.kind) outcomesAgree = false;
  else if (a.outcome.kind === "returned" && b.outcome.kind === "returned")
    outcomesAgree = isDeepStrictEqual(a.outcome.value, b.outcome.value);
  else if (a.outcome.kind === "threw" && b.outcome.kind === "threw")
    outcomesAgree = a.outcome.error.name === b.outcome.error.name;
  else outcomesAgree = true;
  return (
    outcomesAgree &&
    isDeepStrictEqual(a.argsAfter, b.argsAfter) &&
    (a.pollution !== null) === (b.pollution !== null)
  );
}

const copy = (r: CallResult): CallResult => structuredClone(r);

// Feature: revenant-mvp, Property 19: Comparator follows the match rule
describe("Property 19: Comparator follows the match rule", () => {
  it("matches iff outcomes agree, post-call args are deep-equal and pollution flags are equal", () => {
    /** Validates: Requirements 7.3, 7.4, 7.8 */
    fc.assert(
      fc.property(resultArb, resultArb, (a, b) => {
        const c = compare(a, b);
        expect(c.match).toBe(expectedMatch(a, b));
        expect(c.reasons.length === 0).toBe(c.match);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("is reflexive on a deep copy and symmetric", () => {
    /** Validates: Requirements 7.3, 7.4, 7.8 */
    fc.assert(
      fc.property(resultArb, resultArb, (a, b) => {
        expect(compare(a, copy(a)).match).toBe(true);
        expect(compare(a, b).match).toBe(compare(b, a).match);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("reports a mismatch after any single perturbation of an otherwise equal pair", () => {
    /** Validates: Requirements 7.3, 7.4, 7.8 */
    fc.assert(
      fc.property(resultArb, (a) => {
        // returned value
        if (a.outcome.kind === "returned") {
          const b = copy(a);
          b.outcome = { kind: "returned", value: [a.outcome.value] };
          expect(compare(a, b).match).toBe(false);
          expect(compare(b, a).match).toBe(false);
        }
        // error name
        if (a.outcome.kind === "threw") {
          const b = copy(a);
          b.outcome = { kind: "threw", error: { ...a.outcome.error, name: a.outcome.error.name + "X" } };
          expect(compare(a, b).match).toBe(false);
        }
        // timeout on one side only
        const t = copy(a);
        t.outcome = { kind: "timeout" };
        expect(compare(a, t).match).toBe(a.outcome.kind === "timeout");
        // post-call argument state
        const m = copy(a);
        m.argsAfter = [...a.argsAfter, null];
        expect(compare(a, m).match).toBe(false);
        // pollution flag
        const p = copy(a);
        p.pollution =
          a.pollution === null
            ? { detected: true, prototypes: ["Object.prototype"], keys: ["Object.prototype.x"], added: ["x"], removed: [], changed: [] }
            : null;
        expect(compare(a, p).match).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("ignores error messages", () => {
    /** Validates: Requirements 7.3 */
    fc.assert(
      fc.property(nameArb, fc.string(), fc.string(), (name, m1, m2) => {
        const mk = (message: string): CallResult => ({
          outcome: { kind: "threw", error: { name, message } },
          argsAfter: [],
          pollution: null,
        });
        expect(compare(mk(m1), mk(m2)).match).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
