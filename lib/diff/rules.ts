// Intentional-difference rules: declared per package in
// graveyard/<package>/intentional-differences.json. Evaluation order per case:
// plain match first, then rules in file order (first match wins), otherwise mismatch.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compare, type CallResult, type MismatchReason } from './comparator.js';

export interface SideMatcher {
  outcome?: 'returned' | 'threw' | 'timeout';
  errorName?: string;
  pollution?: boolean;
}

export interface IntentionalDifferenceRule {
  id: string;
  reason: string;
  /** CVE-... or GHSA-... */
  advisory: string;
  when: { original: SideMatcher; rebuild: SideMatcher };
}

export const ADVISORY_PATTERN = /^(CVE-\d{4}-\d{4,}|GHSA(-[a-z0-9]{4}){3})$/;

const OUTCOMES = ['returned', 'threw', 'timeout'];

export type RuleValidation =
  | { ok: true; rules: IntentionalDifferenceRule[] }
  | { ok: false; errors: string[] };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateMatcher(v: unknown, path: string, errors: string[]): void {
  if (!isObject(v)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (v.outcome !== undefined && !OUTCOMES.includes(v.outcome as string)) {
    errors.push(`${path}.outcome must be one of ${OUTCOMES.join(', ')}`);
  }
  if (v.errorName !== undefined && (typeof v.errorName !== 'string' || v.errorName === '')) {
    errors.push(`${path}.errorName must be a non-empty string`);
  }
  if (v.pollution !== undefined && typeof v.pollution !== 'boolean') {
    errors.push(`${path}.pollution must be a boolean`);
  }
}

/** Validate parsed file content: either an array of rules or `{ rules: [...] }`. */
export function validateRules(input: unknown): RuleValidation {
  const errors: string[] = [];
  const list = isObject(input) && 'rules' in input ? input.rules : input;
  if (!Array.isArray(list)) {
    return { ok: false, errors: ['rule file must hold an array of rules'] };
  }
  const seen = new Set<string>();
  list.forEach((r, i) => {
    const p = `rules[${i}]`;
    if (!isObject(r)) {
      errors.push(`${p} must be an object`);
      return;
    }
    if (typeof r.id !== 'string' || r.id.trim() === '') errors.push(`${p}.id must be a non-empty string`);
    else if (seen.has(r.id)) errors.push(`${p}.id "${r.id}" is duplicated`);
    else seen.add(r.id);
    if (typeof r.reason !== 'string' || r.reason.trim() === '') {
      errors.push(`${p}.reason must be a non-empty string`);
    }
    if (typeof r.advisory !== 'string' || !ADVISORY_PATTERN.test(r.advisory)) {
      errors.push(`${p}.advisory must be a CVE or GHSA identifier`);
    }
    if (!isObject(r.when)) {
      errors.push(`${p}.when must be an object`);
    } else {
      validateMatcher(r.when.original, `${p}.when.original`, errors);
      validateMatcher(r.when.rebuild, `${p}.when.rebuild`, errors);
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, rules: list as IntentionalDifferenceRule[] };
}

/** Parse and validate rule file text. Throws with all validation errors. */
export function parseRules(text: string): IntentionalDifferenceRule[] {
  const v = validateRules(JSON.parse(text));
  if (!v.ok) throw new Error(`Invalid intentional-differences file: ${v.errors.join('; ')}`);
  return v.rules;
}

/** Load `graveyard/<pkg>/intentional-differences.json` from `root` (repo root). */
export function loadRules(pkg: string, root: string = process.cwd()): IntentionalDifferenceRule[] {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(pkg)) throw new Error(`Invalid package name: ${pkg}`);
  return parseRules(readFileSync(join(root, 'graveyard', pkg, 'intentional-differences.json'), 'utf8'));
}

/** True when every field present in the matcher agrees with the side's observation. */
export function sideMatches(m: SideMatcher, r: CallResult): boolean {
  if (m.outcome !== undefined) {
    const kind = r.outcome.kind;
    if (kind !== m.outcome) return false;
  }
  if (m.errorName !== undefined) {
    if (r.outcome.kind !== 'threw' || r.outcome.error.name !== m.errorName) return false;
  }
  if (m.pollution !== undefined && (r.pollution !== null) !== m.pollution) return false;
  return true;
}

export function ruleMatches(rule: IntentionalDifferenceRule, original: CallResult, rebuild: CallResult): boolean {
  return sideMatches(rule.when.original, original) && sideMatches(rule.when.rebuild, rebuild);
}

export type Verdict =
  | { kind: 'match' }
  | { kind: 'intentional'; ruleId: string }
  | { kind: 'mismatch'; reasons: MismatchReason[] };

/** Plain match first, then rules in order (first match wins), otherwise mismatch. */
export function evaluateCase(
  original: CallResult,
  rebuild: CallResult,
  rules: readonly IntentionalDifferenceRule[],
): Verdict {
  const c = compare(original, rebuild);
  if (c.match) return { kind: 'match' };
  for (const rule of rules) {
    if (ruleMatches(rule, original, rebuild)) return { kind: 'intentional', ruleId: rule.id };
  }
  return { kind: 'mismatch', reasons: c.reasons };
}
