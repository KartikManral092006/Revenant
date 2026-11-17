// Differential comparator: decides whether the original and the rebuild behaved the same
// on one input. Pure; no I/O.
import { isDeepStrictEqual } from 'node:util';
import type { Outcome, PollutionReport, Tagged } from '../../sandbox/protocol.js';

/** Outcome of one call as observed by the parent. 'timeout' is produced by the parent. */
export type CallOutcome = Outcome | { kind: 'timeout' };

/** One side's observation of one call. */
export interface CallResult {
  outcome: CallOutcome;
  /** Serialized arguments after the call (mutation is compared). */
  argsAfter: Tagged[];
  pollution: PollutionReport | null;
}

export type MismatchReason = 'outcome' | 'value' | 'error-name' | 'args-after' | 'pollution';

export interface Comparison {
  match: boolean;
  /** Empty when `match` is true. */
  reasons: MismatchReason[];
}

function compareOutcome(a: CallOutcome, b: CallOutcome): MismatchReason | null {
  if (a.kind !== b.kind) return 'outcome';
  switch (a.kind) {
    case 'returned':
      return isDeepStrictEqual(a.value, (b as typeof a).value) ? null : 'value';
    case 'threw':
      // Error messages are recorded but not scored.
      return a.error.name === (b as typeof a).error.name ? null : 'error-name';
    case 'timeout':
      return null;
    case 'output-too-large':
      // Treated as the same outcome kind; the output is not available to compare.
      return null;
  }
}

/** Compare original `a` with rebuild `b`. Symmetric. */
export function compare(a: CallResult, b: CallResult): Comparison {
  const reasons: MismatchReason[] = [];
  const outcomeReason = compareOutcome(a.outcome, b.outcome);
  if (outcomeReason) reasons.push(outcomeReason);
  if (!isDeepStrictEqual(a.argsAfter, b.argsAfter)) reasons.push('args-after');
  if ((a.pollution !== null) !== (b.pollution !== null)) reasons.push('pollution');
  return { match: reasons.length === 0, reasons };
}

export function isMatch(a: CallResult, b: CallResult): boolean {
  return compare(a, b).match;
}
