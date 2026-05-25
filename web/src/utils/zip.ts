// Minimal ZIP file creator — store method (no compression).
// Spec: APPNOTE.TXT §4.3 (local file header) + §4.4 (data descriptor) + §4.3.12 (central directory).
const encoder = new TextEncoder();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function localFileHeader(name: string, data: Uint8Array, crc: number, modTime: number, modDate: number): Uint8Array {
  const nameBytes = encoder.encode(name);
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);
  let off = 0;

  header.set([0x50, 0x4b, 0x03, 0x04], off);
  off += 4; // signature
  view.setUint16(off, 20, true);
  off += 2; // version needed
  view.setUint16(off, 0x0800, true);
  off += 2; // general purpose (UTF-8)
  view.setUint16(off, 0, true);
  off += 2; // compression: store
  view.setUint16(off, modTime, true);
  off += 2; // mod time
  view.setUint16(off, modDate, true);
  off += 2; // mod date
  view.setUint32(off, crc, true);
  off += 4; // crc-32
  view.setUint32(off, data.byteLength, true);
  off += 4; // compressed size
  view.setUint32(off, data.byteLength, true);
  off += 4; // uncompressed size
  view.setUint16(off, nameBytes.length, true);
  off += 2; // filename length
  view.setUint16(off, 0, true);
  off += 2; // extra field length
  header.set(nameBytes, off);

  return header;
}

function centralDirectoryEntry(name: string, data: Uint8Array, crc: number, offset: number, modTime: number, modDate: number): Uint8Array {
  const nameBytes = encoder.encode(name);
  const entry = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(entry.buffer);
  let off = 0;

  entry.set([0x50, 0x4b, 0x01, 0x02], off);
  off += 4; // signature
  view.setUint16(off, 20, true);
  off += 2; // version made by
  view.setUint16(off, 20, true);
  off += 2; // version needed
  view.setUint16(off, 0x0800, true);
  off += 2; // general purpose (UTF-8)
  view.setUint16(off, 0, true);
  off += 2; // compression: store
  view.setUint16(off, modTime, true);
  off += 2; // mod time
  view.setUint16(off, modDate, true);
  off += 2; // mod date
  view.setUint32(off, crc, true);
  off += 4; // crc-32
  view.setUint32(off, data.byteLength, true);
  off += 4; // compressed size
  view.setUint32(off, data.byteLength, true);
  off += 4; // uncompressed size
  view.setUint16(off, nameBytes.length, true);
  off += 2; // filename length
  view.setUint16(off, 0, true);
  off += 2; // extra field length
  view.setUint16(off, 0, true);
  off += 2; // file comment length
  view.setUint16(off, 0, true);
  off += 2; // disk number
  view.setUint16(off, 0, true);
  off += 2; // internal attributes
  view.setUint32(off, 0, true);
  off += 4; // external attributes
  view.setUint32(off, offset, true);
  off += 4; // relative offset
  entry.set(nameBytes, off);

  return entry;
}

function endOfCentralDirectory(entries: number, cdSize: number, cdOffset: number): Uint8Array {
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  let off = 0;

  eocd.set([0x50, 0x4b, 0x05, 0x06], off);
  off += 4; // signature
  view.setUint16(off, 0, true);
  off += 2; // disk number
  view.setUint16(off, 0, true);
  off += 2; // disk with CD
  view.setUint16(off, entries, true);
  off += 2; // entries on disk
  view.setUint16(off, entries, true);
  off += 2; // total entries
  view.setUint32(off, cdSize, true);
  off += 4; // CD size
  view.setUint32(off, cdOffset, true);
  off += 4; // CD offset
  view.setUint16(off, 0, true);
  off += 2; // comment length

  return eocd;
}

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

/** Creates a ZIP file (store method, UTF-8 names) from the provided entries. */
export function createZip(entries: ZipEntry[]): Blob {
  const parts: Uint8Array[] = [];
  const cdEntries: { name: string; data: Uint8Array; crc: number; offset: number }[] = [];

  const now = new Date();
  const { time: modTime, date: modDate } = dosDateTime(now);

  let currentOffset = 0;
  for (const entry of entries) {
    const crc = crc32(entry.data);
    const header = localFileHeader(entry.path, entry.data, crc, modTime, modDate);

    parts.push(header);
    parts.push(entry.data);
    cdEntries.push({ name: entry.path, data: entry.data, crc, offset: currentOffset });
    currentOffset += header.byteLength + entry.data.byteLength;
  }

  const cdOffset = currentOffset;
  const cdParts = cdEntries.map((e) => centralDirectoryEntry(e.name, e.data, e.crc, e.offset, modTime, modDate));
  let cdSize = 0;
  for (const cd of cdParts) {
    cdSize += cd.byteLength;
    parts.push(cd);
  }

  parts.push(endOfCentralDirectory(cdEntries.length, cdSize, cdOffset));

  const totalSize = currentOffset + cdSize + 22; // 22 = EOCD size
  const result = new Uint8Array(totalSize);
  let cursor = 0;
  for (const p of parts) {
    result.set(p, cursor);
    cursor += p.byteLength;
  }

  return new Blob([result], { type: "application/zip" });
}
