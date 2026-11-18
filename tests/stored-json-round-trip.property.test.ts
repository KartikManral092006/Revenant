import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Evidence, Recording, Tagged } from '../lib/ghost-memory/evidence-id.js';
import { RECORDING_SCHEMA_VERSION, writeRecording } from '../lib/ghost-memory/recorder.js';

// Tagged values are JSON-safe by construction: finite numbers (no -0), plain keys.
const finiteNumber = fc.double({ noNaN: true, noDefaultInfinity: true }).map((n) => (Object.is(n, -0) ? 0 : n));
const key = fc.string({ maxLength: 8 }).filter((k) => k !== '__proto__');
const tagged: fc.Arbitrary<Tagged> = fc.letrec<{ t: Tagged }>((tie) => ({
  t: fc.oneof(
    { depthSize: 'small', maxDepth: 3 },
    fc.constant(null),
    fc.boolean(),
    finiteNumber,
    fc.string({ maxLength: 12 }),
    fc.array(tie('t'), { maxLength: 3 }),
    fc.dictionary(key, tie('t'), { maxKeys: 3 }),
  ),
})).t;

const pollution = fc.option(
  fc.record({
    detected: fc.constant(true as const),
    prototypes: fc.subarray(['Object.prototype', 'Array.prototype', 'Function.prototype'] as const),
    keys: fc.array(fc.string({ maxLength: 10 }), { maxLength: 3 }),
    added: fc.array(fc.string({ maxLength: 10 }), { maxLength: 3 }),
    removed: fc.array(fc.string({ maxLength: 10 }), { maxLength: 3 }),
    changed: fc.array(fc.string({ maxLength: 10 }), { maxLength: 3 }),
  }),
  { nil: null },
);

const outcome: fc.Arbitrary<Evidence['outcome']> = fc.oneof(
  tagged.map((value) => ({ kind: 'returned' as const, value })),
  fc.record({
    kind: fc.constant('threw' as const),
    error: fc.record({ name: fc.string({ maxLength: 10 }), message: fc.string({ maxLength: 20 }) }),
  }),
  fc.record({ kind: fc.constant('output-too-large' as const), bytes: fc.nat() }),
  fc.record({ kind: fc.constant('timeout' as const), afterMs: fc.nat() }),
);

const evidence: fc.Arbitrary<Evidence> = fc.record({
  id: fc.string({ maxLength: 24 }),
  package: fc.string({ maxLength: 10 }),
  export: fc.string({ maxLength: 10 }),
  input: fc.array(tagged, { maxLength: 3 }),
  count: fc.integer({ min: 1, max: 1000 }),
  outcome,
  argsAfter: fc.option(fc.array(tagged, { maxLength: 3 }), { nil: null }),
  pollution,
  classId: fc.string({ maxLength: 24 }),
});

const recording: fc.Arbitrary<Recording> = fc.record({
  package: fc.constantFrom('lodash.set', 'lodash.pick', 'deep-extend', 'string'),
  version: fc.string({ maxLength: 10 }),
  seed: fc.integer(),
  n: fc.nat({ max: 5000 }),
  generatedAt: fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
  nodeVersion: fc.string({ maxLength: 10 }),
  limits: fc.record({
    callTimeoutMs: fc.nat(),
    runTimeoutMs: fc.nat(),
    maxInputBytes: fc.nat(),
    maxOutputBytes: fc.nat(),
  }),
  evidence: fc.array(evidence, { maxLength: 4 }),
  stats: fc.record({
    total: fc.nat(),
    timeouts: fc.nat(),
    threw: fc.nat(),
    returned: fc.nat(),
    pollution: fc.nat(),
    respawns: fc.nat(),
  }),
});

describe('Property 7: Stored JSON round trip (recordings)', () => {
  it('JSON.stringify then JSON.parse returns a deep-equal recording', () => {
    // **Validates: Requirements 3.4, 5.7**
    fc.assert(
      fc.property(recording, (rec) => {
        expect(JSON.parse(JSON.stringify(rec))).toEqual(rec);
      }),
      { numRuns: 100 },
    );
  });

  it('a recording written to data/<package>/ghost-memory.json reads back deep-equal', () => {
    // **Validates: Requirements 3.4, 5.7**
    const root = mkdtempSync(join(tmpdir(), 'revenant-p7-'));
    try {
      fc.assert(
        fc.property(recording, (rec) => {
          const file = writeRecording(rec, root);
          const parsed = JSON.parse(readFileSync(file, 'utf8')) as { schemaVersion: number };
          expect(parsed).toEqual({ schemaVersion: RECORDING_SCHEMA_VERSION, ...rec });
        }),
        { numRuns: 100 },
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
