// @ts-check
// Copied from miroleon/ai-showcase, src/lib/studio/zip.js, commit 6065cf3, without changes.
// Change it there first and copy it again, so the two copies stay the same. MIT License (see LICENSE).
/**
 * Write a ZIP file in the browser, without a library.
 *
 * A ZIP file is a list of entries, each with a small header and the file's bytes, followed by a
 * table of contents (the "central directory") and an end record that says where the table starts.
 * This writer stores files without compression ("stored"), which every unzip tool reads. Photos are
 * already compressed, so compressing again would save little.
 *
 * Format reference: PKWARE's APPNOTE.TXT, sections 4.3 and 4.4.
 */

/** CRC-32 checksum table (polynomial 0xEDB88320), made once. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** The checksum ZIP stores for every file, so unzip tools can tell when a file is damaged. @param {Uint8Array} bytes */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * @param {{ name: string, data: Uint8Array | string }[]} files  names may contain folders ("labels/train/a.txt")
 * @param {Date} [date] modification time stored for every file
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function createZip(files, date = new Date()) {
  const encoder = new TextEncoder();
  // DOS date and time, the format ZIP uses (two-second steps, years from 1980).
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  /** @type {Uint8Array[]} */
  const parts = [];
  /** @type {Uint8Array[]} */
  const directory = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const crc = crc32(data);

    // Local file header (30 bytes plus the name).
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // signature "PK\x03\x04"
    local.setUint16(4, 20, true); // version needed: 2.0
    local.setUint16(6, 0x0800, true); // flag: names are UTF-8
    local.setUint16(8, 0, true); // method: stored
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true); // compressed size
    local.setUint32(22, data.length, true); // uncompressed size
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true); // no extra field
    parts.push(new Uint8Array(local.buffer), name, data);

    // The matching entry in the central directory (46 bytes plus the name).
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true); // signature "PK\x01\x02"
    central.setUint16(4, 20, true); // made by: version 2.0
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, day, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true); // where this file's local header starts
    directory.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const directorySize = directory.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // signature "PK\x05\x06"
  end.setUint16(8, files.length, true); // entries on this disk
  end.setUint16(10, files.length, true); // entries in total
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true); // where the central directory starts

  const all = [...parts, ...directory, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of all) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/**
 * True when the bytes start like a ZIP file: "PK" followed by 3 and 4 (a file entry) or 5 and 6 (an
 * empty archive). The name of a file can lie or be missing; its first bytes cannot.
 * @param {Uint8Array} bytes
 */
export function isZip(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6));
}

/**
 * Read a ZIP file's entries (stored or deflated). Enough for the ZIP files this site writes and for
 * typical exports from labelling tools.
 * @param {Uint8Array} bytes
 * @returns {Promise<{ name: string, data: Uint8Array }[]>}
 */
export async function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Find the end record by searching backwards for its signature.
  let endAt = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      endAt = i;
      break;
    }
  }
  if (endAt < 0) throw new Error('This is not a ZIP file.');
  const count = view.getUint16(endAt + 10, true);
  let pos = view.getUint32(endAt + 16, true);
  const decoder = new TextDecoder();
  const entries = [];
  for (let n = 0; n < count; n++) {
    const method = view.getUint16(pos + 10, true);
    const size = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const localAt = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const raw = bytes.subarray(dataAt, dataAt + size);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = new Uint8Array(await new Response(new Blob([raw.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else throw new Error(`${name}: compression method ${method} is not supported.`);
    if (!name.endsWith('/')) entries.push({ name, data });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
