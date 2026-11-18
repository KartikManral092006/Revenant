import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createZip } from '../lib/reverse-spec/zip';

// Independent table-based CRC-32 so the reader does not reuse the writer's implementation.
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ReadEntry {
  name: string;
  data: Buffer;
  crc: number;
}

/** Minimal reader for stored ZIPs: walks the central directory, then reads each local entry. */
function readZip(zip: Buffer): ReadEntry[] {
  const eocd = zip.length - 22;
  expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);
  const count = zip.readUInt16LE(eocd + 10);
  expect(zip.readUInt16LE(eocd + 8)).toBe(count);
  let p = zip.readUInt32LE(eocd + 16);
  expect(p + zip.readUInt32LE(eocd + 12)).toBe(eocd);

  const out: ReadEntry[] = [];
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    expect(zip.readUInt16LE(p + 10)).toBe(0); // stored
    const crc = zip.readUInt32LE(p + 16);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOff = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;

    expect(zip.readUInt32LE(localOff)).toBe(0x04034b50);
    expect(zip.readUInt32LE(localOff + 14)).toBe(crc);
    expect(zip.readUInt32LE(localOff + 22)).toBe(size);
    const lName = zip.readUInt16LE(localOff + 26);
    const lExtra = zip.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lName + lExtra;
    expect(zip.subarray(localOff + 30, localOff + 30 + lName).toString('utf8')).toBe(name);
    out.push({ name, data: zip.subarray(start, start + size), crc });
  }
  return out;
}

// Feature: revenant-mvp, Property 24: ZIP writer round trip
// **Validates: Requirements 10.2**
describe('Property 24: ZIP writer round trip', () => {
  const nameArb = fc
    .array(fc.string({ unit: 'binary', minLength: 1, maxLength: 12 }).filter((s) => !s.includes('\0')), {
      minLength: 1,
      maxLength: 3,
    })
    .map((parts) => parts.join('/'))
    .filter((n) => Buffer.from(n, 'utf8').toString('utf8') === n);

  const entryArb = fc.record({
    name: nameArb,
    data: fc.oneof(
      fc.uint8Array({ maxLength: 512 }),
      fc.string({ maxLength: 200 }),
    ),
  });

  it('reading the archive yields the same names, bytes and CRC-32', () => {
    fc.assert(
      fc.property(fc.uniqueArray(entryArb, { selector: (e) => e.name, maxLength: 10 }), (entries) => {
        const read = readZip(createZip(entries));
        expect(read.length).toBe(entries.length);
        entries.forEach((e, i) => {
          const bytes = typeof e.data === 'string' ? Buffer.from(e.data, 'utf8') : Buffer.from(e.data);
          expect(read[i].name).toBe(e.name);
          expect(read[i].data.equals(bytes)).toBe(true);
          expect(read[i].crc).toBe(crc32(bytes));
          expect(crc32(read[i].data)).toBe(read[i].crc);
        });
      }),
      { numRuns: 200 },
    );
  });

  it('empty archive is just an end record', () => {
    expect(readZip(createZip([]))).toEqual([]);
  });

  it('rejects duplicate names', () => {
    expect(() => createZip([{ name: 'a', data: '' }, { name: 'a', data: '' }])).toThrow();
  });
});
