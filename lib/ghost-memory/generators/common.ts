// Shared fast-check building blocks for the Graveyard generators.
// Generators run in the parent process and only produce values in the serializable domain
// (primitives, undefined, NaN, Infinity, -0, arrays, plain objects). No functions, no cycles,
// no Date/Map/Set. Node-run code: relative imports only, with .js extensions.
import fc from 'fast-check';
import { serialize } from '../../../sandbox/serialize.js';
import { checkInputSize, DEFAULT_MAX_INPUT_BYTES } from '../../../sandbox/limits.js';
import type { Tagged } from '../../../sandbox/protocol.js';
import type { ArgKind } from '../../graveyard/manifest-schema.js';

/** Share of random inputs replaced by a hand-picked edge case (1 in 10). */
export const EDGE_CASE_WEIGHT = 1;
export const RANDOM_WEIGHT = 9;

export interface GeneratorManifest {
  name: string;
  exportsUnderTest: { name: string; arity: number }[];
  generator: {
    argSpecs: { kind: ArgKind }[];
    seed: number;
    edgeCases: unknown[][];
  };
}

/** One call to make: the export name and its serialized (tagged) arguments. */
export interface GeneratedInput {
  export: string;
  args: Tagged[];
}

export interface GeneratedInputs {
  package: string;
  export: string;
  seed: number;
  /** Requested count. */
  n: number;
  inputs: GeneratedInput[];
  /** Inputs dropped because they exceeded the input size limit. */
  dropped: number;
}

/** A package generator builds, per export, an arbitrary of raw (not yet serialized) argument lists. */
export interface PackageGenerator {
  package: string;
  argsArbitrary(
    manifest: GeneratorManifest,
    exportName: string,
    arity: number,
  ): fc.Arbitrary<unknown[]>;
}

// ---- value arbitraries ----

/** Own keys that matter for pollution and path handling. `$t` is excluded: it is the serializer's reserved tag key. */
export const KEY_POOL = [
  'a',
  'b',
  'c',
  'x',
  '0',
  '1',
  'length',
  'constructor',
  'prototype',
  '__proto__',
  'toString',
  'hasOwnProperty',
  'a.b',
  'a[0]',
] as const;

export const keyArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 8, arbitrary: fc.constantFrom(...KEY_POOL) },
  { weight: 2, arbitrary: fc.string({ minLength: 1, maxLength: 4 }).filter((s) => s !== '$t') },
);

export const primitiveArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer({ min: -5, max: 100 }),
  fc.double({ noNaN: false }),
  fc.constantFrom(NaN, Infinity, -Infinity, -0, 0),
  fc.string({ maxLength: 8 }),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
);

/** Builds an object with own data properties, so a key named "__proto__" stays an own key. */
function objectFromEntries(entries: [string, unknown][]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    Object.defineProperty(out, k, { value: v, writable: true, enumerable: true, configurable: true });
  }
  return out;
}

/** Nested values: primitives, arrays and plain objects, depth at most 3. */
export const anyValueArb: fc.Arbitrary<unknown> = fc.letrec<{ value: unknown }>((tie) => ({
  value: fc.oneof(
    { depthSize: 'small', maxDepth: 3 },
    { weight: 5, arbitrary: primitiveArb },
    { weight: 2, arbitrary: fc.array(tie('value'), { maxLength: 3 }) },
    {
      weight: 2,
      arbitrary: fc
        .array(fc.tuple(keyArb, tie('value')), { maxLength: 3 })
        .map((entries) => objectFromEntries(entries as [string, unknown][])),
    },
  ),
})).value;

/** Plain objects with keys from the pool, depth at most 3. */
export const plainObjectArb: fc.Arbitrary<Record<string, unknown>> = fc
  .array(fc.tuple(keyArb, anyValueArb), { maxLength: 4 })
  .map((entries) => objectFromEntries(entries as [string, unknown][]));

/** Targets for exports that take an object first: mostly plain objects, some arrays, primitives and null/undefined. */
export const objectKindArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 16, arbitrary: plainObjectArb },
  { weight: 2, arbitrary: fc.array(anyValueArb, { maxLength: 4 }) },
  { weight: 1, arbitrary: fc.oneof(fc.integer({ min: -3, max: 3 }), fc.string({ maxLength: 4 }), fc.boolean()) },
  { weight: 1, arbitrary: fc.constantFrom(null, undefined) },
);

/** Property paths: dot, bracket-index, mixed, empty, proto paths and key arrays. */
export const pathArb: fc.Arbitrary<unknown> = (() => {
  const segment = fc.constantFrom('a', 'b', 'c', 'x', 'constructor', 'prototype', '__proto__', 'length');
  const index = fc.nat({ max: 3 });
  const part = fc.oneof(
    segment,
    index.map((i) => `[${i}]`),
    index.map((i) => `${i}`),
  );
  const joined = fc.array(part, { minLength: 1, maxLength: 4 }).map((parts) => {
    let out = '';
    for (const p of parts) out += p.startsWith('[') || out === '' ? p : `.${p}`;
    return out;
  });
  return fc.oneof(
    { weight: 8, arbitrary: joined },
    { weight: 1, arbitrary: fc.constant('') },
    { weight: 1, arbitrary: fc.array(segment, { maxLength: 3 }) },
    { weight: 1, arbitrary: fc.oneof(fc.nat({ max: 3 }), fc.constantFrom(null, undefined)) },
  );
})();

export const stringArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.string({ maxLength: 24 }) },
  { weight: 2, arbitrary: fc.stringMatching(/^[ A-Za-z0-9_\-.<>/]{0,24}$/) },
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 1, arbitrary: fc.stringMatching(/^[ \t\n]{0,12}$/) },
  { weight: 1, arbitrary: fc.string({ minLength: 100, maxLength: 300 }) },
);

export function arbitraryForKind(kind: ArgKind): fc.Arbitrary<unknown> {
  switch (kind) {
    case 'string':
      return stringArb;
    case 'object':
      return objectKindArb;
    case 'array':
      return fc.array(anyValueArb, { maxLength: 4 });
    case 'number':
      return fc.oneof(fc.integer({ min: -5, max: 100 }), fc.double(), fc.constantFrom(NaN, Infinity, -0));
    case 'path':
      return pathArb;
    case 'any':
      return anyValueArb;
  }
}

/** Argument list arbitrary from the manifest argSpecs, first `arity` slots. */
export function argsFromSpecs(argSpecs: { kind: ArgKind }[], arity: number): fc.Arbitrary<unknown[]> {
  const slots: fc.Arbitrary<unknown>[] = [];
  for (let i = 0; i < arity; i++) {
    const spec = argSpecs[i] ?? argSpecs[argSpecs.length - 1];
    slots.push(arbitraryForKind(spec ? spec.kind : 'any'));
  }
  return fc.tuple(...slots) as fc.Arbitrary<unknown[]>;
}

// ---- input list production ----

/** Hand-picked edge cases are stored in tagged form already; cut to the export's arity and drop duplicates. */
export function edgeCasesFor(manifest: GeneratorManifest, arity: number): Tagged[][] {
  const seen = new Set<string>();
  const out: Tagged[][] = [];
  for (const edge of manifest.generator.edgeCases) {
    const args = (edge as Tagged[]).slice(0, arity);
    const key = JSON.stringify(args);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(args);
  }
  return out;
}

export interface GenerateOptions {
  /** Defaults to the manifest seed. */
  seed?: number;
  maxInputBytes?: number;
}

/**
 * Produces `n` serialized inputs for one export. All edge cases come first (so the required
 * `__proto__`, `constructor.prototype` and array-index strings are always present), then random
 * inputs where 1 in 10 is an edge case. Same manifest, export, seed and n give the same list.
 */
export function generateWith(
  generator: PackageGenerator,
  manifest: GeneratorManifest,
  exportName: string,
  n: number,
  options: GenerateOptions = {},
): GeneratedInputs {
  const target = manifest.exportsUnderTest.find((e) => e.name === exportName);
  if (!target) throw new Error(`Unknown export "${exportName}" for ${manifest.name}`);
  const seed = options.seed ?? manifest.generator.seed;
  const maxBytes = options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;

  const edges = edgeCasesFor(manifest, target.arity);
  const edgeArb = edges.length > 0 ? fc.constantFrom(...edges) : undefined;
  const randomArb = generator.argsArbitrary(manifest, exportName, target.arity).map((args) => serialize(args) as Tagged[]);
  const mixed = edgeArb
    ? fc.oneof(
        { weight: EDGE_CASE_WEIGHT, arbitrary: edgeArb },
        { weight: RANDOM_WEIGHT, arbitrary: randomArb },
      )
    : randomArb;

  const leading = edges.slice(0, n);
  const rest = Math.max(0, n - leading.length);
  const sampled = rest > 0 ? fc.sample(mixed, { seed, numRuns: rest }) : [];

  const inputs: GeneratedInput[] = [];
  let dropped = 0;
  for (const args of [...leading, ...sampled]) {
    if (!checkInputSize(args, { maxInputBytes: maxBytes }).ok) {
      dropped++;
      continue;
    }
    inputs.push({ export: exportName, args });
  }
  return { package: manifest.name, export: exportName, seed, n, inputs, dropped };
}
