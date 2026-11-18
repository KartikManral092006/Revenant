/**
 * Citation resolution for Reverse Spec requirements (Req 5.3 to 5.6).
 * A class ID resolves if it exists in classes.json. Resolved citations get the class's
 * Evidence IDs; citations to missing classes are flagged. Requirements are never removed.
 */

export const UNSUPPORTED_MARKER = 'UNSUPPORTED BY RECORDED EVIDENCE';
export const MISSING_CLASS_TEXT = 'cited class not found';

/** The parts of a stored behavior class that citation resolution needs. */
export interface CitableClass {
  classId: string;
  count: number;
  evidenceIds: readonly string[];
  representatives: readonly string[];
}

export interface RawRequirement {
  id: string;
  statement: string;
  classIds: readonly string[];
}

export interface ResolvedCitation {
  classId: string;
  /** Representative Evidence IDs for the class. */
  evidenceIds: string[];
  /** Number of recorded inputs in the class. */
  memberCount: number;
}

export interface CitationIssue {
  requirementId: string;
  classId: string;
  message: string;
}

export interface CheckedRequirement {
  id: string;
  statement: string;
  classIds: string[];
  resolved: ResolvedCitation[];
  /** Cited class IDs that do not exist in classes.json. */
  missing: string[];
  /** True when no citation resolves. */
  unsupported: boolean;
}

export interface Traceability {
  x: number;
  y: number;
  text: string;
}

export interface CitationResult {
  requirements: CheckedRequirement[];
  issues: CitationIssue[];
  traceability: Traceability;
}

export function traceabilityText(x: number, y: number): string {
  return `${x} / ${y} requirements cite evidence`;
}

export function checkCitations(
  requirements: readonly RawRequirement[],
  classes: readonly CitableClass[],
): CitationResult {
  const byId = new Map<string, CitableClass>();
  for (const c of classes) byId.set(c.classId, c);

  const issues: CitationIssue[] = [];
  const checked: CheckedRequirement[] = requirements.map((req) => {
    const classIds = [...new Set(req.classIds)];
    const resolved: ResolvedCitation[] = [];
    const missing: string[] = [];
    for (const classId of classIds) {
      const cls = byId.get(classId);
      if (cls) {
        const evidenceIds = cls.representatives.length > 0 ? cls.representatives : cls.evidenceIds;
        resolved.push({ classId, evidenceIds: [...evidenceIds], memberCount: cls.count });
      } else {
        missing.push(classId);
        issues.push({ requirementId: req.id, classId, message: `${MISSING_CLASS_TEXT}: ${classId}` });
      }
    }
    return {
      id: req.id,
      statement: req.statement,
      classIds,
      resolved,
      missing,
      unsupported: resolved.length === 0,
    };
  });

  const x = checked.filter((r) => !r.unsupported).length;
  const y = checked.length;
  return { requirements: checked, issues, traceability: { x, y, text: traceabilityText(x, y) } };
}
