import { realpathSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pickExport } from '../sandbox/export-adapter';
import { runBatch } from '../lib/ghost-memory/sandbox-runner';
import { validateManifest } from '../lib/graveyard/manifest-schema';
import type { Tagged } from '../sandbox/protocol';

function S(v: unknown) {
  return { v, shout: (x?: string) => String(v).toUpperCase() + (x ?? '') };
}

describe('pickExport', () => {
  it('default style keeps the old behavior', () => {
    const mod = { f: () => 1, default: () => 2 };
    expect(pickExport(mod, 'f')?.()).toBe(1);
    expect(pickExport(mod, 'default')?.()).toBe(2);
    expect(pickExport(S, 'shout')).toBeNull();
  });

  it('receiver-wrapper calls S(args[0])[method](...rest)', () => {
    const fn = pickExport(S, 'shout', 'receiver-wrapper');
    expect(fn?.('ab', '!')).toBe('AB!');
  });

  it('receiver-wrapper returns null for a missing method or a non-factory', () => {
    expect(pickExport(S, 'nope', 'receiver-wrapper')).toBeNull();
    expect(pickExport({ shout: () => 1 }, 'shout', 'receiver-wrapper')).toBeNull();
  });
});

describe('receiver-wrapper in the sandbox child', () => {
  const packageDir = realpathSync(path.join(__dirname, 'fixtures', 'factory-fixture'));
  const limits = { callTimeoutMs: 1000, runTimeoutMs: 30_000, maxInputBytes: 64 * 1024, maxOutputBytes: 256 * 1024 };
  async function* inputs(): AsyncIterable<Tagged[]> {
    yield ['ab', '!'];
  }

  it('calls the method on the wrapped receiver', async () => {
    const res = await runBatch({ packageDir, exportName: 'shout', callStyle: 'receiver-wrapper', inputs: inputs(), limits });
    expect(res.results).toHaveLength(1);
    expect(res.results[0].outcome).toMatchObject({ kind: 'returned', value: 'AB!' });
  });

  it('without callStyle the same export is not found', async () => {
    const res = await runBatch({ packageDir, exportName: 'shout', inputs: inputs(), limits, startupTimeoutMs: 3000 });
    expect(res.results[0].outcome).toMatchObject({ kind: 'error', error: { name: 'ExportNotFound' } });
  });
});

describe('manifest callStyle', () => {
  it('rejects unknown values', () => {
    const r = validateManifest({ name: 'x', version: '1.0.0', callStyle: 'bogus' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain('callStyle');
  });
});
