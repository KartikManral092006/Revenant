import { describe, expect, it } from 'vitest';
import { buildScore, emptyCounts } from './scoring';
import { createDiffStream, produceDiffLines, type DiffStreamLine } from './stream';
import type { DiffRunOptions, DiffRunResult, MismatchSample } from './runner';

const sample = { index: 1, input: [], reasons: ['outcome'] } as unknown as MismatchSample;
const baseRun = { package: 'p', exportName: 'default', inputs: (async function* () {})(), seed: 7, n: 3, rules: [] };

function fakeRun(opts: DiffRunOptions): Promise<DiffRunResult> {
  for (let i = 1; i <= 3; i++) {
    opts.onProgress?.({ done: i, n: 3, matched: i, intentional: 0, mismatched: 0, verdict: { kind: 'match' }, index: i - 1 });
  }
  opts.onMismatch?.(sample);
  return Promise.resolve({ seed: 7, n: 3, summary: buildScore(emptyCounts(), false), partial: false, samples: [sample] });
}

describe('produceDiffLines', () => {
  it('emits start, throttled progress, mismatch, then end', async () => {
    const lines: DiffStreamLine[] = [];
    await produceDiffLines({ run: baseRun, runDiff: fakeRun, now: () => 0, progressIntervalMs: 100 }, (l) => lines.push(l));
    expect(lines.map((l) => l.type)).toEqual(['start', 'progress', 'mismatch', 'end']);
    expect(lines[0]).toEqual({ type: 'start', seed: 7, n: 3 });
  });

  it('emits an error line when the run throws', async () => {
    const lines: DiffStreamLine[] = [];
    await produceDiffLines({ run: baseRun, runDiff: () => Promise.reject(new Error('boom')) }, (l) => lines.push(l));
    expect(lines.at(-1)).toEqual({ type: 'error', message: 'boom' });
  });
});

describe('createDiffStream', () => {
  it('produces one JSON object per line', async () => {
    const text = await new Response(createDiffStream({ run: baseRun, runDiff: fakeRun })).text();
    const parsed = text.trimEnd().split('\n').map((l) => JSON.parse(l) as { type: string });
    expect(parsed[0].type).toBe('start');
    expect(parsed.at(-1)?.type).toBe('end');
  });
});
