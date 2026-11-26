// @ts-check
// Copied from miroleon/ai-showcase, src/lib/tagger/memory-store.js, commit 6065cf3, without changes.
// Change it there first and copy it again, so the two copies stay the same. MIT License (see LICENSE).
/**
 * Browser mode of the tagger, for Safari, Firefox, phones, and anyone who prefers not to give the
 * page a folder. The person adds pictures (and captions, or a ZIP from an earlier session); the
 * pictures and captions stay in this browser's IndexedDB, survive a reload, and leave as a ZIP.
 *
 * IndexedDB is the browser's database for larger data; it keeps pictures as Blobs. The store talks to
 * it through a small key-value interface, so the unit tests can use a Map instead.
 *
 * Part of the tagger library, which has no imports from the rest of the site (ADR 0031).
 */
import { extensionOf, naturalOrder } from './captions.js';
import { emptyMeta, readMeta } from './dataset.js';

/** @typedef {import('./store.js').Store} Store */

/**
 * @typedef {object} KeyValue
 * @property {(key: string) => Promise<any>} get
 * @property {(key: string, value: any) => Promise<void>} set
 * @property {(key: string) => Promise<void>} delete
 * @property {() => Promise<string[]>} keys
 * @property {() => Promise<void>} clear
 */

/** @typedef {Store & { add: (pictures: { name: string, data: Uint8Array | Blob, caption: string }[]) => Promise<void>, clear: () => Promise<void> }} MemoryStore */

const MIME = /** @type {Record<string, string>} */ ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' });

/**
 * @param {KeyValue} [kv]  defaults to IndexedDB
 * @returns {MemoryStore}
 */
export function memoryStore(kv = indexedDbKeyValue()) {
  // Pictures and captions under separate keys, so saving a caption does not write the picture again.
  const pic = (/** @type {string} */ name) => `picture:${name}`;
  const cap = (/** @type {string} */ name) => `caption:${name}`;

  async function names() {
    return (await kv.keys())
      .filter((k) => k.startsWith('picture:'))
      .map((k) => k.slice('picture:'.length))
      .sort(naturalOrder);
  }

  return {
    kind: 'memory',
    label: '',

    async list() {
      return Promise.all((await names()).map(async (name) => ({ name, caption: (await kv.get(cap(name))) ?? '' })));
    },

    async readPicture(name) {
      const blob = await kv.get(pic(name));
      if (!blob) throw new Error(`${name} is not in the store.`);
      return blob;
    },

    async writeCaption(name, caption) {
      await kv.set(cap(name), caption);
    },

    async readMeta() {
      return readMeta((await kv.get('meta')) ?? emptyMeta());
    },

    async writeMeta(meta) {
      // A plain copy: IndexedDB stores objects by cloning them.
      await kv.set('meta', JSON.parse(JSON.stringify(meta)));
    },

    async rename(plan) {
      const moves = plan.filter((p) => p.from !== p.to);
      // Read everything first, then delete, then write, so names can swap places.
      const held = await Promise.all(moves.map(async (m) => ({ ...m, blob: await kv.get(pic(m.from)), caption: await kv.get(cap(m.from)) })));
      for (const m of held) {
        await kv.delete(pic(m.from));
        await kv.delete(cap(m.from));
      }
      for (const m of held) {
        await kv.set(pic(m.to), m.blob);
        if (m.caption !== undefined) await kv.set(cap(m.to), m.caption);
      }
    },

    /** Add pictures. A picture with a name already in the store replaces it; an empty caption keeps the old one. */
    async add(pictures) {
      for (const p of pictures) {
        const blob = p.data instanceof Blob ? p.data : new Blob([/** @type {Uint8Array<ArrayBuffer>} */ (p.data)], { type: MIME[extensionOf(p.name)] ?? '' });
        await kv.set(pic(p.name), blob);
        if (p.caption || (await kv.get(cap(p.name))) === undefined) await kv.set(cap(p.name), p.caption);
      }
    },

    /** Remove every picture, caption and the dataset information. */
    async clear() {
      await kv.clear();
    },
  };
}

/**
 * A key-value store in IndexedDB.
 * @param {string} [dbName]
 * @returns {KeyValue}
 */
export function indexedDbKeyValue(dbName = 'tagger') {
  const STORE = 'files';
  /** @type {Promise<IDBDatabase> | null} */
  let opening = null;
  const open = () => {
    opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        opening = null;
        reject(request.error);
      };
    });
    return opening;
  };
  /**
   * @template T
   * @param {IDBTransactionMode} mode @param {(s: IDBObjectStore) => IDBRequest<T>} action
   * @returns {Promise<T>}
   */
  const run = async (mode, action) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    get: (key) => run('readonly', (s) => s.get(key)),
    set: async (key, value) => {
      await run('readwrite', (s) => s.put(value, key));
    },
    delete: async (key) => {
      await run('readwrite', (s) => s.delete(key));
    },
    keys: async () => (await run('readonly', (s) => s.getAllKeys())).map(String),
    clear: async () => {
      await run('readwrite', (s) => s.clear());
    },
  };
}
