import { crc32 } from "node:zlib";

/** One file to place in the archive. `name` uses forward slashes, e.g. `steering/tech.md`. */
export interface ZipEntry {
  name: string;
  data: Uint8Array | string;
}

const UTF8_FLAG = 0x0800;
const VERSION = 20;
// Fixed DOS date/time (1980-01-01 00:00:00) so output is deterministic.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

/**
 * Builds a store-only (method 0, no compression) ZIP archive.
 * Limits: no ZIP64, so at most 65535 entries and 4 GiB total.
 */
export function createZip(entries: readonly ZipEntry[]): Buffer {
  if (entries.length > 0xffff) throw new RangeError("Too many ZIP entries");
  const seen = new Set<string>();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (seen.has(entry.name)) throw new Error(`Duplicate ZIP entry name: ${entry.name}`);
    seen.add(entry.name);
    const name = Buffer.from(entry.name, "utf8");
    const data = typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : Buffer.from(entry.data);
    if (name.length > 0xffff) throw new RangeError("ZIP entry name too long");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION, 4); // version made by
    central.writeUInt16LE(VERSION, 6); // version needed
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    // extra, comment, disk, internal attrs, external attrs stay 0
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += 30 + name.length + data.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  if (offset + centralSize > 0xffffffff) throw new RangeError("ZIP archive too large");

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, ...centrals, end]);
}
