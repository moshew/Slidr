/*
 * The ZIP container of an Office file (ECMA-376 part 2, OPC). Reading takes the central
 * directory, which is where the sizes are even when a writer streamed its entries; writing
 * stores the parts the way PowerPoint does. Deflate is the platform's own (`CompressionStream`,
 * in the webview and in Node), so the app carries no compression library for it.
 */

/** One file of an archive, read when it is asked for. */
export interface ZipEntry {
  name: string;
  /** Its size once inflated. */
  size: number;
  read(): Promise<Uint8Array<ArrayBuffer>>;
}

/** A file to write into an archive. */
export interface ZipInput {
  name: string;
  data: Uint8Array;
  /** False stores it as it is: a picture or a video, which deflate does not make smaller. */
  compress?: boolean;
}

export class ZipError extends Error {
  override name = 'ZipError';
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function through(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const piped = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

const inflate = (data: Uint8Array) => through(data, new DecompressionStream('deflate-raw'));
const deflate = (data: Uint8Array) => through(data, new CompressionStream('deflate-raw'));

const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const EOCD64_LOCATOR = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** The first bytes of an OLE compound file: what Office writes for a file with a password. */
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Whether the bytes are an Office file protected with a password (or an old binary one). */
export function isCompoundFile(bytes: Uint8Array): boolean {
  return OLE.every((b, i) => bytes[i] === b);
}

/** The files of an archive, by name. Rejects with `ZipError` when the bytes are not one. */
export function readZip(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end record is in the last 64 kB and 22 bytes: its comment is at most 64 kB long.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError('not a zip archive');
  let count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  // A ZIP64 archive says so in a locator just before the end record.
  if ((offset === 0xffffffff || count === 0xffff) && end >= 20) {
    if (view.getUint32(end - 20, true) === EOCD64_LOCATOR) {
      const at = Number(view.getBigUint64(end - 12, true));
      if (at + 56 > bytes.length || view.getUint32(at, true) !== EOCD64) {
        throw new ZipError('broken zip64 directory');
      }
      count = Number(view.getBigUint64(at + 32, true));
      offset = Number(view.getBigUint64(at + 48, true));
    }
  }
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();
  let at = offset;
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL) {
      throw new ZipError('broken zip directory');
    }
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    let compressed = view.getUint32(at + 20, true);
    let size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    let local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    // The sizes and the offset of a large file are in its ZIP64 extra field, in this order.
    let extra = at + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = view.getUint16(extra, true);
      const length = view.getUint16(extra + 2, true);
      if (id === 1) {
        let field = extra + 4;
        const next = () => {
          const value = Number(view.getBigUint64(field, true));
          field += 8;
          return value;
        };
        if (size === 0xffffffff) size = next();
        if (compressed === 0xffffffff) compressed = next();
        if (local === 0xffffffff) local = next();
      }
      extra += 4 + length;
    }
    at = extraEnd + commentLength;
    if (flags & 1) throw new ZipError(`${name} is encrypted`);
    if (name.endsWith('/')) continue;
    const entrySize = size;
    const entryCompressed = compressed;
    const entryLocal = local;
    entries.set(name, {
      name,
      size: entrySize,
      async read() {
        if (view.getUint32(entryLocal, true) !== LOCAL) throw new ZipError(`broken entry ${name}`);
        const start =
          entryLocal +
          30 +
          view.getUint16(entryLocal + 26, true) +
          view.getUint16(entryLocal + 28, true);
        const data = bytes.subarray(start, start + entryCompressed);
        if (data.length < entryCompressed) throw new ZipError(`${name} is cut short`);
        if (method === 0) return data.slice();
        if (method === 8) return inflate(data);
        throw new ZipError(`${name} is compressed with method ${method}`);
      },
    });
  }
  return entries;
}

/** The time a file is stamped with, in DOS form: the archive's content does not depend on it. */
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1; // 1980-01-01

/** An archive of the files, in the order given. Rejects for a file of 4 GB or more. */
export async function writeZip(files: readonly ZipInput[]): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    let data: Uint8Array = file.data;
    let method = 0;
    if (file.compress !== false && file.data.length > 0) {
      const packed = await deflate(file.data);
      if (packed.length < file.data.length) {
        data = packed;
        method = 8;
      }
    }
    if (file.data.length >= 0xffffffff || offset >= 0xffffffff) {
      throw new ZipError(`${file.name} is too large for the archive`);
    }
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, LOCAL, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true); // names in UTF-8
    l.setUint16(8, method, true);
    l.setUint16(10, DOS_TIME, true);
    l.setUint16(12, DOS_DATE, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, file.data.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    const record = new Uint8Array(46 + name.length);
    const c = new DataView(record.buffer);
    c.setUint32(0, CENTRAL, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, method, true);
    c.setUint16(12, DOS_TIME, true);
    c.setUint16(14, DOS_DATE, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, file.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    record.set(name, 46);
    parts.push(local, data);
    central.push(record);
    offset += local.length + data.length;
  }
  const directorySize = central.reduce((sum, record) => sum + record.length, 0);
  if (offset + directorySize >= 0xffffffff || files.length >= 0xffff) {
    throw new ZipError('the archive is too large');
  }
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, EOCD, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + directorySize + end.length);
  let at = 0;
  for (const part of [...parts, ...central, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
