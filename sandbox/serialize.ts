// Tagged serializer: turns arbitrary JS values into JSON-safe trees and back.
//
// Wire forms (reserved key `$t`):
//   undefined            {"$t":"undef"}
//   NaN/Infinity/-0      {"$t":"num","v":"NaN"|"Infinity"|"-Infinity"|"-0"}
//   function             {"$t":"fn","name":...,"length":...}
//   Error                {"$t":"err","name":...,"message":...}
//   repeated/cyclic obj  {"$t":"ref","id":n} -> target wrapped as {"$t":"id","id":n,"v":...}
//   own `$t` key         {"$t":"obj","v":{...}}
//   sparse array         {"$t":"sparse","length":n,"v":{"<index>":...}}
//   unsupported kinds    {"$t":"other","kind":...}

import type { Tagged } from './protocol.js';

type Obj = Record<string, unknown>;

/** Deserialized stand-in for kinds the MVP does not carry (bigint, Date, Map, ...). */
export class OtherValue {
  readonly kind: string;
  constructor(kind: string) {
    this.kind = kind;
  }
}

const hasOwn = (o: object, k: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(o, k);

function setOwn(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function safeString(v: unknown, fallback: string): string {
  try {
    return typeof v === 'string' ? v : String(v);
  } catch {
    return fallback;
  }
}

function readProp(o: object, key: string): unknown {
  try {
    return (o as Obj)[key];
  } catch (e) {
    return e;
  }
}

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function otherKind(v: unknown): string {
  if (v instanceof OtherValue) return v.kind;
  if (typeof v !== 'object' || v === null) return typeof v;
  try {
    const ctor = (v as { constructor?: { name?: unknown } }).constructor;
    if (ctor && typeof ctor.name === 'string' && ctor.name) return ctor.name;
  } catch {
    // fall through
  }
  return 'object';
}

export function serialize(value: unknown): Tagged {
  // Pass 1 finds every object reached more than once (cycles and shared references),
  // so pass 2 can wrap the first occurrence with its id before any `ref` points to it.
  const repeated = new Set<object>();
  encodeWith(value, repeated, true);
  return encodeWith(value, repeated, false);
}

function encodeWith(value: unknown, repeated: Set<object>, collecting: boolean): Tagged {
  const seen = new Map<object, { id: number | null }>();
  let nextId = 0;

  function leafOrNull(v: unknown): Tagged | undefined {
    switch (typeof v) {
      case 'undefined':
        return { $t: 'undef' };
      case 'string':
      case 'boolean':
        return v as Tagged;
      case 'number':
        if (Number.isNaN(v)) return { $t: 'num', v: 'NaN' };
        if (v === Infinity) return { $t: 'num', v: 'Infinity' };
        if (v === -Infinity) return { $t: 'num', v: '-Infinity' };
        if (Object.is(v, -0)) return { $t: 'num', v: '-0' };
        return v;
      case 'bigint':
      case 'symbol':
        return { $t: 'other', kind: typeof v };
      case 'function': {
        const f = v as { length?: unknown };
        return {
          $t: 'fn',
          name: safeString(readProp(f, 'name'), ''),
          length: typeof readProp(f, 'length') === 'number' ? (f.length as number) : 0,
        };
      }
      default:
        if (v === null) return null;
        return undefined;
    }
  }

  function enc(v: unknown): Tagged {
    const leaf = leafOrNull(v);
    if (leaf !== undefined) return leaf;
    const o = v as object;

    if (o instanceof Error) {
      return {
        $t: 'err',
        name: safeString(readProp(o, 'name'), 'Error'),
        message: safeString(readProp(o, 'message'), ''),
      };
    }

    const isArr = Array.isArray(o);
    if (!isArr && (!isPlainObject(o) || o instanceof OtherValue)) {
      return { $t: 'other', kind: otherKind(o) };
    }

    const prior = seen.get(o);
    if (prior) {
      if (collecting) {
        repeated.add(o);
        return null;
      }
      return { $t: 'ref', id: prior.id as number };
    }
    const entry: { id: number | null } = { id: !collecting && repeated.has(o) ? nextId++ : null };
    seen.set(o, entry);

    let body: Tagged;
    if (isArr) {
      const arr = o as unknown[];
      let sparse = false;
      for (let i = 0; i < arr.length; i++) {
        if (!hasOwn(arr, i)) {
          sparse = true;
          break;
        }
      }
      if (!sparse) {
        body = arr.map((x) => enc(x));
      } else {
        const items: { [k: string]: Tagged } = {};
        for (const k of Object.keys(arr)) {
          if (/^(0|[1-9]\d*)$/.test(k)) setOwn(items, k, enc(readProp(arr, k)));
        }
        body = { $t: 'sparse', length: arr.length, v: items };
      }
    } else {
      const out: { [k: string]: Tagged } = {};
      for (const k of Object.keys(o)) setOwn(out, k, enc(readProp(o, k)));
      body = hasOwn(out, '$t') ? { $t: 'obj', v: out } : out;
    }

    return entry.id === null ? body : { $t: 'id', id: entry.id, v: body };
  }

  return enc(value);
}

export function deserialize(tagged: Tagged): unknown {
  const refs = new Map<number, unknown>();

  function dec(node: Tagged, regId?: number): unknown {
    if (node === null || typeof node !== 'object') return node;

    if (Array.isArray(node)) {
      const arr: unknown[] = [];
      if (regId !== undefined) refs.set(regId, arr);
      for (let i = 0; i < node.length; i++) arr[i] = dec(node[i]);
      return arr;
    }

    const t = hasOwn(node, '$t') ? (node as Obj)['$t'] : undefined;
    if (t === undefined) return decObject(node, regId);

    const n = node as Obj;
    switch (t) {
      case 'undef':
        return undefined;
      case 'num': {
        switch (n['v']) {
          case 'NaN':
            return NaN;
          case 'Infinity':
            return Infinity;
          case '-Infinity':
            return -Infinity;
          case '-0':
            return -0;
        }
        throw new TypeError('Invalid num tag');
      }
      case 'fn': {
        const stub = function () {
          throw new Error('Deserialized function descriptor is not callable');
        };
        Object.defineProperty(stub, 'name', { value: String(n['name']), configurable: true });
        Object.defineProperty(stub, 'length', { value: Number(n['length']), configurable: true });
        return stub;
      }
      case 'err': {
        const e = new Error(String(n['message']));
        Object.defineProperty(e, 'name', {
          value: String(n['name']),
          writable: true,
          configurable: true,
          enumerable: false,
        });
        return e;
      }
      case 'other':
        return new OtherValue(String(n['kind']));
      case 'ref': {
        const id = n['id'] as number;
        if (!refs.has(id)) throw new TypeError(`Unresolved reference ${id}`);
        return refs.get(id);
      }
      case 'id':
        return dec(n['v'] as Tagged, n['id'] as number);
      case 'obj':
        return decObject(n['v'] as { [k: string]: Tagged }, regId);
      case 'sparse': {
        const arr: unknown[] = [];
        arr.length = Number(n['length']);
        if (regId !== undefined) refs.set(regId, arr);
        const items = n['v'] as { [k: string]: Tagged };
        for (const k of Object.keys(items)) arr[Number(k)] = dec(items[k]!);
        return arr;
      }
      default:
        throw new TypeError(`Unknown tag ${String(t)}`);
    }
  }

  function decObject(node: { [k: string]: Tagged }, regId?: number): unknown {
    const obj: Obj = {};
    if (regId !== undefined) refs.set(regId, obj);
    for (const k of Object.keys(node)) setOwn(obj, k, dec(node[k]!));
    return obj;
  }

  return dec(tagged);
}
