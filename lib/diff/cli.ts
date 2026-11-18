// Resurrection CLI (Req 13.1, 13.2, 13.4, 7.2). Runs differential testing for one allowlisted
// package: `npm run resurrect -- <package> [--n <int>] [--seed <int>] [--write]`.
// Exit codes: 0 no unexplained mismatches, 1 mismatches, 2 usage error, 3 sandbox/infrastructure failure.
// Node-run code: relative imports only, with .js extensions.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Tagged } from '../../sandbox/protocol.js';
import { listGraveyard } from '../graveyard/loader.js';
import { effectiveN, type Manifest } from '../graveyard/manifest-schema.js';
import { generateInputs } from '../ghost-memory/generators/index.js';
import { loadRules } from './rules.js';
import { runDiff, type DiffRunResult, type MismatchSample } from './runner.js';

export const EXIT_OK = 0;
export const EXIT_MISMATCH = 1;
export const EXIT_USAGE = 2;
export const EXIT_INFRA = 3;
export const MAX_PRINTED_MISMATCHES = 5;

/** 0 when no unexplained mismatches (X = 0), 1 otherwise. Intentional differences are not in X. */
export function exitCodeFor(summary: { mismatches: number }): 0 | 1 {
  return summary.mismatches > 0 ? EXIT_MISMATCH : EXIT_OK;
}

export interface CliArgs {
  package: string;
  n?: number;
  seed?: number;
  write: boolean;
}

export type ParsedArgs = { ok: true; args: CliArgs } | { ok: false; error: string };

function parseInt10(flag: string, value: string | undefined): number | string {
  if (value === undefined || !/^-?\d+$/.test(value)) return `${flag} needs an integer value`;
  return Number(value);
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let pkg: string | undefined;
  let n: number | undefined;
  let seed: number | undefined;
  let write = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') write = true;
    else if (a === '--n' || a === '--seed') {
      const v = parseInt10(a, argv[++i]);
      if (typeof v === 'string') return { ok: false, error: v };
      if (a === '--n') {
        if (v < 1) return { ok: false, error: '--n must be a positive integer' };
        n = v;
      } else seed = v;
    } else if (a.startsWith('-')) return { ok: false, error: `Unknown option: ${a}` };
    else if (pkg === undefined) pkg = a;
    else return { ok: false, error: `Unexpected argument: ${a}` };
  }
  if (pkg === undefined) return { ok: false, error: 'Missing package name' };
  return { ok: true, args: { package: pkg, n, seed, write } };
}

/** Supplies the serialized argument lists for one export. */
export type InputSource = (
  manifest: Manifest,
  exportName: string,
  n: number,
  seed: number,
) => AsyncIterable<Tagged[]>;

/** Default source: the Graveyard generators (task 6.12 wires richer reporting on top). */
export const generatorInputSource: InputSource = (manifest, exportName, n, seed) => {
  const generated = generateInputs(manifest, exportName, n, { seed });
  return (async function* () {
    for (const input of generated.inputs) yield input.args;
  })();
};

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

export interface CliDeps {
  root?: string;
  io?: CliIo;
  inputSource?: InputSource;
  run?: typeof runDiff;
  listManifests?: (root: string) => Manifest[];
  write?: (file: string, text: string) => void;
}

function describeSample(s: MismatchSample): string {
  const kind = (r: MismatchSample['original']): string => r.outcome.kind;
  return `  #${s.index} [${s.reasons.join(', ')}] original=${kind(s.original)} rebuild=${kind(s.rebuild)} input=${JSON.stringify(s.input)}`;
}

/** Runs the CLI and returns the exit code. Never calls process.exit. */
export async function runCli(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  const io: CliIo = deps.io ?? { out: (l) => console.log(l), err: (l) => console.error(l) };
  const root = deps.root ?? process.cwd();
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    io.err(`${parsed.error}\nUsage: resurrect <package> [--n <int>] [--seed <int>] [--write]`);
    return EXIT_USAGE;
  }
  const { args } = parsed;

  let manifests: Manifest[];
  try {
    manifests = (deps.listManifests ?? ((r) => listGraveyard({ root: r })))(root);
  } catch (err) {
    io.err(`Cannot read the graveyard manifests: ${(err as Error).message}`);
    return EXIT_INFRA;
  }
  const manifest = manifests.find((m) => m.name === args.package);
  if (!manifest) {
    io.err(`Unknown package "${args.package}". Known packages: ${manifests.map((m) => m.name).join(', ') || '(none)'}`);
    return EXIT_USAGE;
  }

  const n = args.n ?? effectiveN(manifest);
  const seed = args.seed ?? manifest.generator.seed;
  const exportName = manifest.exportsUnderTest[0].name;

  let result: DiffRunResult;
  try {
    const rules = loadRules(manifest.name, root);
    const inputs = (deps.inputSource ?? generatorInputSource)(manifest, exportName, n, seed);
    result = await (deps.run ?? runDiff)({
      package: manifest.name,
      exportName,
      callStyle: manifest.callStyle,
      inputs,
      seed,
      n,
      rules,
      repoRoot: root,
    });
  } catch (err) {
    io.err(`Sandbox or infrastructure failure: ${(err as Error).message}`);
    return EXIT_INFRA;
  }

  const { summary } = result;
  io.out(`${manifest.name}.${exportName}: ${summary.scoreText}${summary.partial ? ' (partial run)' : ''}`);
  io.out(`seed: ${result.seed}  n: ${result.n}`);
  if (summary.intentional > 0) io.out(`intentional differences: ${summary.intentional}`);
  if (summary.mismatches > 0) {
    io.out(`mismatches: ${summary.mismatches}`);
    for (const s of result.samples.slice(0, MAX_PRINTED_MISMATCHES)) io.out(describeSample(s));
  }

  if (args.write) {
    const file = path.join(root, 'data', manifest.name, 'diff-run.json');
    const doc = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      package: manifest.name,
      export: exportName,
      ...result,
    };
    try {
      (deps.write ?? ((f, t) => (mkdirSync(path.dirname(f), { recursive: true }), writeFileSync(f, t))))(
        file,
        `${JSON.stringify(doc, null, 2)}\n`,
      );
      io.out(`wrote ${path.relative(root, file)}`);
    } catch (err) {
      io.err(`Could not write ${file}: ${(err as Error).message}`);
      return EXIT_INFRA;
    }
  }

  // A sandbox failure on either side is infrastructure trouble, not package behavior.
  if (result.samples.some((s) => s.reasons.includes('sandbox-error'))) {
    io.err('Sandbox failure during the run; the result is not trustworthy.');
    return EXIT_INFRA;
  }
  return exitCodeFor(summary);
}

// Entry point for `node build/node/lib/diff/cli.js`. Avoids import.meta so it compiles under either module format.
if (/diff[\\/]cli\.js$/.test(process.argv[1] ?? '')) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(`Unexpected failure: ${(err as Error).message}`);
      process.exitCode = EXIT_INFRA;
    },
  );
}
