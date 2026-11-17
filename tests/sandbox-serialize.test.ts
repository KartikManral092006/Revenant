import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { serialize, deserialize } from '../sandbox/serialize';
import type { Tagged } from '../sandbox/protocol';

// Feature: revenant-mvp, Property 9: Tagged serialization round trip
// **Validates: Requirements 4.8, 4.9**

const KEYS = ['a', 'b', 'v', 'id', '$t', '__proto__', 'name', 'length', ''];

const numbers = fc.oneof(
  fc.double({ noNaN: false }),
  fc.constantFrom(NaN, Infinity, -Infinity, -0, 0),
  fc.integer(),
);

const leaf = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.boolean(),
  fc.string(),
  numbers,
  fc.constantFrom('$t', 'undef', 'num', 'NaN', '-0'),
  fc.tuple(fc.string(), fc.nat(5)).map(([name, n]) => {
    const f = function () {};
    Object.defineProperty(f, 'name', { value: name });
    Object.defineProperty(f, 'length', { value: n });
    return f;
  }),
  fc
    .tuple(fc.constantFrom('Error', 'TypeError', 'RangeError', 'Custom'), fc.string())
    .map(([name, message]) => {
      const e = new Error(message);
      Object.defineProperty(e, 'name', { value: name, configurable: true, writable: true });
      return e;
    }),
);

// A graph spec: nodes are arrays/objects whose slots hold leaves or references to
// any node (including themselves and earlier ones), which yields cycles and sharing.
type Slot = { ref: number } | { leaf: unknown };
type NodeSpec = { kind: 'array'; slots: Slot[] } | { kind: 'object'; slots: [string, Slot][] };

const slot: fc.Arbitrary<Slot> = fc.oneof(
  leaf.map((l) => ({ leaf: l })),
  fc.nat(5).map((ref) => ({ ref })),
);
const nodeSpec: fc.Arbitrary<NodeSpec> = fc.oneof(
  fc.array(slot, { maxLength: 4 }).map((slots) => ({ kind: 'array' as const, slots })),
  fc
    .uniqueArray(fc.tuple(fc.constantFrom(...KEYS), slot), {
      selector: ([k]) => k,
      maxLength: 5,
    })
    .map((slots) => ({ kind: 'object' as const, slots })),
);

const graph = fc.tuple(fc.array(nodeSpec, { minLength: 1, maxLength: 5 }), fc.oneof(leaf, fc.constant(null).map(() => 'root' as const)));

function build(nodes: NodeSpec[], rootChoice: unknown): unknown {
  const built: unknown[] = nodes.map((n) => (n.kind === 'array' ? [] : {}));
  const resolve = (s: Slot): unknown => ('ref' in s ? built[s.ref % built.length] : s.leaf);
  nodes.forEach((n, i) => {
    if (n.kind === 'array') {
      (built[i] as unknown[]).push(...n.slots.map(resolve));
    } else {
      for (const [k, s] of n.slots) {
        Object.defineProperty(built[i], k, {
          value: resolve(s),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }
  });
  return rootChoice === 'root' ? built[0] : rootChoice;
}

/** Tagged comparison: errors by name+message, functions by name+length, graph shape incl. cycles/sharing. */
function taggedEqual(a: unknown, b: unknown): boolean {
  const ab = new Map<object, object>();
  const ba = new Map<object, object>();
  const eq = (x: unknown, y: unknown): boolean => {
    if (typeof x === 'function' || typeof y === 'function') {
      return (
        typeof x === 'function' &&
        typeof y === 'function' &&
        x.name === y.name &&
        x.length === y.length
      );
    }
    if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) {
      return Object.is(x, y);
    }
    if (ab.has(x) || ba.has(y)) return ab.get(x) === y && ba.get(y) === x;
    ab.set(x, y);
    ba.set(y, x);
    if (x instanceof Error || y instanceof Error) {
      return x instanceof Error && y instanceof Error && x.name === y.name && x.message === y.message;
    }
    if (Array.isArray(x) !== Array.isArray(y)) return false;
    const kx = Object.keys(x);
    const ky = Object.keys(y);
    if (Array.isArray(x) && x.length !== (y as unknown[]).length) return false;
    if (kx.length !== ky.length) return false;
    return kx.every(
      (k) =>
        Object.prototype.hasOwnProperty.call(y, k) &&
        eq((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k]),
    );
  };
  return eq(a, b);
}

function isJsonSafe(t: Tagged): boolean {
  const back = JSON.parse(JSON.stringify(t));
  return JSON.stringify(back) === JSON.stringify(t);
}

describe('Property 9: Tagged serialization round trip', () => {
  it('serialized form is JSON-safe and deserializes to a tagged-equal value', () => {
    fc.assert(
      fc.property(graph, ([nodes, rootChoice]) => {
        const value = build(nodes, rootChoice);
        const tagged = serialize(value);
        expect(isJsonSafe(tagged)).toBe(true);
        // Cross the process boundary as real JSON text.
        const wire = JSON.parse(JSON.stringify(tagged)) as Tagged;
        expect(taggedEqual(value, deserialize(wire))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('keeps own __proto__ and $t keys as own data properties', () => {
    const o: Record<string, unknown> = {};
    Object.defineProperty(o, '__proto__', { value: { x: 1 }, enumerable: true, writable: true, configurable: true });
    Object.defineProperty(o, '$t', { value: 'undef', enumerable: true, writable: true, configurable: true });
    const back = deserialize(JSON.parse(JSON.stringify(serialize(o)))) as Record<string, unknown>;
    expect(Object.getPrototypeOf(back)).toBe(Object.prototype);
    expect(Object.keys(back).sort()).toEqual(['$t', '__proto__']);
    expect(back['$t']).toBe('undef');
    expect(Object.getOwnPropertyDescriptor(back, '__proto__')!.value).toEqual({ x: 1 });
  });

  it('preserves -0, NaN and a self-referencing object', () => {
    const self: Record<string, unknown> = { z: -0, n: NaN, u: undefined };
    self['me'] = self;
    const back = deserialize(JSON.parse(JSON.stringify(serialize(self)))) as Record<string, unknown>;
    expect(Object.is(back['z'], -0)).toBe(true);
    expect(back['n']).toBeNaN();
    expect('u' in back && back['u'] === undefined).toBe(true);
    expect(back['me']).toBe(back);
  });
});
