import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { checkCitations, type CitableClass, type RawRequirement } from '../lib/reverse-spec/citations';

// Feature: revenant-mvp, Property 15: Citations resolve, and failures are flagged
describe('Property 15: Citations resolve, and failures are flagged', () => {
  const classIdArb = fc.stringMatching(/^p:f:class:[a-z0-9]{1,6}$/);
  const evidenceIdArb = fc.stringMatching(/^p:f:[0-9a-f]{12}$/);

  const classesArb = fc.uniqueArray(classIdArb, { maxLength: 8 }).chain((ids) =>
    fc.tuple(
      ...ids.map((classId) =>
        fc
          .uniqueArray(evidenceIdArb, { minLength: 1, maxLength: 6 })
          .chain((evidenceIds) =>
            fc.record({
              classId: fc.constant(classId),
              count: fc.integer({ min: evidenceIds.length, max: 500 }),
              evidenceIds: fc.constant(evidenceIds),
              representatives: fc.subarray(evidenceIds, { maxLength: Math.min(3, evidenceIds.length) }),
            }),
          ),
      ),
    ) as fc.Arbitrary<CitableClass[]>,
  );

  const scenarioArb = classesArb.chain((classes) => {
    const known = classes.map((c) => c.classId);
    const cited = known.length > 0 ? fc.oneof(fc.constantFrom(...known), classIdArb) : classIdArb;
    const reqArb = fc.record({
      statement: fc.string({ maxLength: 40 }),
      classIds: fc.array(cited, { maxLength: 5 }),
    });
    return fc.record({
      classes: fc.constant(classes),
      reqs: fc.array(reqArb, { maxLength: 10 }),
    });
  });

  it('resolves to recorded evidence, flags missing classes, keeps unsupported requirements', () => {
    fc.assert(
      fc.property(scenarioArb, ({ classes, reqs }) => {
        const raw: RawRequirement[] = reqs.map((r, i) => ({ id: `R${i + 1}`, ...r }));
        const result = checkCitations(raw, classes);
        const byId = new Map(classes.map((c) => [c.classId, c]));

        // No requirement is dropped; order preserved.
        expect(result.requirements.map((r) => r.id)).toEqual(raw.map((r) => r.id));

        const flagged = new Set(result.issues.map((i) => `${i.requirementId}|${i.classId}`));
        let expectedIssues = 0;
        for (const [idx, req] of result.requirements.entries()) {
          const cited = new Set(raw[idx].classIds);
          // Every resolved citation maps to Evidence IDs that exist in the class.
          for (const c of req.resolved) {
            const cls = byId.get(c.classId);
            expect(cls).toBeDefined();
            expect(c.evidenceIds.length).toBeGreaterThan(0);
            for (const e of c.evidenceIds) expect(cls!.evidenceIds).toContain(e);
          }
          // Every citation to a missing class is flagged.
          for (const id of cited) {
            if (byId.has(id)) {
              expect(req.resolved.some((c) => c.classId === id)).toBe(true);
            } else {
              expect(req.missing).toContain(id);
              expect(flagged.has(`${req.id}|${id}`)).toBe(true);
              expectedIssues++;
            }
          }
          expect(req.resolved.length + req.missing.length).toBe(cited.size);
          // Unsupported exactly when nothing resolves.
          expect(req.unsupported).toBe(req.resolved.length === 0);
        }
        expect(result.issues).toHaveLength(expectedIssues);
      }),
      { numRuns: 200 },
    );
  });

  it('marks a requirement with only missing citations unsupported but keeps it', () => {
    const r = checkCitations([{ id: 'R1', statement: 's', classIds: ['nope'] }], []);
    expect(r.requirements).toHaveLength(1);
    expect(r.requirements[0].unsupported).toBe(true);
    expect(r.issues).toHaveLength(1);
  });
});
