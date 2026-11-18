/**
 * Bundle assembler for Reverse Spec (Req 5.1, 5.2, 5.3, 5.5, 5.7).
 * Renders requirements.md in code from the checked requirement list, so cited Evidence IDs cannot be
 * lost. design.md, tasks.md and the steering documents are generated as markdown from the same list.
 * No network calls. The result is cached as data/<package>/reverse-spec.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  MISSING_CLASS_TEXT,
  UNSUPPORTED_MARKER,
  checkCitations,
  type CheckedRequirement,
  type CitableClass,
  type CitationIssue,
  type RawRequirement,
  type Traceability,
} from './citations.js';
import { hasForbiddenTerm } from '../report/language-guard.js';

export const BUNDLE_SCHEMA_VERSION = 1;

/** Document name (with folder for steering) to markdown text. */
export type BundleDocuments = Record<string, string>;

export interface StoredBundle {
  schemaVersion: number;
  generatedAt: string;
  package: string;
  model: string;
  requirements: CheckedRequirement[];
  documents: BundleDocuments;
  traceability: Traceability;
  citationIssues: CitationIssue[];
  groqCapMessage?: string;
}

export interface AssembleInput {
  package: string;
  model: string;
  requirements: readonly RawRequirement[];
  classes: readonly CitableClass[];
  generatedAt?: string;
}

/** Replaces any sentence that breaks the language guard (Req 9.3), so it is not shown silently. */
export const LANGUAGE_REVIEW_MARKER = '[removed: needs human review (language guard)]';

export function guardStatement(text: string): string {
  if (!hasForbiddenTerm(text)) return text;
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)\s*/g) ?? [text];
  return sentences
    .map((sent) => (hasForbiddenTerm(sent) ? `${LANGUAGE_REVIEW_MARKER}${/\s$/.test(sent) ? ' ' : ''}` : sent))
    .join('')
    .trim();
}

/** Collapse whitespace so a statement cannot break the markdown structure. */
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

export function renderRequirements(pkg: string, reqs: readonly CheckedRequirement[], trace: Traceability): string {
  const lines: string[] = [`# Requirements: ${pkg}`, '', `Traceability: ${trace.text}`, ''];
  for (const r of reqs) {
    lines.push(`## ${r.id}`, '', oneLine(r.statement), '');
    if (r.unsupported) lines.push(`**${UNSUPPORTED_MARKER}**`, '');
    if (r.resolved.length > 0) {
      lines.push('Evidence:');
      for (const c of r.resolved) {
        lines.push(`- class \`${c.classId}\` (${c.memberCount} recorded inputs): ${c.evidenceIds.join(', ')}`);
      }
      lines.push('');
    }
    if (r.missing.length > 0) {
      lines.push('Citation problems:');
      for (const m of r.missing) lines.push(`- ${MISSING_CLASS_TEXT}: \`${m}\``);
      lines.push('');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

const citedIds = (r: CheckedRequirement): string =>
  r.resolved.length > 0 ? r.resolved.map((c) => `\`${c.classId}\``).join(', ') : 'none';

export function renderDesign(pkg: string, reqs: readonly CheckedRequirement[], trace: Traceability): string {
  const lines = [
    `# Design: ${pkg}`,
    '',
    `This design follows the recorded behavior of \`${pkg}\`. ${trace.text}.`,
    '',
    '## Behaviors to implement',
    '',
  ];
  for (const r of reqs) {
    lines.push(`### ${r.id}`, '', oneLine(r.statement), '', `Behavior classes: ${citedIds(r)}`);
    if (r.unsupported) lines.push('', `**${UNSUPPORTED_MARKER}**`);
    lines.push('');
  }
  lines.push(
    '## Approach',
    '',
    'Implement each behavior as a small function. Compare the rebuild with the recorded Evidence IDs listed in requirements.md.',
  );
  return `${lines.join('\n')}\n`;
}

export function renderTasks(pkg: string, reqs: readonly CheckedRequirement[]): string {
  const lines = [`# Tasks: ${pkg}`, '', '- [ ] 1. Set up the project and test harness'];
  reqs.forEach((r, i) => {
    lines.push(`- [ ] ${i + 2}. Implement ${r.id}: ${oneLine(r.statement)}`);
    lines.push(`  - Evidence classes: ${citedIds(r)}`);
    if (r.unsupported) lines.push(`  - ${UNSUPPORTED_MARKER}`);
  });
  lines.push(`- [ ] ${reqs.length + 2}. Run the recorded inputs against the rebuild and compare outcomes`);
  return `${lines.join('\n')}\n`;
}

export function renderSteering(pkg: string, reqs: readonly CheckedRequirement[], trace: Traceability): BundleDocuments {
  return {
    'steering/product.md': [
      `# Product: ${pkg}`,
      '',
      `Rebuild \`${pkg}\` so that it matches its recorded behavior. ${reqs.length} requirements were derived from recorded Evidence. ${trace.text}.`,
      '',
    ].join('\n'),
    'steering/tech.md': [
      `# Tech: ${pkg}`,
      '',
      '- TypeScript or JavaScript on Node.js',
      '- No runtime dependencies unless a requirement needs one',
      '- Test with recorded inputs and compare outcomes',
      '',
    ].join('\n'),
    'steering/structure.md': [
      `# Structure: ${pkg}`,
      '',
      '- `requirements.md` lists behaviors with cited Evidence IDs',
      '- `design.md` and `tasks.md` follow the same requirement IDs',
      '- Requirements marked unsupported have no resolving Evidence and need review',
      '',
    ].join('\n'),
  };
}

/** Builds the stored bundle record from raw requirements and the package's classes. */
export function assembleBundle(input: AssembleInput): StoredBundle {
  const checked = checkCitations(input.requirements, input.classes);
  const { issues, traceability } = checked;
  const requirements = checked.requirements.map((r) => ({ ...r, statement: guardStatement(r.statement) }));
  const documents: BundleDocuments = {
    'requirements.md': renderRequirements(input.package, requirements, traceability),
    'design.md': renderDesign(input.package, requirements, traceability),
    'tasks.md': renderTasks(input.package, requirements),
    ...renderSteering(input.package, requirements, traceability),
  };
  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    package: input.package,
    model: input.model,
    requirements,
    documents,
    traceability,
    citationIssues: issues,
  };
}

export function bundlePath(pkg: string, repoRoot: string = process.cwd()): string {
  return path.join(repoRoot, 'data', pkg, 'reverse-spec.json');
}

/** Writes `data/<package>/reverse-spec.json`; returns the file path. */
export function writeBundle(bundle: StoredBundle, repoRoot: string = process.cwd()): string {
  const file = bundlePath(bundle.package, repoRoot);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(bundle, null, 2)}\n`);
  return file;
}

/** Reads the cached bundle, or null when it is missing or unreadable. */
export function readBundle(pkg: string, repoRoot: string = process.cwd()): StoredBundle | null {
  try {
    const parsed = JSON.parse(readFileSync(bundlePath(pkg, repoRoot), 'utf8')) as StoredBundle;
    return parsed.schemaVersion === BUNDLE_SCHEMA_VERSION ? parsed : null;
  } catch {
    return null;
  }
}
