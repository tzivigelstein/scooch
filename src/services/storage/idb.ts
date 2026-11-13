// Project storage in IndexedDB, with the interface of core/projectstore.js.
// Nothing leaves the browser.
//
// Database PROJECTS_DB (config), layout version 2:
//   «projects»  records, by id ({id, name, created, modified, …}).
//   «files»     a project's files: {project, key, hash}, by [project, key],
//               indexed by project and by hash.
//   «blobs»     every binary once per content: {hash, blob}, by hash.
//   «history»   each project's saved undo history, by project; its `hashes`
//               (multiEntry) are the binaries it keeps.
//   «clipboard» the pieces cut and not pasted yet (one record, 'cut'), with
//               its `hashes` (multiEntry) too.
// A binary is deleted only by collectGarbage, in one transaction that finds
// no reference to it in «files», «history» or «clipboard». Every write that
// adds a reference stores the binary it needs in the same transaction, and a
// save to a project that is no longer there fails: so no reference ever
// points to a deleted binary, whatever other tabs do and whenever a tab dies.
//
// Version 1 kept each binary inside its «files» row ({project, key, blob}).
// Opening the database at version 2 adds the new stores; the rows are
// converted afterwards (hashing needs time, and an upgrade's transaction can't
// wait for it): a project's rows before it opens (files()), the rest in the
// background (convertAll). Each row is converted in a transaction that stores
// its binary and rewrites the row together, so an interruption leaves every
// row whole, old or new; reading takes both.

import { PROJECTS_DB } from '../../config.ts';
import { ProjectError } from '../../core/projectdoc.js';
import type { ProjectRecord, ProjectStorage, StoredClip, StoredFile, StoredHistory, WriteChanges } from '../../core/types.ts';
import { hashBlob } from './hash.ts';

export const DB_VERSION = 2;

export interface IdbStorage extends ProjectStorage {
  close(): void;
  /** Converts every version 1 row left (see above). Returns how many rows. */
  convertAll(): Promise<number>;
}

/** A row of «files»: a reference (version 2) or, before converting, the binary itself (version 1). */
interface FileRow {
  project: string;
  key: string;
  hash?: string;
  blob?: Blob;
}

interface BlobRow {
  hash: string;
  blob: Blob;
}

const promised = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // An aborted transaction (e.g. over quota) keeps its error in tx.error.
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
    tx.onerror = () => {}; // reported by onabort
  });

/**
 * Opens the database. Rejects if IndexedDB is missing or unusable (some
 * browsers in private mode), or if it doesn't answer within `timeout` ms.
 */
export function openIdbStorage({ name = PROJECTS_DB, timeout = 4000 } = {}): Promise<IdbStorage> {
  return open(name, timeout, false) as Promise<IdbStorage>;
}

/**
 * Opens a database only if it exists (with any version, its stores as they
 * are), without creating it: null when there is none.
 */
export async function openExistingIdbStorage(name: string, { timeout = 4000 } = {}): Promise<IdbStorage | null> {
  if (!globalThis.indexedDB) return null;
  // Where the browser can list the databases, a missing one isn't even touched.
  if (typeof indexedDB.databases === 'function') {
    const names = (await indexedDB.databases()).map((info) => info.name);
    if (!names.includes(name)) return null;
  }
  return open(name, timeout, true);
}

/** Creates the stores and indexes version 2 has and the database doesn't yet. */
function upgrade(db: IDBDatabase, tx: IDBTransaction) {
  if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
  const files = db.objectStoreNames.contains('files') ? tx.objectStore('files') : db.createObjectStore('files', { keyPath: ['project', 'key'] });
  if (!files.indexNames.contains('project')) files.createIndex('project', 'project');
  if (!files.indexNames.contains('hash')) files.createIndex('hash', 'hash');
  if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'hash' });
  if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'project' }).createIndex('hashes', 'hashes', { multiEntry: true });
  if (!db.objectStoreNames.contains('clipboard')) db.createObjectStore('clipboard', { keyPath: 'id' }).createIndex('hashes', 'hashes', { multiEntry: true });
}

function open(name: string, timeout: number, existing: boolean): Promise<IdbStorage | null> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      if (!globalThis.indexedDB) throw new Error('IndexedDB is not available');
      // Without a version, an existing database opens as it is.
      request = existing ? indexedDB.open(name) : indexedDB.open(name, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    let missing = false;
    const timer = setTimeout(() => reject(new Error('IndexedDB did not answer')), timeout);
    request.onupgradeneeded = (event) => {
      if (existing && event.oldVersion === 0) {
        // It didn't exist: aborting the upgrade leaves it uncreated.
        missing = true;
        request.transaction?.abort();
        return;
      }
      upgrade(request.result, request.transaction!);
    };
    request.onblocked = () => {}; // another tab with an older version: wait
    request.onerror = (event) => {
      clearTimeout(timer);
      if (missing) {
        event.preventDefault();
        resolve(null);
      } else reject(request.error);
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      // If another tab needs to upgrade or delete the database, this one lets it go.
      db.onversionchange = () => db.close();
      // An existing database without the stores (never finished): nothing in it.
      if (existing && !(db.objectStoreNames.contains('projects') && db.objectStoreNames.contains('files'))) {
        db.close();
        resolve(null);
        return;
      }
      resolve(idbStorage(db));
    };
  });
}

/** Deletes a database. It doesn't wait for other tabs that still have it open. */
export function deleteIdb(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      // Another tab still has it: it gets deleted once that one lets it go.
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Runs `work` inside a request's callback: if it throws (a request refused
 * right away, e.g. over quota), the transaction aborts and `fail` keeps the
 * error for whoever awaits it (an exception there would otherwise be lost).
 */
function guarded(tx: IDBTransaction, fail: { error: unknown }, work: () => void) {
  try {
    work();
  } catch (err) {
    fail.error ??= err;
    try {
      tx.abort();
    } catch {
      // already finished
    }
  }
}

/** Stores `blob` under `hash` in this transaction, unless a binary with that hash already is. */
function keepBlob(blobs: IDBObjectStore, hash: string, blob: Blob) {
  blobs.count(hash).onsuccess = (e) => {
    if (!(e.target as IDBRequest<number>).result) blobs.put({ hash, blob } satisfies BlobRow);
  };
}

/** Deletes every row of an index's key (inside the transaction). */
function deleteAll(store: IDBObjectStore, index: string, key: IDBValidKey) {
  store.index(index).openKeyCursor(IDBKeyRange.only(key)).onsuccess = (e) => {
    const cursor = (e.target as IDBRequest<IDBCursor | null>).result;
    if (!cursor) return;
    store.delete(cursor.primaryKey);
    cursor.continue();
  };
}

function idbStorage(db: IDBDatabase): IdbStorage {
  // A database opened as it is (the one under the former name) may have only the version 1 stores.
  const has = (store: string) => db.objectStoreNames.contains(store);
  const layout2 = has('blobs');

  const readRows = async (id: string) => promised<FileRow[]>(db.transaction('files').objectStore('files').index('project').getAll(IDBKeyRange.only(id)));

  // Version 1 rows of these: hashed, then each binary stored once and its row
  // rewritten as a reference, in one transaction (a row converted meanwhile by
  // another tab, or deleted, is left as it is).
  async function convert(rows: readonly FileRow[]) {
    const legacy = rows.filter((row) => row.blob && !row.hash);
    if (!legacy.length || !layout2) return 0;
    const hashed = await Promise.all(legacy.map(async (row) => ({ row, hash: await hashBlob(row.blob!) })));
    const tx = db.transaction(['files', 'blobs'], 'readwrite');
    const finished = done(tx);
    const files = tx.objectStore('files');
    const blobs = tx.objectStore('blobs');
    const fail = { error: null as unknown };
    for (const { row, hash } of hashed) {
      files.get([row.project, row.key]).onsuccess = (e) =>
        guarded(tx, fail, () => {
          const current = (e.target as IDBRequest<FileRow | undefined>).result;
          if (!current?.blob || current.hash) return;
          keepBlob(blobs, hash, current.blob);
          files.put({ project: row.project, key: row.key, hash } satisfies FileRow);
        });
    }
    try {
      await finished;
    } catch (err) {
      throw fail.error ?? err;
    }
    return legacy.length;
  }

  async function readBlobs(hashes: readonly string[]) {
    const out = new Map<string, Blob>();
    if (!hashes.length || !layout2) return out;
    const tx = db.transaction('blobs');
    const store = tx.objectStore('blobs');
    await Promise.all(
      [...new Set(hashes)].map((hash) =>
        promised<BlobRow | undefined>(store.get(hash)).then((row) => {
          if (row) out.set(hash, row.blob);
        })
      )
    );
    return out;
  }

  return {
    close: () => db.close(),
    async list() {
      return promised<ProjectRecord[]>(db.transaction('projects').objectStore('projects').getAll());
    },
    async get(id) {
      return (await promised<ProjectRecord | undefined>(db.transaction('projects').objectStore('projects').get(id))) ?? null;
    },
    async files(id) {
      let rows = await readRows(id);
      if (await convert(rows)) rows = await readRows(id);
      const blobs = await readBlobs(rows.filter((row) => row.hash).map((row) => row.hash!));
      const out = new Map<string, StoredFile>();
      for (const row of rows) {
        const blob = row.hash ? blobs.get(row.hash) : row.blob;
        // A version 1 row that couldn't be converted (the database under the
        // former name) still has its binary; its hash is found when it is copied.
        if (blob) out.set(row.key, { blob, hash: row.hash ?? '' });
      }
      return out;
    },
    async write(record, { put = new Map(), remove = [], history, blobs: extra = new Map(), create = false }: WriteChanges = {}) {
      const stores = ['projects', 'files', 'blobs', ...(history !== undefined ? ['history'] : [])];
      const tx = db.transaction(stores, 'readwrite');
      const finished = done(tx);
      const fail = { error: null as unknown };
      const projects = tx.objectStore('projects');
      projects.getKey(record.id).onsuccess = (e) =>
        guarded(tx, fail, () => {
          // Deleted (in another tab): its references are gone, and so may be the binaries they kept.
          if ((e.target as IDBRequest).result === undefined && !create) throw new ProjectError('missing', record.id);
          const files = tx.objectStore('files');
          const blobs = tx.objectStore('blobs');
          for (const [key, file] of put) {
            keepBlob(blobs, file.hash, file.blob);
            files.put({ project: record.id, key, hash: file.hash } satisfies FileRow);
          }
          for (const key of remove) files.delete([record.id, key]);
          for (const [hash, blob] of extra) keepBlob(blobs, hash, blob);
          if (history === null) tx.objectStore('history').delete(record.id);
          else if (history) tx.objectStore('history').put(history);
          projects.put(record);
        });
      try {
        await finished;
      } catch (err) {
        throw fail.error ?? err;
      }
    },
    async update(id, patch) {
      const tx = db.transaction('projects', 'readwrite');
      const finished = done(tx);
      const store = tx.objectStore('projects');
      let next: ProjectRecord | null = null;
      store.get(id).onsuccess = (e) => {
        const record = (e.target as IDBRequest<ProjectRecord | undefined>).result;
        if (!record) return;
        next = { ...record, ...patch };
        store.put(next);
      };
      await finished;
      return next;
    },
    async copy(id, record) {
      // Version 1 rows become references first: a copy shares binaries, it never copies them.
      await convert(await readRows(id));
      const tx = db.transaction(['projects', 'files'], 'readwrite');
      const finished = done(tx);
      const fail = { error: null as unknown };
      const files = tx.objectStore('files');
      tx.objectStore('projects').getKey(id).onsuccess = (e) =>
        guarded(tx, fail, () => {
          if ((e.target as IDBRequest).result === undefined) throw new ProjectError('missing', id);
          files.index('project').getAll(IDBKeyRange.only(id)).onsuccess = (r) =>
            guarded(tx, fail, () => {
              for (const row of (r.target as IDBRequest<FileRow[]>).result) files.put({ ...row, project: record.id });
              tx.objectStore('projects').put(record);
            });
        });
      try {
        await finished;
      } catch (err) {
        throw fail.error ?? err;
      }
    },
    async remove(id) {
      const stores = ['projects', 'files', ...(has('history') ? ['history'] : [])];
      const tx = db.transaction(stores, 'readwrite');
      const finished = done(tx);
      tx.objectStore('projects').delete(id);
      deleteAll(tx.objectStore('files'), 'project', id);
      if (has('history')) tx.objectStore('history').delete(id);
      return finished;
    },
    async history(id) {
      if (!has('history')) return null;
      return (await promised<StoredHistory | undefined>(db.transaction('history').objectStore('history').get(id))) ?? null;
    },
    async clip() {
      if (!has('clipboard')) return null;
      return (await promised<StoredClip | undefined>(db.transaction('clipboard').objectStore('clipboard').get('cut'))) ?? null;
    },
    async setClip(clip, extra = new Map()) {
      const tx = db.transaction(['clipboard', 'blobs'], 'readwrite');
      const finished = done(tx);
      const blobs = tx.objectStore('blobs');
      for (const [hash, blob] of extra) keepBlob(blobs, hash, blob);
      if (clip) tx.objectStore('clipboard').put(clip);
      else tx.objectStore('clipboard').delete('cut');
      return finished;
    },
    blobs: readBlobs,
    async collectGarbage() {
      if (!layout2) return 0;
      const tx = db.transaction(['blobs', 'files', 'history', 'clipboard'], 'readwrite');
      const finished = done(tx);
      const blobs = tx.objectStore('blobs');
      const counters = [tx.objectStore('files').index('hash'), tx.objectStore('history').index('hashes'), tx.objectStore('clipboard').index('hashes')];
      let deleted = 0;
      blobs.getAllKeys().onsuccess = (e) => {
        for (const hash of (e.target as IDBRequest<IDBValidKey[]>).result) {
          let pending = counters.length;
          let used = false;
          for (const index of counters) {
            index.count(hash).onsuccess = (c) => {
              used ||= (c.target as IDBRequest<number>).result > 0;
              if (--pending === 0 && !used) {
                blobs.delete(hash);
                deleted++;
              }
            };
          }
        }
      };
      await finished;
      return deleted;
    },
    async convertAll() {
      if (!layout2) return 0;
      const rows = await promised<FileRow[]>(db.transaction('files').objectStore('files').getAll());
      let converted = 0;
      for (const project of new Set(rows.filter((row) => row.blob && !row.hash).map((row) => row.project))) {
        converted += await convert(await readRows(project));
      }
      return converted;
    },
  };
}
