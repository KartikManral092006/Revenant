import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listGraveyard } from '../lib/graveyard/loader';
import { recordPackage, writeRecording, RecordingError } from '../lib/ghost-memory/recorder';
import type { SandboxRunner } from '../lib/ghost-memory/sandbox-runner';

const manifest = listGraveyard().find((m) => m.name === 'lodash.set')!;

describe('Ghost Memory recorder', () => {
  it('records lodash.set in the real sandbox and writes ghost-memory.json to a temp dir', async () => {
    const recording = await recordPackage({ manifest, n: 40 });
    expect(recording.package).toBe('lodash.set');
    expect(recording.n).toBe(40);
    expect(recording.nodeVersion).toBe(process.version);
    const ids = recording.evidence.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(recording.stats.total).toBe(recording.evidence.reduce((s, e) => s + e.count, 0));
    expect(recording.stats.pollution).toBeGreaterThan(0); // edge cases include __proto__ paths

    const tmp = mkdtempSync(path.join(os.tmpdir(), 'revenant-rec-'));
    try {
      const file = writeRecording(recording, tmp);
      const stored = JSON.parse(readFileSync(file, 'utf8'));
      expect(stored.schemaVersion).toBe(1);
      expect(stored.generatedAt).toBe(recording.generatedAt);
      expect(stored.evidence).toEqual(JSON.parse(JSON.stringify(recording.evidence)));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it('records a timeout as Evidence with null argsAfter', async () => {
    const runner: SandboxRunner = {
      async runBatch(o) {
        let i = 0;
        for await (const _ of o.inputs) void _, i++;
        return {
          results: Array.from({ length: i }, (_, index) => ({
            index,
            outcome: { kind: 'timeout' as const },
            argsAfter: [],
            pollution: null,
            durationMs: 1000,
          })),
          partial: false,
          respawns: i,
        };
      },
    };
    const rec = await recordPackage({ manifest, n: 5, runner });
    expect(rec.evidence.every((e) => e.outcome.kind === 'timeout' && e.argsAfter === null)).toBe(true);
    expect(rec.stats.timeouts).toBe(rec.stats.total);
  });

  it('fails the recording when the run is partial', async () => {
    const runner: SandboxRunner = { runBatch: async () => ({ results: [], partial: true, respawns: 0 }) };
    await expect(recordPackage({ manifest, n: 3, runner })).rejects.toBeInstanceOf(RecordingError);
  });
});
