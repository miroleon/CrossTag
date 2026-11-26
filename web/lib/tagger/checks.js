// @ts-check
// Copied from miroleon/ai-showcase, src/lib/tagger/checks.js, commit 6065cf3, without changes.
// Change it there first and copy it again, so the two copies stay the same. MIT License (see LICENSE).
/**
 * Dataset checks of the tagger (wiki/demos/tagger.md): problems worth fixing before a LoRA trains on
 * a folder of pictures. Pictures without a caption, pictures smaller than the training size, very
 * wide or tall pictures, the same picture twice, and a mix of file types.
 *
 * Duplicates are found with a "difference hash": the picture is shrunk to 9 x 8 grey pixels, and each
 * of the 64 bits says whether a pixel is brighter than its right neighbour. Two copies of a photo,
 * even resized or saved again as JPEG, give the same or almost the same 64 bits, while different
 * photos differ in about half of them. Counting the differing bits (the Hamming distance) finds
 * near-duplicates that a byte-for-byte comparison would miss.
 *
 * Part of the tagger library, which has no imports from the rest of the site (ADR 0031).
 */
import { extensionOf } from './captions.js';

/**
 * What the checks need to know about one picture.
 * @typedef {object} CheckItem
 * @property {string} name
 * @property {string} caption
 * @property {number} width
 * @property {number} height
 * @property {string} [hash]   difference hash as 16 hex digits
 */

/**
 * One kind of problem and the pictures it concerns. For duplicates, `groups` holds the pictures that
 * look alike, one list per group.
 * @typedef {object} Finding
 * @property {'no-caption' | 'small' | 'aspect' | 'duplicate' | 'types'} kind
 * @property {string[]} names
 * @property {string[][]} [groups]
 * @property {string[]} [types]
 */

/** Wider than twice the height (or the reverse): trainers crop or shrink such pictures a lot. */
export const MAX_ASPECT = 2;

/** At most this many of the 64 bits may differ for two pictures to count as near-duplicates. */
export const DUPLICATE_DISTANCE = 6;

/**
 * Run every check.
 * @param {CheckItem[]} items
 * @param {{ trainingSize: number }} options  the side length the trainer works at (512 or 1024)
 * @returns {Finding[]} only the kinds that found something
 */
export function checkDataset(items, { trainingSize }) {
  /** @type {Finding[]} */
  const findings = [];
  const add = (/** @type {Finding} */ f) => f.names.length && findings.push(f);

  add({ kind: 'no-caption', names: items.filter((i) => !i.caption.trim()).map((i) => i.name) });
  // The shorter side counts: trainers scale the picture so its shorter side fits the training size.
  add({ kind: 'small', names: items.filter((i) => i.width > 0 && Math.min(i.width, i.height) < trainingSize).map((i) => i.name) });
  add({ kind: 'aspect', names: items.filter((i) => i.width > 0 && Math.max(i.width, i.height) / Math.min(i.width, i.height) > MAX_ASPECT).map((i) => i.name) });

  const groups = duplicateGroups(items);
  if (groups.length) findings.push({ kind: 'duplicate', names: groups.flat(), groups });

  const types = [...new Set(items.map((i) => normalType(i.name)))].sort();
  if (types.length > 1) findings.push({ kind: 'types', names: [], types });
  return findings;
}

/** "jpeg" and "jpg" are the same type. @param {string} name */
const normalType = (name) => extensionOf(name).replace('jpeg', 'jpg');

/**
 * Pictures whose hashes differ in few bits, grouped. Every pair is compared, which is quick for the
 * few hundred pictures a LoRA dataset has.
 * @param {CheckItem[]} items
 * @returns {string[][]}
 */
export function duplicateGroups(items) {
  const hashed = items.filter((i) => i.hash);
  /** @type {number[]} each picture's group: the index of the first picture it matched */
  const parent = hashed.map((_, i) => i);
  const root = (/** @type {number} */ i) => {
    while (parent[i] !== i) i = parent[i];
    return i;
  };
  for (let a = 0; a < hashed.length; a++) {
    for (let b = a + 1; b < hashed.length; b++) {
      if (hammingDistance(/** @type {string} */ (hashed[a].hash), /** @type {string} */ (hashed[b].hash)) <= DUPLICATE_DISTANCE) parent[root(b)] = root(a);
    }
  }
  /** @type {Map<number, string[]>} */
  const groups = new Map();
  hashed.forEach((item, i) => {
    const r = root(i);
    groups.set(r, [...(groups.get(r) ?? []), item.name]);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}

/**
 * The difference hash of a 9 x 8 grey picture.
 * @param {ArrayLike<number>} grey  72 brightness values, row by row
 * @returns {string} 16 hex digits
 */
export function differenceHash(grey) {
  if (grey.length !== 72) throw new Error('The difference hash needs 9 x 8 = 72 values.');
  let hex = '';
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) byte = (byte << 1) | (grey[row * 9 + col] > grey[row * 9 + col + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** How many of the 64 bits differ between two hashes. @param {string} a @param {string} b */
export function hammingDistance(a, b) {
  let bits = 0;
  for (let i = 0; i < a.length; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

/**
 * Shrink a picture to 9 x 8 pixels and return their brightness, for differenceHash. Runs in the
 * browser (OffscreenCanvas, or a canvas element where OffscreenCanvas is missing).
 * @param {ImageBitmap} bitmap
 * @returns {Uint8Array}
 */
export function greyGrid(bitmap) {
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(9, 8) : Object.assign(document.createElement('canvas'), { width: 9, height: 8 });
  const ctx = /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, 9, 8);
  const { data } = ctx.getImageData(0, 0, 9, 8);
  const grey = new Uint8Array(72);
  // Brightness as the eye sees it: green counts most, blue least (ITU-R BT.601 weights).
  for (let i = 0; i < 72; i++) grey[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
  return grey;
}
