/**
 * A minimal, uncompressed ZIP writer and reader for backups that include
 * videos. Videos are already compressed, so storing them as-is costs
 * nothing, and any unzip tool can open the file. Entries are Blobs, so a
 * large backup is never held in memory as one buffer.
 */

const CHUNK = 8 << 20;
const LIMIT = 0xffffffff; // no ZIP64: each entry and the whole file stay under 4 GB

let table: Uint32Array | null = null;
function crcTable() {
  if (table) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

export async function crc32(blob: Blob): Promise<number> {
  const t = crcTable();
  let c = 0xffffffff;
  for (let at = 0; at < blob.size; at += CHUNK) {
    const bytes = new Uint8Array(
      await blob.slice(at, at + CHUNK).arrayBuffer(),
    );
    for (let i = 0; i < bytes.length; i++)
      c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipInput = { name: string; data: Blob };

export async function makeZip(entries: ZipInput[]): Promise<Blob> {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [],
    central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  const now = new Date(),
    time =
      (now.getHours() << 11) |
      (now.getMinutes() << 5) |
      (now.getSeconds() >> 1),
    date =
      ((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate();
  for (const e of entries) {
    const name = enc.encode(e.name),
      size = e.data.size,
      crc = await crc32(e.data);
    if (size >= LIMIT || offset + size + 30 + name.length >= LIMIT)
      throw Error(
        "Backup is larger than 4 GB. Back up fewer videos at a time.",
      );
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    parts.push(local.buffer, name, e.data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(12, time, true);
    dir.setUint16(14, date, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, size, true);
    dir.setUint32(24, size, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    const rec = new Uint8Array(46 + name.length);
    rec.set(new Uint8Array(dir.buffer));
    rec.set(name, 46);
    central.push(rec);
    offset += 30 + name.length + size;
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  if (offset + dirSize >= LIMIT)
    throw Error("Backup is larger than 4 GB. Back up fewer videos at a time.");
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], {
    type: "application/zip",
  });
}

export async function isZip(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4;
}

/** Lists a ZIP's stored entries. Each entry's data is a slice of the file. */
export async function readZip(file: Blob): Promise<Map<string, Blob>> {
  const damaged = () =>
    Error("This backup is damaged. Existing fits were not changed.");
  const tailStart = Math.max(0, file.size - 22 - 0xffff);
  const tail = new DataView(await file.slice(tailStart).arrayBuffer());
  let endAt = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--)
    if (tail.getUint32(i, true) === 0x06054b50) {
      endAt = i;
      break;
    }
  if (endAt < 0) throw damaged();
  const count = tail.getUint16(endAt + 10, true),
    dirSize = tail.getUint32(endAt + 12, true),
    dirAt = tail.getUint32(endAt + 16, true);
  if (dirAt + dirSize > file.size) throw damaged();
  const dir = new DataView(
    await file.slice(dirAt, dirAt + dirSize).arrayBuffer(),
  );
  const dec = new TextDecoder();
  const out = new Map<string, Blob>();
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > dir.byteLength || dir.getUint32(p, true) !== 0x02014b50)
      throw damaged();
    const method = dir.getUint16(p + 10, true),
      size = dir.getUint32(p + 20, true),
      nameLen = dir.getUint16(p + 28, true),
      extraLen = dir.getUint16(p + 30, true),
      commentLen = dir.getUint16(p + 32, true),
      localAt = dir.getUint32(p + 42, true);
    const name = dec.decode(
      new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLen),
    );
    p += 46 + nameLen + extraLen + commentLen;
    if (method !== 0)
      throw Error(
        "This ZIP was re-compressed by another program. Use the original Cadence backup.",
      );
    const local = new DataView(
      await file.slice(localAt, localAt + 30).arrayBuffer(),
    );
    if (local.byteLength < 30 || local.getUint32(0, true) !== 0x04034b50)
      throw damaged();
    const start =
      localAt + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    if (start + size > file.size) throw damaged();
    out.set(name, file.slice(start, start + size));
  }
  return out;
}
