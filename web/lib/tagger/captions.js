// @ts-check
// Copied from miroleon/ai-showcase, src/lib/tagger/captions.js, commit 6065cf3, without changes.
// Change it there first and copy it again, so the two copies stay the same. MIT License (see LICENSE).
/**
 * Caption logic of the tagger (wiki/demos/tagger.md): which files are pictures, where a picture's
 * caption file is, tags and their counts, bulk edits, renaming, the trigger word and a rough token
 * count. Plain functions on strings, so the unit tests can check every rule.
 *
 * The tagger keeps one caption per picture, in a .txt file with the picture's name ("cat.jpg" and
 * "cat.txt"). Training tools for image LoRAs (ai-toolkit, OneTrainer, kohya) read captions in this
 * layout, and so does CrossTag, the desktop app this library comes from.
 *
 * This folder (src/lib/tagger/) has no imports from the rest of the site, so a script can copy it
 * into the web version of CrossTag unchanged (ADR 0031).
 */

/** File types the tagger opens. Every trainer the export targets reads these. */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

/** @param {string} name */
export const extensionOf = (name) => (/\.([^./]+)$/.exec(name)?.[1] ?? '').toLowerCase();

/** @param {string} name */
export const isImageName = (name) => IMAGE_EXTENSIONS.includes(extensionOf(name)) && !name.startsWith('.');

/** "photos/cat.jpg" has the stem "cat". @param {string} name */
export const stemOf = (name) => (name.split('/').pop() ?? name).replace(/\.[^.]+$/, '');

/** The caption file that belongs to a picture: "cat.jpg" has "cat.txt". @param {string} imageName */
export const captionName = (imageName) => `${stemOf(imageName)}.txt`;

/**
 * Sort file names the way a person counts: "img2" before "img10".
 * @param {string} a @param {string} b
 */
export const naturalOrder = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

// --- tags --------------------------------------------------------------------------------------

/**
 * The tags of a caption: the parts between commas, trimmed. Captions in sentence style also split
 * at commas, which is harmless; the tag overview is most useful for tag-style captions.
 * @param {string} caption
 * @returns {string[]}
 */
export function splitTags(caption) {
  return caption
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/**
 * How often each tag appears, counted once per caption. Most frequent first, then alphabetical.
 * @param {string[]} captions
 * @returns {{ tag: string, count: number }[]}
 */
export function countTags(captions) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const caption of captions) {
    for (const tag of new Set(splitTags(caption))) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || naturalOrder(a.tag, b.tag));
}

/** @param {string} caption @param {string} tag */
export const hasTag = (caption, tag) => splitTags(caption).includes(tag.trim());

/**
 * Replace one tag with another in a caption, or remove it when `to` is empty. Only whole tags
 * change: renaming "red" leaves "red lips" alone. A tag that would appear twice is kept once.
 * @param {string} caption @param {string} from @param {string} to
 */
export function renameTag(caption, from, to) {
  const tags = splitTags(caption);
  const old = from.trim();
  if (!tags.includes(old)) return caption;
  const next = to.trim();
  /** @type {string[]} */
  const out = [];
  for (const tag of tags) {
    const value = tag === old ? next : tag;
    if (value && !out.includes(value)) out.push(value);
  }
  return out.join(', ');
}

// --- bulk edits --------------------------------------------------------------------------------

/**
 * Join two pieces of caption text with a comma, leaving out empty ones.
 * @param {string} first @param {string} second
 */
function joinParts(first, second) {
  const a = first.trim();
  const b = second.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a.replace(/,$/, '')}, ${b}`;
}

/** Put text before a caption: "sketch" and "a cat" give "sketch, a cat". @param {string} caption @param {string} text */
export const addToStart = (caption, text) => joinParts(text, caption);

/** Put text after a caption. @param {string} caption @param {string} text */
export const addToEnd = (caption, text) => joinParts(caption, text);

/** Characters with a meaning in regular expressions, escaped so they match as typed. @param {string} s */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replace every occurrence of `search` with `replacement`. The search text is taken literally, so
 * "(1)" or "a.b" match as typed.
 * @param {string} caption @param {string} search @param {string} replacement
 * @param {{ ignoreCase?: boolean }} [options]
 */
export function replaceText(caption, search, replacement, { ignoreCase = false } = {}) {
  if (!search) return caption;
  if (!ignoreCase) return caption.split(search).join(replacement);
  // A function as the replacement keeps "$1" or "$&" in the user's text from being read as patterns.
  return caption.replace(new RegExp(escapeRegExp(search), 'gi'), () => replacement);
}

/**
 * Apply one edit to some captions and keep the old values, so the page can undo the change once.
 * @param {Map<string, string>} captions  picture name to caption; changed in place
 * @param {string[]} names                the pictures the edit applies to
 * @param {(caption: string) => string} edit
 * @returns {{ changed: string[], undo: Map<string, string> }}
 */
export function bulkEdit(captions, names, edit) {
  /** @type {string[]} */
  const changed = [];
  const undo = new Map();
  for (const name of names) {
    const before = captions.get(name) ?? '';
    const after = edit(before);
    if (after === before) continue;
    undo.set(name, before);
    captions.set(name, after);
    changed.push(name);
  }
  return { changed, undo };
}

// --- trigger word ------------------------------------------------------------------------------

/**
 * The caption as the export writes it: the trigger word first, unless the caption already starts
 * with it. The trigger word is the name the LoRA learns ("s30ulphoto"); a rare word works better
 * than a common one, since the model has no old meaning to unlearn.
 * @param {string} caption @param {string} trigger
 */
export function withTrigger(caption, trigger) {
  const word = trigger.trim();
  if (!word) return caption.trim();
  const first = splitTags(caption)[0] ?? '';
  if (first === word || first.startsWith(`${word} `)) return caption.trim();
  return addToStart(caption, word);
}

// --- renaming ----------------------------------------------------------------------------------

/**
 * New names for a set of pictures: base-01.jpg, base-02.png and so on, in natural order. Numbers
 * have two digits up to 99 pictures and more after that, so the files still sort in order.
 * Each picture keeps its own extension, written in lower case.
 * @param {string[]} names @param {string} base
 * @returns {{ from: string, to: string }[]}
 */
export function renamePlan(names, base) {
  const clean = safeBase(base);
  const sorted = [...names].sort(naturalOrder);
  const width = Math.max(2, String(sorted.length).length);
  return sorted.map((from, i) => ({ from, to: `${clean}-${String(i + 1).padStart(width, '0')}.${extensionOf(from)}` }));
}

/**
 * A base name that is safe as a file name on Windows, macOS and Linux: no slashes or other
 * reserved characters, no spaces at the ends.
 * @param {string} base
 */
export function safeBase(base) {
  // Control characters (codes below 32) are not allowed in Windows file names either.
  const printable = [...base].filter((ch) => ch.charCodeAt(0) >= 32).join('');
  const clean = printable
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  return clean || 'image';
}

// --- token count -------------------------------------------------------------------------------

/** The CLIP text encoders of SD 1.5 and SDXL read 77 tokens, including a start and an end token. */
export const CLIP_TOKEN_LIMIT = 77;

/**
 * A rough count of CLIP tokens for a caption, start and end token included. The real tokenizer needs
 * a 1.5 MB vocabulary, so this estimates: CLIP splits text into words, single digits and runs of
 * punctuation; common English words are one token each, long or rare words several, and each letter
 * of other scripts (Korean, for example) usually at least one. The page shows the result as "about".
 * @param {string} text
 */
export function estimateClipTokens(text) {
  const pieces = text.toLowerCase().match(/'s|'t|'re|'ve|'m|'ll|'d|\p{L}+|\p{N}|[^\s\p{L}\p{N}]+/gu) ?? [];
  let count = 2;
  for (const piece of pieces) {
    if (/^[a-z']+$/.test(piece)) count += piece.length <= 8 ? 1 : Math.ceil(piece.length / 6);
    else if (/^\p{L}+$/u.test(piece)) count += [...piece].length;
    else count += piece.length;
  }
  return count;
}
