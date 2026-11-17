import { createHash } from 'node:crypto';
import type { Limits, Outcome, PollutionReport, Tagged } from '../../sandbox/protocol.js';

export type { Tagged, Limits, Outcome, PollutionReport };

export interface Evidence {
  /** "<package>:<export>:<12 hex>" */
  id: string;
  package: string;
  export: string;
  /** Serialized arguments before the call. */
  input: Tagged[];
  outcome: Outcome | { kind: 'timeout'; afterMs: number };
  /** Post-call argument state; null on timeout. */
  argsAfter: Tagged[] | null;
  pollution: PollutionReport | null;
  /** Assigned deterministically by classes.ts. */
  classId: string;
}

export interface Recording {
  package: string;
  version: string;
  /** fast-check seed and input count */
  seed: number;
  n: number;
  /** ISO timestamp */
  generatedAt: string;
  nodeVersion: string;
  limits: Limits;
  evidence: Evidence[];
  stats: {
    total: number;
    timeouts: number;
    threw: number;
    returned: number;
    pollution: number;
    respawns: number;
  };
}

export interface BehaviorClass {
  classId: string;
  features: Record<string, string>;
  count: number;
  /** All members. */
  evidenceIds: string[];
  /** Up to 3, lowest IDs by sort order. */
  representatives: string[];
}

/** Canonical JSON: object keys sorted by code unit order, no whitespace. */
export function canonicalJson(value: Tagged): string {
  if (value === null || typeof value !== 'object') {
    // Tagged numbers are JSON-safe (non-finite values are tagged objects).
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k] as Tagged)}`).join(',')}}`;
}

/** Canonical form of the serialized input arguments (used for hashing and collision checks). */
export function canonicalInput(input: Tagged[]): string {
  return canonicalJson(input);
}

/** `<package>:<export>:<first 12 hex of sha256(canonical serialized input)>` */
export function evidenceId(pkg: string, exportName: string, input: Tagged[]): string {
  const hash = createHash('sha256').update(canonicalInput(input), 'utf8').digest('hex');
  return `${pkg}:${exportName}:${hash.slice(0, 12)}`;
}
