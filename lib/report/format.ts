// Plain-text formatting of a RebirthReport (Req 9.2, 9.4, 9.5, 9.6).
import { formatCount } from '../diff/scoring.js';
import type { RebirthReport } from './assemble.js';

/** "T inputs run, I explained by intentional-difference rules (excluded from the score), X mismatches" */
export function formatBreakdown(r: RebirthReport): string {
  const { total, excluded, mismatches } = r.score;
  const base =
    `${formatCount(total)} inputs run, ${formatCount(excluded)} explained by intentional-difference rules ` +
    `(excluded from the score), ${formatCount(mismatches)} mismatches`;
  return r.partial ? `${base}. Partial: ${formatCount(total)} of ${formatCount(r.n)} inputs completed` : base;
}

export function formatTestSuite(r: RebirthReport): string {
  const t = r.originalTestSuite;
  const counts = t.passed !== undefined && t.total !== undefined ? ` (${t.passed} / ${t.total} passed)` : '';
  return `Original test suite: ${t.label}${counts}. ${t.detail}`.trim();
}

export function formatReport(r: RebirthReport): string {
  const lines: string[] = [
    `Rebirth Report: ${r.package} (${r.source}, generated at ${r.generatedAt})`,
    `Score: ${r.scoreText}`,
    formatBreakdown(r),
    `Seed: ${r.seed}`,
    '',
    'Intentional differences (excluded from the score):',
  ];
  if (r.intentionalDifferences.length === 0) lines.push('  none declared');
  for (const d of r.intentionalDifferences) {
    lines.push(`  ${d.id} [${d.advisory}]: ${d.reason} (covered ${formatCount(d.covered)})`);
  }
  lines.push('', 'Mismatches:');
  if (r.mismatchSamples.length === 0) lines.push('  none');
  for (const m of r.mismatchSamples) lines.push(`  ${m.evidenceId}: ${m.summary}`);
  lines.push('', 'Vulnerabilities removed:');
  if (r.vulnerabilitiesRemoved.length === 0) lines.push('  none listed');
  for (const v of r.vulnerabilitiesRemoved) lines.push(`  ${v.advisory}: ${v.basis}`);
  lines.push('', formatTestSuite(r));
  return lines.join('\n');
}
