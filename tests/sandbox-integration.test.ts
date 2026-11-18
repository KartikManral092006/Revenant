// Sandbox integration tests (design.md "Sandbox integration tests"). Real child
// processes against tests/fixtures/sandbox-probe. Requirements 4.2-4.7, 4.10, 4.11.
// Requires `npm run build:node` (the child runs build/node/sandbox/child.js).
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBatch, type CallResult, type RunBatchOptions } from '../lib/ghost-memory/sandbox-runner';
import type { Limits, Tagged } from '../sandbox/protocol';

const repoRoot = realpathSync(path.join(__dirname, '..'));
const packageDir = realpathSync(path.join(__dirname, 'fixtures', 'sandbox-probe'));
const limits: Limits = {
  callTimeoutMs: 5_000,
  runTimeoutMs: 60_000,
  maxInputBytes: 64 * 1024,
  maxOutputBytes: 64 * 1024,
};

async function* iterate(items: Tagged[][]): AsyncIterable<Tagged[]> {
  for (const i of items) yield i;
}

function run(inputs: Tagged[][], extra: Partial<RunBatchOptions> & { limits?: Limits } = {}) {
  return runBatch({
    packageDir,
    exportName: 'default',
    repoRoot,
    inputs: iterate(inputs),
    limits,
    ...extra,
  });
}

// Tagged values for plain objects are plain objects; strings are strings.
function value(r: CallResult): Record<string, unknown> & string {
  if (r.outcome.kind !== 'returned') throw new Error(`expected returned, got ${JSON.stringify(r.outcome)}`);
  return r.outcome.value as Record<string, unknown> & string;
}

// A local listener that records any connection or datagram attempt.
let server: net.Server;
let port = 0;
let connections = 0;
beforeAll(async () => {
  server = net.createServer((s) => {
    connections++;
    s.destroy();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as net.AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const NET_CASES = [
  'fetch', 'http', 'node:http', 'https', 'node:https', 'net', 'node:net', 'dgram', 'node:dgram',
  'tls', 'node:tls', 'dns', 'node:dns', 'dns/promises', 'node:dns/promises',
];

describe('network stubs (Req 4.7)', () => {
  it('every network entry point throws NetworkBlockedError and nothing connects', async () => {
    const url = `http://127.0.0.1:${port}/`;
    const before = connections;
    const res = await run(NET_CASES.map((c) => [`net:${c}`, url]));
    expect(res.results).toHaveLength(NET_CASES.length);
    res.results.forEach((r, i) => {
      expect(r.outcome.kind, NET_CASES[i]).toBe('threw');
      if (r.outcome.kind === 'threw') {
        expect(r.outcome.error.name, NET_CASES[i]).toBe('NetworkBlockedError');
      }
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(connections).toBe(before);
  }, 60_000);

  it('the stubs, not the permission model, stop the call: --permission alone lets a socket connect', async () => {
    const before = connections;
    const code = `require('net').connect(${port}, '127.0.0.1').on('connect', () => process.exit(0)).on('error', () => process.exit(1));`;
    const exit = await new Promise<number | null>((resolve) => {
      const p = spawn(process.execPath, ['--permission', `--allow-fs-read=${packageDir}`, '-e', code], {
        env: {} as NodeJS.ProcessEnv,
        stdio: 'ignore',
      });
      p.on('exit', resolve);
    });
    expect(exit).toBe(0);
    expect(connections).toBeGreaterThan(before);
  }, 30_000);

  it('does not claim to cover process.binding-style access (documented limit)', async () => {
    // The stub module only patches Module._load and globals; it makes no claim about
    // process.binding. See sandbox/stubs.ts header and the README security note.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(path.join(repoRoot, 'sandbox', 'stubs.ts'), 'utf8');
    expect(src).toMatch(/NOT OS isolation/);
    expect(src).toMatch(/process\.binding/);
    const readme = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
    expect(readme).toMatch(/process\.binding|permission model/i);
  });
});

describe('permission model denials (Req 4.2)', () => {
  it('fs write, child process, worker, addon and reads outside the grant are denied', async () => {
    const writeTarget = path.join(repoRoot, 'tests', 'fixtures', 'sandbox-probe', 'should-not-exist.txt');
    const res = await run([
      ['write', writeTarget],
      ['spawn'],
      ['worker'],
      ['dlopen', '/nonexistent/addon.node'],
      ['read', '/etc/hosts'],
      ['read', path.join(repoRoot, '.env.local')],
    ]);
    expect(res.results).toHaveLength(6);
    const v = res.results.map(value);
    for (const [i, name] of ['write', 'spawn', 'worker', 'dlopen', 'read /etc/hosts', 'read .env.local'].entries()) {
      expect(v[i].threw, name).toBe(true);
    }
    expect(v[0].code).toBe('ERR_ACCESS_DENIED');
    expect(v[1].code).toBe('ERR_ACCESS_DENIED');
    expect(v[2].code).toBe('ERR_ACCESS_DENIED');
    expect(['ERR_ACCESS_DENIED', 'ERR_DLOPEN_DISABLED']).toContain(v[3].code);
    expect(v[4].code).toBe('ERR_ACCESS_DENIED');
    expect(v[5].code).toBe('ERR_ACCESS_DENIED');
    const { existsSync } = await import('node:fs');
    expect(existsSync(writeTarget)).toBe(false);
  }, 60_000);

  it('the environment is empty', async () => {
    const saved = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'parent-secret';
    try {
      const res = await run([['env']]);
      const e = value(res.results[0]);
      expect(e.key).toBe('undefined');
      expect(JSON.stringify(e.keys)).not.toContain('parent-secret');
      // The parent passes `env: {}`. Only variables added by Node (IPC) or macOS libc may appear.
      const allowed = new Set(['NODE_CHANNEL_FD', '__CF_USER_TEXT_ENCODING']);
      expect((e.keys as string[]).filter((k) => !allowed.has(k))).toEqual([]);
    } finally {
      if (saved === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = saved;
    }
  }, 30_000);
});

describe('timeouts and limits (Req 4.3, 4.4, 4.5, 4.6)', () => {
  it('per-call timeout records timeout, respawns the child, and later inputs run', async () => {
    const res = await run(
      [['pid'], ['slow', 5000], ['pid']],
      { limits: { ...limits, callTimeoutMs: 400 } },
    );
    expect(res.partial).toBe(false);
    expect(res.results.map((r) => r.outcome.kind)).toEqual(['returned', 'timeout', 'returned']);
    expect(res.respawns).toBe(1);
    expect(value(res.results[2])).not.toBe(value(res.results[0]));
  }, 60_000);

  it('run wall clock returns partial results and the child is gone', async () => {
    const res = await run(
      [['ok', 'a'], ['slow', 3000], ['ok', 'b']],
      { limits: { ...limits, callTimeoutMs: 10_000, runTimeoutMs: 1_500 } },
    );
    expect(res.partial).toBe(true);
    expect(res.results.map((r) => r.outcome.kind)).toEqual(['returned']);
  }, 30_000);

  it('memory cap: child exits, call is recorded as an error, run continues', async () => {
    const res = await run([['ok', 'a'], ['alloc'], ['ok', 'b']], {
      maxOldSpaceMb: 32,
      limits: { ...limits, callTimeoutMs: 30_000 },
    });
    expect(res.results).toHaveLength(3);
    expect(res.results[1].outcome.kind).toBe('error');
    expect(value(res.results[2])).toBe('b');
    expect(res.respawns).toBe(1);
  }, 60_000);

  it('size limits: huge output is output-too-large, huge input is rejected', async () => {
    const res = await run([['big', 1_000_000], ['x'.repeat(0), 'ok'], ['ok', 'y'.repeat(100_000)]]);
    expect(res.results[0].outcome.kind).toBe('output-too-large');
    expect(res.results[2].outcome.kind).toBe('threw');
    if (res.results[2].outcome.kind === 'threw') {
      expect(res.results[2].outcome.error.name).toBe('InputTooLarge');
    }
  }, 30_000);
});

describe('prototype pollution (Req 4.10, 4.11)', () => {
  it('flags pollution and runs the next call in a fresh process with clean prototypes', async () => {
    const res = await run([['pid'], ['pollute'], ['check'], ['pid']]);
    expect(res.results).toHaveLength(4);
    expect(res.results[1].pollution?.detected).toBe(true);
    expect(res.results[1].pollution?.keys.join(',')).toContain('revenantPolluted');
    expect(value(res.results[2])).toBe('clean');
    expect(res.results[2].pollution).toBeNull();
    expect(value(res.results[3])).not.toBe(value(res.results[0]));
    expect(res.respawns).toBe(1);
  }, 30_000);
});
