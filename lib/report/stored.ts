// Server-side loader for the stored Rebirth Report. Reads data/<pkg>/diff-run.json (the raw run written by
// `npm run resurrect -- <pkg> --write`) and assembles the report. Returns null for anything missing or malformed.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Manifest } from '../graveyard/manifest-schema.js';
import { loadRules } from '../diff/rules.js';
import { assembleReport, type RebirthReport } from './assemble.js';
import type { OsvVulnerability } from './vulnerabilities.js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function readJsonFile(file: string): unknown {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function osvFromSnapshot(root: string, name: string): OsvVulnerability[] {
  const snap = readJsonFile(path.join(root, 'data', name, 'autopsy.json'));
  if (!isRecord(snap) || !isRecord(snap.vulnerabilities) || !Array.isArray(snap.vulnerabilities.value)) return [];
  const out: OsvVulnerability[] = [];
  for (const v of snap.vulnerabilities.value) {
    if (!isRecord(v) || typeof v.id !== 'string') continue;
    const aliases = Array.isArray(v.aliases) ? v.aliases.filter((a): a is string => typeof a === 'string') : [];
    out.push({ id: v.id, aliases });
  }
  return out;
}

/** Minimal shape check for the raw run file. */
function validRun(d: unknown): d is Record<string, unknown> & {
  seed: number;
  n: number;
  partial: boolean;
  samples: unknown[];
  summary: Record<string, unknown>;
} {
  if (!isRecord(d) || !isNum(d.seed) || !isNum(d.n) || typeof d.partial !== 'boolean' || !Array.isArray(d.samples)) {
    return false;
  }
  const s = d.summary;
  return (
    isRecord(s) &&
    isNum(s.total) &&
    isNum(s.matched) &&
    isNum(s.intentional) &&
    isNum(s.mismatches) &&
    isNum(s.scored) &&
    isRecord(s.perRule) &&
    typeof s.scoreText === 'string'
  );
}

export function loadStoredReport(
  manifest: Pick<Manifest, 'name' | 'originalTestSuite'>,
  root: string = process.cwd(),
): RebirthReport | null {
  try {
    const raw = readJsonFile(path.join(root, 'data', manifest.name, 'diff-run.json'));
    if (!validRun(raw)) return null;
    const run = raw as unknown as Parameters<typeof assembleReport>[0]['run'];
    return assembleReport({
      run,
      manifest,
      rules: loadRules(manifest.name, root),
      exportName: typeof raw.export === 'string' ? raw.export : 'default',
      source: 'stored',
      generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined,
      osvVulnerabilities: osvFromSnapshot(root, manifest.name),
    });
  } catch {
    return null;
  }
}
