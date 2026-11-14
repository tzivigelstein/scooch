// Helpers for the specs of saved projects (projects.spec, stored-formats.spec):
// the save status, the pieces per sheet as the page names them, the
// «Proyectos» dialog, and reading or writing what IndexedDB holds.
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expect, fixture } from './test.ts';

export const DB = 'scooch';
export const LAST_PROJECT = 'scooch:last-project';

/** What stops the project from being saved, next to its name («No se guardó», «Sin guardar»); nothing shows otherwise. */
export const status = (page: Page) => page.locator('#project-status-text');

/** The save status the page keeps (not shown: 'saved', 'pending', 'saving', 'loading', 'error', 'off', 'readonly'). */
export const saveStatus = (page: Page) => page.locator('#project');

/** Waits until the project is saved. */
export async function saved(page: Page) {
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
}

/** Waits until a change is waiting to be saved (or being saved). */
export async function savePending(page: Page) {
  await expect(saveStatus(page)).toHaveAttribute('data-status', /^(pending|saving)$/);
}

/** Per sheet, `<sheet id>:<piece names joined>`: what each piece is and where (its accessible name says it in mm). */
export const labels = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#sheets .page')].map(
      (pg) => `${pg.dataset.sheet}:${[...pg.querySelectorAll('.piece')].map((n) => n.getAttribute('aria-label')).join(' | ')}`,
    ),
  );

/** The same, without the sheet ids (a copy of a project gets the same pieces on its own sheets). */
export const labelsWithoutSheetIds = async (page: Page) => (await labels(page)).map((l) => l.replace(/^\d+:/, ''));

/** Renames the open project from the top bar (no checks on the field itself). */
export async function renameInBar(page: Page, name: string) {
  await page.locator('#project-name').click();
  await page.locator('#project-name-input').fill(name);
  await page.keyboard.press('Enter');
  await expect(page.locator('#project-name-text')).toHaveText(name);
}

/** Opens «Proyectos» with Ctrl+O and waits for its list. */
export async function openProjects(page: Page) {
  await page.keyboard.press('Control+o');
  await expect(page.locator('#projects')).toHaveAttribute('open', '');
  await expect(page.locator('#projects .project-card').first()).toBeVisible();
}

export const card = (page: Page, name: string) => page.locator('#projects .project-card').filter({ has: page.locator('.project-title', { hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`) }) });

/** The cards of «Proyectos», in order. */
export const cards = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#projects .project-card')].map((c) => ({
      id: c.dataset.id ?? '',
      name: c.querySelector('.project-title')?.textContent ?? '',
      meta: (c.querySelector('.project-meta')?.textContent ?? '').replace(/ /g, ' '),
      current: c.classList.contains('is-current'),
      thumb: !!c.querySelector<HTMLImageElement>('.project-thumb img')?.naturalWidth,
    })),
  );

/** The name of the card that has the focus. */
export const focusedCard = (page: Page) => page.evaluate(() => document.activeElement?.closest('.project-card')?.querySelector('.project-title')?.textContent ?? null);

// ---------- IndexedDB ----------

export interface StoredRecord {
  id: string;
  name: string;
  version: number;
  modified: number;
  doc: Record<string, unknown> & { version?: number; items: Record<string, unknown>[] };
}

/** The stored record of a project (the open one by default), without its thumbnail. */
export const storedRecord = (page: Page, id?: string) =>
  page.evaluate(
    async ({ db: name, last, id }) => {
      const key = id ?? localStorage.getItem(last)!;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const record = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const r = db.transaction('projects').objectStore('projects').get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      db.close();
      if (!record) return null;
      const { thumb, ...rest } = record;
      return { ...rest, thumb: thumb instanceof Blob };
    },
    { db: DB, last: LAST_PROJECT, id },
  ) as Promise<(StoredRecord & { thumb: boolean }) | null>;

/**
 * Rewrites the stored document of the open project: `change` runs in the page
 * on a copy of the document and returns the new one.
 */
export const patchStored = (page: Page, change: (doc: Record<string, unknown>) => Record<string, unknown>) =>
  page.evaluate(
    async ({ db: name, last, source }) => {
      const id = localStorage.getItem(last)!;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('projects', 'readwrite');
        const store = tx.objectStore('projects');
        store.get(id).onsuccess = (e) => {
          const record = (e.target as IDBRequest).result;
          const fn = new Function(`return (${source})`)() as (doc: unknown) => Record<string, unknown>;
          const doc = fn(structuredClone(record.doc));
          store.put({ ...record, doc, version: doc.version ?? 0 });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { db: DB, last: LAST_PROJECT, source: change.toString() },
  );

/** A Blob as the seed carries it (the same encoding as e2e/fixtures/legacy-pliego.json). */
export interface SeedBlob {
  $blob: string;
  type: string;
}

/** A fixture file as a seed Blob. */
export const seedBlob = (name: string, type: string): SeedBlob => ({ $blob: readFileSync(fixture(name)).toString('base64'), type });

export interface Seed {
  /** The database: «scooch», or the legacy «pliego». */
  db: string;
  /** 1: «projects» and «files» (each binary inside its row); 2: also «blobs», «history» and «clipboard». */
  version: number;
  projects: unknown[];
  /** Rows of the «files» store: {project, key, blob} (version 1) or {project, key, hash}. */
  files: unknown[];
  /** Rows of the «blobs» store (version 2): {hash, blob}. */
  blobs?: unknown[];
  /** localStorage, as is. */
  storage: Record<string, string>;
}

/**
 * Writes a database and localStorage on the app's origin before the app ever
 * runs there: from a blank page of that origin (answered by the test, not by
 * the server).
 */
export async function seedStorage(page: Page, seed: Seed) {
  await page.route('**/__seed', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>seed</title>' }));
  await page.goto('./__seed');
  await page.evaluate(async (seed) => {
    const decode = (v: unknown): unknown => {
      if (v && typeof v === 'object' && '$blob' in v) {
        const { $blob, type } = v as SeedBlob;
        return new Blob([Uint8Array.from(atob($blob), (c) => c.charCodeAt(0))], { type });
      }
      if (Array.isArray(v)) return v.map(decode);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
      return v;
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(seed.db, seed.version);
      request.onupgradeneeded = () => {
        // The stores of each layout, as the app at that version made them (src/services/storage/idb.ts).
        const db = request.result;
        db.createObjectStore('projects', { keyPath: 'id' });
        const files = db.createObjectStore('files', { keyPath: ['project', 'key'] });
        files.createIndex('project', 'project');
        if (seed.version < 2) return;
        files.createIndex('hash', 'hash');
        db.createObjectStore('blobs', { keyPath: 'hash' });
        db.createObjectStore('history', { keyPath: 'project' }).createIndex('hashes', 'hashes', { multiEntry: true });
        db.createObjectStore('clipboard', { keyPath: 'id' }).createIndex('hashes', 'hashes', { multiEntry: true });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const stores = seed.version < 2 ? ['projects', 'files'] : ['projects', 'files', 'blobs'];
      const tx = db.transaction(stores, 'readwrite');
      for (const record of decode(seed.projects) as unknown[]) tx.objectStore('projects').put(record);
      for (const row of decode(seed.files) as unknown[]) tx.objectStore('files').put(row);
      for (const row of decode(seed.blobs ?? []) as unknown[]) tx.objectStore('blobs').put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    for (const [key, value] of Object.entries(seed.storage)) localStorage.setItem(key, value);
  }, seed);
  await page.unroute('**/__seed');
}

/** Hides indexedDB.databases(), as browsers that can't list databases (kept aside for the test as `__databases`). */
export async function hideDatabases(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __databases?: () => Promise<IDBDatabaseInfo[]> };
    w.__databases = IDBFactory.prototype.databases && indexedDB.databases.bind(indexedDB);
    delete (IDBFactory.prototype as Partial<IDBFactory>).databases;
  });
}

/** The databases of the origin (also when the app can't see indexedDB.databases()). */
export const databases = (page: Page) =>
  page.evaluate(async () => {
    const w = window as unknown as { __databases?: () => Promise<IDBDatabaseInfo[]> };
    const list = await (w.__databases ?? indexedDB.databases.bind(indexedDB))();
    return list.map((d) => d.name ?? '').sort();
  });

/**
 * What the «scooch» database holds: each project (id, name, has a
 * thumbnail), how many file rows (and how many still keep their binary
 * inside, as layout version 1 did), and how many binaries.
 */
export const storedProjects = (page: Page) =>
  page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const out = { projects: [] as { id: string; name: string; thumb: boolean }[], files: 0, unconverted: 0, blobs: 0, hashes: [] as string[] };
    await new Promise<void>((resolve) => {
      const tx = db.transaction(['projects', 'files', 'blobs']);
      tx.objectStore('projects').getAll().onsuccess = (e) =>
        (out.projects = ((e.target as IDBRequest).result as { id: string; name: string; thumb: unknown }[]).map((r) => ({ id: r.id, name: r.name, thumb: r.thumb instanceof Blob })));
      tx.objectStore('files').getAll().onsuccess = (e) => {
        const rows = (e.target as IDBRequest).result as { blob?: Blob; hash?: string }[];
        out.files = rows.length;
        out.unconverted = rows.filter((row) => row.blob || !row.hash).length;
      };
      tx.objectStore('blobs').getAllKeys().onsuccess = (e) => {
        out.hashes = ((e.target as IDBRequest).result as string[]).sort();
        out.blobs = out.hashes.length;
      };
      tx.oncomplete = () => resolve();
    });
    db.close();
    return out;
  }, DB);

// ---------- Object URLs ----------

/** Counts the object URLs alive in the page (created and not revoked yet), as `__urls()`. */
export async function trackObjectUrls(page: Page) {
  await page.addInitScript(() => {
    const live = new Set<string>();
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    URL.createObjectURL = function (obj: Blob | MediaSource) {
      const url = create.call(URL, obj);
      live.add(url);
      return url;
    };
    URL.revokeObjectURL = function (url: string) {
      live.delete(url);
      return revoke.call(URL, url);
    };
    (window as unknown as { __urls: () => number }).__urls = () => live.size;
  });
}

export const liveObjectUrls = (page: Page) => page.evaluate(() => (window as unknown as { __urls: () => number }).__urls());
