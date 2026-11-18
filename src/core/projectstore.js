// Saved projects: the logic (create, save, open, duplicate, rename, delete,
// list) over a small storage interface (ProjectStorage in types.ts), so it
// runs in Node with memoryStorage(). In the browser the storage is IndexedDB
// (services/storage/idb.ts). No DOM, no interface texts.
//
// Record: {id, name, created, modified, opened, version, doc, counts, thumb}
//   doc: the document of projectdoc.js; counts: {sheets, pieces}; thumb: a
//   Blob (thumbnail of the first sheet) or null; opened: when it was last
//   opened. A project's files are referenced by the keys of
//   projectdoc.fileKeys(); each binary is stored once per content (its hash),
//   whoever references it.

import { DOC_VERSION, DEFAULT_CUTS, ProjectError, deserialize, fileKeys, counts } from './projectdoc.js';

/** The longest a project's name can be. */
export const NAME_MAX = 80;

/** A new project id («p» + time + random), unique in practice. */
export const newProjectId = (now = Date.now(), random = Math.random) =>
  `p${now.toString(36)}${Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0')}`;

/** A clean name: no extra spaces and at most NAME_MAX characters; empty → `fallback`. */
export function cleanName(name, fallback) {
  const clean = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return clean || fallback;
}

/** A new project's document: one empty sheet with the given settings. */
export function emptyDoc({ paper = 'A4', landscape = false, margin = 10, gap = 5, rotate = true, allowOverlap = false, cuts = DEFAULT_CUTS } = {}) {
  return { version: DOC_VERSION, paper, landscape, margin, gap, rotate, allowOverlap, cuts: { ...cuts }, sheets: [{ id: 1 }], items: [], assets: {} };
}

/** Creates and stores a project (empty by default). Returns the record. */
export async function createProject(storage, { id, name, now, doc = emptyDoc(), thumb = null }) {
  const record = { id, name, created: now, modified: now, opened: now, version: doc.version, doc, counts: counts(doc), thumb };
  await storage.write(record, { create: true });
  return record;
}

/**
 * Saves a project's document. `files`: key → StoredFile of the binaries
 * available in memory; `stored`: key → hash of the files already stored (not
 * written again). Writes only what is missing and drops the references that
 * aren't used any more, with the record (and `history`, if given: see
 * WriteChanges) in one operation. `thumb`: a new thumbnail (undefined: keeps
 * the one there was). Returns {record, stored} (the files stored now).
 */
export async function saveProject(storage, { record, doc, files, stored = new Map(), history, blobs, thumb, now }) {
  const needed = fileKeys(doc);
  const put = new Map();
  for (const key of needed) {
    if (stored.has(key)) continue;
    const file = files.get(key);
    if (!file) throw new ProjectError('corrupt', `missing file ${key}`);
    put.set(key, file);
  }
  const remove = [...stored.keys()].filter((key) => !needed.includes(key));
  const next = {
    ...record,
    modified: now,
    version: doc.version,
    doc,
    counts: counts(doc),
    thumb: thumb === undefined ? (record.thumb ?? null) : thumb,
  };
  await storage.write(next, { put, remove, history, blobs });
  return { record: next, stored: new Map(needed.map((key) => [key, put.get(key)?.hash ?? stored.get(key)])) };
}

/**
 * Opens a project: {record, doc, files}. Throws ProjectError 'missing' if it
 * isn't there, 'newer' if a newer version of the app saved it and 'corrupt'
 * if its document can't be read or a file is missing. `context`: what
 * migrating needs (projectdoc.migrate).
 */
export async function loadProject(storage, id, context = {}) {
  const record = await storage.get(id);
  if (!record) throw new ProjectError('missing', id);
  const doc = deserialize(record.doc, context);
  const files = await storage.files(id);
  const missing = fileKeys(doc).filter((key) => !files.has(key));
  if (missing.length) throw new ProjectError('corrupt', `missing files: ${missing.join(', ')}`);
  return { record, doc, files };
}

/** When a project sorts in the list: when it was last opened (or saved, for records from before). */
export const sortTime = (record) => record.opened ?? record.modified ?? 0;

/**
 * Copies a project: the same files (references: no binary is copied) and no
 * undo history. It sorts right after the original, so nothing else moves in
 * the list. `name`: the copy's, or made from the original's (read in the
 * same operation, which starts at once: nothing is read before). Returns the
 * new record.
 */
export function duplicateProject(storage, id, { newId, name, now }) {
  return storage.copy(id, (record) => ({
    ...record,
    id: newId,
    name: typeof name === 'function' ? name(record.name) : name,
    created: now,
    modified: now,
    opened: sortTime(record) - 1,
  }));
}

/**
 * Changes the name (already clean), and only the name, in one operation: its
 * dates stay, so renaming doesn't reorder the list (or make another tab's
 * last-moment journal look stale). Returns the record.
 */
export async function renameProject(storage, id, name) {
  const record = await storage.update(id, { name });
  if (!record) throw new ProjectError('missing', id);
  return record;
}

/** Records that the project was opened now (only that: it doesn't count as a change). Returns the record, or null. */
export const touchProject = (storage, id, now) => storage.update(id, { opened: now });

/** Deletes the project, its file references and its undo history (can't be undone). */
export const deleteProject = (storage, id) => storage.remove(id);

/**
 * Why the record's document can't be opened (without looking at the files):
 * null, 'corrupt' or 'newer' (saved by a newer version of the app: it is
 * fine, this one just can't read it).
 */
export function openProblem(record) {
  try {
    deserialize(record.doc);
    return null;
  } catch (err) {
    return err instanceof ProjectError && err.code === 'newer' ? 'newer' : 'corrupt';
  }
}

/** Is the record's document damaged? (Without looking at its files.) */
export const isDamaged = (record) => openProblem(record) === 'corrupt';

/**
 * Every project, the last opened first, with `damaged` and `newer` (saved by
 * a newer version of the app: left alone).
 */
export async function listProjects(storage) {
  const records = await storage.list();
  return records
    .map((record) => {
      const problem = openProblem(record);
      return { ...record, damaged: problem === 'corrupt', newer: problem === 'newer' };
    })
    .sort((a, b) => sortTime(b) - sortTime(a));
}

/** Which project to open on start: the last one if it can be opened, else the last opened of the rest (or null). */
export function pickProject(list, lastId) {
  const usable = list.filter((record) => !record.damaged && !record.newer);
  return (usable.find((record) => record.id === lastId) ?? usable[0])?.id ?? null;
}

/**
 * Last-moment journal: when the tab closes or reloads, IndexedDB doesn't
 * promise to finish writing (the connection closes with the page), so the
 * document is also written down synchronously (localStorage, one key per
 * project). On opening the project, the journal is used when the stored
 * record is still the one it started from. Pieces whose files didn't get
 * saved yet (added in the last second) are dropped, with their assets.
 *
 * `journal` (doc not validated yet), one of:
 *   version 2: {v: 2, id, base, name, doc}: `base` is the `modified` of the
 *     stored record the tab had last read or written. If the record was saved
 *     since (by that last save going through, or by another tab), its
 *     `modified` is another one and the journal is stale. An equality, not an
 *     order: the system clock can step back between saving and closing.
 *   version 1 (no `v`): {id, at, name, doc}, used when `at` is later than the
 *     record's `modified` (by the clock).
 * Returns {doc, name}, or null when it doesn't apply or can't be read.
 */
export function recoverJournal(record, files, journal, context = {}) {
  if (!journal || journal.id !== record.id) return null;
  const current = journal.v === 2 ? journal.base === record.modified : journal.at > (record.modified ?? 0);
  if (!current) return null;
  let doc;
  try {
    doc = deserialize(journal.doc, context);
  } catch {
    return null;
  }
  const has = (key) => files.has(key);
  const usable = new Set(
    Object.entries(doc.assets)
      .filter(([key, a]) => has(`src:${a.src}`) && has(`preview:${key}`) && (!(a.kind === 'image' && a.derived) || has(`bytes:${a.src}`)))
      .map(([key]) => key)
  );
  const items = doc.items.filter((item) => usable.has(item.asset));
  const assets = Object.fromEntries(Object.entries(doc.assets).filter(([key]) => items.some((item) => item.asset === key)));
  return { doc: { ...doc, items, assets }, name: typeof journal.name === 'string' ? journal.name : record.name };
}

/**
 * A storage in memory with the same interface and guarantees (for tests):
 * binaries once per hash, deleted only by collectGarbage when nothing
 * references them. `fail(op)` may return an error to simulate failures (e.g.
 * over quota); the operation then changes nothing.
 */
export function memoryStorage({ fail = () => null } = {}) {
  const records = new Map();
  const refs = new Map(); // project id → Map key → hash
  const blobs = new Map(); // hash → Blob
  const histories = new Map(); // project id → stored history
  let clip = null;
  const check = (op) => {
    const error = fail(op);
    if (error) throw error;
  };
  const keep = (hash, blob) => {
    if (!blobs.has(hash)) blobs.set(hash, blob);
  };
  return {
    async list() {
      check('list');
      return [...records.values()].map((record) => structuredClone(record));
    },
    async get(id) {
      check('get');
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async files(id) {
      check('files');
      return new Map([...(refs.get(id) ?? [])].map(([key, hash]) => [key, { blob: blobs.get(hash), hash }]));
    },
    async write(record, { put = new Map(), remove = [], history, blobs: extra = new Map(), create = false } = {}) {
      check('write');
      if (!create && !records.has(record.id)) throw new ProjectError('missing', record.id);
      const next = new Map(refs.get(record.id) ?? []);
      for (const [key, file] of put) {
        keep(file.hash, file.blob);
        next.set(key, file.hash);
      }
      for (const key of remove) next.delete(key);
      for (const [hash, blob] of extra) keep(hash, blob);
      if (history === null) histories.delete(record.id);
      else if (history) histories.set(record.id, structuredClone(history));
      records.set(record.id, structuredClone(record));
      refs.set(record.id, next);
    },
    async update(id, patch) {
      check('update');
      if (!records.has(id)) return null;
      const next = { ...records.get(id), ...patch };
      records.set(id, next);
      return structuredClone(next);
    },
    async copy(id, make) {
      check('copy');
      if (!records.has(id)) throw new ProjectError('missing', id);
      const record = make(structuredClone(records.get(id)));
      records.set(record.id, structuredClone(record));
      refs.set(record.id, new Map(refs.get(id)));
      return structuredClone(record);
    },
    async remove(id) {
      check('remove');
      records.delete(id);
      refs.delete(id);
      histories.delete(id);
    },
    async history(id) {
      check('history');
      return histories.has(id) ? structuredClone(histories.get(id)) : null;
    },
    async clip() {
      check('clip');
      return clip ? structuredClone(clip) : null;
    },
    async setClip(next, extra = new Map()) {
      check('setClip');
      for (const [hash, blob] of extra) keep(hash, blob);
      clip = next ? structuredClone(next) : null;
    },
    async blobs(hashes) {
      check('blobs');
      return new Map(hashes.filter((hash) => blobs.has(hash)).map((hash) => [hash, blobs.get(hash)]));
    },
    async collectGarbage() {
      check('collectGarbage');
      const live = liveHashes({ files: [...refs.values()].flatMap((map) => [...map.values()]), histories: [...histories.values()], clip });
      let deleted = 0;
      for (const hash of [...blobs.keys()]) {
        if (live.has(hash)) continue;
        blobs.delete(hash);
        deleted++;
      }
      return deleted;
    },
    /** For tests: how many binaries are stored. */
    blobCount: () => blobs.size,
  };
}

/**
 * The hashes something references: the projects' files, the saved undo
 * histories and the saved clipboard. A binary outside this set can go.
 */
export function liveHashes({ files = [], histories = [], clip = null }) {
  const live = new Set(files);
  for (const history of histories) for (const hash of history.hashes ?? []) live.add(hash);
  for (const hash of clip?.hashes ?? []) live.add(hash);
  return live;
}
