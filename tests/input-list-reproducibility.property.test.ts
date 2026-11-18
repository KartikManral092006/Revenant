import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { generateInputs, type GeneratorManifest } from '../lib/ghost-memory/generators/index.js';

const PACKAGES = ['lodash.set', 'lodash.pick', 'deep-extend', 'string'];

const manifests = PACKAGES.map(
  (pkg) =>
    JSON.parse(readFileSync(join(__dirname, '..', 'graveyard', pkg, 'manifest.json'), 'utf8')) as GeneratorManifest,
);
const targets = manifests.flatMap((m) => m.exportsUnderTest.map((e) => ({ m, name: e.name })));

describe('Property 18: Same seed gives the same input list', () => {
  /**
   * **Validates: Requirements 7.1, 7.2**
   */
  it('generating twice with the same seed and N yields identical serialized lists, reproducible from the stored seed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...targets),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.integer({ min: 0, max: 60 }),
        ({ m, name }, seed, n) => {
          const a = generateInputs(m, name, n, { seed });
          const b = generateInputs(m, name, n, { seed });
          if (JSON.stringify(a) !== JSON.stringify(b)) return false;
          // The stored list carries its seed; regenerating from that stored seed gives the same list.
          const stored = JSON.parse(JSON.stringify(a)) as typeof a;
          const again = generateInputs(m, name, stored.n, { seed: stored.seed });
          return stored.seed === seed && JSON.stringify(again.inputs) === JSON.stringify(stored.inputs);
        },
      ),
      { numRuns: 100 },
    );
  });
});
