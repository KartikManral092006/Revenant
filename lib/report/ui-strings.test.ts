import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { findViolations } from './language-guard.js';

// Requirement 9.3: no UI or app text may contain a forbidden word.

const ROOT = process.cwd();
const DIRS = ['components', 'app'];

/** Extracts string literals, template text and JSX text from source. */
export function extractStrings(fileName: string, source: string): string[] {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      out.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function scanSource(fileName: string, source: string): string[] {
  return extractStrings(fileName, source).filter((s) => findViolations(s).length > 0);
}

function listSources(dir: string): string[] {
  const files: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...listSources(p));
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
  return files;
}

describe('UI string scan (Requirement 9.3)', () => {
  it('flags a seeded violation in string, template and JSX text', () => {
    expect(scanSource('a.tsx', 'const a = "This is proven";')).toHaveLength(1);
    expect(scanSource('a.tsx', 'const a = `guaranteed ${x}`;')).toHaveLength(1);
    expect(scanSource('a.tsx', 'const a = `${x} identical`;')).toHaveLength(1);
    expect(scanSource('a.tsx', 'const a = <p>Output is Identical</p>;')).toHaveLength(1);
  });

  it('allows clean text and the whitelisted phrase', () => {
    expect(scanSource('a.tsx', 'const a = <p>Evidence, not proof</p>;')).toHaveLength(0);
    expect(scanSource('a.ts', 'const a = "unproven";')).toHaveLength(0);
  });

  it('finds source files to scan', () => {
    for (const d of DIRS) expect(listSources(join(ROOT, d)).length).toBeGreaterThan(0);
  });

  it('has no forbidden words in string literals in components/ and app/', () => {
    const bad: string[] = [];
    for (const d of DIRS) {
      for (const f of listSources(join(ROOT, d))) {
        for (const s of scanSource(f, readFileSync(f, 'utf8'))) {
          bad.push(`${relative(ROOT, f)}: ${JSON.stringify(s)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
