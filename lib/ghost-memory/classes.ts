// Deterministic behavior classes (Req 3.2, 5.2). Groups Evidence by the manifest's ordered
// classFeatures. A record whose extractor is unknown, returns nothing, or returns a value outside
// the allowed list goes to `<package>:<export>:class:unclassified`. Records are never dropped.
// Node-run code: relative imports only, with .js extensions.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Manifest } from '../graveyard/manifest-schema.js';
import type { BehaviorClass, Evidence, Recording } from './evidence-id.js';
import { getExtractor } from './features/index.js';

export const CLASSES_SCHEMA_VERSION = 1;
export const UNCLASSIFIED_KEY = 'unclassified';
export const MAX_REPRESENTATIVES = 3;

export interface StoredClasses {
  schemaVersion: number;
  generatedAt: string;
  package: string;
  version: string;
  total: number;
  unclassified: number;
  classes: BehaviorClass[];
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Feature values for one record, or null when it is unclassified. */
export function classify(manifest: Manifest, ev: Evidence): Record<string, string> | null {
  const features: Record<string, string> = {};
  for (const { feature, allowed } of manifest.classFeatures) {
    const extractor = getExtractor(feature);
    if (!extractor) return null;
    let value: string | undefined;
    try {
      value = extractor(ev, { allowed });
    } catch {
      return null;
    }
    if (value === undefined || !allowed.includes(value)) return null;
    features[feature] = value;
  }
  return features;
}

export function classIdFor(pkg: string, exportName: string, features: Record<string, string> | null, manifest: Manifest): string {
  const key = features ? manifest.classFeatures.map((f) => features[f.feature]).join('|') : UNCLASSIFIED_KEY;
  return `${pkg}:${exportName}:class:${key === '' ? UNCLASSIFIED_KEY : key}`;
}

/** Feature names in the manifest that have no extractor. */
export function missingExtractors(manifest: Manifest): string[] {
  return manifest.classFeatures.map((f) => f.feature).filter((n) => !getExtractor(n));
}

/**
 * Partitions the evidence into classes. Returns new evidence with `classId` set (input order kept)
 * and the classes sorted by ID. `count` sums each member's `count`, so class counts add up to
 * `recording.stats.total`.
 */
export function buildClasses(manifest: Manifest, evidence: readonly Evidence[]): { evidence: Evidence[]; classes: BehaviorClass[] } {
  const groups = new Map<string, BehaviorClass>();
  const assigned = evidence.map((ev) => {
    const features = classify(manifest, ev);
    const classId = classIdFor(ev.package, ev.export, features, manifest);
    let g = groups.get(classId);
    if (!g) {
      g = { classId, features: features ?? {}, count: 0, evidenceIds: [], representatives: [] };
      groups.set(classId, g);
    }
    g.count += ev.count;
    g.evidenceIds.push(ev.id);
    return { ...ev, classId };
  });
  const classes = [...groups.values()].sort((a, b) => byCodeUnit(a.classId, b.classId));
  for (const c of classes) {
    c.evidenceIds.sort(byCodeUnit);
    c.representatives = c.evidenceIds.slice(0, MAX_REPRESENTATIVES);
  }
  return { evidence: assigned, classes };
}

/** Builds the classes for a recording and returns the recording with `classId` assigned. */
export function classifyRecording(
  manifest: Manifest,
  recording: Recording,
  now: () => Date = () => new Date(),
): { recording: Recording; stored: StoredClasses } {
  const { evidence, classes } = buildClasses(manifest, recording.evidence);
  const unclassified = classes
    .filter((c) => c.classId.endsWith(`:class:${UNCLASSIFIED_KEY}`))
    .reduce((n, c) => n + c.count, 0);
  return {
    recording: { ...recording, evidence },
    stored: {
      schemaVersion: CLASSES_SCHEMA_VERSION,
      generatedAt: now().toISOString(),
      package: recording.package,
      version: recording.version,
      total: classes.reduce((n, c) => n + c.count, 0),
      unclassified,
      classes,
    },
  };
}

/** Writes `data/<package>/classes.json`; returns the file path. */
export function writeClasses(stored: StoredClasses, repoRoot: string = process.cwd()): string {
  const file = path.join(repoRoot, 'data', stored.package, 'classes.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`);
  return file;
}
