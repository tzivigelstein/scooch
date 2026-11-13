// Project storage in IndexedDB, with the interface of core/projectstore.js.
// Database «pliego»: «projects» (records, by id) and «files» (binaries as Blob,
// by [project, key], with an index by project). Nothing leaves the browser.

import type { ProjectRecord, ProjectStorage } from '../../core/types.ts';

const DB_NAME = 'pliego';
const DB_VERSION = 1;

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
export function openIdbStorage({ timeout = 4000 } = {}): Promise<ProjectStorage> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      if (!globalThis.indexedDB) throw new Error('IndexedDB is not available');
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    const timer = setTimeout(() => reject(new Error('IndexedDB did not answer')), timeout);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) {
        const files = db.createObjectStore('files', { keyPath: ['project', 'key'] });
        files.createIndex('project', 'project');
      }
    };
    request.onblocked = () => {}; // another tab with an older version: wait
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      // If another tab needs to upgrade the database, this one lets it go.
      db.onversionchange = () => db.close();
      resolve(idbStorage(db));
    };
  });
}

function idbStorage(db: IDBDatabase): ProjectStorage {
  return {
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
