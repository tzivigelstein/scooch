// Project storage in IndexedDB, with the interface of core/projectstore.js.
// Database PROJECTS_DB (config): «projects» (records, by id) and «files»
// (binaries as Blob, by [project, key], with an index by project). Nothing
// leaves the browser.

import { PROJECTS_DB } from '../../config.ts';
import type { ProjectRecord, ProjectStorage } from '../../core/types.ts';

const DB_VERSION = 1;

export interface IdbStorage extends ProjectStorage {
  close(): void;
}

interface FileRow {
  project: string;
  key: string;
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
 * Opens a database only if it exists (with any version), without creating
 * it: null when there is none.
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
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) {
        const files = db.createObjectStore('files', { keyPath: ['project', 'key'] });
        files.createIndex('project', 'project');
      }
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

function idbStorage(db: IDBDatabase): IdbStorage {
  return {
    close: () => db.close(),
    async list() {
      const tx = db.transaction('projects');
      return promised<ProjectRecord[]>(tx.objectStore('projects').getAll());
    },
    async get(id) {
      const tx = db.transaction('projects');
      return (await promised<ProjectRecord | undefined>(tx.objectStore('projects').get(id))) ?? null;
    },
    async files(id) {
      const tx = db.transaction('files');
      const rows = await promised<FileRow[]>(tx.objectStore('files').index('project').getAll(IDBKeyRange.only(id)));
      return new Map(rows.map((row) => [row.key, row.blob]));
    },
    async write(record, { put = new Map(), remove = [] } = {}) {
      const tx = db.transaction(['projects', 'files'], 'readwrite');
      const finished = done(tx);
      const files = tx.objectStore('files');
      for (const [key, blob] of put) files.put({ project: record.id, key, blob } satisfies FileRow);
      for (const key of remove) files.delete([record.id, key]);
      tx.objectStore('projects').put(record);
      return finished;
    },
    async remove(id) {
      const tx = db.transaction(['projects', 'files'], 'readwrite');
      const finished = done(tx);
      tx.objectStore('projects').delete(id);
      tx.objectStore('files').index('project').openKeyCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursor | null>).result;
        if (!cursor) return;
        tx.objectStore('files').delete(cursor.primaryKey);
        cursor.continue();
      };
      return finished;
    },
  };
}
