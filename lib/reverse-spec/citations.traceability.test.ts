import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { checkCitations, traceabilityText } from './citations';
import type { CitableClass, RawRequirement } from './citations';

const classIdArb = fc.constantFrom('c1', 'c2', 'c3', 'c4', 'c5', 'c6');

const classArb: fc.Arbitrary<CitableClass[]> = fc
  .uniqueArray(classIdArb, { maxLength: 6 })
  .chain((ids) =>
    fc.tuple(
      ...ids.map((classId) =>
        fc.record({
          classId: fc.constant(classId),
          count: fc.nat({ max: 100 }),
          evidenceIds: fc.array(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 4 }),
          representatives: fc.array(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 3 }),
        }),
      ),
    ),
  ) as fc.Arbitrary<CitableClass[]>;

const reqsArb: fc.Arbitrary<RawRequirement[]> = fc.array(
  fc.record({
    id: fc.string({ maxLength: 6 }),
    statement: fc.string({ maxLength: 20 }),
    classIds: fc.array(classIdArb, { maxLength: 5 }),
  }),
  { maxLength: 15 },
);

describe('traceability', () => {
  // Feature: revenant-mvp, Property 16: Traceability count
  // **Validates: Requirements 5.6**
  it('X counts requirements with a resolving citation, Y the total, X <= Y, text matches', () => {
    fc.assert(
      fc.property(reqsArb, classArb, (reqs, classes) => {
        const { traceability, requirements } = checkCitations(reqs, classes);
        const existing = new Set(classes.map((c) => c.classId));
        const expectedX = reqs.filter((r) => r.classIds.some((id) => existing.has(id))).length;
        expect(traceability.x).toBe(expectedX);
        expect(traceability.y).toBe(reqs.length);
        expect(requirements).toHaveLength(reqs.length);
        expect(traceability.x).toBeLessThanOrEqual(traceability.y);
        expect(traceability.text).toBe(`${expectedX} / ${reqs.length} requirements cite evidence`);
        expect(traceability.text).toBe(traceabilityText(expectedX, reqs.length));
      }),
      { numRuns: 200 },
    );
  });
});
