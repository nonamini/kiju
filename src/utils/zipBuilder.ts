/**
 * Minimal, zero-dependency PKZIP archive builder (STORE method 0, UTF-8 flag).
 * Preserves directory hierarchy (e.g. virtual folder paths with Japanese names)
 * and deduplicates colliding entry paths automatically.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

export interface ZipEntry {
  path: string;
  content: string | Uint8Array;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function deduplicateEntryPath(rawPath: string, usedPaths: Set<string>): string {
  const normalized = rawPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');

  if (!usedPaths.has(normalized)) {
    usedPaths.add(normalized);
    return normalized;
  }

  const lastSlash = normalized.lastIndexOf('/');
  const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : '';
  const file = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const lastDot = file.lastIndexOf('.');
  const stem = lastDot > 0 ? file.slice(0, lastDot) : file;
  const ext = lastDot > 0 ? file.slice(lastDot) : '';

  let counter = 2;
  while (true) {
    const candidate = `${dir}${stem} (${counter})${ext}`;
    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate);
      return candidate;
    }
    counter++;
  }
}

function writeUint16LE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}

function writeUint32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/**
 * Builds a valid PKZIP binary archive containing the specified entries.
 * Uses STORE compression (method 0) and UTF-8 filename flag (0x0800).
 */
export function buildZipArchive(
  entries: ZipEntry[],
  now: Date = new Date()
): Uint8Array {
  const encoder = new TextEncoder();
  const { dosTime, dosDate } = getDosDateTime(now);
  const usedPaths = new Set<string>();

  interface PreparedEntry {
    nameBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc: number;
    localHeaderOffset: number;
  }

  const prepared: PreparedEntry[] = [];
  let localSectionSize = 0;
  let centralSectionSize = 0;

  for (const entry of entries) {
    const uniquePath = deduplicateEntryPath(entry.path, usedPaths);
    const nameBytes = encoder.encode(uniquePath);
    const dataBytes =
      typeof entry.content === 'string'
        ? encoder.encode(entry.content)
        : entry.content;
    const crc = crc32(dataBytes);

    prepared.push({
      nameBytes,
      dataBytes,
      crc,
      localHeaderOffset: localSectionSize,
    });

    localSectionSize += 30 + nameBytes.length + dataBytes.length;
    centralSectionSize += 46 + nameBytes.length;
  }

  const totalSize = localSectionSize + centralSectionSize + 22;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // 1. Write Local File Headers + Data
  let cursor = 0;
  for (const item of prepared) {
    writeUint32LE(view, cursor, 0x04034b50); // Local file header signature
    writeUint16LE(view, cursor + 4, 20); // Version needed to extract (2.0)
    writeUint16LE(view, cursor + 6, 0x0800); // General purpose bit flag: UTF-8
    writeUint16LE(view, cursor + 8, 0); // Compression method: STORE
    writeUint16LE(view, cursor + 10, dosTime);
    writeUint16LE(view, cursor + 12, dosDate);
    writeUint32LE(view, cursor + 14, item.crc);
    writeUint32LE(view, cursor + 18, item.dataBytes.length);
    writeUint32LE(view, cursor + 22, item.dataBytes.length);
    writeUint16LE(view, cursor + 26, item.nameBytes.length);
    writeUint16LE(view, cursor + 28, 0); // Extra field length
    output.set(item.nameBytes, cursor + 30);
    output.set(item.dataBytes, cursor + 30 + item.nameBytes.length);
    cursor += 30 + item.nameBytes.length + item.dataBytes.length;
  }

  // 2. Write Central Directory Headers
  const centralDirOffset = cursor;
  for (const item of prepared) {
    writeUint32LE(view, cursor, 0x02014b50); // Central directory signature
    writeUint16LE(view, cursor + 4, 20); // Version made by
    writeUint16LE(view, cursor + 6, 20); // Version needed
    writeUint16LE(view, cursor + 8, 0x0800); // UTF-8 flag
    writeUint16LE(view, cursor + 10, 0); // Compression method: STORE
    writeUint16LE(view, cursor + 12, dosTime);
    writeUint16LE(view, cursor + 14, dosDate);
    writeUint32LE(view, cursor + 16, item.crc);
    writeUint32LE(view, cursor + 20, item.dataBytes.length);
    writeUint32LE(view, cursor + 24, item.dataBytes.length);
    writeUint16LE(view, cursor + 28, item.nameBytes.length);
    writeUint16LE(view, cursor + 30, 0); // Extra field length
    writeUint16LE(view, cursor + 32, 0); // File comment length
    writeUint16LE(view, cursor + 34, 0); // Disk number start
    writeUint16LE(view, cursor + 36, 0); // Internal file attributes
    writeUint32LE(view, cursor + 38, 0); // External file attributes
    writeUint32LE(view, cursor + 42, item.localHeaderOffset);
    output.set(item.nameBytes, cursor + 46);
    cursor += 46 + item.nameBytes.length;
  }

  // 3. Write End of Central Directory Record (EOCD)
  writeUint32LE(view, cursor, 0x06054b50);
  writeUint16LE(view, cursor + 4, 0); // Disk number
  writeUint16LE(view, cursor + 6, 0); // Start disk
  writeUint16LE(view, cursor + 8, prepared.length);
  writeUint16LE(view, cursor + 10, prepared.length);
  writeUint32LE(view, cursor + 12, centralSectionSize);
  writeUint32LE(view, cursor + 16, centralDirOffset);
  writeUint16LE(view, cursor + 20, 0); // Comment length

  return output;
}
