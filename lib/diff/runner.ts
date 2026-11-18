// Differential runner (Req 7.1, 7.3, 7.4, 7.7, 8.2). Starts one sandbox run for the original
// (graveyard/node_modules/<pkg>) and one for the rebuild (resurrected/<pkg>), feeds both the
// same serialized inputs in the same order, then compares, applies rules and scores each input
// once both sides have a result for it.
import path from 'node:path';
import type { CallStyle, Limits, Tagged } from '../../sandbox/protocol.js';
import { DEFAULT_SIZE_LIMITS } from '../../sandbox/limits.js';
import { resolvePackageDir } from '../graveyard/loader.js';
import {
  sandboxRunner as defaultSandboxRunner,
  type CallResult as SandboxCallResult,
  type SandboxRunner,
} from '../ghost-memory/sandbox-runner.js';
import type { CallResult, MismatchReason } from './comparator.js';
import { evaluateCase, type IntentionalDifferenceRule, type Verdict } from './rules.js';
import { addVerdict, buildScore, emptyCounts, type Score, type ScoreCounts } from './scoring.js';

export const DEFAULT_BUDGET_MS = 60_000;
export const DEFAULT_CALL_TIMEOUT_MS = 1_000;
export const DEFAULT_MAX_MISMATCH_SAMPLES = 20;

/** Reason attached to a mismatch caused by a sandbox failure rather than package behavior. */
export type SampleReason = MismatchReason | 'sandbox-error';

export interface MismatchSample {
  /** Zero-based input position. */
  index: number;
  input: Tagged[];
  original: SandboxCallResult;
  rebuild: SandboxCallResult;
  reasons: SampleReason[];
}

export interface ProgressEvent {
  /** Inputs completed on both sides so far (T). */
  done: number;
  n: number;
  matched: number;
  intentional: number;
  mismatched: number;
  verdict: Verdict;
  index: number;
}

export interface DiffRunOptions {
  /** Allowlisted package name. */
  package: string;
  exportName: string;
  /** Manifest `callStyle`, applied to both sides. */
  callStyle?: CallStyle;
  /** Serialized argument lists, sent in this order to both sides. */
  inputs: AsyncIterable<Tagged[]>;
  seed: number;
  n: number;
  rules: readonly IntentionalDifferenceRule[];
  /** Run budget in ms. Default 60 s. */
  budgetMs?: number;
  callTimeoutMs?: number;
  maxMismatchSamples?: number;
  onProgress?: (p: ProgressEvent) => void;
  onMismatch?: (s: MismatchSample) => void;
  signal?: AbortSignal;
  repoRoot?: string;
  runner?: SandboxRunner;
  /** Overrides for tests; default to graveyard/node_modules/<pkg> and resurrected/<pkg>. */
  originalDir?: string;
  rebuildDir?: string;
}

export interface DiffRunResult {
  seed: number;
  n: number;
  /** Counts and score text. `total` is T, inputs completed on both sides. */
  summary: Score;
  partial: boolean;
  samples: MismatchSample[];
}

/** Lets two consumers read one async source in the same order, pulling from it lazily. */
function tee<T>(source: AsyncIterable<T>): [AsyncIterable<T>, AsyncIterable<T>] {
  const it = source[Symbol.asyncIterator]();
  const buffer: IteratorResult<T>[] = [];
  let base = 0; // absolute index of buffer[0]
  const next = [0, 0];
  let pulling: Promise<void> = Promise.resolve();
  let finished = false;

  const fetch = async (abs: number): Promise<IteratorResult<T>> => {
    // Serialize pulls so each consumer sees the same element at the same position.
    pulling = pulling.then(async () => {
      while (!finished && base + buffer.length <= abs) {
        const r = await it.next();
        buffer.push(r);
        if (r.done) finished = true;
      }
    });
    await pulling;
    const r = buffer[abs - base] ?? buffer[buffer.length - 1];
    return r ?? { done: true, value: undefined };
  };
  const trim = (): void => {
    const drop = Math.min(next[0], next[1]) - base;
    if (drop > 0) {
      buffer.splice(0, drop);
      base += drop;
    }
  };
  const side = (id: 0 | 1): AsyncIterable<T> => ({
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<T>> {
          const r = await fetch(next[id]);
          if (!r.done) {
            next[id]++;
            trim();
          }
          return r;
        },
        async return(): Promise<IteratorResult<T>> {
          return { done: true, value: undefined };
        },
      };
    },
  });
  return [side(0), side(1)];
}

function isSandboxError(r: SandboxCallResult): boolean {
  return r.outcome.kind === 'error';
}

function toComparable(r: SandboxCallResult): CallResult {
  // 'error' outcomes are screened out before this is called.
  return { outcome: r.outcome as CallResult['outcome'], argsAfter: r.argsAfter, pollution: r.pollution };
}

export async function runDiff(opts: DiffRunOptions): Promise<DiffRunResult> {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const runner = opts.runner ?? defaultSandboxRunner;
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const maxSamples = opts.maxMismatchSamples ?? DEFAULT_MAX_MISMATCH_SAMPLES;
  const originalDir = opts.originalDir ?? resolvePackageDir(opts.package, { root: repoRoot });
  const rebuildDir = opts.rebuildDir ?? path.join(repoRoot, 'resurrected', opts.package);

  const limits: Limits = {
    callTimeoutMs: opts.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS,
    runTimeoutMs: budgetMs,
    maxInputBytes: DEFAULT_SIZE_LIMITS.maxInputBytes,
    maxOutputBytes: DEFAULT_SIZE_LIMITS.maxOutputBytes,
  };

  // Inputs are retained until both sides have a result, so mismatch samples can show them.
  const [srcA, srcB] = tee(opts.inputs);
  const seen = new Map<number, Tagged[]>();
  async function* recorded(src: AsyncIterable<Tagged[]>): AsyncGenerator<Tagged[]> {
    let i = 0;
    for await (const v of src) {
      if (!seen.has(i)) seen.set(i, v);
      i++;
      yield v;
    }
  }

  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }
  const budgetTimer = setTimeout(() => controller.abort(), Math.max(0, budgetMs));

  const pendingA = new Map<number, SandboxCallResult>();
  const pendingB = new Map<number, SandboxCallResult>();
  let counts: ScoreCounts = emptyCounts();
  let nextIndex = 0;
  const samples: MismatchSample[] = [];

  // Score inputs strictly in order, only once both sides have a result for them.
  const drain = (): void => {
    for (;;) {
      const a = pendingA.get(nextIndex);
      const b = pendingB.get(nextIndex);
      if (!a || !b) return;
      pendingA.delete(nextIndex);
      pendingB.delete(nextIndex);
      const index = nextIndex++;
      let verdict: Verdict;
      let sampleReasons: SampleReason[] = [];
      if (isSandboxError(a) || isSandboxError(b)) {
        // Infrastructure failure on a side: never a match and never explained by a rule.
        verdict = { kind: 'mismatch', reasons: ['outcome'] };
        sampleReasons = ['sandbox-error'];
      } else {
        verdict = evaluateCase(toComparable(a), toComparable(b), opts.rules);
        if (verdict.kind === 'mismatch') sampleReasons = verdict.reasons;
      }
      counts = addVerdict(counts, verdict);
      if (verdict.kind === 'mismatch' && samples.length < maxSamples) {
        const sample: MismatchSample = {
          index,
          input: seen.get(index) ?? [],
          original: a,
          rebuild: b,
          reasons: sampleReasons,
        };
        samples.push(sample);
        opts.onMismatch?.(sample);
      }
      seen.delete(index);
      opts.onProgress?.({
        done: counts.total,
        n: opts.n,
        matched: counts.matched,
        intentional: counts.intentional,
        mismatched: counts.mismatches,
        verdict,
        index,
      });
    }
  };

  const base = { exportName: opts.exportName, callStyle: opts.callStyle, limits, signal: controller.signal, repoRoot };
  let partial = false;
  try {
    const [ra, rb] = await Promise.all([
      runner.runBatch({
        ...base,
        packageDir: originalDir,
        inputs: recorded(srcA),
        onResult: (r) => {
          pendingA.set(r.index, r);
          drain();
        },
      }),
      runner.runBatch({
        ...base,
        packageDir: rebuildDir,
        inputs: recorded(srcB),
        onResult: (r) => {
          pendingB.set(r.index, r);
          drain();
        },
      }),
    ]);
    // Stopped early on either side (budget, abort), or fewer inputs completed than requested.
    partial = ra.partial || rb.partial || controller.signal.aborted;
  } finally {
    clearTimeout(budgetTimer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
  // Results still pending belong to inputs completed on one side only; they are excluded from T.

  return { seed: opts.seed, n: opts.n, summary: buildScore(counts, partial), partial, samples };
}
