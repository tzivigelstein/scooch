// IndexedDB for the tests of src/services/storage/idb.ts: fake-indexeddb, made
// as strict as browsers on the two things that broke saving in Safari.
//
// - A transaction's lifetime. A browser deactivates a transaction when control
//   returns to the event loop, so a request made after awaiting anything else
//   (hashing, a Blob's bytes, a timer) throws TransactionInactiveError, and
//   one with nothing left to do commits. fake-indexeddb never deactivates one.
//   Here, whenever a Blob's bytes or a hash are ready, every transaction alive
//   is deactivated before the code awaiting them goes on; the fake activates
//   it again only to deliver one of its own requests' events, as browsers do.
// - Blobs. WebKit can't store a Blob in an ephemeral session (Safari's private
//   windows, Playwright's WebKit): the request fails with UnknownError and the
//   transaction aborts. Here neither can, except while seeding what an
//   earlier layout stored (`allowBlobs`).
//
// And on one that broke garbage collection in WebKit: a «nextunique» or
// «prevunique» cursor on an empty index fails with UnknownError («Unable to
// open cursor») and the transaction aborts. Here too.
//
// And the page going away (the tab closed or reloaded, `leavePage`): once the
// task that leaves ends (from the first IndexedDB work after it on), no
// transaction opens any more, and one still open is dropped when it runs out
// of requests unless it was committed explicitly (commit()), as in WebKit;
// its callbacks still run until then. (In WebKit a small one that finishes
// before the page is torn down is kept too: this is the case where it doesn't.)
//
// And on one that broke opening what earlier layouts stored in WebKit: a Blob
// read from a row (layouts 1 and 2 stored Blobs) can't be read any more once
// that row is rewritten or deleted, unless its bytes were read before: reading
// it fails with NotReadableError (WebKit also logs «Failed to load resource»
// for its internal blob: URL, and an <img> of it doesn't draw). There it
// happens most of the time, not always; here always.
//
// It relies on fake-indexeddb's internals (pinned in package.json): a
// transaction's `_state`, `_requests`, `_start` and `_execRequestAsync`, a
// cursor's `_iterate`, `_position` and its index's `_rawIndex.records`.
import { IDBCursor, IDBDatabase, IDBFactory, IDBIndex, IDBKeyRange, IDBObjectStore, IDBTransaction } from 'fake-indexeddb';
import { afterAll, beforeEach } from 'vitest';

interface FakeTransaction extends IDBTransaction {
  _state: 'active' | 'inactive' | 'committing' | 'finished';
  _requests: { request: IDBRequest }[];
  _start(): void;
  _execRequestAsync(request: { source: IDBObjectStore; operation: () => unknown }): IDBRequest;
}

interface FakeCursor extends IDBCursor {
  _position: IDBValidKey | undefined;
  _iterate(...args: unknown[]): unknown;
}

const live = new Set<FakeTransaction>();
let blobsAllowed = false;
let leaving = false;
let gone = false;

/** What browsers do when control returns to the event loop: no transaction stays active. */
function returnToEventLoop() {
  for (const tx of live) {
    if (tx._state === 'finished') live.delete(tx);
    else if (tx._state === 'active') tx._state = 'inactive';
  }
}

/** Resolves with `value` in a task of its own, after every transaction alive is deactivated. */
const inLaterTask = <T>(value: T) =>
  new Promise<T>((resolve) =>
    setImmediate(() => {
      returnToEventLoop();
      resolve(value);
    })
  );

const containsBlob = (value: unknown, seen = new Set<unknown>()): boolean => {
  if (value instanceof Blob) return true;
  if (!value || typeof value !== 'object' || seen.has(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return false;
  seen.add(value);
  return Object.values(value).some((v) => containsBlob(v, seen));
};

// Each row's writes so far (by database, store and key) and each store's deletes
// by key range; and, for each Blob read from a row and not read yet, which row
// and how many writes it had then.
const rowWrites = new Map<string, number>();
const rangeDeletes = new Map<string, number>();
const readFrom = new WeakMap<Blob, { row: string; store: string; writes: number; ranges: number }>();

const storeId = (store: IDBObjectStore) => `${store.transaction.db.name}\u0000${store.name}`;
const rowId = (store: IDBObjectStore, key: unknown) => `${storeId(store)}\u0000${JSON.stringify(key)}`;
function keyOf(store: IDBObjectStore, value: unknown, key?: IDBValidKey): unknown {
  if (key !== undefined || store.keyPath === null) return key;
  const at = (path: string) => path.split('.').reduce<unknown>((v, part) => (v as Record<string, unknown> | undefined)?.[part], value);
  return Array.isArray(store.keyPath) ? store.keyPath.map(at) : at(store.keyPath);
}
const bump = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1);

/** Marks the Blobs in rows just read from `store` as read from their rows, as they are now. */
function tagBlobs(store: IDBObjectStore, rows: unknown[]) {
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const id = rowId(store, keyOf(store, row));
    const stamp = { row: id, store: storeId(store), writes: rowWrites.get(id) ?? 0, ranges: rangeDeletes.get(storeId(store)) ?? 0 };
    const walk = (value: unknown) => {
      if (value instanceof Blob) readFrom.set(value, stamp);
      else if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer)) Object.values(value).forEach(walk);
    };
    walk(row);
  }
}

const originals = {
  transaction: IDBDatabase.prototype.transaction,
  put: IDBObjectStore.prototype.put,
  add: IDBObjectStore.prototype.add,
  delete: IDBObjectStore.prototype.delete,
  storeGet: IDBObjectStore.prototype.get,
  storeGetAll: IDBObjectStore.prototype.getAll,
  indexGet: IDBIndex.prototype.get,
  indexGetAll: IDBIndex.prototype.getAll,
  arrayBuffer: Blob.prototype.arrayBuffer,
  digest: crypto.subtle.digest,
  iterate: (IDBCursor.prototype as FakeCursor)._iterate,
  start: (IDBTransaction.prototype as unknown as FakeTransaction)._start,
};

(IDBTransaction.prototype as unknown as FakeTransaction)._start = function (this: FakeTransaction) {
  // The fake does its work in tasks of its own: the task that left has ended.
  if (leaving) gone = true;
  const pending = this._requests.some((r) => r.request.readyState !== 'done');
  if (gone && !pending && this._state !== 'committing' && this._state !== 'finished') return this.abort();
  return originals.start.call(this);
};

(IDBCursor.prototype as FakeCursor)._iterate = function (this: FakeCursor, ...args: unknown[]) {
  const index = this.source as unknown as { _rawIndex?: { records: { size(): number } } };
  const opening = this._position === undefined && this.direction.endsWith('unique') && index._rawIndex;
  if (opening && index._rawIndex!.records.size() === 0) throw new DOMException('Unable to open cursor', 'UnknownError');
  return originals.iterate.apply(this, args);
};

IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
  if (gone) throw new DOMException('The page has gone away', 'InvalidStateError');
  const tx = originals.transaction.apply(this, args) as FakeTransaction;
  live.add(tx);
  return tx;
};

for (const method of ['put', 'add'] as const) {
  IDBObjectStore.prototype[method] = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    bump(rowWrites, rowId(this, keyOf(this, value, key)));
    if (blobsAllowed || !containsBlob(value)) return originals[method].call(this, value, key);
    // As WebKit: the request is accepted, then fails, and the transaction aborts unless the error is handled.
    return (this.transaction as FakeTransaction)._execRequestAsync({
      source: this,
      operation: () => {
        throw new DOMException('Error preparing Blob/File data to be stored in object store', 'UnknownError');
      },
    });
  };
}

IDBObjectStore.prototype.delete = function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
  if (query instanceof IDBKeyRange) bump(rangeDeletes, storeId(this));
  else bump(rowWrites, rowId(this, query));
  return originals.delete.call(this, query);
};

// Reads: the Blobs in the rows they give are marked (before the caller's own handler runs).
function tagging<T>(request: IDBRequest<T>, store: IDBObjectStore, rows: (result: T) => unknown[]) {
  request.addEventListener('success', () => tagBlobs(store, rows(request.result)));
  return request;
}
IDBObjectStore.prototype.get = function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
  return tagging(originals.storeGet.call(this, query), this, (row) => [row]);
};
IDBObjectStore.prototype.getAll = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['getAll']>) {
  return tagging(originals.storeGetAll.apply(this, args), this, (rows) => rows);
};
IDBIndex.prototype.get = function (this: IDBIndex, query: IDBValidKey | IDBKeyRange) {
  return tagging(originals.indexGet.call(this, query), this.objectStore, (row) => [row]);
};
IDBIndex.prototype.getAll = function (this: IDBIndex, ...args: Parameters<IDBIndex['getAll']>) {
  return tagging(originals.indexGetAll.apply(this, args), this.objectStore, (rows) => rows);
};

Blob.prototype.arrayBuffer = function (this: Blob) {
  const from = readFrom.get(this);
  if (from && ((rowWrites.get(from.row) ?? 0) !== from.writes || (rangeDeletes.get(from.store) ?? 0) !== from.ranges)) {
    return inLaterTask(null).then(() => {
      throw new DOMException('The I/O read operation failed.', 'NotReadableError');
    });
  }
  // Its bytes read, it stays readable.
  readFrom.delete(this);
  return originals.arrayBuffer.call(this).then(inLaterTask);
};
crypto.subtle.digest = function (this: SubtleCrypto, ...args: Parameters<SubtleCrypto['digest']>) {
  return originals.digest.apply(this, args).then(inLaterTask);
} as SubtleCrypto['digest'];

afterAll(() => {
  IDBDatabase.prototype.transaction = originals.transaction;
  IDBObjectStore.prototype.put = originals.put;
  IDBObjectStore.prototype.add = originals.add;
  IDBObjectStore.prototype.delete = originals.delete;
  IDBObjectStore.prototype.get = originals.storeGet;
  IDBObjectStore.prototype.getAll = originals.storeGetAll;
  IDBIndex.prototype.get = originals.indexGet;
  IDBIndex.prototype.getAll = originals.indexGetAll;
  Blob.prototype.arrayBuffer = originals.arrayBuffer;
  crypto.subtle.digest = originals.digest;
  (IDBCursor.prototype as FakeCursor)._iterate = originals.iterate;
  (IDBTransaction.prototype as unknown as FakeTransaction)._start = originals.start;
});

// A new, empty IndexedDB for every test.
beforeEach(() => {
  live.clear();
  blobsAllowed = false;
  leaving = gone = false;
  rowWrites.clear();
  rangeDeletes.clear();
  Object.assign(globalThis, { indexedDB: new IDBFactory(), IDBKeyRange });
});

/**
 * The page goes away at the end of this task (see above). Resolves once
 * every transaction it left is done, with the page back (as after a reload,
 * the database as the dying page left it).
 */
export async function leavePage() {
  // What this task's microtasks open still opens, as in a browser.
  leaving = true;
  const nextTask = () => new Promise((resolve) => setImmediate(resolve));
  do await nextTask();
  while ([...live].some((tx) => tx._state !== 'finished'));
  await nextTask(); // their «abort» events
  live.clear();
  leaving = gone = false;
}

/** Runs `work` with Blobs storable, as every browser stored them for layouts 1 and 2. */
export async function allowingBlobs<T>(work: () => Promise<T>): Promise<T> {
  blobsAllowed = true;
  try {
    return await work();
  } finally {
    blobsAllowed = false;
  }
}

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/** Opens a database as it is, for reading or seeding it directly. */
export const openRaw = (name: string, version?: number, upgrade?: (db: IDBDatabase) => void) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
    r.onupgradeneeded = () => upgrade?.(r.result);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/** Every row of every store of a database, by store. */
export async function dump(name: string): Promise<Record<string, unknown[]>> {
  const db = await openRaw(name);
  const stores = [...db.objectStoreNames];
  const tx = db.transaction(stores);
  const rows = await Promise.all(stores.map((store) => request(tx.objectStore(store).getAll())));
  db.close();
  return Object.fromEntries(stores.map((store, i) => [store, rows[i]]));
}

/** Whether anything stored in the database is a Blob. */
export const storesBlobs = async (name: string) => containsBlob(await dump(name));

/** The rows of an earlier layout, written as that version of the app wrote them. */
export interface Layout {
  version: 1 | 2;
  projects: unknown[];
  files: unknown[];
  blobs?: unknown[];
  history?: unknown[];
  clipboard?: unknown[];
}

/** Writes a database of an earlier layout (its stores as idb.ts made them at that version). */
export async function seedLayout(name: string, layout: Layout) {
  await allowingBlobs(async () => {
    const db = await openRaw(name, layout.version, (db) => {
      db.createObjectStore('projects', { keyPath: 'id' });
      const files = db.createObjectStore('files', { keyPath: ['project', 'key'] });
      files.createIndex('project', 'project');
      if (layout.version < 2) return;
      files.createIndex('hash', 'hash');
      db.createObjectStore('blobs', { keyPath: 'hash' });
      db.createObjectStore('history', { keyPath: 'project' }).createIndex('hashes', 'hashes', { multiEntry: true });
      db.createObjectStore('clipboard', { keyPath: 'id' }).createIndex('hashes', 'hashes', { multiEntry: true });
    });
    const stores = layout.version < 2 ? ['projects', 'files'] : ['projects', 'files', 'blobs', 'history', 'clipboard'];
    const tx = db.transaction(stores, 'readwrite');
    const finished = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    for (const store of stores) for (const row of (layout as unknown as Record<string, unknown[] | undefined>)[store] ?? []) tx.objectStore(store).put(row);
    await finished;
    db.close();
  });
}

/** A fixture's JSON with each `{$blob, type}` (base64) turned into a Blob. */
export function withBlobs<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withBlobs) as T;
  if (value && typeof value === 'object') {
    if ('$blob' in value) {
      const { $blob, type } = value as unknown as { $blob: string; type: string };
      return new Blob([Buffer.from($blob, 'base64')], { type }) as T;
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withBlobs(v)])) as T;
  }
  return value;
}
