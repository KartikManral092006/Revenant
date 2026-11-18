// Ghost Memory recorder (Req 3.1, 3.2, 3.4, 4.3, 4.11). Runs generated inputs against the
// original package in the sandbox and builds a Recording. Repeated inputs are run and stored
// once with a `count`. An Evidence ID collision with a different canonical input fails the
// recording. Node-run code: relative imports only, with .js extensions.
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Limits, Tagged } from '../../sandbox/protocol.js';
import { DEFAULT_SIZE_LIMITS } from '../../sandbox/limits.js';
import { resolvePackageDir } from '../graveyard/loader.js';
import { effectiveN, type Manifest } from '../graveyard/manifest-schema.js';
import { canonicalInput, evidenceId, type Evidence, type Recording } from './evidence-id.js';
import { generateInputs } from './generators/index.js';
import { sandboxRunner, type SandboxRunner } from './sandbox-runner.js';

export const RECORDING_SCHEMA_VERSION = 1;
export const DEFAULT_RECORD_CALL_TIMEOUT_MS = 1_000;
/** Offline recordings get a larger run budget than live runs. */
export const DEFAULT_RECORD_RUN_TIMEOUT_MS = 10 * 60_000;

/** The stored file: a Recording plus the schema version. */
export interface StoredRecording extends Recording {
  schemaVersion: number;
}

export interface RecordOptions {
  manifest: Manifest;
  /** Defaults to the manifest seed. */
  seed?: number;
  /** Defaults to the manifest N (1000 when omitted). */
  n?: number;
  /** Absolute package directory; symlinks are resolved. Default: the allowlisted Graveyard directory. */
  packageDir?: string;
  repoRoot?: string;
  limits?: Partial<Limits>;
  runner?: SandboxRunner;
  signal?: AbortSignal;
  /** Live mode: keep the results gathered when the run clock expires instead of failing. */
  allowPartial?: boolean;
  /** Called after each export finishes (live progress). */
  onProgress?: (p: { export: string; done: number; total: number; partial: boolean }) => void;
  /** Overrides the clock for tests. */
  now?: () => Date;
}

export class RecordingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordingError';
  }
}

interface Pending {
  export: string;
  input: Tagged[];
  id: string;
  count: number;
}

export async function recordPackage(opts: RecordOptions): Promise<Recording> {
  const { manifest } = opts;
  const repoRoot = opts.repoRoot ?? process.cwd();
  const seed = opts.seed ?? manifest.generator.seed;
  const n = opts.n ?? effectiveN(manifest);
  const packageDir = realpathSync(opts.packageDir ?? resolvePackageDir(manifest.name, { root: repoRoot }));
  const runner = opts.runner ?? sandboxRunner;
  const limits: Limits = {
    callTimeoutMs: opts.limits?.callTimeoutMs ?? DEFAULT_RECORD_CALL_TIMEOUT_MS,
    runTimeoutMs: opts.limits?.runTimeoutMs ?? DEFAULT_RECORD_RUN_TIMEOUT_MS,
    maxInputBytes: opts.limits?.maxInputBytes ?? DEFAULT_SIZE_LIMITS.maxInputBytes,
    maxOutputBytes: opts.limits?.maxOutputBytes ?? DEFAULT_SIZE_LIMITS.maxOutputBytes,
  };

  const evidence: Evidence[] = [];
  const stats = { total: 0, timeouts: 0, threw: 0, returned: 0, pollution: 0, respawns: 0 };

  let exportsDone = 0;
  for (const target of manifest.exportsUnderTest) {
    const generated = generateInputs(manifest, target.name, n, { seed, maxInputBytes: limits.maxInputBytes });

    // Deduplicate: one Pending per ID; a same-ID, different-input pair is a collision.
    const byId = new Map<string, { pending: Pending; canonical: string }>();
    for (const g of generated.inputs) {
      const id = evidenceId(manifest.name, target.name, g.args);
      const canonical = canonicalInput(g.args);
      const known = byId.get(id);
      if (known) {
        if (known.canonical !== canonical) {
          throw new RecordingError(`Evidence ID collision for ${id}: two different canonical inputs share this ID`);
        }
        known.pending.count++;
      } else {
        byId.set(id, { pending: { export: target.name, input: g.args, id, count: 1 }, canonical });
      }
    }
    const unique = [...byId.values()].map((v) => v.pending);

    const batch = await runner.runBatch({
      packageDir,
      exportName: target.name,
      callStyle: manifest.callStyle,
      inputs: (async function* () {
        for (const p of unique) yield p.input;
      })(),
      limits,
      signal: opts.signal,
      repoRoot,
    });
    if (batch.partial && !opts.allowPartial) {
      throw new RecordingError(`Run time limit reached for ${manifest.name}.${target.name}; recording is incomplete`);
    }
    stats.respawns += batch.respawns;

    for (const r of batch.results) {
      const p = unique[r.index];
      if (!p) throw new RecordingError(`Runner returned a result for unknown input index ${r.index}`);
      if (r.outcome.kind === 'error') {
        throw new RecordingError(
          `Sandbox failure on ${p.id}: ${r.outcome.error.name}: ${r.outcome.error.message}`,
        );
      }
      const classId = `${manifest.name}:${target.name}:class:unclassified`;
      const base = { id: p.id, package: manifest.name, export: target.name, input: p.input, count: p.count, classId };
      if (r.outcome.kind === 'timeout') {
        evidence.push({
          ...base,
          outcome: { kind: 'timeout', afterMs: r.durationMs },
          argsAfter: null,
          pollution: null,
        });
        stats.timeouts += p.count;
      } else {
        evidence.push({ ...base, outcome: r.outcome, argsAfter: r.argsAfter, pollution: r.pollution });
        if (r.outcome.kind === 'threw') stats.threw += p.count;
        else if (r.outcome.kind === 'returned') stats.returned += p.count;
      }
      if (r.pollution) stats.pollution += p.count;
      stats.total += p.count;
    }
    exportsDone++;
    opts.onProgress?.({
      export: target.name,
      done: exportsDone,
      total: manifest.exportsUnderTest.length,
      partial: batch.partial,
    });
  }

  return {
    package: manifest.name,
    version: manifest.version,
    seed,
    n,
    generatedAt: (opts.now ?? (() => new Date()))().toISOString(),
    nodeVersion: process.version,
    limits,
    evidence,
    stats,
  };
}

/** Writes `data/<package>/ghost-memory.json` with `schemaVersion`; returns the file path. */
export function writeRecording(recording: Recording, repoRoot: string = process.cwd()): string {
  const file = path.join(repoRoot, 'data', recording.package, 'ghost-memory.json');
  const stored: StoredRecording = { schemaVersion: RECORDING_SCHEMA_VERSION, ...recording };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`);
  return file;
}

/** Records and writes in one step. */
export async function recordAndWrite(opts: RecordOptions): Promise<{ recording: Recording; file: string }> {
  const recording = await recordPackage(opts);
  const file = writeRecording(recording, opts.repoRoot);
  return { recording, file };
}
