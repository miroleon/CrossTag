// @ts-check
// Copied from miroleon/ai-showcase, src/lib/tagger/export.js, commit 6065cf3, without changes.
// Change it there first and copy it again, so the two copies stay the same. MIT License (see LICENSE).
/**
 * Export and import of a captioned dataset (wiki/demos/tagger.md). The functions here turn pictures
 * and captions into a list of files, and a list of files back into pictures and captions; the page
 * packs the list into a ZIP or reads it from one. Keeping the ZIP out of this file keeps the tagger
 * library free of imports from the rest of the site (ADR 0031).
 *
 * The layouts, one per family of training tools:
 *
 *   captions     the folder as the tagger keeps it: pictures, captions, tagger.json. Opening this ZIP
 *                again continues the work.
 *   folder       dataset/ with pictures and captions side by side, the trigger word in every caption.
 *                ai-toolkit and OneTrainer read this folder.
 *   kohya        img/10_name/ ... kohya's sd-scripts read the number before the "_" as the
 *                repeats: how many times each picture is shown per pass over the data.
 *   imagefolder  train/ with the pictures and one metadata.jsonl, the format of Hugging Face datasets.
 *
 * Every layout carries DATASET.md, the dataset card.
 */
import { captionName, isImageName, naturalOrder, safeBase, stemOf, withTrigger } from './captions.js';
import { META_FILE, readMeta, writeMeta } from './dataset.js';

/** @typedef {import('./dataset.js').DatasetMeta} DatasetMeta */
/** @typedef {'captions' | 'folder' | 'kohya' | 'imagefolder'} Layout */

export const LAYOUTS = /** @type {const} */ (['folder', 'kohya', 'imagefolder', 'captions']);

/**
 * @typedef {object} ExportPicture
 * @property {string} name
 * @property {Uint8Array} data
 * @property {string} caption
 */

/**
 * @typedef {object} ExportOptions
 * @property {Layout} layout
 * @property {DatasetMeta} meta
 * @property {string} card        the text of DATASET.md (datasetCard below)
 * @property {number} [repeats]   for kohya, default 10
 */

/**
 * The files of an export, under one top folder named after the dataset.
 * @param {ExportPicture[]} pictures
 * @param {ExportOptions} options
 * @returns {{ name: string, data: Uint8Array | string }[]}
 */
export function exportFiles(pictures, { layout, meta, card, repeats = 10 }) {
  const root = safeBase(meta.card.title || meta.trigger || 'dataset');
  const sorted = [...pictures].sort((a, b) => naturalOrder(a.name, b.name));
  /** @type {{ name: string, data: Uint8Array | string }[]} */
  const files = [];
  const caption = (/** @type {ExportPicture} */ p) => (layout === 'captions' ? p.caption : withTrigger(p.caption, meta.trigger));

  if (layout === 'imagefolder') {
    const lines = sorted.map((p) => JSON.stringify({ file_name: p.name, text: caption(p) }));
    for (const p of sorted) files.push({ name: `${root}/train/${p.name}`, data: p.data });
    files.push({ name: `${root}/train/metadata.jsonl`, data: `${lines.join('\n')}\n` });
  } else {
    const folder = {
      captions: root,
      folder: `${root}/dataset`,
      kohya: `${root}/img/${Math.max(1, Math.round(repeats))}_${safeBase(meta.trigger || root)}`,
    }[layout];
    for (const p of sorted) {
      files.push({ name: `${folder}/${p.name}`, data: p.data });
      files.push({ name: `${folder}/${captionName(p.name)}`, data: caption(p) });
    }
  }
  if (layout === 'captions') files.push({ name: `${root}/${META_FILE}`, data: writeMeta(meta) });
  files.push({ name: `${root}/DATASET.md`, data: card });
  return files;
}

/**
 * Pictures and captions from a list of files: a ZIP's entries, or files a person picked or dropped.
 * A caption belongs to the picture with the same name in the same folder. Pictures with the same
 * name in different folders get a number added, since the tagger shows one flat list.
 * @param {{ name: string, data: Uint8Array }[]} files   names may contain folders
 * @returns {{ pictures: { name: string, data: Uint8Array, caption: string }[], meta: DatasetMeta | null }}
 */
export function importFiles(files) {
  const decoder = new TextDecoder();
  const folderOf = (/** @type {string} */ path) => path.slice(0, path.lastIndexOf('/') + 1);
  // Skip the hidden files macOS adds to ZIPs (__MACOSX/, ._name).
  const visible = files.filter((f) => !/(^|\/)(__MACOSX\/|\.)/.test(f.name));
  /** @type {Map<string, string>} */
  const captions = new Map();
  for (const f of visible.filter((f) => /\.txt$/i.test(f.name))) captions.set(folderOf(f.name) + stemOf(f.name), decoder.decode(f.data));

  /** @type {DatasetMeta | null} */
  let meta = null;
  const metaFile = visible.find((f) => f.name.split('/').pop() === META_FILE);
  if (metaFile) {
    try {
      meta = readMeta(JSON.parse(decoder.decode(metaFile.data)));
    } catch {
      meta = null;
    }
  }

  const used = new Set();
  const pictures = [];
  for (const f of visible.filter((f) => isImageName(f.name)).sort((a, b) => naturalOrder(a.name, b.name))) {
    let name = f.name.split('/').pop() ?? f.name;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stemOf(f.name)}-${n}${f.name.slice(f.name.lastIndexOf('.'))}`;
    used.add(name.toLowerCase());
    pictures.push({ name, data: f.data, caption: (captions.get(folderOf(f.name) + stemOf(f.name)) ?? '').trim() });
  }
  return { pictures, meta };
}

/**
 * Labels for the dataset card, in the language of the page that writes it.
 * @typedef {object} CardLabels
 * @property {string} untitled
 * @property {string} author
 * @property {string} purpose
 * @property {string} license
 * @property {string} trigger
 * @property {string} target
 * @property {string} count
 * @property {string} created
 * @property {string} notes
 * @property {string} pictures
 * @property {string} file
 * @property {string} source
 * @property {string} sourceNote
 * @property {string} people
 * @property {string} missing
 * @property {Record<string, string>} sources   own, licensed, other
 * @property {Record<string, string>} peopleValues   none, agreed, unknown
 * @property {Record<string, string>} targets
 */

/** A value for one cell of a Markdown table: no line breaks, and pipes escaped. @param {string} s */
const cell = (s) => s.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();

/**
 * DATASET.md: who made the dataset, why, under which license, and where each picture comes from.
 * @param {DatasetMeta} meta
 * @param {string[]} names   the pictures in the dataset
 * @param {CardLabels} labels
 * @param {Date} [date]
 */
export function datasetCard(meta, names, labels, date = new Date()) {
  const { card } = meta;
  const value = (/** @type {string} */ s) => cell(s) || labels.missing;
  const lines = [
    `# ${cell(card.title) || labels.untitled}`,
    '',
    `- ${labels.author}: ${value(card.author)}`,
    `- ${labels.purpose}: ${value(card.purpose)}`,
    `- ${labels.license}: ${value(card.license)}`,
    `- ${labels.trigger}: ${value(meta.trigger)}`,
    `- ${labels.target}: ${labels.targets[meta.target] ?? meta.target}`,
    `- ${labels.count}: ${names.length}`,
    `- ${labels.created}: ${date.toISOString().slice(0, 10)}`,
    '',
  ];
  if (card.notes.trim()) lines.push(`## ${labels.notes}`, '', card.notes.trim(), '');
  lines.push(`## ${labels.pictures}`, '', `| ${labels.file} | ${labels.source} | ${labels.sourceNote} | ${labels.people} |`, '|---|---|---|---|');
  for (const name of [...names].sort(naturalOrder)) {
    const info = meta.pictures[name];
    const source = info?.source ? labels.sources[info.source] : labels.missing;
    const people = info?.people ? labels.peopleValues[info.people] : labels.missing;
    lines.push(`| ${cell(name)} | ${source} | ${cell(info?.sourceNote ?? '')} | ${people} |`);
  }
  return `${lines.join('\n')}\n`;
}
