// Rebirth Report assembly (Req 9.1, 9.2, 9.4, 9.5, 9.6). Pure; no I/O.
// Builds a RebirthReport from a differential run and the package manifest.
import { evidenceId } from '../ghost-memory/evidence-id.js';
import type { DiffRunResult, MismatchSample } from '../diff/runner.js';
import type { IntentionalDifferenceRule } from '../diff/rules.js';
import type { Manifest } from '../graveyard/manifest-schema.js';

import { computeVulnerabilitiesRemoved, type OsvVulnerability } from './vulnerabilities.js';

export type TestSuiteLabel = 'available' | 'not available' | 'adapted from upstream';

export interface RebirthReport {
  package: string;
  generatedAt: string;
  source: 'live' | 'stored';
  seed: number;
  n: number;
  partial: boolean;
  score: { matched: number; scored: number; total: number; excluded: number; mismatches: number };
  /** "M / S inputs matched" */
  scoreText: string;
  intentionalDifferences: { id: string; reason: string; advisory: string; covered: number }[];
  mismatchSamples: { evidenceId: string; summary: string }[];
  vulnerabilitiesRemoved: { advisory: string; basis: string }[];
  originalTestSuite: { label: TestSuiteLabel; detail: string; passed?: number; total?: number };
}

export interface AssembleOptions {
  run: Pick<DiffRunResult, 'seed' | 'n' | 'summary' | 'partial' | 'samples'>;
  manifest: Pick<Manifest, 'name' | 'originalTestSuite'>;
  rules: readonly IntentionalDifferenceRule[];
  /** Export under test; used to build Evidence IDs for mismatch samples. */
  exportName: string;
  source: 'live' | 'stored';
  generatedAt?: string;
  /** Explicit override. Takes precedence over `osvVulnerabilities`. */
  vulnerabilitiesRemoved?: { advisory: string; basis: string }[];
  /** OSV results for the pinned original version; the removed list is derived from them. */
  osvVulnerabilities?: readonly OsvVulnerability[];
  testSuiteCounts?: { passed: number; total: number };
}

function describeSample(s: MismatchSample): string {
  const reasons = s.reasons.length ? s.reasons.join(', ') : 'unspecified';
  return `input #${s.index}: original ${s.original.outcome.kind}, rebuild ${s.rebuild.outcome.kind} (${reasons})`;
}

export function assembleReport(opts: AssembleOptions): RebirthReport {
  const { run, manifest, rules } = opts;
  const s = run.summary;
  const suite = manifest.originalTestSuite;
  return {
    package: manifest.name,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    source: opts.source,
    seed: run.seed,
    n: run.n,
    partial: run.partial,
    score: {
      matched: s.matched,
      scored: s.scored,
      total: s.total,
      excluded: s.intentional,
      mismatches: s.mismatches,
    },
    scoreText: s.scoreText,
    intentionalDifferences: rules.map((r) => ({
      id: r.id,
      reason: r.reason,
      advisory: r.advisory,
      covered: s.perRule[r.id] ?? 0,
    })),
    mismatchSamples: run.samples.map((m) => ({
      evidenceId: evidenceId(manifest.name, opts.exportName, m.input),
      summary: describeSample(m),
    })),
    vulnerabilitiesRemoved:
      opts.vulnerabilitiesRemoved ??
      computeVulnerabilitiesRemoved(opts.osvVulnerabilities ?? [], rules, s.perRule),
    originalTestSuite: {
      label: suite.label,
      detail: suite.detail,
      ...(opts.testSuiteCounts ?? {}),
    },
  };
}
