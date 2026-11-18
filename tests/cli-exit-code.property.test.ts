import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { exitCodeFor } from "../lib/diff/cli";

const NUM_RUNS = 200;

// Feature: revenant-mvp, Property 27: CLI exit code follows mismatches
// **Validates: Requirements 13.2, 13.4**
describe("Property 27: CLI exit code follows mismatches", () => {
  it("exit code is 0 if and only if the unexplained mismatch count is 0", () => {
    fc.assert(
      fc.property(
        fc.record({
          mismatches: fc.nat({ max: 1_000_000 }),
          intentional: fc.nat({ max: 1_000_000 }),
          scoreText: fc.string(),
          partial: fc.boolean(),
        }),
        (summary) => {
          const code = exitCodeFor(summary);
          expect(code === 0).toBe(summary.mismatches === 0);
          expect(code).toBe(summary.mismatches === 0 ? 0 : 1);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("intentional differences alone never change the exit code", () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000 }), (intentional) => {
        expect(exitCodeFor({ mismatches: 0, intentional } as { mismatches: number })).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
