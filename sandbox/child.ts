// Sandbox child entry. Runs in a separate Node process started by the parent runner.
// Imports nothing from app/ or lib/.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type {
  ChildMsg,
  Limits,
  Outcome,
  ParentMsg,
  SerializedError,
  Tagged,
} from './protocol.js';
import { deserialize, serialize } from './serialize.js';
import { checkInputSize, checkOutputSize } from './limits.js';
import { compareSnapshot, takeSnapshot, type ProtoSnapshot } from './pollution.js';
import { installNetworkStubs } from './stubs.js';

// Package console output is discarded. IPC uses process.send, not stdout.
const noop = (): void => {};
for (const m of Object.keys(console) as (keyof Console)[]) {
  if (typeof console[m] === 'function') (console as unknown as Record<string, unknown>)[m] = noop;
}
process.stdout.write = (() => true) as typeof process.stdout.write;
process.stderr.write = (() => true) as typeof process.stderr.write;

const send = process.send?.bind(process);

function post(msg: ChildMsg, cb?: () => void): void {
  if (!send) process.exit(2);
  else send(msg, undefined, undefined, () => cb?.());
}

function toSerializedError(e: unknown): SerializedError {
  let name = 'Error';
  let message = '';
  try {
    if (typeof e === 'object' && e !== null) {
      const o = e as { name?: unknown; message?: unknown };
      name = typeof o.name === 'string' ? o.name : 'Error';
      message = typeof o.message === 'string' ? o.message : '';
    } else {
      name = 'NonErrorThrown';
      message = String(e);
    }
  } catch {
    // keep defaults
  }
  return { name, message };
}

let fn: ((...args: unknown[]) => unknown) | null = null;
let limits: Limits | null = null;
let snapshot: ProtoSnapshot[] = [];

async function loadPackage(packageDir: string): Promise<unknown> {
  const req = createRequire(pathToFileURL(packageDir.replace(/\/?$/, '/')).href);
  try {
    return req(packageDir);
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUIRE_ESM') {
      return import(pathToFileURL(req.resolve(packageDir)).href);
    }
    throw e;
  }
}

function pickExport(mod: unknown, exportName: string): ((...a: unknown[]) => unknown) | null {
  const m = mod as Record<string, unknown> | ((...a: unknown[]) => unknown);
  if (exportName === 'default') {
    if (typeof m === 'function') return m;
    const d = (m as Record<string, unknown>)?.default;
    return typeof d === 'function' ? (d as (...a: unknown[]) => unknown) : null;
  }
  const f = (m as Record<string, unknown>)?.[exportName];
  return typeof f === 'function' ? (f as (...a: unknown[]) => unknown) : null;
}

async function onInit(msg: Extract<ParentMsg, { type: 'init' }>): Promise<void> {
  limits = msg.limits;
  installNetworkStubs();
  snapshot = takeSnapshot();
  const mod = await loadPackage(msg.packageDir);
  fn = pickExport(mod, msg.exportName);
  if (!fn) {
    post({
      type: 'fatal',
      error: { name: 'ExportNotFound', message: `Export "${msg.exportName}" is not a function` },
    });
    return;
  }
  post({ type: 'ready', protoSnapshotId: `${snapshot.length}:${Date.now()}` });
}

function onCall(msg: Extract<ParentMsg, { type: 'call' }>): void {
  if (!fn || !limits) {
    post({ type: 'fatal', error: { name: 'NotInitialized', message: 'call before init' } });
    return;
  }
  const started = performance.now();
  const input = checkInputSize(msg.args, limits);
  let outcome: Outcome;
  let args: unknown[] = [];

  if (!input.ok) {
    outcome = {
      kind: 'threw',
      error: { name: 'InputTooLarge', message: `Serialized input is ${input.bytes} bytes` },
    };
  } else {
    // Fresh copy of the arguments for every call.
    args = msg.args.map((a) => deserialize(a));
    try {
      const value = fn(...args);
      const tagged = serialize(value);
      const out = checkOutputSize(tagged, limits);
      outcome = out.ok
        ? { kind: 'returned', value: tagged }
        : { kind: 'output-too-large', bytes: out.bytes };
    } catch (e) {
      outcome = { kind: 'threw', error: toSerializedError(e) };
    }
  }

  let argsAfter: Tagged[];
  try {
    argsAfter = args.map((a) => serialize(a));
  } catch {
    argsAfter = [];
  }

  const pollution = compareSnapshot(snapshot);
  post(
    {
      type: 'result',
      callId: msg.callId,
      outcome,
      argsAfter,
      pollution,
      durationMs: performance.now() - started,
    },
    pollution ? () => process.exit(0) : undefined,
  );
}

process.on('message', (raw: ParentMsg) => {
  try {
    if (raw.type === 'init') {
      onInit(raw).catch((e) => post({ type: 'fatal', error: toSerializedError(e) }));
    } else if (raw.type === 'call') {
      onCall(raw);
    } else if (raw.type === 'shutdown') {
      process.exit(0);
    }
  } catch (e) {
    post({ type: 'fatal', error: toSerializedError(e) });
  }
});

process.on('uncaughtException', (e) => {
  post({ type: 'fatal', error: toSerializedError(e) }, () => process.exit(1));
});
