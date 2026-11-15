// The projects' IndexedDB (src/services/storage/idb.ts) on a fake IndexedDB as
// strict as browsers about transactions and Blobs (tests/support/idb.ts):
// what it stores, the guarantees the projects service relies on, and the
// databases earlier layouts left.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ProjectError } from '../../src/core/projectdoc.js';
import { createProject, emptyDoc, loadProject, saveProject } from '../../src/core/projectstore.js';
import type { ProjectRecord, StoredClip, StoredFile, StoredHistory } from '../../src/core/types.ts';
import { blobOfBytes, hashBlob, knownBytes } from '../../src/services/storage/hash.ts';
import { DB_VERSION, openIdbStorage } from '../../src/services/storage/idb.ts';
import { dump, openRaw, seedLayout, storesBlobs, withBlobs } from '../support/idb.ts';
import { oneImageDoc } from '../support/projects.ts';

const NAME = 'scooch-test';
const open = () => openIdbStorage({ name: NAME });

// A spy left behind by a failed test would change the next ones.
afterEach(() => vi.restoreAllMocks());

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const fileOf = (text: string, type = 'image/png'): StoredFile => {
  const bytes = new TextEncoder().encode(text);
  return { blob: new Blob([bytes], { type }), hash: sha256(bytes) };
};
const textOf = async (blob: Blob | null | undefined) => (blob ? new TextDecoder().decode(await blob.arrayBuffer()) : undefined);

const history = (project: string, hashes: string[]): StoredHistory => ({ project, v: 1, assets: {}, files: {}, hashes });
const clip = (hashes: string[]): StoredClip => ({ id: 'cut', v: 1, assets: {}, files: {}, hashes });

/** A project with one image piece whose original and preview are stored. */
async function projectWithImage() {
  const storage = await open();
  const record = await createProject(storage, { id: 'p1', name: 'Uno', now: 1, doc: oneImageDoc('uno', 20) });
  const files = new Map([
    ['src:1', fileOf('png')],
    ['preview:a1', fileOf('preview')],
  ]);
  const saved = await saveProject(storage, { record, doc: record.doc, files, now: 2 });
  return { storage, record: saved.record, stored: saved.stored };
}

const storedHashes = async () => ((await dump(NAME)).blobs as { hash: string }[]).map((row) => row.hash);

describe('the fake IndexedDB is as strict as a browser', () => {
  test('a transaction used after awaiting a Blob’s bytes throws TransactionInactiveError', async () => {
    (await open()).close();
    const db = await openRaw(NAME);
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    store.get('x');
    await new Blob(['x']).arrayBuffer();
    expect(() => store.put({ id: 'x' })).toThrow(expect.objectContaining({ name: 'TransactionInactiveError' }));
    db.close();
  });

  test('a Blob can’t be stored: the request fails with UnknownError and the transaction aborts, as in WebKit’s ephemeral sessions', async () => {
    (await open()).close();
    const db = await openRaw(NAME);
    const tx = db.transaction('blobs', 'readwrite');
    const aborted = new Promise((resolve) => (tx.onabort = () => resolve(tx.error?.name)));
    tx.objectStore('blobs').put({ hash: 'h', blob: new Blob(['x']) });
    await expect(aborted).resolves.toBe('UnknownError');
    db.close();
  });
});

describe('what it stores', () => {
  test('binaries and thumbnails as bytes with their media type, never as Blobs; they read back as Blobs of the same type and content', async () => {
    const { storage, record } = await projectWithImage();
    await storage.write({ ...record, thumb: new Blob(['thumb'], { type: 'image/webp' }) });
    const cut = fileOf('cut', 'image/jpeg');
    await storage.setClip(clip([cut.hash]), new Map([[cut.hash, cut.blob]]));

    expect(await storesBlobs(NAME)).toBe(false);
    const rows = (await dump(NAME)).blobs as { bytes: unknown; type: string }[];
    expect(rows.map((row) => `${row.type} ${row.bytes instanceof ArrayBuffer}`).sort()).toEqual(['image/jpeg true', 'image/png true', 'image/png true']);

    const files = await storage.files('p1');
    expect(files.get('src:1')?.hash).toBe(fileOf('png').hash);
    expect(files.get('src:1')?.blob.type).toBe('image/png');
    expect(await textOf(files.get('preview:a1')?.blob)).toBe('preview');
    const thumb = (await storage.get('p1'))?.thumb;
    expect(thumb?.type).toBe('image/webp');
    expect(await textOf(thumb)).toBe('thumb');
    expect((await storage.list())[0].thumb).toBeInstanceOf(Blob);
    expect(await textOf((await storage.blobs([cut.hash])).get(cut.hash))).toBe('cut');
  });

  test('saving the record alone, its thumbnail read from storage, opens the transaction in the same task (as a save when the page goes away needs)', async () => {
    const { storage, record } = await projectWithImage();
    await storage.write({ ...record, thumb: new Blob(['thumb'], { type: 'image/webp' }) });
    const stored = (await storage.get('p1'))!;
    const db = await openRaw(NAME);
    const transaction = vi.spyOn(Object.getPrototypeOf(db) as IDBDatabase, 'transaction');
    db.close();
    const writing = storage.write({ ...stored, modified: 3 });
    expect(transaction).toHaveBeenCalledTimes(1);
    await writing;
    transaction.mockRestore();
    expect((await storage.get('p1'))?.modified).toBe(3);
    expect(await textOf((await storage.get('p1'))?.thumb)).toBe('thumb');
  });

  test('new files whose bytes the app holds (made from them, or read to hash them) are saved without reading them again: the transaction opens in the same task', async () => {
    const { storage, record } = await projectWithImage();
    const original = new TextEncoder().encode('original');
    // A view into a larger buffer: only its own bytes are stored.
    const shared = new Uint8Array([9, 9, ...original, 9]).subarray(2, 2 + original.length);
    const preview = new Blob(['new preview'], { type: 'image/png' });
    const put = new Map([
      ['src:2', { blob: blobOfBytes(shared, 'image/png'), hash: sha256(original) }],
      ['preview:a2', { blob: preview, hash: await hashBlob(preview) }],
    ]);
    const read = vi.spyOn(Blob.prototype, 'arrayBuffer');
    const db = await openRaw(NAME);
    const transaction = vi.spyOn(Object.getPrototypeOf(db) as IDBDatabase, 'transaction');
    db.close();
    const writing = storage.write(record, { put });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    await writing;
    transaction.mockRestore();
    read.mockRestore();
    expect(await everyBinaryIsBytesOfItsHash()).toContain(sha256(original));
    expect(knownBytes(preview), 'stored: the bytes read to hash it go').toBeUndefined();
  });
});

describe('the guarantees the projects service relies on', () => {
  test('a save to a project deleted meanwhile (in another tab) fails with «missing» and leaves nothing it references: its new binary goes with the next collection', async () => {
    const { storage, record, stored } = await projectWithImage();
    await storage.remove('p1');
    await expect(storage.write(record, { put: new Map([['src:9', fileOf('new')]]) })).rejects.toMatchObject({ code: 'missing' });
    await expect(saveProject(storage, { record, doc: record.doc, files: new Map(), stored, now: 3 })).rejects.toBeInstanceOf(ProjectError);
    expect(await storage.get('p1')).toBeNull();
    expect((await dump(NAME)).files).toEqual([]);
    await storage.collectGarbage();
    expect(await storedHashes()).toEqual([]);
  });

  test('new files go with their references in a transaction committed at once, before the record: if the page goes away before the record is written, the project still has them', async () => {
    const { storage, record } = await projectWithImage();
    const db = await openRaw(NAME);
    const prototype = Object.getPrototypeOf(db) as IDBDatabase;
    const tx = db.transaction('projects');
    const commit = vi.spyOn(Object.getPrototypeOf(tx) as IDBTransaction, 'commit');
    db.close();
    const original = prototype.transaction;
    let opened = 0;
    // The page goes away before the second transaction (the record's) opens.
    vi.spyOn(prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      if (++opened === 2) throw new DOMException('The page went away', 'InvalidStateError');
      return original.apply(this, args);
    });
    const added = fileOf('added right before closing');
    await expect(storage.write({ ...record, modified: 9 }, { put: new Map([['src:2', added]]) })).rejects.toThrow('The page went away');
    expect(commit).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
    const files = await storage.files('p1');
    expect(files.get('src:2')?.hash).toBe(added.hash);
    expect(await textOf(files.get('src:2')?.blob)).toBe('added right before closing');
    expect((await storage.get('p1'))?.modified, 'the record as it was: the journal has the rest').toBe(2);
  });

  test('garbage collection takes the references of a project that isn’t there (left by a tab that went away between them and the record), then their binaries', async () => {
    const { storage } = await projectWithImage();
    const db = await openRaw(NAME);
    const tx = db.transaction(['files', 'blobs'], 'readwrite');
    tx.objectStore('blobs').put({ hash: fileOf('orphan').hash, bytes: new TextEncoder().encode('orphan').buffer, type: 'image/png' });
    tx.objectStore('files').put({ project: 'gone', key: 'src:1', hash: fileOf('orphan').hash });
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
    await storage.collectGarbage();
    expect(((await dump(NAME)).files as { project: string }[]).map((row) => row.project)).toEqual(['p1', 'p1']);
    await storage.collectGarbage();
    expect(await storedHashes()).not.toContain(fileOf('orphan').hash);
    expect((await storage.files('p1')).size).toBe(2);
  });

  test('a binary is stored once per content, and garbage collection deletes only what no project, saved history or clipboard references', async () => {
    const { storage, record } = await projectWithImage();
    await storage.copy('p1', { ...record, id: 'p2', name: 'Copia' });
    const undo = fileOf('undo');
    const cut = fileOf('cut');
    const orphan = fileOf('orphan');
    const other = { ...record, id: 'p3' };
    await storage.write(other, { create: true, history: history('p3', [undo.hash]), blobs: new Map([[undo.hash, undo.blob]]) });
    await storage.setClip(clip([cut.hash]), new Map([[cut.hash, cut.blob]]));
    await storage.write(other, { blobs: new Map([[orphan.hash, orphan.blob], [undo.hash, undo.blob]]) });
    expect(await storedHashes()).toHaveLength(5);

    expect(await storage.collectGarbage()).toBe(1);
    await storage.remove('p1');
    expect(await storage.collectGarbage()).toBe(0); // the copy still references them
    await storage.remove('p2');
    await storage.setClip(null);
    await storage.write(other, { history: null });
    expect(await storage.collectGarbage()).toBe(4);
    expect(await storedHashes()).toEqual([]);
  });

  test('a project opens with its files; renaming changes only the name', async () => {
    const { storage } = await projectWithImage();
    expect(await storage.update('p1', { name: 'Otro' })).toMatchObject({ name: 'Otro', modified: 2 });
    const { files } = await loadProject(storage, 'p1');
    expect([...files.keys()].sort()).toEqual(['preview:a1', 'src:1']);
    expect(await storage.update('nope', { name: 'x' })).toBeNull();
  });

  test('a new project in an empty browser: nothing stored is a Blob', async () => {
    const storage = await open();
    await createProject(storage, { id: 'p1', name: 'Nuevo', now: 1, doc: emptyDoc() });
    expect(await storesBlobs(NAME)).toBe(false);
  });
});

// ---------- Databases of earlier layouts ----------

type BlobSeed = { $blob: string; type: string };
const fixture = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../e2e/fixtures', name), 'utf8'));
const V2 = fixture('scooch-v2-layout.json') as {
  version: 2;
  projects: (ProjectRecord & { thumb: BlobSeed })[];
  files: { project: string; key: string; hash: string }[];
  blobs: { hash: string; blob: BlobSeed }[];
  history: unknown[];
  clipboard: unknown[];
};
const V1 = fixture('scooch-v1-layout.json') as { version: 1; projects: { id: string }[]; files: { project: string; key: string; blob: BlobSeed }[] };
const contentHash = (seed: BlobSeed) => sha256(Buffer.from(seed.$blob, 'base64'));

/** Checks that nothing stored is a Blob, that each binary's bytes hash to its key and every thumbnail is bytes; returns the hashes. */
async function everyBinaryIsBytesOfItsHash() {
  const { blobs, projects } = (await dump(NAME)) as { blobs: { hash: string; bytes: ArrayBuffer }[]; projects: { thumb: unknown }[] };
  expect(await storesBlobs(NAME)).toBe(false);
  for (const row of blobs) expect(sha256(new Uint8Array(row.bytes)), row.hash).toBe(row.hash);
  for (const { thumb } of projects) expect(thumb === null || (thumb as { bytes: unknown }).bytes instanceof ArrayBuffer).toBe(true);
  return blobs.map((row) => row.hash).sort();
}

describe('a database of layout 2 (binaries and thumbnails as Blobs), recorded from that version', () => {
  test('opens at layout 3 as it was: every project with its files and thumbnail, the saved history and the clipboard', async () => {
    expect(DB_VERSION).toBe(3);
    await seedLayout(NAME, withBlobs(V2));
    const storage = await open();
    for (const project of V2.projects) {
      const { files } = await loadProject(storage, project.id);
      const expected = V2.files.filter((row) => row.project === project.id).map((row) => `${row.key} ${row.hash}`);
      expect([...files].map(([key, file]) => `${key} ${file.hash}`).sort()).toEqual(expected.sort());
      expect((await storage.get(project.id))?.thumb?.type).toBe(project.thumb.type);
    }
    const clipboard = (await storage.clip())!;
    expect((await storage.blobs(clipboard.hashes)).size).toBe(clipboard.hashes.length);
    const saved = (await storage.history(V2.projects[0].id))!;
    expect(saved.hashes.length).toBeGreaterThan(0);
    expect((await storage.blobs(saved.hashes)).size).toBe(saved.hashes.length);
  });

  test('converting stores every binary and thumbnail as bytes of the same content, and a second run has nothing to do', async () => {
    await seedLayout(NAME, withBlobs(V2));
    const storage = await open();
    expect(await storage.convertAll()).toBe(V2.blobs.length + V2.projects.length);
    expect(await everyBinaryIsBytesOfItsHash()).toEqual(V2.blobs.map((row) => contentHash(row.blob)).sort());
    expect(await storage.convertAll()).toBe(0);
    const thumb = (await storage.get(V2.projects[0].id))!.thumb!;
    expect(Buffer.from(await thumb.arrayBuffer()).toString('base64')).toBe(V2.projects[0].thumb.$blob);
  });

  test('a binary read while still a Blob comes into memory and is converted at once: WebKit invalidates a Blob read from IndexedDB once its row is rewritten', async () => {
    await seedLayout(NAME, withBlobs(V2));
    const storage = await open();
    const project = V2.projects[1];
    const { files } = await loadProject(storage, project.id);
    const hashes = new Set([...files.values()].map((file) => file.hash));
    const rows = (await dump(NAME)).blobs as { hash: string; blob?: Blob }[];
    expect(rows.filter((row) => hashes.has(row.hash)).every((row) => !row.blob)).toBe(true);
    expect(rows.filter((row) => row.blob)).toHaveLength(V2.blobs.length - hashes.size);
    for (const file of files.values()) expect(sha256(new Uint8Array(await file.blob.arrayBuffer()))).toBe(file.hash);
  });

  test('opening a project (its record touched) first turns its Blob thumbnail into bytes: WebKit loses a Blob read from IndexedDB and written back', async () => {
    await seedLayout(NAME, withBlobs(V2));
    const storage = await open();
    const [first, second] = V2.projects;
    expect(await storage.update(first.id, { opened: 5 })).toMatchObject({ opened: 5 });
    const rows = (await dump(NAME)).projects as { id: string; thumb: unknown }[];
    expect(rows.find((row) => row.id === first.id)?.thumb).toEqual(expect.objectContaining({ type: first.thumb.type, bytes: expect.any(ArrayBuffer) }));
    expect(rows.find((row) => row.id === second.id)?.thumb, 'the others wait for convertAll').toBeInstanceOf(Blob);
    expect(Buffer.from(await (await storage.get(first.id))!.thumb!.arrayBuffer()).toString('base64')).toBe(first.thumb.$blob);
  });

  test('a conversion interrupted halfway finishes on the next start, losing nothing', async () => {
    await seedLayout(NAME, withBlobs(V2));
    (await open()).close();
    // Half the binaries were converted when the tab closed.
    const db = await openRaw(NAME);
    const tx = db.transaction('blobs', 'readwrite');
    for (const [i, row] of V2.blobs.entries()) {
      if (i % 2) continue;
      const bytes = Buffer.from(row.blob.$blob, 'base64');
      tx.objectStore('blobs').put({ hash: row.hash, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), type: row.blob.type });
    }
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
    const storage = await open();
    expect(await storage.convertAll()).toBe(Math.floor(V2.blobs.length / 2) + V2.projects.length);
    expect(await everyBinaryIsBytesOfItsHash()).toEqual(V2.blobs.map((row) => contentHash(row.blob)).sort());
  });

  test('a binary whose Blob can’t be read stays as it was and doesn’t stop the rest; the error comes out at the end', async () => {
    await seedLayout(NAME, withBlobs(V2));
    const storage = await open();
    const unreadable = V2.blobs.find((row) => row.blob.type === 'application/pdf')!;
    const read = Blob.prototype.arrayBuffer;
    const spy = vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(function (this: Blob) {
      if (this.type === 'application/pdf') return Promise.reject(new DOMException('gone', 'NotReadableError'));
      return read.call(this);
    });
    await expect(storage.convertAll()).rejects.toMatchObject({ name: 'NotReadableError' });
    spy.mockRestore();
    const rows = (await dump(NAME)).blobs as { hash: string; blob?: Blob }[];
    expect(rows.filter((row) => row.blob).map((row) => row.hash)).toEqual([unreadable.hash]);
    expect(rows).toHaveLength(V2.blobs.length);
  });
});

describe('a database of layout 1 (each binary inside its file row), recorded from that version', () => {
  test('a project’s rows become references before it opens, with each binary stored once as bytes; converting does the rest', async () => {
    await seedLayout(NAME, withBlobs(V1));
    const storage = await open();
    const first = V1.projects[0].id;
    const { files } = await loadProject(storage, first);
    expect(files.size).toBe(V1.files.filter((row) => row.project === first).length);
    await storage.convertAll();
    const rows = (await dump(NAME)).files as { hash?: string; blob?: Blob }[];
    expect(rows.every((row) => row.hash && !row.blob)).toBe(true);
    expect(await everyBinaryIsBytesOfItsHash()).toEqual([...new Set(V1.files.map((row) => contentHash(row.blob)))].sort());
  });
});
