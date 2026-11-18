import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildClasses, UNCLASSIFIED_KEY } from "../lib/ghost-memory/classes";
import type { Evidence } from "../lib/ghost-memory/evidence-id";
import type { Manifest } from "../lib/graveyard/manifest-schema";
import type { Tagged } from "../sandbox/protocol";

const FEATURE_VALUES: Record<string, string[]> = {
  pathShape: ["dot", "bracket-index", "mixed", "empty", "proto-path"],
  targetType: ["null-or-undefined", "array", "plain-object", "primitive"],
  outcome: ["returned", "returned-false", "threw:TypeError", "threw:other", "timeout", "prototype-pollution"],
  argShape: ["single", "two-plain", "nested", "arrays", "null-or-primitive"],
  inputShape: ["empty", "whitespace", "long", "ascii", "symbols"],
  notARealExtractor: ["x", "y"],
};

const classFeatures = fc
  .uniqueArray(fc.constantFrom(...Object.keys(FEATURE_VALUES)), { minLength: 1, maxLength: 3 })
  .chain((names) =>
    fc.tuple(
      ...names.map((feature) =>
        // A random subset of the real values, so some records fall outside the allowed list.
        fc
          .subarray(FEATURE_VALUES[feature], { minLength: 0 })
          .map((allowed) => ({ feature, allowed })),
      ),
    ),
  );

const tagged = fc.oneof(
  fc.jsonValue() as fc.Arbitrary<Tagged>,
  fc.constantFrom<Tagged>({ $t: "undef" }, { $t: "num", v: "NaN" }, "a.b", "a[0]", "__proto__.x", "", " "),
);

const outcomeArb: fc.Arbitrary<Evidence["outcome"]> = fc.oneof(
  fc.jsonValue().map((value) => ({ kind: "returned", value }) as unknown as Evidence["outcome"]),
  fc
    .constantFrom("TypeError", "RangeError")
    .map((name) => ({ kind: "threw", error: { name, message: "m" } }) as unknown as Evidence["outcome"]),
  fc.constant({ kind: "timeout", afterMs: 100 } as Evidence["outcome"]),
);

const evidenceList = fc.array(
  fc.record({
    export: fc.constantFrom("a", "b"),
    input: fc.array(tagged, { maxLength: 3 }),
    count: fc.integer({ min: 1, max: 20 }),
    outcome: outcomeArb,
    polluted: fc.boolean(),
  }),
  { maxLength: 30 },
).map((rows) =>
  rows.map(
    (r, i): Evidence => ({
      id: `pkg:${r.export}:${i.toString(16).padStart(12, "0")}`,
      package: "pkg",
      export: r.export,
      input: r.input,
      count: r.count,
      outcome: r.outcome,
      argsAfter: null,
      pollution: r.polluted ? ({ kind: "polluted" } as unknown as Evidence["pollution"]) : null,
      classId: "",
    }),
  ),
);

// Feature: revenant-mvp, Property 13: Behavior class partition is total
describe("Property 13: Behavior class partition is total", () => {
  it("assigns every record to exactly one class; counts sum; out-of-list values are unclassified", () => {
    /** Validates: Requirements 3.2, 5.2 */
    fc.assert(
      fc.property(classFeatures, evidenceList, (features, evidence) => {
        const manifest = { name: "pkg", classFeatures: features } as unknown as Manifest;
        const out = buildClasses(manifest, evidence);

        // Same records, same order, each with a classId that names an existing class.
        expect(out.evidence.map((e) => e.id)).toEqual(evidence.map((e) => e.id));
        const classIds = new Set(out.classes.map((c) => c.classId));
        expect(classIds.size).toBe(out.classes.length);
        for (const e of out.evidence) expect(classIds.has(e.classId)).toBe(true);

        // Each record ID appears in exactly one class.
        const seen = new Map<string, number>();
        for (const c of out.classes) for (const id of c.evidenceIds) seen.set(id, (seen.get(id) ?? 0) + 1);
        expect(seen.size).toBe(evidence.length);
        for (const n of seen.values()) expect(n).toBe(1);

        // Membership matches the assigned classId; counts sum to the total.
        for (const c of out.classes) {
          const members = out.evidence.filter((e) => e.classId === c.classId);
          expect(members.map((m) => m.id).sort()).toEqual([...c.evidenceIds].sort());
          expect(c.count).toBe(members.reduce((n, m) => n + m.count, 0));
        }
        expect(out.classes.reduce((n, c) => n + c.count, 0)).toBe(evidence.reduce((n, e) => n + e.count, 0));

        // A class with features has all values inside the allowed lists; otherwise it is unclassified.
        for (const c of out.classes) {
          if (c.classId.endsWith(`:class:${UNCLASSIFIED_KEY}`)) continue;
          for (const f of features) expect(f.allowed).toContain(c.features[f.feature]);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("puts a record with a value outside the allowed list in the unclassified class", () => {
    const manifest = { name: "pkg", classFeatures: [{ feature: "targetType", allowed: ["array"] }] } as unknown as Manifest;
    const ev: Evidence = {
      id: "pkg:a:000000000000",
      package: "pkg",
      export: "a",
      input: [{ k: 1 }],
      count: 1,
      outcome: { kind: "timeout", afterMs: 1 },
      argsAfter: null,
      pollution: null,
      classId: "",
    };
    const out = buildClasses(manifest, [ev]);
    expect(out.evidence[0].classId).toBe("pkg:a:class:unclassified");
    expect(out.classes).toHaveLength(1);
  });
});
