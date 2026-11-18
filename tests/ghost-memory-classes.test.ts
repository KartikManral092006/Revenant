import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listGraveyard } from '../lib/graveyard/loader';
import type { Evidence } from '../lib/ghost-memory/evidence-id';
import { buildClasses, classifyRecording, missingExtractors, writeClasses } from '../lib/ghost-memory/classes';
import { argShape, inputShape, outcome, pathShape, targetType } from '../lib/ghost-memory/features';

const manifests = listGraveyard();
const setManifest = manifests.find((m) => m.name === 'lodash.set')!;

function ev(id: string, input: unknown[], out: Evidence['outcome'] = { kind: 'returned', value: null }, extra: Partial<Evidence> = {}): Evidence {
  return {
    id: `lodash.set:default:${id}`,
    package: 'lodash.set',
    export: 'default',
    input: input as Evidence['input'],
    count: 1,
    outcome: out,
    argsAfter: [],
    pollution: null,
    classId: '',
    ...extra,
  };
}
const ctx = { allowed: [] as string[] };

describe('feature extractors', () => {
  it('pathShape', () => {
    const f = (p: unknown) => pathShape(ev('a', [{}, p, 1]), ctx);
    expect(f('a.b')).toBe('dot');
    expect(f('a[0]')).toBe('mixed');
    expect(f('[0]')).toBe('bracket-index');
    expect(f('')).toBe('empty');
    expect(f([])).toBe('empty');
    expect(f('__proto__.x')).toBe('proto-path');
    expect(f('constructor.prototype.x')).toBe('proto-path');
    expect(f({ $t: 'undef' })).toBeUndefined();
  });
  it('targetType', () => {
    const f = (t: unknown) => targetType(ev('a', [t, 'a', 1]), ctx);
    expect(f({ a: 1 })).toBe('plain-object');
    expect(f([1])).toBe('array');
    expect(f('s')).toBe('primitive');
    expect(f(null)).toBe('null-or-undefined');
    expect(f({ $t: 'undef' })).toBe('null-or-undefined');
    expect(f({ $t: 'fn', name: 'x', length: 0 })).toBeUndefined();
  });
  it('outcome', () => {
    const o = (out: Evidence['outcome'], extra: Partial<Evidence> = {}, allowed: string[] = []) =>
      outcome(ev('a', [], out, extra), { allowed });
    expect(o({ kind: 'returned', value: 1 })).toBe('returned');
    expect(o({ kind: 'returned', value: false })).toBe('returned');
    expect(o({ kind: 'returned', value: false }, {}, ['returned-false'])).toBe('returned-false');
    expect(o({ kind: 'threw', error: { name: 'TypeError', message: '' } })).toBe('threw:TypeError');
    expect(o({ kind: 'threw', error: { name: 'RangeError', message: '' } })).toBe('threw:other');
    expect(o({ kind: 'timeout', afterMs: 5 })).toBe('timeout');
    expect(o({ kind: 'returned', value: 1 }, { pollution: { detected: true, prototypes: ['Object.prototype'], keys: [], added: [], removed: [], changed: [] } })).toBe('prototype-pollution');
  });
  it('argShape and inputShape', () => {
    const a = (...args: unknown[]) => argShape(ev('a', args), ctx);
    expect(a({ a: 1 })).toBe('single');
    expect(a({ a: 1 }, { b: 2 })).toBe('two-plain');
    expect(a({ a: { b: 1 } }, { b: 2 })).toBe('nested');
    expect(a([1], { b: 2 })).toBe('arrays');
    expect(a({}, null)).toBe('null-or-primitive');
    const s = (x: unknown) => inputShape(ev('a', [x]), ctx);
    expect(s('')).toBe('empty');
    expect(s('  ')).toBe('whitespace');
    expect(s('hello world')).toBe('ascii');
    expect(s('a!b')).toBe('symbols');
    expect(s('x'.repeat(100))).toBe('long');
    expect(s(5)).toBeUndefined();
  });
  it('every manifest feature has an extractor', () => {
    for (const m of manifests) expect(missingExtractors(m)).toEqual([]);
  });
});

describe('buildClasses', () => {
  const records = [
    ev('d', [{}, 'a.b', 1]),
    ev('c', [{}, 'a.c', 1]),
    ev('b', [{}, 'a.d', 1]),
    ev('a', [{}, 'a.e', 1], undefined, { count: 4 }),
    ev('z', [{}, { $t: 'undef' }, 1]),
  ];
  it('partitions totally with deterministic representatives', () => {
    const { evidence, classes } = buildClasses(setManifest, records);
    expect(evidence).toHaveLength(records.length);
    const main = classes.find((c) => c.classId === 'lodash.set:default:class:dot|plain-object|returned')!;
    expect(main.features).toEqual({ pathShape: 'dot', targetType: 'plain-object', outcome: 'returned' });
    expect(main.count).toBe(7);
    expect(main.representatives).toEqual([
      'lodash.set:default:a',
      'lodash.set:default:b',
      'lodash.set:default:c',
    ]);
    const un = classes.find((c) => c.classId === 'lodash.set:default:class:unclassified')!;
    expect(un.evidenceIds).toEqual(['lodash.set:default:z']);
    expect(classes.reduce((n, c) => n + c.evidenceIds.length, 0)).toBe(records.length);
    expect(evidence.every((e) => classes.some((c) => c.classId === e.classId))).toBe(true);
  });
  it('sends values outside the allowed list to unclassified', () => {
    const narrow = { ...setManifest, classFeatures: [{ feature: 'outcome', allowed: ['timeout'] }] };
    const { classes } = buildClasses(narrow, records);
    expect(classes.map((c) => c.classId)).toEqual(['lodash.set:default:class:unclassified']);
  });
  it('writes classes.json', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'classes-'));
    try {
      const recording = {
        package: 'lodash.set', version: '4.3.2', seed: 1, n: 5, generatedAt: 'x', nodeVersion: 'v',
        limits: { callTimeoutMs: 1, runTimeoutMs: 1, maxInputBytes: 1, maxOutputBytes: 1 },
        evidence: records,
        stats: { total: 8, timeouts: 0, threw: 0, returned: 8, pollution: 0, respawns: 0 },
      };
      const { stored } = classifyRecording(setManifest, recording);
      const file = writeClasses(stored, dir);
      const read = JSON.parse(readFileSync(file, 'utf8'));
      expect(file).toBe(path.join(dir, 'data', 'lodash.set', 'classes.json'));
      expect(read.total).toBe(8);
      expect(read.unclassified).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
