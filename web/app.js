// @ts-check
/**
 * CrossTag web: connects the markup in index.html to the tagger library in lib/tagger/. The list of
 * pictures, the large preview, the caption box that saves while the person types, the tag overview,
 * bulk edits with one undo, renaming, the dataset checks, the dataset card and the ZIP export.
 *
 * Two places can hold the dataset (lib/tagger/store.js): a folder on the computer, as in the desktop
 * app (Chrome and Edge, through the File System Access API), or this browser's own storage (every
 * browser, with a ZIP to take the files elsewhere). Every tool works the same in both.
 *
 * The screen follows the tagger of the ai-showcase workshop pages (src/lib/workshop/tagger-view.js
 * there), without the workshop parts: no caption drafts from a model, no example datasets, and plain
 * English text instead of a translation system.
 */
import { createZip, isZip, readZip } from './lib/zip.js';
import {
  CLIP_TOKEN_LIMIT,
  addToEnd,
  addToStart,
  bulkEdit,
  countTags,
  estimateClipTokens,
  hasTag,
  renamePlan,
  renameTag,
  replaceText,
  safeBase,
} from './lib/tagger/captions.js';
import { checkDataset, differenceHash, greyGrid } from './lib/tagger/checks.js';
import { TARGETS, emptyMeta, emptyPictureInfo, renameInMeta } from './lib/tagger/dataset.js';
import { datasetCard, exportFiles, importFiles } from './lib/tagger/export.js';
import { aiToolkitSteps, trainingFiles } from './lib/tagger/training.js';
import { folderPickerSupported, pickFolder } from './lib/tagger/folder-store.js';
import { indexedDbKeyValue, memoryStore } from './lib/tagger/memory-store.js';

/** @typedef {import('./lib/tagger/store.js').Store} Store */
/** @typedef {import('./lib/tagger/dataset.js').DatasetMeta} DatasetMeta */
/** @typedef {import('./lib/tagger/export.js').Layout} Layout */

/**
 * One picture as the screen knows it. Size and hash are filled in by the dataset check.
 * @typedef {object} Item
 * @property {string} name
 * @property {string} [url]      object URL for the thumbnail and the large view
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [hash]
 */

/** Wait this long after the last key press before saving a caption. */
const SAVE_DELAY_MS = 400;

// --- small helpers ----------------------------------------------------------------------------------

/** @param {string} id */
function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} is missing in index.html`);
  return element;
}

/**
 * Make an element. Attributes set to null or undefined are left out; children may be strings.
 * @param {string} tag
 * @param {Record<string, string | number | null | undefined>} [attributes]
 * @param {(Node | string | null)[]} children
 * @returns {any}
 */
function h(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) if (value != null) element.setAttribute(key, String(value));
  for (const child of children) if (child != null) element.append(child);
  return element;
}

/**
 * A progress bar with a line of text. A fraction of null shows a bar that moves without an end.
 * @param {string} id
 */
function meter(id) {
  const element = byId(id);
  const bar = /** @type {HTMLProgressElement} */ (element.querySelector('progress'));
  const label = /** @type {HTMLElement} */ (element.querySelector('span'));
  return {
    /** @param {boolean} on */
    set hidden(on) {
      element.hidden = on;
    },
    /** @param {number | null} fraction @param {string} text */
    update(fraction, text) {
      if (fraction === null) bar.removeAttribute('value');
      else bar.value = fraction;
      label.textContent = text;
    },
  };
}

/** "1 picture", "2 pictures". @param {number} n @param {string} word */
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** @param {unknown} e */
const messageOf = (e) => /** @type {Error} */ (e).message;

// --- the elements -----------------------------------------------------------------------------------

const ui = {
  openFolder: /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('[data-open-folder]')),
  addFiles: /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('[data-add-files]')),
  addFolder: byId('add-folder'),
  openHint: byId('open-hint'),
  theme: byId('theme'),
  mode: byId('mode'),
  meter: meter('meter'),
  welcome: byId('welcome'),
  work: byId('work'),
  trigger: /** @type {HTMLInputElement} */ (byId('trigger')),
  target: /** @type {HTMLSelectElement} */ (byId('target')),
  targetHint: byId('target-hint'),
  filter: byId('filter'),
  filterText: byId('filter-text'),
  selection: byId('selection'),
  list: byId('list'),
  preview: byId('preview'),
  position: byId('position'),
  prev: /** @type {HTMLButtonElement} */ (byId('prev')),
  next: /** @type {HTMLButtonElement} */ (byId('next')),
  caption: /** @type {HTMLTextAreaElement} */ (byId('caption')),
  captionLabel: byId('caption-label'),
  saved: byId('saved'),
  tokens: byId('tokens'),
  source: /** @type {HTMLSelectElement} */ (byId('source')),
  sourceNote: /** @type {HTMLInputElement} */ (byId('source-note')),
  people: /** @type {HTMLSelectElement} */ (byId('people')),
  tags: byId('tags'),
  tagOptions: byId('tag-options'),
  tagFrom: /** @type {HTMLInputElement} */ (byId('tag-from')),
  tagTo: /** @type {HTMLInputElement} */ (byId('tag-to')),
  scopeShown: byId('scope-shown'),
  scopeSelected: byId('scope-selected'),
  clear: /** @type {HTMLButtonElement} */ (byId('clear')),
  undo: /** @type {HTMLButtonElement} */ (byId('undo')),
  bulkStatus: byId('bulk-status'),
  base: /** @type {HTMLInputElement} */ (byId('base')),
  renameButton: /** @type {HTMLButtonElement} */ (byId('rename-button')),
  renamePreview: byId('rename-preview'),
  renameStatus: byId('rename-status'),
  check: /** @type {HTMLButtonElement} */ (byId('check')),
  checkMeter: meter('check-meter'),
  checkStatus: byId('check-status'),
  findings: byId('findings'),
  layout: /** @type {HTMLSelectElement} */ (byId('layout')),
  layoutHint: byId('layout-hint'),
  repeatsField: byId('repeats-field'),
  repeats: /** @type {HTMLInputElement} */ (byId('repeats')),
  exportButton: /** @type {HTMLButtonElement} */ (byId('export')),
  exportMeter: meter('export-meter'),
  exportStatus: byId('export-status'),
  forgetRow: byId('forget-row'),
  forget: /** @type {HTMLButtonElement} */ (byId('forget')),
  forgetStatus: byId('forget-status'),
  enlarged: /** @type {HTMLDialogElement} */ (byId('enlarged')),
  enlargedTitle: byId('enlarged-title'),
  enlargedImage: /** @type {HTMLImageElement} */ (byId('enlarged-image')),
  enlargedCaption: byId('enlarged-caption'),
};

// The browser store gets its own database name, since GitHub Pages serves every project of an
// account from the same origin, and other pages there may keep a "tagger" database too.
const memory = memoryStore(indexedDbKeyValue('crosstag'));

const state = {
  /** @type {Store | null} */ store: null,
  /** @type {Item[]} */ items: [],
  /** picture name to caption: the page's copy, written to the store while the person types */
  captions: /** @type {Map<string, string>} */ (new Map()),
  /** @type {DatasetMeta} */ meta: emptyMeta(),
  /** name of the picture in the editor */
  current: '',
  /** @type {Set<string>} */ selected: new Set(),
  /** the tag the list is filtered by, or "" */
  filter: '',
  /** name of the picture whose checkbox was clicked last, for Shift-click ranges */
  anchor: '',
  /** @type {{ map: Map<string, string> } | null} */ undo: null,
  /** @type {ReturnType<typeof setTimeout> | null} */ saveTimer: null,
  /** @type {Promise<void>} */ saving: Promise.resolve(),
  /** @type {ReturnType<typeof setTimeout> | null} */ metaTimer: null,
  /** which button waits for a second press: "clear", "rename" or "forget" */
  armed: '',
  showId: 0,
};

// --- theme ------------------------------------------------------------------------------------------

// The desktop app has a dark and a light theme; here the system setting decides until the person
// presses the button, and the choice is kept for the next visit.
ui.theme.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try {
    localStorage.setItem('crosstag-theme', root.dataset.theme);
  } catch {
    // Without storage the choice lasts until the page closes.
  }
});

// --- opening ----------------------------------------------------------------------------------------

const canUseFolders = folderPickerSupported();
for (const button of ui.openFolder) button.hidden = !canUseFolders;
// Browsers without the folder picker can still read a whole folder into the browser store.
ui.addFolder.hidden = canUseFolders || !('webkitdirectory' in HTMLInputElement.prototype);
ui.openHint.textContent = canUseFolders
  ? 'Open a folder to work in it directly: captions are saved next to the pictures while you type, and the browser asks once whether the page may change files there. Pictures you add instead stay in this browser and leave as a ZIP.'
  : 'This browser cannot write into a folder, so the pictures and captions stay in the browser, also after a reload, and leave as a ZIP. Chrome or Edge on a computer can work in the folder directly, as the desktop app does.';

for (const button of ui.openFolder) {
  button.addEventListener('click', async () => {
    try {
      await open(await pickFolder());
    } catch (e) {
      // Closing the picker is a normal choice, not an error.
      if (/** @type {Error} */ (e).name !== 'AbortError') ui.mode.textContent = `The folder could not be opened: ${messageOf(e)}`;
    }
  });
}

for (const input of ui.addFiles) {
  input.addEventListener('change', async () => {
    await addFiles([...(input.files ?? [])]);
    input.value = '';
  });
}

// Files dropped anywhere on the page are added like picked files.
document.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
document.addEventListener('drop', async (e) => {
  if (!e.dataTransfer?.files.length) return;
  e.preventDefault();
  await addFiles([...e.dataTransfer.files]);
});

/**
 * Add picked or dropped files to the browser store: pictures, their .txt captions, a tagger.json, or
 * ZIP files with any of these.
 * @param {File[]} files
 */
async function addFiles(files) {
  if (!files.length) return;
  ui.meter.hidden = false;
  try {
    /** @type {{ name: string, data: Uint8Array }[]} */
    const entries = [];
    for (const [i, file] of files.entries()) {
      ui.meter.update(i / files.length, `Reading ${file.name} (${i + 1} of ${files.length})`);
      const data = new Uint8Array(await file.arrayBuffer());
      if (isZip(data)) entries.push(...(await readZip(data)));
      else entries.push({ name: file.webkitRelativePath || file.name, data });
    }
    const { pictures, meta } = importFiles(entries);
    if (!pictures.length) {
      ui.mode.textContent = 'No pictures found. CrossTag opens PNG, JPEG, GIF and WebP files, and ZIP files with such pictures.';
      return;
    }
    ui.meter.update(1, `Keeping the pictures in this browser (${pictures.length})`);
    await flushCaption();
    await memory.add(pictures);
    if (meta) await memory.writeMeta(mergeMeta(await memory.readMeta(), meta));
    await open(memory);
    ui.mode.textContent = `${modeText()} Pictures added: ${pictures.length}.`;
  } catch (e) {
    ui.mode.textContent = `The pictures could not be opened: ${messageOf(e)}`;
  } finally {
    ui.meter.hidden = true;
  }
}

/**
 * Information from an imported tagger.json, on top of what the browser store holds already.
 * @param {DatasetMeta} old @param {DatasetMeta} imported
 */
function mergeMeta(old, imported) {
  const card = { ...old.card };
  for (const key of /** @type {(keyof DatasetMeta['card'])[]} */ (Object.keys(card))) card[key] = imported.card[key] || card[key];
  return {
    trigger: imported.trigger || old.trigger,
    target: imported.target,
    card,
    pictures: { ...old.pictures, ...imported.pictures },
  };
}

/** @param {Store} store */
async function open(store) {
  await flushCaption();
  for (const item of state.items) if (item.url) URL.revokeObjectURL(item.url);
  state.store = store;
  const list = await store.list();
  state.items = list.map((p) => ({ name: p.name }));
  state.captions = new Map(list.map((p) => [p.name, p.caption]));
  state.meta = await store.readMeta();
  state.selected.clear();
  state.filter = '';
  state.undo = null;
  state.current = state.items[0]?.name ?? '';
  ui.mode.textContent = modeText();
  const empty = state.items.length === 0;
  ui.work.hidden = empty;
  ui.welcome.hidden = !empty;
  ui.forgetRow.hidden = store.kind !== 'memory';
  ui.findings.replaceChildren();
  ui.checkStatus.textContent = '';
  fillSettings();
  renderList();
  renderTags();
  renderUndo();
  await show(state.current);
}

const modeText = () =>
  state.store?.kind === 'folder'
    ? `Folder mode, in the folder "${state.store.label}" (pictures: ${state.items.length}). Captions are saved there as .txt files while you type.`
    : `Browser mode (pictures: ${state.items.length}): the pictures stay in this browser. Save a ZIP under Export to take them to a trainer or another computer.`;

// --- settings and dataset card ----------------------------------------------------------------------

const cardFields = /** @type {NodeListOf<HTMLInputElement | HTMLTextAreaElement>} */ (document.querySelectorAll('[data-card]'));

function fillSettings() {
  ui.trigger.value = state.meta.trigger;
  ui.target.value = state.meta.target;
  for (const input of cardFields) input.value = state.meta.card[/** @type {keyof DatasetMeta['card']} */ (input.dataset.card)] ?? '';
  showTargetHint();
}

function showTargetHint() {
  const target = TARGETS[state.meta.target];
  ui.targetHint.textContent =
    target.style === 'tags'
      ? `This model reads captions through CLIP, which was trained on short image texts. Short tags separated by commas suit it, such as "woman, market stall, evening, neon light". CLIP reads at most 77 tokens. Training size: ${target.size} pixels.`
      : `This model reads captions through a language model, so whole sentences suit it: "A woman sells fish at a market stall in the evening, lit by neon signs." Training size: ${target.size} pixels.`;
  showTokens();
}

/** Save the dataset information a moment after the last change. */
function saveMetaSoon() {
  if (state.metaTimer) clearTimeout(state.metaTimer);
  state.metaTimer = setTimeout(() => {
    state.metaTimer = null;
    state.store?.writeMeta(state.meta).catch((e) => (ui.saved.textContent = `Not saved: ${e.message}`));
  }, SAVE_DELAY_MS);
}

ui.trigger.addEventListener('input', () => {
  state.meta.trigger = ui.trigger.value.trim();
  saveMetaSoon();
  showTokens();
});
ui.target.addEventListener('change', () => {
  state.meta.target = /** @type {DatasetMeta['target']} */ (ui.target.value);
  showTargetHint();
  saveMetaSoon();
});
for (const input of cardFields) {
  input.addEventListener('input', () => {
    state.meta.card[/** @type {keyof DatasetMeta['card']} */ (input.dataset.card)] = input.value;
    saveMetaSoon();
  });
}

// --- the list ---------------------------------------------------------------------------------------

/** The pictures the list shows: all of them, or those with the filter tag. */
const visible = () => (state.filter ? state.items.filter((i) => hasTag(state.captions.get(i.name) ?? '', state.filter)) : state.items);

/** An object URL for a picture, made once and kept while the dataset is open. @param {string} name */
async function urlOf(name) {
  const item = state.items.find((i) => i.name === name);
  if (!item || !state.store) return '';
  item.url ??= URL.createObjectURL(await state.store.readPicture(name));
  return item.url;
}

function renderList() {
  const shown = visible();
  ui.list.replaceChildren(
    ...shown.map((item) => {
      const box = h('input', { type: 'checkbox', 'aria-label': `Select ${item.name}`, 'data-name': item.name });
      box.checked = state.selected.has(item.name);
      box.addEventListener('click', (/** @type {MouseEvent} */ e) => onCheckbox(item.name, box.checked, e.shiftKey));
      const thumb = h('img', { alt: '', class: 'thumb', loading: 'lazy', decoding: 'async', width: 48, height: 48 });
      urlOf(item.name).then((url) => (thumb.src = url));
      const pick = h(
        'button',
        { type: 'button', class: 'pick', 'data-name': item.name },
        thumb,
        h('span', { class: 'pick__name' }, item.name),
        h('span', { class: 'pick__mark small' }),
      );
      pick.addEventListener('click', (/** @type {MouseEvent} */ e) => onPick(item.name, e));
      return h('li', {}, box, pick);
    }),
  );
  for (const item of shown) markItem(item.name);
  ui.filter.hidden = !state.filter;
  ui.filterText.textContent = `Pictures with the tag "${state.filter}": ${shown.length}`;
  renderSelection();
}

/** Update one row: whether it is open in the editor and whether it has a caption. @param {string} name */
function markItem(name) {
  const pick = ui.list.querySelector(`.pick[data-name="${CSS.escape(name)}"]`);
  if (!pick) return;
  if (name === state.current) pick.setAttribute('aria-current', 'true');
  else pick.removeAttribute('aria-current');
  const empty = !(state.captions.get(name) ?? '').trim();
  /** @type {HTMLElement} */ (pick.querySelector('.pick__mark')).textContent = empty ? 'no caption' : '';
  pick.toggleAttribute('data-empty', empty);
}

function renderSelection() {
  const shown = visible().length;
  ui.selection.textContent = `Selected: ${state.selected.size}`;
  ui.scopeShown.textContent = state.filter ? `the pictures with the tag "${state.filter}" (${shown})` : `every picture in the list (${shown})`;
  ui.scopeSelected.textContent = `the selected pictures (${state.selected.size})`;
}

/** @param {string} name @param {boolean} checked @param {boolean} range */
function onCheckbox(name, checked, range) {
  const shown = visible().map((i) => i.name);
  if (range && state.anchor && shown.includes(state.anchor)) {
    const [a, b] = [shown.indexOf(state.anchor), shown.indexOf(name)].sort((x, y) => x - y);
    for (const n of shown.slice(a, b + 1)) setSelected(n, checked);
  } else setSelected(name, checked);
  state.anchor = name;
  renderSelection();
}

/** @param {string} name @param {boolean} on */
function setSelected(name, on) {
  if (on) state.selected.add(name);
  else state.selected.delete(name);
  const box = /** @type {HTMLInputElement | null} */ (ui.list.querySelector(`input[data-name="${CSS.escape(name)}"]`));
  if (box) box.checked = on;
}

/**
 * A click on a row opens the picture. With Ctrl or Cmd it adds the picture to the selection
 * instead, and with Shift it selects every picture from the open one to this one.
 * @param {string} name @param {MouseEvent} e
 */
function onPick(name, e) {
  if (e.ctrlKey || e.metaKey) {
    onCheckbox(name, !state.selected.has(name), false);
    return;
  }
  if (e.shiftKey) {
    state.anchor = state.current;
    onCheckbox(name, true, true);
    return;
  }
  show(name);
}

byId('select-all').addEventListener('click', () => {
  for (const item of visible()) setSelected(item.name, true);
  renderSelection();
});
byId('select-none').addEventListener('click', () => {
  for (const name of [...state.selected]) setSelected(name, false);
  renderSelection();
});
byId('filter-clear').addEventListener('click', () => setFilter(''));

/** @param {string} tag */
function setFilter(tag) {
  state.filter = tag;
  renderList();
  renderTags();
}

// --- the editor -------------------------------------------------------------------------------------

/**
 * Open one picture in the editor.
 * @param {string} name
 */
async function show(name) {
  await flushCaption();
  const previous = state.current;
  state.current = name;
  markItem(previous);
  markItem(name);
  const item = state.items.find((i) => i.name === name);
  const shown = visible();
  const index = shown.findIndex((i) => i.name === name);
  ui.position.textContent = item ? `${index + 1} of ${shown.length}` : '';
  ui.prev.disabled = ui.next.disabled = shown.length < 2;
  ui.captionLabel.textContent = name ? `Caption for ${name}` : 'Caption';
  ui.caption.value = state.captions.get(name) ?? '';
  ui.saved.textContent = '';
  const info = state.meta.pictures[name] ?? emptyPictureInfo();
  ui.source.value = info.source;
  ui.sourceNote.value = info.sourceNote;
  ui.people.value = info.people;
  showTokens();
  ui.list.querySelector(`.pick[data-name="${CSS.escape(name)}"]`)?.scrollIntoView({ block: 'nearest' });
  if (!item || !state.store) {
    ui.preview.replaceChildren();
    return;
  }

  // Draw the picture the way the camera meant it (EXIF orientation), as the trainers read it.
  const id = ++state.showId;
  const bitmap = await createImageBitmap(await state.store.readPicture(name), { imageOrientation: 'from-image' });
  if (id !== state.showId) return bitmap.close();
  item.width = bitmap.width;
  item.height = bitmap.height;
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = h('canvas', { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const enlarge = h('button', { type: 'button', class: 'preview__open', title: 'Open large' }, canvas, h('span', { class: 'visually-hidden' }, `Open ${name} large`));
  enlarge.addEventListener('click', () => openLarge(name));
  ui.preview.replaceChildren(enlarge, h('p', { class: 'small muted' }, `${item.width} x ${item.height} pixels`));
}

/** Show a picture at full size in a dialog, with its caption. @param {string} name */
async function openLarge(name) {
  ui.enlargedTitle.textContent = name;
  ui.enlargedImage.alt = state.captions.get(name) || name;
  ui.enlargedImage.src = await urlOf(name);
  ui.enlargedCaption.textContent = state.captions.get(name) ?? '';
  ui.enlarged.showModal();
}
byId('enlarged-close').addEventListener('click', () => ui.enlarged.close());
// A click outside the picture closes the dialog too.
ui.enlarged.addEventListener('click', (e) => {
  if (e.target === ui.enlarged) ui.enlarged.close();
});

/** Move by `step` pictures in the list, wrapping around at the ends. @param {number} step */
function move(step) {
  const shown = visible();
  if (!shown.length) return;
  const i = shown.findIndex((item) => item.name === state.current);
  show(shown[(i + step + shown.length) % shown.length].name);
}

ui.prev.addEventListener('click', () => move(-1));
ui.next.addEventListener('click', () => move(1));

// The arrow keys move between pictures while the focus is not in a text field, as in the desktop
// app; inside the caption box, Alt with an arrow key does the same.
document.addEventListener('keydown', (e) => {
  const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
  if (!step || e.ctrlKey || e.metaKey || e.shiftKey || ui.work.hidden || ui.enlarged.open) return;
  const target = /** @type {HTMLElement} */ (e.target);
  const typing = target.matches('textarea, select, input:not([type="checkbox"]), summary');
  if (target === ui.caption ? !e.altKey : typing || e.altKey) return;
  e.preventDefault();
  move(step);
});

ui.caption.addEventListener('input', () => {
  state.captions.set(state.current, ui.caption.value);
  ui.saved.textContent = 'Saving';
  markItem(state.current);
  showTokens();
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => flushCaption(), SAVE_DELAY_MS);
});
ui.caption.addEventListener('blur', () => flushCaption());

/** Write the open caption now if it waits for its save. */
function flushCaption() {
  if (!state.saveTimer) return state.saving;
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  const name = state.current;
  const caption = (state.captions.get(name) ?? '').trim();
  state.saving = state.saving
    .then(() => state.store?.writeCaption(name, caption))
    .then(() => {
      if (name === state.current) ui.saved.textContent = state.store?.kind === 'folder' ? 'Saved in the folder' : 'Saved in this browser';
      renderTagsSoon();
    })
    .catch((e) => {
      ui.saved.textContent = `Not saved: ${e.message}`;
    });
  return state.saving;
}

function showTokens() {
  const target = TARGETS[state.meta.target];
  if (!target.clip) {
    ui.tokens.textContent = '';
    return;
  }
  // The trigger word goes in front of every caption on export, so it counts too.
  const text = state.meta.trigger ? `${state.meta.trigger}, ${ui.caption.value}` : ui.caption.value;
  const n = estimateClipTokens(text);
  ui.tokens.textContent = n > CLIP_TOKEN_LIMIT ? `About ${n} of ${CLIP_TOKEN_LIMIT} tokens: CLIP cuts off the rest` : `About ${n} of ${CLIP_TOKEN_LIMIT} tokens`;
  ui.tokens.toggleAttribute('data-over', n > CLIP_TOKEN_LIMIT);
}

// Where the picture comes from, for the dataset card.
for (const field of [ui.source, ui.sourceNote, ui.people]) {
  field.addEventListener(field === ui.sourceNote ? 'input' : 'change', () => {
    if (!state.current) return;
    state.meta.pictures[state.current] = {
      source: /** @type {any} */ (ui.source.value),
      sourceNote: ui.sourceNote.value,
      people: /** @type {any} */ (ui.people.value),
    };
    saveMetaSoon();
  });
}

// --- tags -------------------------------------------------------------------------------------------

/** @type {ReturnType<typeof setTimeout> | null} */
let tagsTimer = null;
function renderTagsSoon() {
  if (tagsTimer) clearTimeout(tagsTimer);
  tagsTimer = setTimeout(renderTags, 300);
}

function renderTags() {
  const counts = countTags([...state.captions.values()]);
  ui.tags.replaceChildren(
    ...counts.map(({ tag, count: n }) => {
      const button = h(
        'button',
        { type: 'button', class: 'tag', 'aria-pressed': String(state.filter === tag), 'data-once': n === 1 ? '' : null },
        h('span', {}, tag),
        h('span', { class: 'mono' }, ` ${n}`),
        n === 1 ? h('span', { class: 'tag__once' }, ' once') : null,
      );
      button.addEventListener('click', () => {
        setFilter(state.filter === tag ? '' : tag);
        if (state.filter) ui.tagFrom.value = tag;
      });
      return h('li', {}, button);
    }),
  );
  if (!counts.length) ui.tags.replaceChildren(h('li', { class: 'small muted' }, 'No tags yet.'));
  ui.tagOptions.replaceChildren(...counts.map(({ tag }) => h('option', { value: tag })));
}

byId('tag-rename').addEventListener('submit', (e) => {
  e.preventDefault();
  const from = ui.tagFrom.value.trim();
  const to = ui.tagTo.value.trim();
  if (!from) return;
  applyBulk(
    state.items.map((i) => i.name),
    (c) => renameTag(c, from, to),
  );
  if (state.filter === from) setFilter(to);
  ui.tagFrom.value = ui.tagTo.value = '';
});

// --- bulk edits -------------------------------------------------------------------------------------

/** The pictures a bulk edit applies to, from the scope radio buttons. */
function scope() {
  const choice = /** @type {HTMLInputElement} */ (document.querySelector('input[name="scope"]:checked')).value;
  return choice === 'selected' ? [...state.selected] : visible().map((i) => i.name);
}

/**
 * Change some captions, write them, and keep the old ones for one undo.
 * @param {string[]} names @param {(caption: string) => string} edit
 */
async function applyBulk(names, edit) {
  await flushCaption();
  disarm();
  if (!names.length) {
    ui.bulkStatus.textContent = 'No pictures to change: select some, or apply to all.';
    return;
  }
  const { changed, undo } = bulkEdit(state.captions, names, edit);
  if (changed.length) state.undo = { map: undo };
  await writeCaptions(changed);
  ui.bulkStatus.textContent = `Captions changed: ${changed.length}.`;
}

/** @param {string[]} names */
async function writeCaptions(names) {
  try {
    for (const name of names) await state.store?.writeCaption(name, (state.captions.get(name) ?? '').trim());
  } catch (e) {
    ui.bulkStatus.textContent = `Not saved: ${messageOf(e)}`;
  }
  ui.caption.value = state.captions.get(state.current) ?? '';
  showTokens();
  renderList();
  renderTags();
  renderUndo();
}

function renderUndo() {
  ui.undo.disabled = !state.undo;
}

ui.undo.addEventListener('click', async () => {
  if (!state.undo) return;
  const names = [...state.undo.map.keys()];
  for (const [name, caption] of state.undo.map) state.captions.set(name, caption);
  state.undo = null;
  await writeCaptions(names);
  ui.bulkStatus.textContent = `Captions back as they were: ${names.length}.`;
});

/** @param {string} formId @param {string} inputId @param {(text: string) => (caption: string) => string} make */
function bulkForm(formId, inputId, make) {
  byId(formId).addEventListener('submit', (e) => {
    e.preventDefault();
    const input = /** @type {HTMLInputElement} */ (byId(inputId));
    applyBulk(scope(), make(input.value));
  });
}
bulkForm('add-start', 'start-text', (text) => (c) => addToStart(c, text));
bulkForm('add-end', 'end-text', (text) => (c) => addToEnd(c, text));
bulkForm('replace', 'search', (search) => {
  const replacement = /** @type {HTMLInputElement} */ (byId('replacement')).value;
  const ignoreCase = /** @type {HTMLInputElement} */ (byId('ignore-case')).checked;
  return (c) => replaceText(c, search, replacement, { ignoreCase });
});

// Emptying captions asks for a second press, which names how many captions it empties.
ui.clear.addEventListener('click', () => {
  const names = scope();
  if (state.armed !== 'clear') {
    disarm();
    state.armed = 'clear';
    ui.clear.textContent = `Press again to empty the captions (${names.length})`;
    return;
  }
  applyBulk(names, () => '');
});

/** Put every two-press button back to its first state. */
function disarm() {
  state.armed = '';
  ui.clear.textContent = 'Empty the captions';
  ui.renameButton.textContent = 'Rename all';
  ui.forget.textContent = 'Remove the pictures from this browser';
}

// --- renaming ---------------------------------------------------------------------------------------

function renamePreview() {
  const plan = renamePlan(
    state.items.map((i) => i.name),
    ui.base.value,
  );
  ui.renamePreview.textContent = plan.length && ui.base.value.trim() ? `${plan[0].from} becomes ${plan[0].to}, and so on (pictures: ${plan.length}).` : '';
}
ui.base.addEventListener('input', () => {
  disarm();
  renamePreview();
});

byId('rename').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.store || !ui.base.value.trim()) return;
  // In a folder the files on disk change, so the button asks for a second press.
  if (state.store.kind === 'folder' && state.armed !== 'rename') {
    disarm();
    state.armed = 'rename';
    ui.renameButton.textContent = `Press again to rename the files on disk (${state.items.length})`;
    return;
  }
  disarm();
  await flushCaption();
  const plan = renamePlan(
    state.items.map((i) => i.name),
    ui.base.value,
  );
  const moved = new Map(plan.map((p) => [p.from, p.to]));
  try {
    ui.renameStatus.textContent = `Renaming the pictures (${plan.length})`;
    await state.store.rename(plan);
    renameInMeta(state.meta, plan);
    await state.store.writeMeta(state.meta);
    const current = moved.get(state.current) ?? '';
    await open(state.store);
    if (current) await show(current);
    ui.renameStatus.textContent = `Pictures renamed: ${plan.filter((p) => p.from !== p.to).length}.`;
  } catch (err) {
    const error = /** @type {Error & { code?: string, file?: string }} */ (err);
    ui.renameStatus.textContent =
      error.code === 'exists'
        ? `Nothing was renamed: ${error.file ?? ''} exists already and is not part of the dataset.`
        : `Renaming stopped: ${error.message}. Check the folder before you try again.`;
  }
});

// --- dataset checks ---------------------------------------------------------------------------------

/**
 * The text for one kind of finding.
 * @param {import('./lib/tagger/checks.js').Finding} f @param {number} size
 */
function findingText(f, size) {
  const n = f.names.length;
  switch (f.kind) {
    case 'no-caption':
      return `Without a caption (${n}): a picture without a caption teaches the model the picture without words.`;
    case 'small':
      return `Smaller than ${size} pixels on the shorter side (${n}): the trainer enlarges these, which makes them blurry.`;
    case 'aspect':
      return `More than twice as wide as tall, or the reverse (${n}): trainers crop or shrink such pictures a lot.`;
    case 'duplicate':
      return `Pictures that look like copies of each other (${n}). Each group is one picture several times; keep one of each, or the model learns it more than the rest.`;
    case 'types':
      return `The dataset mixes file types (${(f.types ?? []).join(', ')}). Most trainers read them all; this is a hint, not a problem.`;
    default:
      return f.kind;
  }
}

ui.check.addEventListener('click', async () => {
  if (!state.store) return;
  await flushCaption();
  ui.check.disabled = true;
  ui.checkMeter.hidden = false;
  ui.findings.replaceChildren();
  const total = state.items.length;
  try {
    // Size and hash need each picture decoded once; later checks reuse them.
    for (const [i, item] of state.items.entries()) {
      ui.checkMeter.update(i / total, `Looking at picture ${i + 1} of ${total}`);
      if (item.hash) continue;
      const bitmap = await createImageBitmap(await state.store.readPicture(item.name), { imageOrientation: 'from-image' });
      item.width = bitmap.width;
      item.height = bitmap.height;
      item.hash = differenceHash(greyGrid(bitmap));
      bitmap.close();
    }
    ui.checkMeter.update(1, `Looking at picture ${total} of ${total}`);
    const size = TARGETS[state.meta.target].size;
    const findings = checkDataset(
      state.items.map((i) => ({ name: i.name, caption: state.captions.get(i.name) ?? '', width: i.width ?? 0, height: i.height ?? 0, hash: i.hash })),
      { trainingSize: size },
    );
    ui.checkStatus.textContent = findings.length ? `Kinds of problems found: ${findings.length}.` : `No problems found (pictures checked: ${total}).`;
    ui.findings.replaceChildren(
      ...findings.map((f) => {
        const groups = f.groups ?? (f.names.length ? [f.names] : []);
        return h('li', { class: 'stack-tight' }, h('p', {}, findingText(f, size)), ...groups.map((g) => h('div', { class: 'cluster' }, ...g.map((name) => openButton(name)))));
      }),
    );
  } catch (e) {
    ui.checkStatus.textContent = `The check stopped: ${messageOf(e)}`;
  } finally {
    ui.check.disabled = false;
    ui.checkMeter.hidden = true;
  }
});

/** A small button that opens one picture in the editor. @param {string} name */
function openButton(name) {
  const button = h('button', { type: 'button', class: 'button button--small' }, name);
  button.addEventListener('click', () => {
    if (state.filter && !visible().some((i) => i.name === name)) setFilter('');
    show(name);
    ui.caption.focus();
  });
  return button;
}

// --- export -----------------------------------------------------------------------------------------

const LAYOUT_HINTS = {
  folder: 'A folder "dataset" with each picture next to its caption, the trigger word at the start of every caption.',
  kohya: 'A folder img/10_name: kohya reads the number as the repeats, how often each picture is shown per pass over the data.',
  imagefolder: 'A folder "train" with the pictures and one metadata.jsonl file that holds all captions.',
  captions: 'The pictures and captions as they are, without the trigger word, plus tagger.json. Add this ZIP to CrossTag web again to continue, in any browser.',
};

function showLayoutHint() {
  ui.layoutHint.textContent = LAYOUT_HINTS[/** @type {Layout} */ (ui.layout.value)];
  ui.repeatsField.hidden = ui.layout.value !== 'kohya';
}
ui.layout.addEventListener('change', showLayoutHint);
showLayoutHint();

const TARGET_NAMES = { zimage: 'Z-Image Turbo', flux: 'FLUX', sdxl: 'SDXL', sd15: 'SD 1.5' };

/** The labels of DATASET.md. @returns {import('./lib/tagger/export.js').CardLabels} */
const cardLabels = () => ({
  untitled: 'Dataset without a name',
  author: 'Made by',
  purpose: 'Purpose',
  license: 'License',
  trigger: 'Trigger word',
  target: 'Model',
  count: 'Pictures',
  created: 'Exported on',
  notes: 'Notes',
  pictures: 'Pictures and their sources',
  file: 'File',
  source: 'Source',
  sourceNote: 'Details',
  people: 'People',
  missing: 'not given',
  sources: { own: 'taken by me', licensed: 'found, with a license that allows it', other: 'other' },
  peopleValues: { none: 'no people', agreed: 'people who agreed to be in the dataset', unknown: 'people who did not agree, or nobody asked them' },
  targets: TARGET_NAMES,
});

/**
 * TRAINING.md for an export: the steps for the training tools that fit the layout and the model.
 * The settings files it names come from lib/tagger/training.js.
 * @param {Layout} layout @param {number} n pictures @param {number} repeats @param {string} root
 */
function trainingReadme(layout, n, repeats, root) {
  const target = state.meta.target;
  const model = TARGET_NAMES[target];
  const title = state.meta.card.title || root;
  const steps = aiToolkitSteps(n).toLocaleString('en');
  const parts = [`# Training "${title}"\n\nThis folder holds ${n} pictures with captions for a LoRA on ${model}. The short version for each training tool follows.\n`];
  if (layout === 'folder') {
    parts.push(
      target === 'zimage'
        ? `## ai-toolkit (Z-Image Turbo)\n\nai-toolkit runs on a computer with an NVIDIA graphics card (Windows or Linux).\n\n1. Install ai-toolkit: https://github.com/ostris/ai-toolkit (the settings file was checked against commit 73c84b0).\n2. Copy the folder \`dataset\` to \`ai-toolkit/datasets/${root}\` and \`training/${root}.yaml\` to \`ai-toolkit/config/\`.\n3. In the ai-toolkit folder run \`python run.py config/${root}.yaml\`. The first run downloads Z-Image Turbo and the training adapter (about 33 GB, checked 2026-11-25).\n4. Training takes ${steps} steps. A LoRA file lands in \`output/${root}/\` every 250 steps, with sample pictures, so the files form a training timeline.\n`
        : `## ai-toolkit\n\nThe ai-toolkit settings file is written for Z-Image Turbo only. For ${model}, choose "Z-Image Turbo" as the model in CrossTag and export again, or use OneTrainer.\n`,
      `## OneTrainer (SDXL or SD 1.5)\n\n1. Install OneTrainer: https://github.com/Nerogar/OneTrainer\n2. Choose the preset for an SDXL LoRA or an SD 1.5 LoRA and the base model file.\n3. Under concepts, add the folder \`dataset\` and set the captions to come from the .txt files next to the pictures.\n4. Start the training; OneTrainer saves the LoRA as a .safetensors file.\n`,
    );
  }
  if (layout === 'kohya') {
    parts.push(
      target === 'sdxl' || target === 'sd15'
        ? `## kohya sd-scripts (${model})\n\n1. Install sd-scripts: https://github.com/kohya-ss/sd-scripts (the scripts were written for release v0.13.1).\n2. Set MODEL to the ${model} checkpoint, then run \`training/train.sh\` (Mac, Linux) or \`training\\train.bat\` (Windows) in the sd-scripts folder with its Python environment active.\n3. The pictures in \`img\` are shown ${repeats} times per pass, for 10 passes. A LoRA file lands in \`output\` every 2 passes, with sample pictures.\n`
        : `## kohya sd-scripts\n\nThe kohya scripts are written for SDXL and SD 1.5. For ${model}, export the layout "ai-toolkit or OneTrainer" instead.\n`,
    );
  }
  return parts.join('\n');
}

ui.exportButton.addEventListener('click', async () => {
  if (!state.store) return;
  await flushCaption();
  const store = state.store;
  const layout = /** @type {Layout} */ (ui.layout.value);
  const repeats = Number(ui.repeats.value) || 10;
  const root = safeBase(state.meta.card.title || state.meta.trigger || 'dataset');
  const total = state.items.length;
  ui.exportButton.disabled = true;
  ui.exportMeter.hidden = false;
  try {
    const pictures = [];
    for (const [i, item] of state.items.entries()) {
      ui.exportMeter.update(i / total, `Reading picture ${i + 1} of ${total}`);
      pictures.push({
        name: item.name,
        data: new Uint8Array(await (await store.readPicture(item.name)).arrayBuffer()),
        caption: state.captions.get(item.name) ?? '',
      });
    }
    ui.exportMeter.update(null, 'Packing the ZIP');
    const card = datasetCard(
      state.meta,
      state.items.map((i) => i.name),
      cardLabels(),
    );
    const files = exportFiles(pictures, { layout, meta: state.meta, card, repeats });
    // Settings files for the trainers and TRAINING.md (lib/tagger/training.js).
    files.push(
      ...trainingFiles({
        layout,
        root,
        target: state.meta.target,
        trigger: state.meta.trigger,
        captions: pictures.map((p) => p.caption),
        readme: trainingReadme(layout, pictures.length, repeats, root),
      }),
    );
    const zip = createZip(files);
    const name = `${root}-${layout}.zip`;
    const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    const link = h('a', { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    const missing = pictures.filter((p) => !p.caption.trim()).length;
    ui.exportStatus.textContent = `Saved ${name} (pictures: ${pictures.length}).${missing ? ` Without a caption: ${missing}.` : ''}`;
  } catch (e) {
    ui.exportStatus.textContent = `The export stopped: ${messageOf(e)}`;
  } finally {
    ui.exportButton.disabled = false;
    ui.exportMeter.hidden = true;
  }
});

// Browser mode keeps pictures until the person removes them; the button asks for a second press.
ui.forget.addEventListener('click', async () => {
  if (state.armed !== 'forget') {
    disarm();
    state.armed = 'forget';
    ui.forget.textContent = `Press again to remove ${count(state.items.length, 'picture')} and their captions`;
    return;
  }
  disarm();
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = null;
  await memory.clear();
  await open(memory);
  ui.mode.textContent = 'The pictures and captions are removed from this browser.';
  ui.forgetStatus.textContent = '';
});

// --- start ------------------------------------------------------------------------------------------

// Pictures from an earlier visit in browser mode are still in the browser; open them again.
memory
  .list()
  .then((list) => (list.length ? open(memory) : undefined))
  .catch(() => undefined);

// Saves that wait for their timer go out before the page closes.
addEventListener('pagehide', () => {
  flushCaption();
});
