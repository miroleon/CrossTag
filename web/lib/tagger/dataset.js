// @ts-check
// Copied from miroleon/ai-showcase, src/lib/tagger/dataset.js, commit 6065cf3, without changes.
// Change it there first and copy it again, so the two copies stay the same. MIT License (see LICENSE).
/**
 * What the tagger knows about a dataset besides the captions: the trigger word, the model the LoRA
 * is for, the dataset card (who made it, why, under which license) and, per picture, where it comes
 * from and whether it shows people who agreed. The tagger keeps this in a file "tagger.json" next to
 * the pictures, so it travels with the folder or the ZIP, and writes it out as DATASET.md on export
 * (wiki/guides/ethics-and-consent.md says why a dataset needs a card).
 *
 * Part of the tagger library, which has no imports from the rest of the site (ADR 0031).
 */

/** Name of the file that holds this information in the dataset folder. */
export const META_FILE = 'tagger.json';

/**
 * The models a LoRA can be trained for, with how they like their captions. SD 1.5 and SDXL read
 * captions through CLIP, trained on short alt texts, so short comma-separated tags suit them and the
 * 77-token limit matters. Z-Image and FLUX read captions through a language model and were trained on
 * long descriptions, so whole sentences suit them. `size` is the usual training size in pixels.
 */
export const TARGETS = /** @type {const} */ ({
  sd15: { style: 'tags', size: 512, clip: true },
  sdxl: { style: 'tags', size: 1024, clip: true },
  zimage: { style: 'sentences', size: 1024, clip: false },
  flux: { style: 'sentences', size: 1024, clip: false },
});

/** @typedef {keyof typeof TARGETS} Target */

/** Where a picture comes from. */
export const SOURCES = /** @type {const} */ (['own', 'licensed', 'other']);
/** Whether a picture shows people, and whether they agreed to be in the dataset. */
export const PEOPLE = /** @type {const} */ (['none', 'agreed', 'unknown']);

/**
 * @typedef {object} PictureInfo
 * @property {'' | typeof SOURCES[number]} source
 * @property {string} sourceNote   a link, a license, a photographer's name
 * @property {'' | typeof PEOPLE[number]} people
 */

/**
 * @typedef {object} Card
 * @property {string} title
 * @property {string} author
 * @property {string} purpose
 * @property {string} license
 * @property {string} notes
 */

/**
 * @typedef {object} DatasetMeta
 * @property {string} trigger
 * @property {Target} target
 * @property {Card} card
 * @property {Record<string, PictureInfo>} pictures   by picture file name
 */

/** @returns {DatasetMeta} */
export function emptyMeta() {
  return { trigger: '', target: 'zimage', card: { title: '', author: '', purpose: '', license: '', notes: '' }, pictures: {} };
}

/** @returns {PictureInfo} */
export const emptyPictureInfo = () => ({ source: '', sourceNote: '', people: '' });

/** @param {unknown} v */
const text = (v) => (typeof v === 'string' ? v : '');

/**
 * Read tagger.json, keeping only known fields with the right types, so a damaged or hand-edited
 * file cannot break the page.
 * @param {unknown} json
 * @returns {DatasetMeta}
 */
export function readMeta(json) {
  const meta = emptyMeta();
  if (!json || typeof json !== 'object') return meta;
  const data = /** @type {Record<string, any>} */ (json);
  meta.trigger = text(data.trigger);
  if (typeof data.target === 'string' && data.target in TARGETS) meta.target = /** @type {Target} */ (data.target);
  const card = data.card && typeof data.card === 'object' ? data.card : {};
  for (const key of /** @type {(keyof Card)[]} */ (Object.keys(meta.card))) meta.card[key] = text(card[key]);
  if (data.pictures && typeof data.pictures === 'object') {
    for (const [name, info] of Object.entries(data.pictures)) {
      if (!info || typeof info !== 'object') continue;
      meta.pictures[name] = {
        source: SOURCES.includes(info.source) ? info.source : '',
        sourceNote: text(info.sourceNote),
        people: PEOPLE.includes(info.people) ? info.people : '',
      };
    }
  }
  return meta;
}

/**
 * The text of tagger.json. Pictures without any information are left out.
 * @param {DatasetMeta} meta
 */
export function writeMeta(meta) {
  const pictures = Object.fromEntries(Object.entries(meta.pictures).filter(([, p]) => p.source || p.sourceNote || p.people));
  return `${JSON.stringify({ format: 'tagger', version: 1, ...meta, pictures }, null, 2)}\n`;
}

/**
 * Move the per-picture information along when pictures are renamed.
 * @param {DatasetMeta} meta @param {{ from: string, to: string }[]} plan
 */
export function renameInMeta(meta, plan) {
  /** @type {Record<string, PictureInfo>} */
  const pictures = {};
  const moved = new Map(plan.map((p) => [p.from, p.to]));
  for (const [name, info] of Object.entries(meta.pictures)) pictures[moved.get(name) ?? name] = info;
  meta.pictures = pictures;
}
