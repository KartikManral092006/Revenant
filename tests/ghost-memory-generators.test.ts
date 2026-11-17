import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateInputs, GENERATORS, type GeneratorManifest } from '../lib/ghost-memory/generators/index.js';
import { deserialize } from '../sandbox/serialize.js';

const PACKAGES = ['lodash.set', 'lodash.pick', 'deep-extend', 'string'];

function manifest(pkg: string): GeneratorManifest {
  return JSON.parse(readFileSync(join(__dirname, '..', 'graveyard', pkg, 'manifest.json'), 'utf8'));
}

describe('ghost-memory generators', () => {
  it('has a generator for every Graveyard package', () => {
    expect(Object.keys(GENERATORS).sort()).toEqual([...PACKAGES].sort());
  });

  for (const pkg of PACKAGES) {
    const m = manifest(pkg);
    for (const exp of m.exportsUnderTest) {
      it(`${pkg}:${exp.name} produces N deserializable inputs of the export's arity, edge cases first`, () => {
        const out = generateInputs(m, exp.name, 200);
        expect(out.seed).toBe(m.generator.seed);
        expect(out.inputs.length + out.dropped).toBe(200);
        for (const input of out.inputs) {
          expect(input.export).toBe(exp.name);
          expect(input.args.length).toBeLessThanOrEqual(exp.arity);
          expect(() => deserialize(input.args)).not.toThrow();
        }
        const first = m.generator.edgeCases[0]!.slice(0, exp.arity);
        expect(out.inputs[0]!.args).toEqual(first);
        const text = JSON.stringify(out.inputs.map((i) => i.args));
        expect(text).toContain('__proto__');
        expect(text).toContain('constructor.prototype');
      });
    }
  }

  it('same seed gives the same list; a different seed gives a different list', () => {
    const m = manifest('lodash.set');
    const a = generateInputs(m, 'default', 300);
    expect(generateInputs(m, 'default', 300)).toEqual(a);
    expect(generateInputs(m, 'default', 300, { seed: 1 }).inputs).not.toEqual(a.inputs);
  });

  it('returns fewer edge cases when N is smaller than the edge-case list', () => {
    const m = manifest('lodash.set');
    expect(generateInputs(m, 'default', 3).inputs).toHaveLength(3);
  });

  it('drops inputs over the size limit and counts them', () => {
    const m = manifest('deep-extend');
    const out = generateInputs(m, 'default', 50, { maxInputBytes: 10 });
    expect(out.inputs.length + out.dropped).toBe(50);
    expect(out.dropped).toBeGreaterThan(0);
  });

  it('rejects unknown packages and exports', () => {
    expect(() => generateInputs({ ...manifest('string'), name: 'left-pad' }, 'default', 1)).toThrow();
    expect(() => generateInputs(manifest('string'), 'nope', 1)).toThrow();
  });
});
