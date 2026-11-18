// Offline coverage pass, Option A (Req 3.3). Replays the stored recording's inputs in a child
// started with NODE_V8_COVERAGE and WITHOUT --permission (V8 coverage cannot be written under
// the permission model); the network stubs still install in the child. The V8 JSON is reduced
// to two numbers: exported functions exercised (from Evidence) and branch coverage.
// Never used by live runs. Node-run code: relative imports only, with .js extensions.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CallStyle, ChildMsg, ParentMsg } from '../../sandbox/protocol.js';
import { resolvePackageDir } from '../graveyard/loader.js';
import type { Manifest } from '../graveyard/manifest-schema.js';
import type { Evidence, Recording } from './evidence-id.js';

export const COVERAGE_SCHEMA_VERSION = 1;

export interface V8Range {
  startOffset: number;
  endOffset: number;
  count: number;
}
export interface V8Function {
  functionName?: string;
  ranges: V8Range[];
  isBlockCoverage?: boolean;
}
export interface V8Script {
  url: string;
  functions: V8Function[];
}
export interface V8CoverageFile {
  result: V8Script[];
}

export interface BranchCoverage {
  covered: number;
  total: number;
  /** 0 to 100 */
  percent: number;
}

export interface StoredCoverage {
  schemaVersion: number;
  package: string;
  version: string;
  /** ISO timestamp of the offline pass. */
  measuredAt: string;
  exportedFunctions: { exercised: number; total: number; percent: number };
  /** null when the V8 pass failed for this package. */
  branches: BranchCoverage | null;
  /** Why `branches` is null. */
  branchesError?: string;
}

const pct = (covered: number, total: number): number => (total <= 0 ? 0 : Math.min(100, Math.max(0, (covered / total) * 100)));

/** Exports from the manifest with at least one Evidence entry. `exercised <= total` always holds. */
export function summarizeExports(
  evidence: Pick<Evidence, 'export'>[],
  exportsUnderTest: { name: string }[],
): { exercised: number; total: number; percent: number } {
  const names = new Set(exportsUnderTest.map((e) => e.name));
  const seen = new Set(evidence.map((e) => e.export).filter((n) => names.has(n)));
  return { exercised: seen.size, total: names.size, percent: pct(seen.size, names.size) };
}

/**
 * Share of distinct V8 ranges (file, start, end) with a count above zero, over the scripts under
 * `packageDir` (nested node_modules excluded). Ranges from several processes are merged.
 */
export function summarizeBranches(files: V8CoverageFile[], packageDir: string): BranchCoverage {
  const root = packageDir.endsWith(path.sep) ? packageDir : packageDir + path.sep;
  const ranges = new Map<string, boolean>();
  for (const file of files) {
    for (const script of file.result ?? []) {
      let p: string;
      try {
        p = script.url.startsWith('file:') ? fileURLToPath(script.url) : script.url;
      } catch {
        continue;
      }
      if (!p.startsWith(root) || p.slice(root.length).split(path.sep).includes('node_modules')) continue;
      for (const fn of script.functions ?? []) {
        for (const r of fn.ranges ?? []) {
          const key = `${p}|${r.startOffset}|${r.endOffset}`;
          ranges.set(key, (ranges.get(key) ?? false) || r.count > 0);
        }
      }
    }
  }
  const total = ranges.size;
  let covered = 0;
  for (const hit of ranges.values()) if (hit) covered++;
  return { covered, total, percent: pct(covered, total) };
}

export function readV8CoverageDir(dir: string): V8CoverageFile[] {
  const out: V8CoverageFile[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      out.push(JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as V8CoverageFile);
    } catch {
      // a truncated file from a killed child is ignored
    }
  }
  return out;
}

export interface CoverageOptions {
  manifest: Manifest;
  recording: Recording;
  repoRoot?: string;
  packageDir?: string;
  now?: () => Date;
}

type Ev = ChildMsg | { type: 'exit' } | { type: 'timeout' };

class Child {
  private queue: Ev[] = [];
  private waiter: ((e: Ev) => void) | null = null;
  dead = false;
  readonly exited: Promise<void>;
  constructor(readonly proc: ChildProcess) {
    this.exited = new Promise((resolve) => {
      const done = (): void => {
        this.dead = true;
        this.push({ type: 'exit' });
        resolve();
      };
      proc.once('exit', done);
      proc.once('error', done);
    });
    proc.on('message', (m) => this.push(m as ChildMsg));
  }
  private push(e: Ev): void {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(e);
    } else this.queue.push(e);
  }
  send(m: ParentMsg): void {
    if (!this.dead && this.proc.connected) {
      try {
        this.proc.send(m, () => {});
      } catch {
        // child gone
      }
    }
  }
  next(ms: number): Promise<Ev> {
    const q = this.queue.shift();
    if (q) return Promise.resolve(q);
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.waiter = null;
        resolve({ type: 'timeout' });
      }, ms);
      this.waiter = (e) => {
        clearTimeout(t);
        resolve(e);
      };
    });
  }
  /** Asks the child to exit normally (flushes V8 coverage); kills it if it does not. */
  async finish(): Promise<void> {
    this.send({ type: 'shutdown' });
    const t = setTimeout(() => this.proc.kill('SIGKILL'), 5_000);
    await this.exited;
    clearTimeout(t);
  }
  async kill(): Promise<void> {
    if (!this.dead) this.proc.kill('SIGKILL');
    await this.exited;
  }
}

const STARTUP_MS = 10_000;

async function replayExport(
  exportName: string,
  inputs: Evidence[],
  o: { entry: string; packageDir: string; repoRoot: string; coverageDir: string; recording: Recording; callStyle?: CallStyle },
): Promise<void> {
  const { limits } = o.recording;
  let child: Child | null = null;
  const start = async (): Promise<Child> => {
    const proc = spawn(process.execPath, [o.entry], {
      env: { NODE_V8_COVERAGE: o.coverageDir } as unknown as NodeJS.ProcessEnv,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      cwd: o.repoRoot,
    });
    const c = new Child(proc);
    c.send({ type: 'init', packageDir: o.packageDir, exportName, limits, ...(o.callStyle ? { callStyle: o.callStyle } : {}) });
    const ev = await c.next(STARTUP_MS);
    if (ev.type !== 'ready') {
      await c.kill();
      throw new Error(`child did not start for ${exportName}: ${ev.type === 'fatal' ? ev.error.message : ev.type}`);
    }
    return c;
  };
  try {
    let callId = 0;
    for (const e of inputs) {
      // A timed-out call needs a SIGKILL, which discards that child's coverage; skip those inputs.
      if (e.outcome.kind === 'timeout') continue;
      child ??= await start();
      child.send({ type: 'call', callId, args: e.input });
      let ev = await child.next(limits.callTimeoutMs);
      while (ev.type === 'ready') ev = await child.next(limits.callTimeoutMs);
      callId++;
      if (ev.type === 'result' && !ev.pollution) continue;
      // Pollution (child exits itself), timeout, fatal or exit: start a fresh child next time.
      if (ev.type === 'timeout') await child.kill();
      else await child.finish();
      child = null;
    }
  } finally {
    if (child) await (child as Child).finish();
  }
}

/** Runs the replay and returns the summary. Never throws for V8 failures: `branches` is null instead. */
export async function measureCoverage(opts: CoverageOptions): Promise<StoredCoverage> {
  const { manifest, recording } = opts;
  const repoRoot = opts.repoRoot ?? process.cwd();
  const packageDir = realpathSync(opts.packageDir ?? resolvePackageDir(manifest.name, { root: repoRoot }));
  const entry = path.join(repoRoot, 'build', 'node', 'sandbox', 'child.js');
  const coverageDir = mkdtempSync(path.join(tmpdir(), 'revenant-v8-'));
  let branches: BranchCoverage | null = null;
  let branchesError: string | undefined;
  try {
    for (const t of manifest.exportsUnderTest) {
      const inputs = recording.evidence.filter((e) => e.export === t.name);
      await replayExport(t.name, inputs, { entry, packageDir, repoRoot, coverageDir, recording, callStyle: manifest.callStyle });
    }
    const summary = summarizeBranches(readV8CoverageDir(coverageDir), packageDir);
    if (summary.total === 0) branchesError = 'V8 reported no coverage ranges for the package files';
    else branches = summary;
  } catch (err) {
    branchesError = err instanceof Error ? err.message : String(err);
  } finally {
    rmSync(coverageDir, { recursive: true, force: true });
  }
  return {
    schemaVersion: COVERAGE_SCHEMA_VERSION,
    package: manifest.name,
    version: manifest.version,
    measuredAt: (opts.now ?? (() => new Date()))().toISOString(),
    exportedFunctions: summarizeExports(recording.evidence, manifest.exportsUnderTest),
    branches,
    ...(branchesError ? { branchesError } : {}),
  };
}

/** Writes `data/<package>/coverage.json`; returns the path. */
export function writeCoverage(cov: StoredCoverage, repoRoot: string = process.cwd()): string {
  const file = path.join(repoRoot, 'data', cov.package, 'coverage.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(cov, null, 2)}\n`);
  return file;
}

/** Measures and writes in one step. */
export async function measureAndWriteCoverage(
  opts: CoverageOptions,
): Promise<{ coverage: StoredCoverage; file: string }> {
  const coverage = await measureCoverage(opts);
  return { coverage, file: writeCoverage(coverage, opts.repoRoot) };
}
