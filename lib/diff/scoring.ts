// Differential score arithmetic. Pure; no I/O.
// T = total inputs completed on both sides, M = plain matches, I = cases explained by
// intentional-difference rules, X = mismatches, S = T - I (scored denominator).
import type { Verdict } from './rules.js';

export interface ScoreCounts {
  /** T: inputs completed on both sides. */
  total: number;
  /** M: plain matches (numerator). */
  matched: number;
  /** I: cases explained by a rule, excluded from the score. */
  intentional: number;
  /** X: mismatches. */
  mismatches: number;
  /** S = T - I (denominator). */
  scored: number;
  /** Rule ID to the number of cases it explained. Sums to I. */
  perRule: Record<string, number>;
}

export interface Score extends ScoreCounts {
  partial: boolean;
  /** "M / S inputs matched" with thousands separators. */
  scoreText: string;
}

export function emptyCounts(): ScoreCounts {
  return { total: 0, matched: 0, intentional: 0, mismatches: 0, scored: 0, perRule: {} };
}

/** Add one verdict to the counts, returning a new object. */
export function addVerdict(counts: ScoreCounts, verdict: Verdict): ScoreCounts {
  const next: ScoreCounts = {
    ...counts,
    total: counts.total + 1,
    perRule: { ...counts.perRule },
  };
  switch (verdict.kind) {
    case 'match':
      next.matched += 1;
      break;
    case 'intentional':
      next.intentional += 1;
      next.perRule[verdict.ruleId] = (next.perRule[verdict.ruleId] ?? 0) + 1;
      break;
    case 'mismatch':
      next.mismatches += 1;
      break;
  }
  next.scored = next.total - next.intentional;
  return next;
}

/** Format an integer with comma thousands separators (locale independent). */
export function formatCount(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function scoreText(matched: number, scored: number): string {
  return `${formatCount(matched)} / ${formatCount(scored)} inputs matched`;
}

/** Build the final score from counts. When S is 0 the text is "0 / 0 inputs matched". */
export function buildScore(counts: ScoreCounts, partial = false): Score {
  const scored = counts.total - counts.intentional;
  return {
    ...counts,
    perRule: { ...counts.perRule },
    scored,
    partial,
    scoreText: scored === 0 ? scoreText(0, 0) : scoreText(counts.matched, scored),
  };
}

/** Score a list of verdicts. */
export function scoreVerdicts(verdicts: readonly Verdict[], partial = false): Score {
  let counts = emptyCounts();
  for (const v of verdicts) counts = addVerdict(counts, v);
  return buildScore(counts, partial);
}
