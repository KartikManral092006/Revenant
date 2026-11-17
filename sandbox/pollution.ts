// Prototype pollution detection. Imports nothing from app/.
import type { PollutionReport, WatchedPrototype } from './protocol.js';

interface PropRecord {
  value: unknown;
  get: unknown;
  set: unknown;
}

export interface ProtoSnapshot {
  name: WatchedPrototype;
  target: object;
  props: Map<string | symbol, PropRecord>;
}

/** Objects to watch, keyed by name. Tests pass stand-in objects here. */
export type ProtoTargets = Partial<Record<WatchedPrototype, object>>;

export function defaultTargets(): ProtoTargets {
  return {
    'Object.prototype': Object.prototype,
    'Array.prototype': Array.prototype,
    'Function.prototype': Function.prototype,
  };
}

function snapshotOne(name: WatchedPrototype, target: object): ProtoSnapshot {
  const props = new Map<string | symbol, PropRecord>();
  for (const key of Reflect.ownKeys(target)) {
    const d = Object.getOwnPropertyDescriptor(target, key);
    if (d) props.set(key, { value: d.value, get: d.get, set: d.set });
  }
  return { name, target, props };
}

/** Snapshot own keys and descriptor value/get/set identities. Does not freeze anything. */
export function takeSnapshot(targets: ProtoTargets = defaultTargets()): ProtoSnapshot[] {
  return (Object.entries(targets) as [WatchedPrototype, object][]).map(([n, t]) =>
    snapshotOne(n, t),
  );
}

const label = (k: string | symbol): string =>
  typeof k === 'symbol' ? (k.description ?? 'symbol') : k;

/** Compare current state with the snapshot. Returns null when nothing changed. */
export function compareSnapshot(snapshot: ProtoSnapshot[]): PollutionReport | null {
  const prototypes: WatchedPrototype[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const snap of snapshot) {
    const now = snapshotOne(snap.name, snap.target);
    let touched = false;
    for (const [k, cur] of now.props) {
      const old = snap.props.get(k);
      if (!old) {
        added.push(`${snap.name}.${label(k)}`);
        touched = true;
      } else if (
        !Object.is(old.value, cur.value) ||
        !Object.is(old.get, cur.get) ||
        !Object.is(old.set, cur.set)
      ) {
        changed.push(`${snap.name}.${label(k)}`);
        touched = true;
      }
    }
    for (const k of snap.props.keys()) {
      if (!now.props.has(k)) {
        removed.push(`${snap.name}.${label(k)}`);
        touched = true;
      }
    }
    if (touched) prototypes.push(snap.name);
  }

  if (prototypes.length === 0) return null;
  return {
    detected: true,
    prototypes,
    keys: [...added, ...removed, ...changed],
    added,
    removed,
    changed,
  };
}
