import { describe, expect, it } from 'vitest';
import type { BehaviorClass } from '../ghost-memory/evidence-id';
import { buildPrompt, PromptTooLargeError } from './prompt';

const cls = (key: string, n: number): BehaviorClass => {
  const ids = Array.from({ length: n }, (_, i) => `p:f:${key}${String(i).padStart(2, '0')}`);
  return { classId: `p:f:class:${key}`, features: { outcome: key }, count: n * 2, evidenceIds: ids, representatives: ids.slice(0, 3) };
};
const input = (classes: BehaviorClass[]) => ({ package: 'p', version: '1.0.0', classes });

describe('buildPrompt', () => {
  it('includes class IDs, counts, 3 representatives and 10 unclassified records', () => {
    const r = buildPrompt(input([cls('a', 5), cls('unclassified', 20)]));
    expect(r.prompt).toContain('p:f:class:a');
    expect(r.prompt).toContain('count: 10');
    expect(r.representativesPerClass).toBe(3);
    expect(r.includedEvidenceIds).toHaveLength(3 + 10);
    expect(r.includedEvidenceIds).not.toContain('p:f:a03');
  });

  it('drops to 1 representative per class when over budget', () => {
    const classes = Array.from({ length: 20 }, (_, i) => cls(`k${i}`, 5));
    const full = buildPrompt(input(classes));
    const r = buildPrompt(input(classes), full.prompt.length - 1);
    expect(r.representativesPerClass).toBe(1);
    expect(r.includedEvidenceIds).toHaveLength(20);
  });

  it('throws when even 1 representative per class is too large', () => {
    expect(() => buildPrompt(input([cls('a', 5)]), 10)).toThrow(PromptTooLargeError);
  });
});
