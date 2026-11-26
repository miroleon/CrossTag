// @ts-check
// Copied from miroleon/ai-showcase, src/lib/tagger/folder-store.js, commit 6065cf3, without changes.
// Change it there first and copy it again, so the two copies stay the same. MIT License (see LICENSE).
/**
 * Folder mode of the tagger: the page works directly in a folder on the computer, as CrossTag does.
 * Captions are saved as .txt files next to the pictures, and tagger.json holds the trigger word, the
 * dataset card and the source of each picture.
 *
 * This uses the File System Access API, which Chrome and Edge on desktop have. The page calls
 * showDirectoryPicker(); the browser asks the person once whether the page may change files in the
 * chosen folder, and the permission lasts for the visit. Safari, Firefox and phones do not have the
 * API, so the page uses memory-store.js there.
 *
 * Only the chosen folder is read, not the folders inside it, as in CrossTag.
 *
 * Part of the tagger library, which has no imports from the rest of the site (ADR 0031).
 */
import { captionName, isImageName, naturalOrder } from './captions.js';
import { META_FILE, emptyMeta, readMeta, writeMeta } from './dataset.js';

/** @typedef {import('./store.js').Store} Store */

/** True when this browser can open a folder for reading and writing. */
export const folderPickerSupported = () => typeof (/** @type {any} */ (globalThis).showDirectoryPicker) === 'function';

/**
 * Ask the person for a folder and open it. Throws an AbortError when they cancel the picker.
 * @returns {Promise<Store>}
 */
export async function pickFolder() {
  // "id" lets the browser start the picker in the folder chosen last time.
  const dir = await /** @type {any} */ (globalThis).showDirectoryPicker({ id: 'tagger', mode: 'readwrite' });
  return folderStore(dir);
}

/**
 * A store on a directory handle. The unit tests pass a stand-in handle with the same methods.
 * @param {FileSystemDirectoryHandle} dir
 * @returns {Store}
 */
export function folderStore(dir) {
  /** Every file in the folder, by name. */
  async function files() {
    /** @type {Map<string, FileSystemFileHandle>} */
    const out = new Map();
    for await (const [name, handle] of /** @type {any} */ (dir).entries()) if (handle.kind === 'file') out.set(name, handle);
    return out;
  }

  /** @param {string} name @param {Blob | string} data */
  async function write(name, data) {
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  /**
   * Rename one file. Chromium has FileSystemFileHandle.move(); where it is missing or refuses, the
   * file is copied to the new name and the old one removed.
   * @param {string} from @param {string} to
   */
  async function move(from, to) {
    const handle = /** @type {any} */ (await dir.getFileHandle(from));
    if (typeof handle.move === 'function') {
      try {
        await handle.move(to);
        return;
      } catch {
        // Fall through to copy and delete.
      }
    }
    await write(to, await handle.getFile());
    await dir.removeEntry(from);
  }

  return {
    kind: 'folder',
    label: dir.name,

    async list() {
      const all = await files();
      const pictures = [...all.keys()].filter(isImageName).sort(naturalOrder);
      return Promise.all(
        pictures.map(async (name) => {
          const txt = all.get(captionName(name));
          return { name, caption: txt ? (await (await txt.getFile()).text()).trim() : '' };
        }),
      );
    },

    async readPicture(name) {
      return (await dir.getFileHandle(name)).getFile();
    },

    async writeCaption(name, caption) {
      const file = captionName(name);
      // An empty caption does not create a file; an existing one is emptied.
      if (!caption && !(await files()).has(file)) return;
      await write(file, caption);
    },

    async readMeta() {
      try {
        const file = await (await dir.getFileHandle(META_FILE)).getFile();
        return readMeta(JSON.parse(await file.text()));
      } catch {
        return emptyMeta();
      }
    },

    async writeMeta(meta) {
      await write(META_FILE, writeMeta(meta));
    },

    async rename(plan) {
      const all = await files();
      /** @type {{ from: string, to: string }[]} */
      const moves = [];
      for (const { from, to } of plan) {
        if (from === to) continue;
        moves.push({ from, to });
        if (all.has(captionName(from))) moves.push({ from: captionName(from), to: captionName(to) });
      }
      // A new name may not belong to a file that is not renamed itself, or that file would be lost.
      const sources = new Set(moves.map((m) => m.from));
      const blocked = moves.find((m) => all.has(m.to) && !sources.has(m.to));
      if (blocked) throw Object.assign(new Error(`${blocked.to} exists already.`), { code: 'exists', file: blocked.to });
      // Two rounds through temporary names, so "b" can become "a" while "a" becomes "b".
      const temp = moves.map((m, i) => `.tagger-rename-${i}-${m.to}`);
      for (const [i, m] of moves.entries()) await move(m.from, temp[i]);
      for (const [i, m] of moves.entries()) await move(temp[i], m.to);
    },
  };
}
