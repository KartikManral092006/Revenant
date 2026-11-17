/**
 * Language guard (Requirement 9.3).
 * Revenant reports evidence, never proof. The terms below are forbidden.
 */

export const FORBIDDEN = /\b(proven|guaranteed|identical)\b/i;

/** The only whitelisted phrase. Removed (replaced by one space) before scanning. */
export const ALLOWED_PHRASE = /evidence, not proof/gi;

const FORBIDDEN_GLOBAL = /\b(proven|guaranteed|identical)\b/gi;

export interface LanguageViolation {
  term: string;
  index: number;
}

function stripAllowed(text: string): string {
  return text.replace(ALLOWED_PHRASE, " ");
}

/** True when the text contains a forbidden term outside the whitelisted phrase. */
export function hasForbiddenTerm(text: string): boolean {
  return FORBIDDEN.test(stripAllowed(text));
}

/** Lists forbidden terms found (indices refer to the text after phrase removal). */
export function findViolations(text: string): LanguageViolation[] {
  const stripped = stripAllowed(text);
  const found: LanguageViolation[] = [];
  for (const m of stripped.matchAll(FORBIDDEN_GLOBAL)) {
    found.push({ term: m[0].toLowerCase(), index: m.index ?? 0 });
  }
  return found;
}
