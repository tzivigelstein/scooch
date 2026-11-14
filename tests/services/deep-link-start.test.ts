// @vitest-environment jsdom
// Starting the app from a deep link (state/actions/deeplink.ts and the
// `start` option of services/projects.ts initProjects), on a storage in
// memory: the link creates a new project with its settings, never opens or
// changes a saved one, and leaves the address without its parameters. The
// real IndexedDB and a reload in a browser are in e2e/specs/deep-links.spec.ts.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../../src/core/projectstore.js';
import type { ProjectStorage } from '../../src/core/types.ts';
import { storedProject } from '../support/projects.ts';

const LAST_PROJECT = 'scooch:last-project';

// The storage the service opens instead of IndexedDB; `fails`: this browser can't save.
const opened = vi.hoisted(() => ({ storage: null as ProjectStorage | null, fails: false }));
vi.mock('../../src/services/storage/idb.ts', () => ({
  openIdbStorage: async () => {
    if (opened.fails) throw new Error('no IndexedDB here');
    return opened.storage;
  },
  openExistingIdbStorage: async () => null,
  deleteIdb: async () => {},
}));
vi.mock('../../src/services/thumbnail.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/thumbnail.ts')>()),
  drawThumbnail: async () => null,
}));

/** Starts the app's projects (as App does) with `search` in the address, on fresh modules. */
async function start(storage: ProjectStorage, search = '') {
  opened.storage = storage;
  vi.resetModules();
  if (search) window.history.replaceState(null, '', `/${search}`);
  const support = await import('../support/state.ts');
  support.resetState();
  const { startProjects } = await import('../../src/state/actions/projects.ts');
  const projects = await import('../../src/services/projects.ts');
  const { getDocument } = await import('../../src/state/document.ts');
  const { getView } = await import('../../src/state/view.ts');
  await startProjects();
  // The notice with plain spaces instead of the copy's no-break ones.
  return { session: projects.projectSession(), getDocument, notice: () => getView().flash?.text.replace(/ /g, ' ') ?? null };
}

/** A stored project as plain data, to compare before and after. */
async function snapshot(storage: ProjectStorage, id: string) {
  return { record: JSON.stringify(await storage.get(id)), files: [...(await storage.files(id)).keys()].sort() };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('BroadcastChannel', undefined);
  localStorage.clear();
  opened.fails = false;
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a deep link on start', () => {
  test('on a first visit, it creates the project with the link’s settings and takes them out of the address', async () => {
    const storage = memoryStorage();
    const app = await start(storage, '?utm_source=guide&paper=letter&orientation=landscape&margin=5&gap=2&cuts=outline&rotate=off');
    const expected = { paper: 'letter', landscape: true, margin: 5, gap: 2, rotate: false };
    expect(app.getDocument()).toMatchObject({ ...expected, items: [] });
    expect(app.getDocument().cuts.mode).toBe('outline');
    const stored = (await storage.get(app.session.record!.id))!;
    expect(stored.doc).toMatchObject(expected);
    expect(stored.doc.cuts.mode).toBe('outline');
    expect(localStorage.getItem(LAST_PROJECT)).toBe(stored.id);
    expect(window.location.search).toBe('?utm_source=guide');
    expect(app.notice()).toBe('Se creó un proyecto nuevo con papel Carta horizontal');
  });

  test('with a saved project open last time, it creates another one and leaves the saved one exactly as it was', async () => {
    const storage = memoryStorage();
    await storedProject(storage, 'p1', 'Tarjetas', 33, 1000);
    localStorage.setItem(LAST_PROJECT, 'p1');
    const journal = JSON.stringify({ v: 2, id: 'p1', base: 1000, name: 'Tarjetas', doc: { version: 5 } });
    localStorage.setItem('scooch:journal:p1', journal);
    const before = await snapshot(storage, 'p1');

    const app = await start(storage, '?paper=A4&margin=5&photo=passport-35x45');
    expect(app.session.record!.id).not.toBe('p1');
    expect(app.getDocument()).toMatchObject({ paper: 'A4', margin: 5, items: [] });
    expect(await snapshot(storage, 'p1')).toEqual(before);
    expect(localStorage.getItem('scooch:journal:p1')).toBe(journal);
    expect((await storage.list()).map((r) => r.id).sort()).toEqual(['p1', app.session.record!.id].sort());
    expect(localStorage.getItem(LAST_PROJECT)).toBe(app.session.record!.id);
    expect(app.notice()).toBe('Se creó un proyecto nuevo con papel A4. Las fotos que agregues se recortan a Pasaporte 3,5 × 4,5: 35 × 45 mm.');
  });

  test('a reload afterwards opens the project the link created, without creating another', async () => {
    const storage = memoryStorage();
    await storedProject(storage, 'p1', 'Tarjetas', 33, 1000);
    localStorage.setItem(LAST_PROJECT, 'p1');
    const first = await start(storage, '?paper=legal');
    const created = first.session.record!.id;
    const again = await start(storage);
    expect(again.session.record!.id).toBe(created);
    expect(again.getDocument().paper).toBe('legal');
    expect(await storage.list()).toHaveLength(2);
    expect(again.notice()).toBeNull();
  });

  test('a link whose values can’t be read opens the last project as usual, and leaves the address clean', async () => {
    const storage = memoryStorage();
    await storedProject(storage, 'p1', 'Tarjetas', 33, 1000);
    localStorage.setItem(LAST_PROJECT, 'p1');
    const app = await start(storage, '?paper=A10&margin=wide');
    expect(app.session.record!.id).toBe('p1');
    expect(app.getDocument().items[0]?.x).toBe(33);
    expect(await storage.list()).toHaveLength(1);
    expect(window.location.search).toBe('');
    expect(app.notice()).toBeNull();
  });

  test('without storage, the link still sets up the project the tab works on', async () => {
    opened.fails = true;
    const app = await start(memoryStorage(), '?paper=A5&gap=0');
    expect(app.getDocument()).toMatchObject({ paper: 'A5', gap: 0 });
    expect(app.session.storage).toBeNull();
  });
});
