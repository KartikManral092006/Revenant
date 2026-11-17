// Size limit checks for serialized sandbox inputs and outputs (Req 4.5).
// Imports nothing from app/.

export const DEFAULT_MAX_INPUT_BYTES = 64 * 1024;
export const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;

export interface SizeLimits {
  maxInputBytes: number;
  maxOutputBytes: number;
}

export const DEFAULT_SIZE_LIMITS: SizeLimits = {
  maxInputBytes: DEFAULT_MAX_INPUT_BYTES,
  maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
};

export type SizeCheck = { ok: true; bytes: number } | { ok: false; bytes: number };

/** UTF-8 byte length of the JSON text of a serialized (tagged) value. */
export function serializedByteLength(value: unknown): number {
  const text = JSON.stringify(value);
  return text === undefined ? 0 : Buffer.byteLength(text, 'utf8');
}

/** Accepts a byte count if and only if it does not exceed `max`. */
export function checkBytes(bytes: number, max: number): SizeCheck {
  return { ok: bytes <= max, bytes };
}

/** Checks a serialized input (the tagged argument list) against `maxInputBytes`. */
export function checkInputSize(
  serialized: unknown,
  limits: Pick<SizeLimits, 'maxInputBytes'> = DEFAULT_SIZE_LIMITS,
): SizeCheck {
  return checkBytes(serializedByteLength(serialized), limits.maxInputBytes);
}

/**
 * Checks a serialized output against `maxOutputBytes`. When it fails, the
 * caller records `{ kind: 'output-too-large', bytes }` using the returned count.
 */
export function checkOutputSize(
  serialized: unknown,
  limits: Pick<SizeLimits, 'maxOutputBytes'> = DEFAULT_SIZE_LIMITS,
): SizeCheck {
  return checkBytes(serializedByteLength(serialized), limits.maxOutputBytes);
}
