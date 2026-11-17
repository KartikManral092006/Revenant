import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateInputs } from '/Users/kartikmanral/Desktop/Revenant/lib/ghost-memory/generators/index.js';
it('gen', () => {
  for (const p of ['lodash.set','lodash.pick','deep-extend','string']) {
    const m = JSON.parse(readFileSync(`/Users/kartikmanral/Desktop/Revenant/graveyard/${p}/manifest.json`,'utf8'));
    for (const e of m.exportsUnderTest) {
      const a = generateInputs(m, e.name, 1000), b = generateInputs(m, e.name, 1000);
      expect(a).toEqual(b); console.log(p, e.name, a.inputs.length, a.dropped, JSON.stringify(a.inputs[40].args).slice(0,100));
    }
  }
});
