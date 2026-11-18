// Named feature extractors for behavior classes (Req 3.2, 5.2). The manifest refers to them by
// the name in `classFeatures[].feature`. An extractor returns a value, or undefined when it
// cannot decide; classes.ts sends such records to the unclassified class.
// Node-run code: relative imports only, with .js extensions.
import type { Tagged } from '../../../sandbox/protocol.js';
import type { Evidence } from '../evidence-id.js';

export interface FeatureContext {
  /** The closed list of allowed values from the manifest. */
  allowed: readonly string[];
}
export type FeatureExtractor = (evidence: Evidence, ctx: FeatureContext) => string | undefined;

type Obj = { [key: string]: Tagged };

/** Removes the `id` wrapper the serializer puts around a shared object. */
function unwrap(v: Tagged | undefined): Tagged | undefined {
  while (v !== null && typeof v === 'object' && !Array.isArray(v) && v['$t'] === 'id') {
    v = v['v'] as Tagged;
  }
  return v;
}
function tagOf(v: Tagged | undefined): string | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && typeof v['$t'] === 'string'
    ? (v['$t'] as string)
    : undefined;
}
/** Plain object body of a serialized value (handles the `obj` escape tag), else undefined. */
function plainBody(v: Tagged | undefined): Obj | undefined {
  v = unwrap(v);
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const t = tagOf(v);
  if (t === undefined) return v;
  if (t === 'obj') return unwrap(v['v']) as Obj;
  return undefined;
}
function isArray(v: Tagged | undefined): boolean {
  v = unwrap(v);
  return Array.isArray(v) || tagOf(v) === 'sparse';
}
function isNullish(v: Tagged | undefined): boolean {
  v = unwrap(v);
  return v === null || v === undefined || tagOf(v) === 'undef';
}
function isPrimitive(v: Tagged | undefined): boolean {
  v = unwrap(v);
  if (v === null) return false;
  return typeof v !== 'object' || tagOf(v) === 'num';
}

/** Path strings found in a serialized path argument (string, number, or an array of those). */
function pathStrings(v: Tagged | undefined): string[] | undefined {
  v = unwrap(v);
  if (typeof v === 'string') return [v];
  if (typeof v === 'number') return [String(v)];
  if (Array.isArray(v)) {
    const out: string[] = [];
    for (const item of v) {
      const inner = pathStrings(item);
      if (!inner) return undefined;
      out.push(...inner);
    }
    return out;
  }
  return undefined;
}

function oneShape(p: string): 'dot' | 'bracket-index' | 'mixed' | 'empty' | 'proto-path' {
  if (p === '') return 'empty';
  if (/(^|[.[\]'"])__proto__([.[\]'"]|$)/.test(p) || /(^|[.[\]'"])constructor[.\]['"]+prototype([.[\]'"]|$)/.test(p)) {
    return 'proto-path';
  }
  const bracket = /\[[^\]]*\]/.test(p);
  const dot = p.includes('.');
  if (bracket && (dot || p.replace(/\[[^\]]*\]/g, '') !== '')) return 'mixed';
  if (bracket) return 'bracket-index';
  return 'dot';
}

/** Shape of the path argument (second argument) of lodash.set and lodash.pick. */
export const pathShape: FeatureExtractor = (ev) => {
  const parts = pathStrings(ev.input[1]);
  if (!parts) return undefined;
  const shapes = (parts.length === 0 ? [''] : parts).map(oneShape);
  if (shapes.includes('proto-path')) return 'proto-path';
  if (shapes.every((s) => s === 'empty')) return 'empty';
  const rest = shapes.filter((s) => s !== 'empty');
  return rest.every((s) => s === rest[0]) ? rest[0] : 'mixed';
};

/** Type of the first argument. */
export const targetType: FeatureExtractor = (ev) => {
  const t = ev.input[0];
  if (isNullish(t)) return 'null-or-undefined';
  if (isArray(t)) return 'array';
  if (plainBody(t)) return 'plain-object';
  if (isPrimitive(t)) return 'primitive';
  return undefined;
};

/** Result of the call. `returned-false` is used only when the manifest allows it. */
export const outcome: FeatureExtractor = (ev, ctx) => {
  if (ev.pollution) return 'prototype-pollution';
  const o = ev.outcome;
  if (o.kind === 'timeout') return 'timeout';
  if (o.kind === 'threw') return o.error.name === 'TypeError' ? 'threw:TypeError' : 'threw:other';
  if (o.kind === 'returned') {
    if (o.value === false && ctx.allowed.includes('returned-false')) return 'returned-false';
    return 'returned';
  }
  return undefined;
};

/** Argument layout for deep-extend (target plus sources). */
export const argShape: FeatureExtractor = (ev) => {
  const args = ev.input;
  if (args.length === 0) return undefined;
  if (args.some((a) => isNullish(a) || isPrimitive(a))) return 'null-or-primitive';
  if (args.some(isArray)) return 'arrays';
  const bodies = args.map(plainBody);
  if (bodies.some((b) => !b)) return undefined;
  const nested = bodies.some((b) => Object.values(b as Obj).some((x) => plainBody(x) !== undefined || isArray(x)));
  if (nested) return 'nested';
  return args.length === 1 ? 'single' : 'two-plain';
};

/** Shape of the first string argument (string package). */
export const inputShape: FeatureExtractor = (ev) => {
  const s = unwrap(ev.input[0]);
  if (typeof s !== 'string') return undefined;
  if (s === '') return 'empty';
  if (s.trim() === '') return 'whitespace';
  if (s.length > 64) return 'long';
  return /^[A-Za-z0-9 _-]+$/.test(s) ? 'ascii' : 'symbols';
};

export const FEATURE_EXTRACTORS: Readonly<Record<string, FeatureExtractor>> = {
  pathShape,
  targetType,
  outcome,
  argShape,
  inputShape,
};

export function getExtractor(name: string): FeatureExtractor | undefined {
  return Object.hasOwn(FEATURE_EXTRACTORS, name) ? FEATURE_EXTRACTORS[name] : undefined;
}
