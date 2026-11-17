import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateManifest } from '../lib/graveyard/manifest-schema';

const root = path.resolve(__dirname, '..');
const EXPECTED = {
  'lodash.set': { monorepo: true, resurrection: 'full' },
  'lodash.pick': { monorepo: true, resurrection: 'full' },
  string: { monorepo: undefined, resurrection: 'autopsy-and-ghost-memory' },
  'deep-extend': { monorepo: undefined, resurrection: 'autopsy-and-ghost-memory' },
} as const;

describe('graveyard manifests', () => {
  for (const [name, expected] of Object.entries(EXPECTED)) {
    it(`${name} manifest is valid and has the expected flags`, () => {
      const raw = JSON.parse(readFileSync(path.join(root, 'graveyard', name, 'manifest.json'), 'utf8'));
      const result = validateManifest(raw);
      expect(result.ok ? [] : result.errors).toEqual([]);
      expect(raw.name).toBe(name);
      expect(raw.monorepo).toBe(expected.monorepo);
      expect(raw.resurrection).toBe(expected.resurrection);
      expect(raw.graveyardCriteria.pureFunction.judgment).toBe('human');
    });
  }
});
