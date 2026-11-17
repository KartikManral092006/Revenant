// Message and value types shared by the parent runner and the sandbox child.
// This file must stay free of imports from app/ and lib/ (it runs in Node, not Next.js).

/** A JSON-safe tree produced by the tagged serializer. Tags are objects with a `$t` key. */
export type Tagged =
  | null
  | boolean
  | number
  | string
  | Tagged[]
  | { [key: string]: Tagged };

export interface Limits {
  /** Per-call wall clock in ms (enforced by the parent). */
  callTimeoutMs: number;
  /** Per-run wall clock in ms (enforced by the parent). */
  runTimeoutMs: number;
  /** Max serialized input size in bytes. */
  maxInputBytes: number;
  /** Max serialized output size in bytes. */
  maxOutputBytes: number;
}

export interface SerializedError {
  name: string;
  message: string;
}

/** Names of the prototypes watched for pollution. */
export type WatchedPrototype = 'Object.prototype' | 'Array.prototype' | 'Function.prototype';

export interface PollutionReport {
  detected: true;
  /** Prototypes that changed. */
  prototypes: WatchedPrototype[];
  /** Affected keys, formatted `<Prototype>.<key>` (symbols use their description). */
  keys: string[];
  added: string[];
  removed: string[];
  changed: string[];
}

export type Outcome =
  | { kind: 'returned'; value: Tagged }
  | { kind: 'threw'; error: SerializedError }
  | { kind: 'output-too-large'; bytes: number };
// 'timeout' is produced by the parent: a hung child cannot report itself.

export type ParentMsg =
  | { type: 'init'; packageDir: string; exportName: string; limits: Limits }
  | { type: 'call'; callId: number; args: Tagged[] }
  | { type: 'shutdown' };

export type ChildMsg =
  | { type: 'ready'; protoSnapshotId: string }
  | {
      type: 'result';
      callId: number;
      outcome: Outcome;
      argsAfter: Tagged[];
      pollution: PollutionReport | null;
      durationMs: number;
    }
  | { type: 'fatal'; error: SerializedError };
