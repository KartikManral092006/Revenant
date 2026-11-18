// Resolves the function the sandbox child calls for an export. Pure, so it can be unit tested.
import type { CallStyle } from './protocol.js';

type Fn = (...a: unknown[]) => unknown;

export function pickExport(mod: unknown, exportName: string, callStyle: CallStyle = 'function'): Fn | null {
  if (callStyle === 'receiver-wrapper') return pickWrapperMethod(mod, exportName);
  const m = mod as Record<string, unknown> | Fn;
  if (exportName === 'default') {
    if (typeof m === 'function') return m;
    const d = (m as Record<string, unknown>)?.default;
    return typeof d === 'function' ? (d as Fn) : null;
  }
  const f = (m as Record<string, unknown>)?.[exportName];
  return typeof f === 'function' ? (f as Fn) : null;
}

/** The module is a factory `S(value)`; the export is a method on the wrapped value. */
function pickWrapperMethod(mod: unknown, method: string): Fn | null {
  const factory = typeof mod === 'function' ? (mod as Fn) : ((mod as { default?: unknown } | null)?.default as unknown);
  if (typeof factory !== 'function') return null;
  // Probe once so a missing method reports ExportNotFound at init, not on every call.
  let probe: unknown;
  try {
    probe = (factory as Fn)('');
  } catch {
    return null;
  }
  if (probe === null || probe === undefined || typeof (probe as Record<string, unknown>)[method] !== 'function') {
    return null;
  }
  return (...args: unknown[]): unknown => {
    const wrapped = (factory as Fn)(args[0]) as Record<string, unknown>;
    return (wrapped[method] as Fn).apply(wrapped, args.slice(1));
  };
}
