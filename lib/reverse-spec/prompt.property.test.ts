import fc from 'fast-check';
import { describe, it } from 'vitest';
import type { BehaviorClass } from '../ghost-memory/evidence-id';
import { buildPrompt } from './prompt';

// Feature: revenant-mvp, Property 14: Prompt contains classes and respects limits
// **Validates: Requirements 5.2**

const classesArb = fc
  .array(
    fc.record({
      unclassified: fc.boolean(),
      nIds: fc.integer({ min: 0, max: 30 }),
      nReps: fc.integer({ min: 0, max: 6 }),
      count: fc.integer({ min: 0, max: 100000 }),
    }),
    { maxLength: 12 },
  )
  .map((specs): BehaviorClass[] => {
    const seenUnclassified = { v: false };
    return specs.map((s, i) => {
      const unclassified = s.unclassified && !seenUnclassified.v;
      if (unclassified) seenUnclassified.v = true;
      const key = unclassified ? 'unclassified' : `k${i}`;
      const evidenceIds = Array.from({ length: s.nIds }, (_, j) => `p:f:c${i}e${j}`);
      return {
        classId: `p:f:class:${key}`,
        features: { outcome: key },
        count: s.count,
        evidenceIds,
        representatives: evidenceIds.slice(0, Math.min(s.nReps, evidenceIds.length)),
      };
    });
  });

describe('Property 14: Prompt contains classes and respects limits', () => {
  it('includes every class ID and count, caps representatives and unclassified records, and adds no other evidence', () => {
    fc.assert(
      fc.property(classesArb, (classes) => {
        const r = buildPrompt({ package: 'p', version: '1.0.0', classes }, Number.MAX_SAFE_INTEGER);
        const allowed = new Set<string>();
        for (const c of classes) {
          if (!r.prompt.includes(c.classId)) return false;
          if (!r.prompt.includes(`count: ${c.count}`)) return false;
          const isU = c.classId.endsWith(':class:unclassified');
          const picked = isU ? c.evidenceIds.slice(0, 10) : c.representatives.slice(0, 3);
          if (picked.length > (isU ? 10 : 3)) return false;
          picked.forEach((id) => allowed.add(id));
        }
        if (r.includedEvidenceIds.length !== allowed.size) return false;
        if (!r.includedEvidenceIds.every((id) => allowed.has(id))) return false;
        // No evidence ID outside the allowed set appears in the prompt text.
        for (const c of classes) {
          for (const id of c.evidenceIds) {
            // Trailing quote avoids prefix collisions such as c1e1 vs c1e10.
            if (!allowed.has(id) && r.prompt.includes(`"${id}"`)) return false;
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });
});
