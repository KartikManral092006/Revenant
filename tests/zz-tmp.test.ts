import { it } from 'vitest';
import fc from 'fast-check';
import * as c from '../lib/ghost-memory/generators/common.js';
for (const k of ['primitiveArb','keyArb','stringArb','pathArb','anyValueArb','plainObjectArb','objectKindArb']) {
  it(k, () => { fc.sample((c as any)[k],{seed:1,numRuns:100}); }, 5000);
}
