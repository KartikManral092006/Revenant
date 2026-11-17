import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  checkBytes,
  checkInputSize,
  checkOutputSize,
  serializedByteLength,
} from '../sandbox/limits';

// Feature: revenant-mvp, Property 10: Size limits are enforced
// **Validates: Requirements 4.5**
describe('Property 10: Size limits are enforced', () => {
  it('checkBytes rejects iff bytes exceed max', () => {
    fc.assert(
      fc.property(fc.nat(1_000_000), fc.nat(1_000_000), (bytes, max) => {
        const r = checkBytes(bytes, max);
        expect(r.ok).toBe(bytes <= max);
        expect(r.bytes).toBe(bytes);
      }),
      { numRuns: 200 },
    );
  });

  it('boundary: exactly max is accepted, max + 1 is rejected', () => {
    fc.assert(
      fc.property(fc.nat(1_000_000), (max) => {
        expect(checkBytes(max, max).ok).toBe(true);
        expect(checkBytes(max + 1, max).ok).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('input and output checks agree with the UTF-8 byte length of the JSON text', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), fc.nat(1200), (s, max) => {
        const value = { t: 'arr', v: [s] };
        const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
        expect(serializedByteLength(value)).toBe(bytes);
        const inp = checkInputSize(value, { maxInputBytes: max });
        const out = checkOutputSize(value, { maxOutputBytes: max });
        expect(inp.ok).toBe(bytes <= max);
        expect(out.ok).toBe(bytes <= max);
        expect(inp.bytes).toBe(bytes);
        expect(out.bytes).toBe(bytes);
      }),
      { numRuns: 200 },
    );
  });
});
