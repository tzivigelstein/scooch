// Project storage in IndexedDB, with the interface of core/projectstore.js.
// Nothing leaves the browser.
//
// Database PROJECTS_DB (config), layout version 3:
//   «projects»  records, by id ({id, name, created, modified, opened, …});
//               the thumbnail as bytes ({bytes, type}) or null.
//   «files»     a project's files: {project, key, hash}, by [project, key],
//               indexed by project and by hash.
//   «blobs»     every binary once per content: {hash, bytes, type}, by hash,
//               indexed by type (which lists only the rows stored as bytes).
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
// Binaries are stored as bytes (an ArrayBuffer and the media type), never as
// Blobs: WebKit can't store a Blob in an ephemeral session (Safari's private
// windows, Playwright's WebKit): the request fails with «UnknownError: Error
// preparing Blob/File data to be stored in object store» and the transaction
// aborts. A Blob's bytes can only be read asynchronously, so they are read
// before the transaction opens: once it is open, only IndexedDB requests run
// in it, chained from their callbacks (awaiting anything else lets it commit).
// Writing only a record whose thumbnail came from here (a save of the
// document alone, also when the tab is closing) opens it right away.
//
// Earlier layouts, read as they are and converted:
//   1. each binary inside its «files» row ({project, key, blob}). Version 2
//      added the other stores; a project's rows are converted before it opens
//      (files()), the rest in the background (convertAll).
//   2. «blobs» rows {hash, blob} and Blob thumbnails. Version 3 adds the index
//      «type»; they are converted in the background (convertAll).
// Converting needs time (hashing, reading a Blob), and an upgrade's
// transaction can't wait for it. Each row is converted in a transaction of
// its own that reads it again and rewrites it only if it is still in the old
// shape, so an interruption leaves every row whole, old or new.

import { PROJECTS_DB } from '../../config.ts';
import { ProjectError } from '../../core/projectdoc.js';
import type { ProjectRecord, ProjectStorage, StoredClip, StoredFile, StoredHistory, WriteChanges } from '../../core/types.ts';
import { forgetBytes, hashBytes, knownBytes } from './hash.ts';

export const DB_VERSION = 3;

export interface IdbStorage extends ProjectStorage {
  close(): void;
  /** Converts every row of an earlier layout left (see above). Returns how many rows. */
  convertAll(): Promise<number>;
}

/** A binary as stored (layout 3). */
interface Bytes {
  bytes: ArrayBuffer;
  type: string;
}

/** A row of «files»: a reference (layout 2 on) or, before converting, the binary itself (layout 1). */
interface FileRow {
  project: string;
  key: string;
  hash?: string;
  blob?: Blob;
}

/** A row of «blobs»: bytes (layout 3) or, before converting, a Blob (layout 2). */
type BlobRow = { hash: string } & (Bytes | { blob: Blob });

/** A record as stored: its thumbnail as bytes, or a Blob before converting (layouts 1 and 2). */
type RecordRow = Omit<ProjectRecord, 'thumb'> & { thumb: Bytes | Blob | null };

const isBytes = (value: unknown): value is Bytes => !!value && typeof value === 'object' && (value as Bytes).bytes instanceof ArrayBuffer;

const blobOf = (stored: Bytes) => new Blob([stored.bytes], { type: stored.type });

/** A Blob's bytes as stored: right away when the app holds them (storage/hash.ts), else read. */
function bytesOf(blob: Blob): Bytes | Promise<Bytes> {
  const known = knownBytes(blob);
  // A view may share a larger buffer: only its own bytes are stored.
  if (known) return { bytes: (known.byteOffset === 0 && known.byteLength === known.buffer.byteLength ? known.buffer : known.slice().buffer) as ArrayBuffer, type: blob.type };
  return blob.arrayBuffer().then((bytes) => ({ bytes, type: blob.type }));
}

/** The binary of a «blobs» row, whichever layout stored it. */
const blobOfRow = (row: BlobRow) => ('blob' in row ? row.blob : isBytes(row) ? blobOf(row) : null);

// The bytes of the thumbnails this tab read or wrote, by their Blob: writing a
// record again doesn't have to read its thumbnail first (they are small).
const thumbBytes = new WeakMap<Blob, Bytes>();

function thumbOf(stored: RecordRow['thumb'] | undefined): Blob | null {
  if (stored instanceof Blob) return stored;
  if (!isBytes(stored)) return null;
  const blob = blobOf(stored);
  thumbBytes.set(blob, stored);
  return blob;
}

const recordOf = (row: RecordRow): ProjectRecord => ({ ...row, thumb: thumbOf(row.thumb) });

/** What a write stores: the record and the binaries by hash, as bytes. */
interface Prepared {
  row: RecordRow;
  bytes: Map<string, Bytes>;
}

/**
 * Turns the record's thumbnail and the binaries into bytes before a
 * transaction opens: synchronously when all of them are known, so the
 * transaction opens in the same task (see above).
 */
function prepare(record: ProjectRecord, binaries: ReadonlyMap<string, Blob> = new Map()): Prepared | Promise<Prepared> {
  const { thumb } = record;
  const thumbStored = thumb ? (thumbBytes.get(thumb) ?? bytesOf(thumb)) : null;
  const entries = [...binaries].map(([hash, blob]) => [hash, bytesOf(blob)] as const);
  if (!(thumbStored instanceof Promise) && entries.every(([, stored]) => !(stored instanceof Promise))) {
    if (thumb && thumbStored) thumbBytes.set(thumb, thumbStored);
    return { row: { ...record, thumb: thumbStored }, bytes: new Map(entries as (readonly [string, Bytes])[]) };
  }
  return (async () => {
    const stored = await thumbStored;
    if (thumb && stored) thumbBytes.set(thumb, stored);
    return { row: { ...record, thumb: stored }, bytes: new Map(await Promise.all(entries.map(async ([hash, bytes]) => [hash, await bytes] as const))) };
  })();
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

/** Creates the stores and indexes layout 3 has and the database doesn't yet. */
function upgrade(db: IDBDatabase, tx: IDBTransaction) {
  if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
  const files = db.objectStoreNames.contains('files') ? tx.objectStore('files') : db.createObjectStore('files', { keyPath: ['project', 'key'] });
  if (!files.indexNames.contains('project')) files.createIndex('project', 'project');
  if (!files.indexNames.contains('hash')) files.createIndex('hash', 'hash');
  const blobs = db.objectStoreNames.contains('blobs') ? tx.objectStore('blobs') : db.createObjectStore('blobs', { keyPath: 'hash' });
  if (!blobs.indexNames.contains('type')) blobs.createIndex('type', 'type');
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
        // WebKit keeps an empty database after an aborted upgrade; the others don't.
        void deleteIdb(name).then(() => resolve(null));
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

type Failure = { error: unknown };

/**
 * Runs `work` inside a request's callback: if it throws (a request refused
 * right away, e.g. over quota, or the transaction aborted by an earlier
 * request), the transaction aborts and `fail` keeps the first error for
 * whoever awaits it (an exception there would otherwise be lost).
 */
function guarded(tx: IDBTransaction, fail: Failure, work: () => void) {
  try {
    work();
  } catch (err) {
    fail.error ??= tx.error ?? err;
    try {
      tx.abort();
    } catch {
      // already finished
    }
  }
}

/** Waits for the transaction; its failure is the first error `fail` kept, if any. */
async function settled(tx: Promise<void>, fail: Failure) {
  try {
    await tx;
  } catch (err) {
    throw fail.error ?? err;
  }
}

/** Stores a binary under `hash` in this transaction, unless one with that hash already is. */
function keepBytes(tx: IDBTransaction, fail: Failure, blobs: IDBObjectStore, hash: string, stored: Bytes) {
  blobs.count(hash).onsuccess = (e) =>
    guarded(tx, fail, () => {
      if (!(e.target as IDBRequest<number>).result) blobs.put({ hash, bytes: stored.bytes, type: stored.type } satisfies BlobRow);
    });
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
  // A database opened as it is (the one under the former name) may have only the layout 1 stores.
  const has = (store: string) => db.objectStoreNames.contains(store);
  const layout2 = has('blobs');

  const readRows = async (id: string) => promised<FileRow[]>(db.transaction('files').objectStore('files').index('project').getAll(IDBKeyRange.only(id)));

  // Layout 1 rows of these: read and hashed, then each binary stored once and
  // its row rewritten as a reference, in one transaction (a row converted
  // meanwhile by another tab, or deleted, is left as it is).
  async function convert(rows: readonly FileRow[]) {
    const legacy = rows.filter((row) => row.blob && !row.hash);
    if (!legacy.length || !layout2) return 0;
    const read = await Promise.all(
      legacy.map(async (row) => {
        const stored = await bytesOf(row.blob!);
        return { row, stored, hash: await hashBytes(stored.bytes) };
      })
    );
    const tx = db.transaction(['files', 'blobs'], 'readwrite');
    const finished = done(tx);
    const files = tx.objectStore('files');
    const blobs = tx.objectStore('blobs');
    const fail: Failure = { error: null };
    for (const { row, stored, hash } of read) {
      files.get([row.project, row.key]).onsuccess = (e) =>
        guarded(tx, fail, () => {
          const current = (e.target as IDBRequest<FileRow | undefined>).result;
          if (!current?.blob || current.hash) return;
          keepBytes(tx, fail, blobs, hash, stored);
          files.put({ project: row.project, key: row.key, hash } satisfies FileRow);
        });
    }
    await settled(finished, fail);
    return legacy.length;
  }

  // Layout 2 binaries, already read, as bytes: their rows rewritten in one
  // transaction, each unless it was converted or deleted meanwhile.
  async function storeAsBytes(read: ReadonlyMap<string, Bytes>) {
    const tx = db.transaction('blobs', 'readwrite');
    const finished = done(tx);
    const fail: Failure = { error: null };
    const blobs = tx.objectStore('blobs');
    for (const [hash, stored] of read) {
      blobs.get(hash).onsuccess = (e) =>
        guarded(tx, fail, () => {
          const current = (e.target as IDBRequest<BlobRow | undefined>).result;
          if (current && 'blob' in current) blobs.put({ hash, bytes: stored.bytes, type: stored.type } satisfies BlobRow);
        });
    }
    await settled(finished, fail);
  }

  async function readBlobs(hashes: readonly string[]) {
    const out = new Map<string, Blob>();
    if (!hashes.length || !layout2) return out;
    const store = db.transaction('blobs').objectStore('blobs');
    const rows = await Promise.all([...new Set(hashes)].map((hash) => promised<BlobRow | undefined>(store.get(hash))));
    // A layout 2 binary is read into memory and converted right away: WebKit
    // invalidates a Blob read from IndexedDB once its row is rewritten (by
    // converting it, here, in the background or in another tab). One that
    // can't be read is given as it is.
    const read = new Map<string, Bytes>();
    for (const row of rows) {
      if (!row) continue;
      if (!('blob' in row)) {
        const blob = blobOfRow(row);
        if (blob) out.set(row.hash, blob);
        continue;
      }
      try {
        const stored = await bytesOf(row.blob);
        read.set(row.hash, stored);
        out.set(row.hash, blobOf(stored));
      } catch {
        out.set(row.hash, row.blob);
      }
    }
    if (read.size) await storeAsBytes(read).catch(() => {});
    return out;
  }

  // A layout 2 binary as bytes, unless it was converted or deleted meanwhile.
  async function convertBlobRow(hash: string) {
    const row = await promised<BlobRow | undefined>(db.transaction('blobs').objectStore('blobs').get(hash));
    if (!row || !('blob' in row)) return 0;
    await storeAsBytes(new Map([[hash, await bytesOf(row.blob)]]));
    return 1;
  }

  // A record's Blob thumbnail as bytes, unless it changed meanwhile.
  async function convertThumb(id: string) {
    const row = await promised<RecordRow | undefined>(db.transaction('projects').objectStore('projects').get(id));
    if (!(row?.thumb instanceof Blob)) return 0;
    const stored = await bytesOf(row.thumb);
    const tx = db.transaction('projects', 'readwrite');
    const finished = done(tx);
    const fail: Failure = { error: null };
    const projects = tx.objectStore('projects');
    projects.get(id).onsuccess = (e) =>
      guarded(tx, fail, () => {
        const current = (e.target as IDBRequest<RecordRow | undefined>).result;
        if (current?.thumb instanceof Blob) projects.put({ ...current, thumb: stored } satisfies RecordRow);
      });
    await settled(finished, fail);
    return 1;
  }

  return {
    close: () => db.close(),
    async list() {
      return (await promised<RecordRow[]>(db.transaction('projects').objectStore('projects').getAll())).map(recordOf);
    },
    async get(id) {
      const row = await promised<RecordRow | undefined>(db.transaction('projects').objectStore('projects').get(id));
      return row ? recordOf(row) : null;
    },
    async files(id) {
      let rows = await readRows(id);
      if (await convert(rows)) rows = await readRows(id);
      const blobs = await readBlobs(rows.filter((row) => row.hash).map((row) => row.hash!));
      const out = new Map<string, StoredFile>();
      for (const row of rows) {
        const blob = row.hash ? blobs.get(row.hash) : row.blob;
        // A layout 1 row that couldn't be converted (the database under the
        // former name) still has its binary; its hash is found when it is copied.
        if (blob) out.set(row.key, { blob, hash: row.hash ?? '' });
      }
      return out;
    },
    async write(record, { put = new Map(), remove = [], history, blobs: extra = new Map(), create = false }: WriteChanges = {}) {
      const binaries = new Map([...[...put.values()].map((file) => [file.hash, file.blob] as const), ...extra]);
      const ready = prepare(record, binaries);
      const { row, bytes } = ready instanceof Promise ? await ready : ready;
      // New files of a project that is there go first, each binary with its
      // reference, in a transaction whose requests all go out at once and is
      // committed right away: one that is still waiting for a callback when
      // the page goes away is lost (always in WebKit), and with it a file
      // added right before closing the tab (the last-moment journal keeps the
      // document, not the files). The record follows, checked as below; a
      // binary already stored is written again with the same content.
      const early = put.size > 0 && !create;
      if (early) {
        const tx = db.transaction(['files', 'blobs'], 'readwrite');
        const finished = done(tx);
        const files = tx.objectStore('files');
        const blobs = tx.objectStore('blobs');
        for (const [key, file] of put) {
          const stored = bytes.get(file.hash)!;
          blobs.put({ hash: file.hash, bytes: stored.bytes, type: stored.type } satisfies BlobRow);
          files.put({ project: record.id, key, hash: file.hash } satisfies FileRow);
        }
        tx.commit?.();
        await finished;
      }
      const stores = ['projects', 'files', 'blobs', ...(history !== undefined ? ['history'] : [])];
      const tx = db.transaction(stores, 'readwrite');
      const finished = done(tx);
      const fail: Failure = { error: null };
      const projects = tx.objectStore('projects');
      projects.getKey(record.id).onsuccess = (e) =>
        guarded(tx, fail, () => {
          const files = tx.objectStore('files');
          // Deleted (in another tab): its references are gone, and so may be
          // the binaries they kept. The ones just written go too (that is
          // what this transaction commits), and the save fails.
          if ((e.target as IDBRequest).result === undefined && !create) {
            if (early) for (const key of put.keys()) files.delete([record.id, key]);
            fail.error = new ProjectError('missing', record.id);
            return;
          }
          const blobs = tx.objectStore('blobs');
          if (!early) for (const [key, file] of put) files.put({ project: record.id, key, hash: file.hash } satisfies FileRow);
          for (const key of remove) files.delete([record.id, key]);
          for (const [hash, stored] of bytes) keepBytes(tx, fail, blobs, hash, stored);
          if (history === null) tx.objectStore('history').delete(record.id);
          else if (history) tx.objectStore('history').put(history);
          projects.put(row);
        });
      await settled(finished, fail);
      if (fail.error) throw fail.error;
      for (const blob of binaries.values()) forgetBytes(blob);
    },
    async update(id, patch) {
      // A thumbnail still stored as a Blob becomes bytes first: WebKit loses a
      // Blob read from IndexedDB and written back (the new copy of the record
      // points to the old one's file, which goes). If it can't, the thumbnail
      // goes (the next save draws another).
      await convertThumb(id).catch(() => 0);
      const tx = db.transaction('projects', 'readwrite');
      const finished = done(tx);
      const store = tx.objectStore('projects');
      let next: RecordRow | null = null;
      store.get(id).onsuccess = (e) => {
        const row = (e.target as IDBRequest<RecordRow | undefined>).result;
        if (!row) return;
        next = { ...row, ...patch, ...(row.thumb instanceof Blob ? { thumb: null } : {}) };
        store.put(next);
      };
      await finished;
      return next ? recordOf(next) : null;
    },
    async copy(id, record) {
      // Layout 1 rows become references first: a copy shares binaries, it never copies them.
      await convert(await readRows(id));
      const ready = prepare(record);
      const { row } = ready instanceof Promise ? await ready : ready;
      const tx = db.transaction(['projects', 'files'], 'readwrite');
      const finished = done(tx);
      const fail: Failure = { error: null };
      const files = tx.objectStore('files');
      tx.objectStore('projects').getKey(id).onsuccess = (e) =>
        guarded(tx, fail, () => {
          if ((e.target as IDBRequest).result === undefined) throw new ProjectError('missing', id);
          files.index('project').getAll(IDBKeyRange.only(id)).onsuccess = (r) =>
            guarded(tx, fail, () => {
              for (const fileRow of (r.target as IDBRequest<FileRow[]>).result) files.put({ ...fileRow, project: record.id });
              tx.objectStore('projects').put(row);
            });
        });
      await settled(finished, fail);
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
      const bytes = new Map(await Promise.all([...extra].map(async ([hash, blob]) => [hash, await bytesOf(blob)] as const)));
      const tx = db.transaction(['clipboard', 'blobs'], 'readwrite');
      const finished = done(tx);
      const fail: Failure = { error: null };
      const blobs = tx.objectStore('blobs');
      for (const [hash, stored] of bytes) keepBytes(tx, fail, blobs, hash, stored);
      if (clip) tx.objectStore('clipboard').put(clip);
      else tx.objectStore('clipboard').delete('cut');
      await settled(finished, fail);
      for (const blob of extra.values()) forgetBytes(blob);
    },
    blobs: readBlobs,
    async collectGarbage() {
      if (!layout2) return 0;
      const tx = db.transaction(['blobs', 'files', 'history', 'clipboard', 'projects'], 'readwrite');
      const finished = done(tx);
      const fail: Failure = { error: null };
      const blobs = tx.objectStore('blobs');
      const files = tx.objectStore('files');
      const projects = tx.objectStore('projects');
      // References of a project that isn't there go (a tab stored a new file
      // and went away before its record, while another deleted the project):
      // their binaries, with the next collection.
      files.index('project').openKeyCursor(null, 'nextunique').onsuccess = (e) =>
        guarded(tx, fail, () => {
          const cursor = (e.target as IDBRequest<IDBCursor | null>).result;
          if (!cursor) return;
          const project = cursor.key;
          projects.getKey(project).onsuccess = (p) =>
            guarded(tx, fail, () => {
              if ((p.target as IDBRequest).result === undefined) deleteAll(files, 'project', project);
            });
          cursor.continue();
        });
      const counters = [files.index('hash'), tx.objectStore('history').index('hashes'), tx.objectStore('clipboard').index('hashes')];
      let deleted = 0;
      blobs.getAllKeys().onsuccess = (e) => {
        for (const hash of (e.target as IDBRequest<IDBValidKey[]>).result) {
          let pending = counters.length;
          let used = false;
          for (const index of counters) {
            index.count(hash).onsuccess = (c) =>
              guarded(tx, fail, () => {
                used ||= (c.target as IDBRequest<number>).result > 0;
                if (--pending === 0 && !used) {
                  blobs.delete(hash);
                  deleted++;
                }
              });
          }
        }
      };
      await settled(finished, fail);
      return deleted;
    },
    async convertAll() {
      if (!layout2) return 0;
      // A row that can't be converted (its Blob can't be read) stays as it is
      // and doesn't stop the rest; the first such error is thrown at the end.
      let converted = 0;
      const errors: unknown[] = [];
      const attempt = async (work: () => Promise<number>) => {
        try {
          converted += await work();
        } catch (error) {
          errors.push(error);
        }
      };
      // Layout 1: the binaries inside «files» rows, project by project.
      const rows = await promised<FileRow[]>(db.transaction('files').objectStore('files').getAll());
      for (const project of new Set(rows.filter((row) => row.blob && !row.hash).map((row) => row.project))) {
        await attempt(async () => convert(await readRows(project)));
      }
      // Layout 2: the binaries the index «type» doesn't list (they are Blobs), and the Blob thumbnails.
      const tx = db.transaction(['blobs', 'projects']);
      const blobs = tx.objectStore('blobs');
      if (blobs.indexNames.contains('type')) {
        const [hashes, typed, records] = await Promise.all([
          promised(blobs.getAllKeys()),
          promised(blobs.index('type').getAllKeys()),
          promised<RecordRow[]>(tx.objectStore('projects').getAll()),
        ]);
        const asBytes = new Set(typed);
        for (const hash of hashes) if (!asBytes.has(hash)) await attempt(() => convertBlobRow(hash as string));
        for (const record of records) if (record.thumb instanceof Blob) await attempt(() => convertThumb(record.id));
      }
      if (errors.length) throw errors[0];
      return converted;
    },
  };
}
