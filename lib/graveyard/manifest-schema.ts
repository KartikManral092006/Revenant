// Manifest types and hand-written validator for graveyard/<package>/manifest.json.
// Node-run code: relative imports only, with .js extensions.

export const DEFAULT_N = 1000;

/** Exact version: no range operators, tags or URLs (design.md, Graveyard loader). */
export const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export const ARG_KINDS = ['string', 'object', 'array', 'number', 'any', 'path'] as const;
export type ArgKind = (typeof ARG_KINDS)[number];

const KINDS_NEEDING_EDGE_CASES: readonly ArgKind[] = ['string', 'object', 'array', 'path'];
const RESURRECTION_VALUES = ['full', 'autopsy-and-ghost-memory'] as const;
const TEST_SUITE_LABELS = ['available', 'not available', 'adapted from upstream'] as const;

/** JSON-safe tagged value as produced by the sandbox serializer. Kept structural to avoid importing sandbox code. */
export type Tagged = unknown;

export interface EvidenceNote {
  evidence: string;
  checkedAt: string;
}

export interface Manifest {
  name: string;
  version: string;
  monorepo?: boolean;
  /** How exports are called in the sandbox. Default `function`; `receiver-wrapper` for factories like `string`. */
  callStyle?: 'function' | 'receiver-wrapper';
  exportsUnderTest: { name: string; arity: number }[];
  generator: {
    argSpecs: { kind: ArgKind }[];
    seed: number;
    edgeCases: Tagged[][];
  };
  n?: number;
  classFeatures: { feature: string; allowed: string[] }[];
  graveyardCriteria: {
    unmaintained: EvidenceNote;
    permissiveLicense: EvidenceNote;
    weeklyDownloads: EvidenceNote;
    pureFunction: { judgment: 'human'; note: string; reviewedBy: string };
  };
  resurrection: (typeof RESURRECTION_VALUES)[number];
  originalTestSuite: { label: (typeof TEST_SUITE_LABELS)[number]; detail: string };
}

export type ManifestValidation =
  | { ok: true; manifest: Manifest; effectiveN: number }
  | { ok: false; errors: string[] };

export function isExactVersion(version: unknown): boolean {
  return typeof version === 'string' && EXACT_VERSION_PATTERN.test(version);
}

/** N used for live runs: the manifest value, or 1000 when omitted. */
export function effectiveN(manifest: { n?: number }): number {
  return manifest.n === undefined ? DEFAULT_N : manifest.n;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function collectStrings(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 20) return;
  if (typeof value === 'string') {
    out.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
  } else if (isRecord(value)) {
    for (const key of Object.keys(value)) collectStrings(value[key], out, depth + 1);
  }
}

const ARRAY_INDEX_PATH = /\[\d+\]|(^|\.)\d+(\.|$)/;

function checkEvidence(v: unknown, path: string, errors: string[]): void {
  if (!isRecord(v)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!isNonEmptyString(v.evidence)) errors.push(`${path}.evidence must be a non-empty string`);
  if (!isNonEmptyString(v.checkedAt)) errors.push(`${path}.checkedAt must be a non-empty string`);
}

export function validateManifest(input: unknown): ManifestValidation {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['manifest must be an object'] };

  if (!isNonEmptyString(input.name)) errors.push('name must be a non-empty string');

  if (typeof input.version !== 'string') {
    errors.push('version must be a string');
  } else if (!EXACT_VERSION_PATTERN.test(input.version)) {
    errors.push(`version "${input.version}" is not an exact version`);
  }

  if (input.monorepo !== undefined && typeof input.monorepo !== 'boolean') {
    errors.push('monorepo must be a boolean when present');
  }

  if (input.callStyle !== undefined && input.callStyle !== 'function' && input.callStyle !== 'receiver-wrapper') {
    errors.push('callStyle must be "function" or "receiver-wrapper" when present');
  }

  // exportsUnderTest
  if (!Array.isArray(input.exportsUnderTest) || input.exportsUnderTest.length === 0) {
    errors.push('exportsUnderTest must be a non-empty array');
  } else {
    input.exportsUnderTest.forEach((e, i) => {
      if (!isRecord(e) || !isNonEmptyString(e.name)) {
        errors.push(`exportsUnderTest[${i}].name must be a non-empty string`);
      }
      if (!isRecord(e) || !Number.isInteger(e.arity) || (e.arity as number) < 0) {
        errors.push(`exportsUnderTest[${i}].arity must be a non-negative integer`);
      }
    });
  }

  // generator
  let needsEdgeCases = false;
  const gen = input.generator;
  if (!isRecord(gen)) {
    errors.push('generator must be an object');
  } else {
    if (!Array.isArray(gen.argSpecs)) {
      errors.push('generator.argSpecs must be an array');
    } else {
      gen.argSpecs.forEach((spec, i) => {
        const kind = isRecord(spec) ? spec.kind : undefined;
        if (typeof kind !== 'string' || !(ARG_KINDS as readonly string[]).includes(kind)) {
          errors.push(`generator.argSpecs[${i}].kind must be one of ${ARG_KINDS.join(', ')}`);
        } else if (KINDS_NEEDING_EDGE_CASES.includes(kind as ArgKind)) {
          needsEdgeCases = true;
        }
      });
    }
    if (typeof gen.seed !== 'number' || !Number.isInteger(gen.seed)) {
      errors.push('generator.seed must be an integer');
    }
    if (!Array.isArray(gen.edgeCases) || !gen.edgeCases.every((c) => Array.isArray(c))) {
      errors.push('generator.edgeCases must be an array of argument lists');
    } else if (needsEdgeCases) {
      const strings = new Set<string>();
      collectStrings(gen.edgeCases, strings);
      if (!strings.has('__proto__')) errors.push('generator.edgeCases must include "__proto__"');
      if (!strings.has('constructor.prototype')) {
        errors.push('generator.edgeCases must include "constructor.prototype"');
      }
      if (![...strings].some((s) => ARRAY_INDEX_PATH.test(s))) {
        errors.push('generator.edgeCases must include an array-index path such as "a[0]" or "a.0"');
      }
    }
  }

  // n
  if (input.n !== undefined && (!Number.isInteger(input.n) || (input.n as number) < 1)) {
    errors.push('n must be a positive integer when present');
  }

  // classFeatures
  if (!Array.isArray(input.classFeatures)) {
    errors.push('classFeatures must be an array');
  } else {
    input.classFeatures.forEach((f, i) => {
      if (!isRecord(f) || !isNonEmptyString(f.feature)) {
        errors.push(`classFeatures[${i}].feature must be a non-empty string`);
      }
      if (
        !isRecord(f) ||
        !Array.isArray(f.allowed) ||
        f.allowed.length === 0 ||
        !f.allowed.every((a) => typeof a === 'string')
      ) {
        errors.push(`classFeatures[${i}].allowed must be a non-empty array of strings`);
      }
    });
  }

  // graveyardCriteria
  const gc = input.graveyardCriteria;
  if (!isRecord(gc)) {
    errors.push('graveyardCriteria must be an object');
  } else {
    checkEvidence(gc.unmaintained, 'graveyardCriteria.unmaintained', errors);
    checkEvidence(gc.permissiveLicense, 'graveyardCriteria.permissiveLicense', errors);
    checkEvidence(gc.weeklyDownloads, 'graveyardCriteria.weeklyDownloads', errors);
    const pf = gc.pureFunction;
    if (!isRecord(pf)) {
      errors.push('graveyardCriteria.pureFunction must be an object');
    } else {
      if (pf.judgment !== 'human') errors.push('graveyardCriteria.pureFunction.judgment must be "human"');
      if (!isNonEmptyString(pf.note)) errors.push('graveyardCriteria.pureFunction.note must be a non-empty string');
      if (!isNonEmptyString(pf.reviewedBy)) {
        errors.push('graveyardCriteria.pureFunction.reviewedBy must be a non-empty string');
      }
    }
  }

  if (
    typeof input.resurrection !== 'string' ||
    !(RESURRECTION_VALUES as readonly string[]).includes(input.resurrection)
  ) {
    errors.push(`resurrection must be one of ${RESURRECTION_VALUES.join(', ')}`);
  }

  const ots = input.originalTestSuite;
  if (!isRecord(ots)) {
    errors.push('originalTestSuite must be an object');
  } else {
    if (typeof ots.label !== 'string' || !(TEST_SUITE_LABELS as readonly string[]).includes(ots.label)) {
      errors.push(`originalTestSuite.label must be one of ${TEST_SUITE_LABELS.join(', ')}`);
    }
    if (typeof ots.detail !== 'string') errors.push('originalTestSuite.detail must be a string');
  }

  if (errors.length > 0) return { ok: false, errors };
  const manifest = input as unknown as Manifest;
  return { ok: true, manifest, effectiveN: effectiveN(manifest) };
}
