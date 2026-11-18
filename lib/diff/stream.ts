// NDJSON lines for a live differential run (Req 7.6, 7.7). The server does all the work; the
// browser only reads these lines. Line types: start, progress (throttled), mismatch (capped
// samples), end. A failure is reported as one `error` line and then the stream closes.
// Node-run code: relative imports only, with .js extensions.
import { runDiff, type DiffRunOptions, type DiffRunResult, type MismatchSample, type ProgressEvent } from './runner.js';
import type { Score } from './scoring.js';

export const DEFAULT_PROGRESS_INTERVAL_MS = 100;

export type DiffStreamLine =
  | { type: 'start'; seed: number; n: number }
  | { type: 'progress'; done: number; matched: number; intentional: number; mismatched: number }
  | { type: 'mismatch'; sample: MismatchSample }
  | { type: 'end'; summary: Score; partial: boolean }
  | { type: 'error'; message: string };

export interface DiffStreamOptions {
  /** Options for the run, minus the callbacks this module owns. */
  run: Omit<DiffRunOptions, 'onProgress' | 'onMismatch'>;
  /** Minimum ms between progress lines. The last count always arrives in `end`. */
  progressIntervalMs?: number;
  /** Replaceable for tests. */
  runDiff?: (opts: DiffRunOptions) => Promise<DiffRunResult>;
  now?: () => number;
}

/** One NDJSON line, newline-terminated. */
export function encodeLine(line: DiffStreamLine): string {
  return `${JSON.stringify(line)}\n`;
}

/**
 * Runs the differential and calls `emit` for each line, in order: `start`, then `progress` and
 * `mismatch` lines, then `end` (or `error` when the run throws). Never rejects.
 */
export async function produceDiffLines(
  opts: DiffStreamOptions,
  emit: (line: DiffStreamLine) => void,
): Promise<void> {
  const interval = opts.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
  const now = opts.now ?? Date.now;
  const run = opts.runDiff ?? runDiff;
  let lastProgressAt = Number.NEGATIVE_INFINITY;
  emit({ type: 'start', seed: opts.run.seed, n: opts.run.n });
  try {
    const result = await run({
      ...opts.run,
      onProgress: (p: ProgressEvent) => {
        const t = now();
        if (t - lastProgressAt < interval) return;
        lastProgressAt = t;
        emit({ type: 'progress', done: p.done, matched: p.matched, intentional: p.intentional, mismatched: p.mismatched });
      },
      // The runner already caps the number of samples it reports.
      onMismatch: (sample) => emit({ type: 'mismatch', sample }),
    });
    emit({ type: 'end', summary: result.summary, partial: result.partial });
  } catch (err) {
    emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

/** The same lines as an `application/x-ndjson` byte stream. */
export function createDiffStream(opts: DiffStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      await produceDiffLines(opts, (line) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeLine(line)));
        } catch {
          closed = true; // client went away
        }
      });
      if (!closed) controller.close();
    },
  });
}
