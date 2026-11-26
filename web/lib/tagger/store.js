// @ts-check
// Copied from miroleon/ai-showcase, src/lib/tagger/store.js, commit 6065cf3, without changes.
// Change it there first and copy it again, so the two copies stay the same. MIT License (see LICENSE).
/**
 * The one interface both places that keep a dataset share: a folder on the computer
 * (folder-store.js) and the browser's own storage (memory-store.js). The page talks only to this
 * interface, so every tool works the same in both modes.
 *
 * Part of the tagger library, which has no imports from the rest of the site (ADR 0031).
 */

/**
 * @typedef {object} Store
 * @property {'folder' | 'memory'} kind
 * @property {string} label   the folder's name (folder mode)
 * @property {() => Promise<{ name: string, caption: string }[]>} list   pictures in natural order
 * @property {(name: string) => Promise<Blob>} readPicture
 * @property {(name: string, caption: string) => Promise<void>} writeCaption
 * @property {() => Promise<import('./dataset.js').DatasetMeta>} readMeta
 * @property {(meta: import('./dataset.js').DatasetMeta) => Promise<void>} writeMeta
 * @property {(plan: { from: string, to: string }[]) => Promise<void>} rename   pictures and their captions
 */

export {};
