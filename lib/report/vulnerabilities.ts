// Vulnerabilities-removed basis (Req 9.1). Pure; no I/O.
// An advisory is listed only if OSV reports it against the pinned original version
// and a rule carrying that advisory ID covered at least one input (a case where the
// original showed the behavior and the rebuild did not).
import type { IntentionalDifferenceRule } from '../diff/rules.js';

export interface OsvVulnerability {
  id: string;
  aliases?: readonly string[];
}

export function computeVulnerabilitiesRemoved(
  osvVulns: readonly OsvVulnerability[],
  rules: readonly IntentionalDifferenceRule[],
  perRule: Readonly<Record<string, number>>,
): { advisory: string; basis: string }[] {
  const reported = new Set<string>();
  for (const v of osvVulns) {
    reported.add(v.id);
    for (const a of v.aliases ?? []) reported.add(a);
  }
  const covered = new Map<string, number>();
  for (const r of rules) {
    const n = perRule[r.id] ?? 0;
    if (n > 0 && reported.has(r.advisory)) {
      covered.set(r.advisory, (covered.get(r.advisory) ?? 0) + n);
    }
  }
  return [...covered].map(([advisory, n]) => ({
    advisory,
    basis: `behavior no longer observed in ${n} inputs`,
  }));
}
