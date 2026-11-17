import path from 'node:path';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { listGraveyardNames, resolvePackageDir } from '../lib/graveyard/loader';

// Feature: revenant-mvp, Property 2: Only allowlisted packages resolve
// **Validates: Requirements 1.3**

const root = path.resolve(__dirname, '..');
const opts = { root };
const names = listGraveyardNames(opts);
const nodeModules = path.join(root, 'graveyard', 'node_modules');

function resolves(name: string): string | null {
  try {
    return resolvePackageDir(name, opts);
  } catch {
    return null;
  }
}

describe('Property 2: Only allowlisted packages resolve', () => {
  it('has a non-empty manifest list', () => {
    expect(names.length).toBeGreaterThanOrEqual(3);
  });

  it('resolves every listed name to a path under graveyard/node_modules/', () => {
    fc.assert(
      fc.property(fc.constantFrom(...names), (name) => {
        const dir = resolvePackageDir(name, opts);
        expect(path.isAbsolute(dir)).toBe(true);
        expect(path.dirname(dir)).toBe(nodeModules);
        expect(path.basename(dir)).toBe(name);
      }),
      { numRuns: 100 },
    );
  });

  it('resolves an arbitrary string if and only if it is in the manifest list', () => {
    const candidate = fc.oneof(
      fc.string(),
      fc.constantFrom('..', '../x', '../../etc/passwd', 'a/b', '/abs', '', '.', 'node_modules', '__proto__', 'constructor'),
      fc.constantFrom(...names).map((n) => `${n}/..`),
      fc.constantFrom(...names).map((n) => `../${n}`),
      fc.constantFrom(...names).map((n) => `${n} `),
      fc.constantFrom(...names).map((n) => n.toUpperCase()),
      fc.constantFrom(...names),
    );
    fc.assert(
      fc.property(candidate, (name) => {
        const result = resolves(name);
        if (names.includes(name)) {
          expect(result).not.toBeNull();
          expect(path.dirname(result as string)).toBe(nodeModules);
        } else {
          expect(result).toBeNull();
        }
      }),
      { numRuns: 200 },
    );
  });

  it('throws for non-string input', () => {
    fc.assert(
      fc.property(fc.anything().filter((v) => typeof v !== 'string'), (v) => {
        expect(() => resolvePackageDir(v as string, opts)).toThrow();
      }),
      { numRuns: 100 },
    );
  });
});
