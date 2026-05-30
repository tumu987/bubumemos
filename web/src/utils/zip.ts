/**
 * 手写 ZIP Store 模式（无压缩）。
 * 零外部依赖，CRC-32 查表法，手写字节操作。
 *
 * 参考: APPNOTE.TXT - .ZIP File Format Specification
 */

// ============================================================================
// CRC-32 查表（256 项，多项式 0xEDB88320）
// ============================================================================

const CRC32_TABLE = new Uint32Array(256);

(function initCrc32Table() {
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    CRC32_TABLE[i] = crc;
  }
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ============================================================================
// 字节写入工具（手写小端序，不用 DataView）
// ============================================================================

function writeU16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
}

function writeU32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
  target[offset + 2] = (value >> 16) & 0xff;
  target[offset + 3] = (value >> 24) & 0xff;
}

// ============================================================================
// 工具
// ============================================================================

const encoder = new TextEncoder();

function encodeStr(str: string): Uint8Array {
  // 仅支持 ASCII 文件名（ZIP 标准）
  return encoder.encode(str);
}

// ============================================================================
// 公开 API
// ============================================================================

interface ZipEntry {
  /** 文件名（仅支持 ASCII，如 "attachments/photo.jpg"） */
  name: string;
  /** 文件数据 */
  data: Uint8Array | Blob;
}

/**
 * 创建 ZIP 文件（Store 模式，无压缩）。
 * 返回 Blob，可直接用于下载。
 */
export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  const parts: Uint8Array[] = [];
  const centralDirParts: Uint8Array[] = [];
  let centralDirSize = 0;
  let centralDirOffset = 0;

  for (const entry of entries) {
    // 统一转为 Uint8Array
    let raw: Uint8Array;
    if (entry.data instanceof Uint8Array) {
      raw = entry.data;
    } else {
      raw = new Uint8Array(await entry.data.arrayBuffer());
    }

    const nameBytes = encodeStr(entry.name);
    const nameLen = nameBytes.length;
    const crc = crc32(raw);
    const size = raw.length;

    // --- Local file header ---
    const localHeaderSize = 30 + nameLen;
    const localHeader = new Uint8Array(localHeaderSize);
    writeU32(localHeader, 0, 0x04034b50); // local file header signature
    writeU16(localHeader, 4, 20); // version needed
    writeU16(localHeader, 6, 0); // general purpose bit flag
    writeU16(localHeader, 8, 0); // compression method: store
    writeU16(localHeader, 10, 0); // last mod file time
    writeU16(localHeader, 12, 0); // last mod file date
    writeU32(localHeader, 14, crc);
    writeU32(localHeader, 18, size); // compressed size
    writeU32(localHeader, 22, size); // uncompressed size
    writeU16(localHeader, 26, nameLen);
    writeU16(localHeader, 28, 0); // extra field length
    localHeader.set(nameBytes, 30);

    parts.push(localHeader, raw);

    // --- Central directory entry ---
    const cdSize = 46 + nameLen;
    const cd = new Uint8Array(cdSize);
    writeU32(cd, 0, 0x02014b50); // central directory header signature
    writeU16(cd, 4, 20); // version made by
    writeU16(cd, 6, 20); // version needed
    writeU16(cd, 8, 0); // general purpose bit flag
    writeU16(cd, 10, 0); // compression method: store
    writeU16(cd, 12, 0); // last mod file time
    writeU16(cd, 14, 0); // last mod file date
    writeU32(cd, 16, crc);
    writeU32(cd, 20, size); // compressed size
    writeU32(cd, 24, size); // uncompressed size
    writeU16(cd, 28, nameLen);
    writeU16(cd, 30, 0); // extra field length
    writeU16(cd, 32, 0); // file comment length
    writeU16(cd, 34, 0); // disk number start
    writeU16(cd, 36, 0); // internal file attributes
    writeU32(cd, 38, 0); // external file attributes
    writeU32(cd, 42, centralDirOffset);
    cd.set(nameBytes, 46);

    centralDirParts.push(cd);
    centralDirSize += cdSize;
    centralDirOffset += localHeaderSize + size;
  }

  // --- End of central directory record ---
  const eocdSize = 22;
  const eocd = new Uint8Array(eocdSize);
  writeU32(eocd, 0, 0x06054b50); // end of central dir signature
  writeU16(eocd, 4, 0); // disk number
  writeU16(eocd, 6, 0); // disk with central dir
  writeU16(eocd, 8, entries.length); // total entries on this disk
  writeU16(eocd, 10, entries.length); // total entries
  writeU32(eocd, 12, centralDirSize);
  writeU32(eocd, 16, centralDirOffset);
  writeU16(eocd, 20, 0); // comment length

  parts.push(...centralDirParts, eocd);

  // 合片
  const totalSize = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return new Blob([result], { type: "application/zip" });
}
