import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { evidenceId } from "../lib/ghost-memory/evidence-id";
import type { Tagged } from "../sandbox/protocol";

/** Rebuild a value with object keys in reverse insertion order. */
function reverseKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reverseKeys);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).reverse()) {
      Object.defineProperty(out, k, {
        value: reverseKeys((v as Record<string, unknown>)[k]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  }
  return v;
}

const name = fc.stringMatching(/^[a-z][a-z0-9._-]{0,15}$/);
const input = fc.array(fc.jsonValue() as fc.Arbitrary<Tagged>, { maxLength: 4 });

// Feature: revenant-mvp, Property 6: Evidence ID determinism and format
describe("Property 6: Evidence ID determinism and format", () => {
  it("is deterministic and matches <package>:<export>:<12 lowercase hex>", () => {
    /** Validates: Requirements 3.2 */
    fc.assert(
      fc.property(name, name, input, (pkg, exp, inp) => {
        const a = evidenceId(pkg, exp, inp);
        const b = evidenceId(pkg, exp, inp);
        expect(a).toBe(b);
        expect(a).toMatch(new RegExp(`^${pkg.replace(/[.]/g, "\\.")}:${exp.replace(/[.]/g, "\\.")}:[0-9a-f]{12}$`));
      }),
      { numRuns: 200 },
    );
  });

  it("is independent of object key order in the input", () => {
    /** Validates: Requirements 3.2 */
    fc.assert(
      fc.property(name, name, input, (pkg, exp, inp) => {
        expect(evidenceId(pkg, exp, reverseKeys(inp) as Tagged[])).toBe(evidenceId(pkg, exp, inp));
      }),
      { numRuns: 200 },
    );
  });
});
