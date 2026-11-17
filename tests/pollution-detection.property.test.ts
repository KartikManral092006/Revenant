import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareSnapshot, takeSnapshot, type ProtoTargets } from '../sandbox/pollution';

// Feature: revenant-mvp, Property 11: Prototype change detection
// **Validates: Requirements 4.10**
// Only stand-in objects are mutated; the real built-in prototypes are never touched.

const NAMES = ['Object.prototype', 'Array.prototype', 'Function.prototype'] as const;
const SYM = Symbol('s');
const KEYS: (string | symbol)[] = ['a', 'b', 'c', '__proto__x', SYM];
const shared = { shared: true };
const getter1 = () => 1;
const getter2 = () => 2;
const setter1 = (_v: unknown) => undefined;
const VALUES: unknown[] = [1, 2, 'x', NaN, 0, -0, undefined, null, shared, { shared: true }];

type Def =
  | { kind: 'value'; value: unknown }
  | { kind: 'accessor'; get?: () => number; set?: (v: unknown) => void };

const defArb: fc.Arbitrary<Def> = fc.oneof(
  fc.constantFrom(...VALUES).map((value): Def => ({ kind: 'value', value })),
  fc
    .record({
      get: fc.constantFrom<undefined | (() => number)>(undefined, getter1, getter2),
      set: fc.constantFrom<undefined | ((v: unknown) => void)>(undefined, setter1),
    })
    .map((r): Def => ({ kind: 'accessor', ...r })),
);

type Op =
  | { op: 'define'; proto: number; key: string | symbol; def: Def }
  | { op: 'delete'; proto: number; key: string | symbol };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    op: fc.constant('define' as const),
    proto: fc.integer({ min: 0, max: 2 }),
    key: fc.constantFrom(...KEYS),
    def: defArb,
  }),
  fc.record({
    op: fc.constant('delete' as const),
    proto: fc.integer({ min: 0, max: 2 }),
    key: fc.constantFrom(...KEYS),
  }),
);

function define(target: object, key: string | symbol, def: Def): void {
  if (def.kind === 'value') {
    Object.defineProperty(target, key, {
      value: def.value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } else {
    Object.defineProperty(target, key, {
      get: def.get,
      set: def.set,
      configurable: true,
      enumerable: true,
    });
  }
}

type Rec = { value: unknown; get: unknown; set: unknown };
function records(target: object): Map<string | symbol, Rec> {
  const m = new Map<string | symbol, Rec>();
  for (const k of Reflect.ownKeys(target)) {
    const d = Object.getOwnPropertyDescriptor(target, k)!;
    m.set(k, { value: d.value, get: d.get, set: d.set });
  }
  return m;
}

function differs(a: Map<string | symbol, Rec>, b: Map<string | symbol, Rec>): boolean {
  if (a.size !== b.size) return true;
  for (const [k, r] of a) {
    const o = b.get(k);
    if (!o) return true;
    if (!Object.is(r.value, o.value) || !Object.is(r.get, o.get) || !Object.is(r.set, o.set)) {
      return true;
    }
  }
  return false;
}

const initialArb = fc.array(fc.array(fc.tuple(fc.constantFrom(...KEYS), defArb), { maxLength: 4 }), {
  minLength: 3,
  maxLength: 3,
});

describe('Property 11: prototype change detection', () => {
  it('reports a change iff the final state differs from the snapshot', () => {
    fc.assert(
      fc.property(initialArb, fc.array(opArb, { maxLength: 12 }), (initial, ops) => {
        const standIns = [{}, [] as unknown[], function standIn() {}] as object[];
        const targets: ProtoTargets = {};
        standIns.forEach((t, i) => {
          targets[NAMES[i]] = t;
          for (const [k, d] of initial[i]) define(t, k, d);
        });

        const before = standIns.map(records);
        const snap = takeSnapshot(targets);
        expect(compareSnapshot(snap)).toBeNull();

        for (const o of ops) {
          const t = standIns[o.proto];
          if (o.op === 'define') define(t, o.key, o.def);
          else delete (t as Record<string | symbol, unknown>)[o.key];
        }

        const after = standIns.map(records);
        const changedIdx = before.map((b, i) => differs(b, after[i]));
        const report = compareSnapshot(snap);

        if (!changedIdx.some(Boolean)) {
          expect(report).toBeNull();
        } else {
          expect(report).not.toBeNull();
          expect(report!.detected).toBe(true);
          expect([...report!.prototypes].sort()).toEqual(
            NAMES.filter((_, i) => changedIdx[i]).sort(),
          );
          expect(report!.keys.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('detects nothing when stand-ins are untouched', () => {
    const t: ProtoTargets = { 'Object.prototype': { a: 1 } };
    expect(compareSnapshot(takeSnapshot(t))).toBeNull();
  });
});
