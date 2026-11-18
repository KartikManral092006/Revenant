// Parent side of the sandbox (Req 4.1 to 4.6, 4.11). Runs one batch of inputs in a
// child Node process started with the permission model, an empty environment and
// read grants for the compiled sandbox and the package under test only.
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type {
  ChildMsg,
  CallStyle,
  Limits,
  Outcome,
  ParentMsg,
  PollutionReport,
  SerializedError,
  Tagged,
} from '../../sandbox/protocol.js';

export type CallOutcome =
  | Outcome
  | { kind: 'timeout' }
  | { kind: 'error'; error: SerializedError };

export interface CallResult {
  /** Zero-based position of the input in the batch; results stay aligned with inputs. */
  index: number;
  outcome: CallOutcome;
  argsAfter: Tagged[];
  pollution: PollutionReport | null;
  durationMs: number;
}

export interface RunBatchOptions {
  /** Absolute, validated by the lib/graveyard allowlist. */
  packageDir: string;
  exportName: string;
  /** Manifest `callStyle`; forwarded to the child in the init message. */
  callStyle?: CallStyle;
  /** Serialized argument lists. */
  inputs: AsyncIterable<Tagged[]>;
  limits: Limits;
  signal?: AbortSignal;
  onResult?: (r: CallResult) => void;
  /** `--max-old-space-size` in MB. Default 256. */
  maxOldSpaceMb?: number;
  /** Repository root used to find `build/node/sandbox`. Default `process.cwd()`. */
  repoRoot?: string;
  /** Max time for the child to load the package and report ready. Default 10 s. */
  startupTimeoutMs?: number;
}

export interface RunBatchResult {
  results: CallResult[];
  partial: boolean;
  respawns: number;
}

export interface SandboxRunner {
  runBatch(opts: RunBatchOptions): Promise<RunBatchResult>;
}

const DEFAULT_MAX_OLD_SPACE_MB = 256;
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
const MAX_CONSECUTIVE_STARTUP_FAILURES = 3;

type Event = ChildMsg | { type: 'exit' };
type Wait = Event | { type: 'timeout' } | { type: 'aborted' };

/** One child process plus a queue of its messages. */
class ChildHandle {
  private queue: Event[] = [];
  private waiter: ((e: Event) => void) | null = null;
  readonly exited: Promise<void>;
  isDead = false;

  constructor(readonly proc: ChildProcess) {
    this.exited = new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        this.isDead = true;
        this.push({ type: 'exit' });
        resolve();
      };
      proc.once('exit', finish);
      proc.once('error', finish);
    });
    proc.on('message', (m) => this.push(m as ChildMsg));
  }

  private push(e: Event): void {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(e);
    } else {
      this.queue.push(e);
    }
  }

  send(msg: ParentMsg): boolean {
    if (this.isDead || !this.proc.connected) return false;
    try {
      this.proc.send(msg, (err) => {
        if (err) this.push({ type: 'exit' });
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Next event, a timeout after `ms`, or `aborted` when `abort` settles first. */
  next(ms: number, abort: Promise<void>): Promise<Wait> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    // An exit that arrives while other events are queued must still be seen last.
    return new Promise<Wait>((resolve) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        resolve({ type: 'timeout' });
      }, Math.max(0, ms));
      void abort.then(() => {
        if (this.waiter === onEvent) this.waiter = null;
        clearTimeout(timer);
        resolve({ type: 'aborted' });
      });
      const onEvent = (e: Event): void => {
        clearTimeout(timer);
        resolve(e);
      };
      this.waiter = onEvent;
    });
  }

  async kill(): Promise<void> {
    if (!this.isDead) {
      try {
        this.proc.kill('SIGKILL');
      } catch {
        // already gone
      }
    }
    await this.exited;
  }
}

export function buildChildArgs(opts: {
  packageDir: string;
  repoRoot: string;
  maxOldSpaceMb: number;
}): { entry: string; args: string[] } {
  const sandboxDir = path.join(opts.repoRoot, 'build', 'node', 'sandbox');
  const entry = path.join(sandboxDir, 'child.js');
  // No write, child-process, worker, addon or wasi grants.
  const args = [
    '--permission',
    `--allow-fs-read=${sandboxDir}`,
    `--allow-fs-read=${opts.packageDir}`,
    `--max-old-space-size=${opts.maxOldSpaceMb}`,
    entry,
  ];
  return { entry, args };
}

function toError(name: string, message: string): CallOutcome {
  return { kind: 'error', error: { name, message } };
}

export async function runBatch(opts: RunBatchOptions): Promise<RunBatchResult> {
  const { limits, signal } = opts;
  const repoRoot = opts.repoRoot ?? process.cwd();
  const maxOldSpaceMb = opts.maxOldSpaceMb ?? DEFAULT_MAX_OLD_SPACE_MB;
  const startupMs = opts.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const { args } = buildChildArgs({ packageDir: opts.packageDir, repoRoot, maxOldSpaceMb });

  const results: CallResult[] = [];
  let respawns = 0;
  let spawned = 0;
  let partial = false;
  let startupFailures = 0;
  let child: ChildHandle | null = null;

  const deadline = Date.now() + limits.runTimeoutMs;
  // Settles when the run wall clock expires or the caller aborts.
  let stopRun!: () => void;
  const stopped = new Promise<void>((resolve) => {
    stopRun = resolve;
  });
  const runTimer = setTimeout(stopRun, Math.max(0, limits.runTimeoutMs));
  const onAbort = (): void => stopRun();
  if (signal) {
    if (signal.aborted) stopRun();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  let isStopped = false;
  void stopped.then(() => {
    isStopped = true;
  });

  const record = (r: CallResult): void => {
    results.push(r);
    opts.onResult?.(r);
  };
  const dropChild = async (): Promise<void> => {
    const c = child;
    child = null;
    if (c) await c.kill();
  };

  /** Spawns a child and waits for `ready`. Returns an error description on failure. */
  const startChild = async (): Promise<SerializedError | 'stopped' | null> => {
    if (spawned > 0) respawns++;
    spawned++;
    const proc = spawn(process.execPath, args, {
      env: {} as NodeJS.ProcessEnv,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      cwd: repoRoot,
    });
    const handle = new ChildHandle(proc);
    child = handle;
    const init: ParentMsg = {
      type: 'init',
      packageDir: opts.packageDir,
      exportName: opts.exportName,
      ...(opts.callStyle ? { callStyle: opts.callStyle } : {}),
      limits,
    };
    if (!handle.send(init)) {
      await dropChild();
      return { name: 'ChildExited', message: 'Child exited during startup' };
    }
    const waitMs = Math.min(startupMs, Math.max(0, deadline - Date.now()));
    const ev = await handle.next(waitMs, stopped);
    if (ev.type === 'ready') return null;
    await dropChild();
    if (ev.type === 'aborted' || isStopped) return 'stopped';
    if (ev.type === 'fatal') return ev.error;
    if (ev.type === 'timeout') return { name: 'StartupTimeout', message: 'Child did not become ready' };
    return { name: 'ChildExited', message: 'Child exited during startup' };
  };

  const iterator = opts.inputs[Symbol.asyncIterator]();
  let index = 0;
  try {
    for (;;) {
      if (isStopped || Date.now() >= deadline || signal?.aborted) {
        partial = true;
        break;
      }
      const step = await iterator.next();
      if (step.done) break;
      const args_ = step.value;
      const i = index++;

      if (!child) {
        const failure = await startChild();
        if (failure === 'stopped') {
          partial = true;
          break;
        }
        if (failure) {
          startupFailures++;
          record({
            index: i,
            outcome: { kind: 'error', error: failure },
            argsAfter: [],
            pollution: null,
            durationMs: 0,
          });
          if (startupFailures >= MAX_CONSECUTIVE_STARTUP_FAILURES) {
            throw new Error(
              `Sandbox child failed to start ${startupFailures} times: ${failure.name}: ${failure.message}`,
            );
          }
          continue;
        }
        startupFailures = 0;
      }
      const active: ChildHandle = child!;

      const startedAt = Date.now();
      const sent = active.send({ type: 'call', callId: i, args: args_ });
      const waitMs = Math.min(limits.callTimeoutMs, Math.max(0, deadline - Date.now()));
      let ev: Wait = sent ? await active.next(waitMs, stopped) : { type: 'exit' };
      // Ignore stale messages from an earlier call (should not happen).
      while (ev.type === 'ready' || (ev.type === 'result' && ev.callId !== i)) {
        ev = await active.next(Math.max(0, startedAt + waitMs - Date.now()), stopped);
      }
      const elapsed = Date.now() - startedAt;

      if (ev.type === 'aborted' || (ev.type === 'timeout' && isStopped) || Date.now() >= deadline && ev.type === 'timeout') {
        // Run wall clock or abort: the in-flight call is not recorded.
        partial = true;
        await dropChild();
        break;
      }
      if (ev.type === 'result') {
        record({
          index: i,
          outcome: ev.outcome,
          argsAfter: ev.argsAfter,
          pollution: ev.pollution,
          durationMs: ev.durationMs,
        });
        if (ev.pollution) await dropChild(); // respawn before the next input (Req 4.11)
      } else if (ev.type === 'timeout') {
        await dropChild();
        record({ index: i, outcome: { kind: 'timeout' }, argsAfter: [], pollution: null, durationMs: elapsed });
      } else if (ev.type === 'fatal') {
        await dropChild();
        record({
          index: i,
          outcome: { kind: 'error', error: ev.error },
          argsAfter: [],
          pollution: null,
          durationMs: elapsed,
        });
      } else {
        await dropChild();
        record({
          index: i,
          outcome: toError('ChildExited', 'Child process exited unexpectedly'),
          argsAfter: [],
          pollution: null,
          durationMs: elapsed,
        });
      }
    }
  } finally {
    clearTimeout(runTimer);
    signal?.removeEventListener('abort', onAbort);
    if (child) {
      const c: ChildHandle = child;
      c.send({ type: 'shutdown' });
      await c.kill();
    }
    await iterator.return?.();
  }
  return { results, partial, respawns };
}

export const sandboxRunner: SandboxRunner = { runBatch };
