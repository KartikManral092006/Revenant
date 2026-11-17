// Feature: revenant-mvp, Property 12: Timeouts keep results aligned with inputs
// **Validates: Requirements 4.3**
import { realpathSync } from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runBatch } from '../lib/ghost-memory/sandbox-runner';
import type { Tagged } from '../sandbox/protocol';

const packageDir = realpathSync(path.join(__dirname, 'fixtures', 'hang-fixture'));

async function* iterate(items: Tagged[][]): AsyncIterable<Tagged[]> {
  for (const i of items) yield i;
}

describe('Property 12: Timeouts keep results aligned with inputs', () => {
  it('returns one result per input in order; marked inputs time out, others do not', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Small batches keep child-process runs affordable; the run count stays at 100.
        fc.array(fc.boolean(), { minLength: 1, maxLength: 4 }),
        async (hangFlags) => {
          const inputs: Tagged[][] = hangFlags.map((h, i) => [h ? 'hang' : `ok-${i}`]);
          const res = await runBatch({
            packageDir,
            exportName: 'default',
            inputs: iterate(inputs),
            limits: {
              callTimeoutMs: 250,
              runTimeoutMs: 60_000,
              maxInputBytes: 64 * 1024,
              maxOutputBytes: 256 * 1024,
            },
          });
          expect(res.partial).toBe(false);
          expect(res.results).toHaveLength(inputs.length);
          res.results.forEach((r, i) => {
            expect(r.index).toBe(i);
            if (hangFlags[i]) {
              expect(r.outcome.kind).toBe('timeout');
            } else {
              expect(r.outcome.kind).not.toBe('timeout');
              expect(r.outcome).toEqual({ kind: 'returned', value: `ok-${i}` });
            }
          });
        },
      ),
      { numRuns: 100 },
    );
  }, 600_000);
});
