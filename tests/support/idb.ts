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
// It relies on fake-indexeddb's internals (pinned in package.json): a
// transaction's `_state` and `_execRequestAsync`, a cursor's `_iterate`,
// `_position` and its index's `_rawIndex.records`.
import { IDBCursor, IDBDatabase, IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { afterAll, beforeEach } from 'vitest';

interface FakeTransaction extends IDBTransaction {
  _state: 'active' | 'inactive' | 'committing' | 'finished';
  _execRequestAsync(request: { source: IDBObjectStore; operation: () => unknown }): IDBRequest;
}

interface FakeCursor extends IDBCursor {
  _position: IDBValidKey | undefined;
  _iterate(...args: unknown[]): unknown;
}

const live = new Set<FakeTransaction>();
let blobsAllowed = false;

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

const originals = {
  transaction: IDBDatabase.prototype.transaction,
  put: IDBObjectStore.prototype.put,
  add: IDBObjectStore.prototype.add,
  arrayBuffer: Blob.prototype.arrayBuffer,
  digest: crypto.subtle.digest,
  iterate: (IDBCursor.prototype as FakeCursor)._iterate,
};

(IDBCursor.prototype as FakeCursor)._iterate = function (this: FakeCursor, ...args: unknown[]) {
  const index = this.source as unknown as { _rawIndex?: { records: { size(): number } } };
  const opening = this._position === undefined && this.direction.endsWith('unique') && index._rawIndex;
  if (opening && index._rawIndex!.records.size() === 0) throw new DOMException('Unable to open cursor', 'UnknownError');
  return originals.iterate.apply(this, args);
};

IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
  const tx = originals.transaction.apply(this, args) as FakeTransaction;
  live.add(tx);
  return tx;
};

for (const method of ['put', 'add'] as const) {
  IDBObjectStore.prototype[method] = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
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

Blob.prototype.arrayBuffer = function (this: Blob) {
  return originals.arrayBuffer.call(this).then(inLaterTask);
};
crypto.subtle.digest = function (this: SubtleCrypto, ...args: Parameters<SubtleCrypto['digest']>) {
  return originals.digest.apply(this, args).then(inLaterTask);
} as SubtleCrypto['digest'];

afterAll(() => {
  IDBDatabase.prototype.transaction = originals.transaction;
  IDBObjectStore.prototype.put = originals.put;
  IDBObjectStore.prototype.add = originals.add;
  Blob.prototype.arrayBuffer = originals.arrayBuffer;
  crypto.subtle.digest = originals.digest;
  (IDBCursor.prototype as FakeCursor)._iterate = originals.iterate;
});

// A new, empty IndexedDB for every test.
beforeEach(() => {
  live.clear();
  blobsAllowed = false;
  Object.assign(globalThis, { indexedDB: new IDBFactory(), IDBKeyRange });
});

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
