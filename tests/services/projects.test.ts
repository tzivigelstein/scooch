// @vitest-environment jsdom
// The open project's service (src/services/projects.ts) on a storage in
// memory (the same interface as IndexedDB) with fake timers: when autosave
// writes, and what opening and deleting do to the undo history. The real
// IndexedDB, reloads and other tabs are in e2e/specs/projects.spec.ts.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../../src/core/projectstore.js';
import type { ProjectDoc, ProjectStorage } from '../../src/core/types.ts';
import { storedProject } from '../support/projects.ts';
import { FakeBroadcastChannel, FakeLockManager } from '../support/tabs.ts';

// The storage the service opens instead of IndexedDB (set by each test).
const opened = vi.hoisted(() => ({ storage: null as ProjectStorage | null, legacyFails: false }));
vi.mock('../../src/services/storage/idb.ts', () => ({
  openIdbStorage: async () => opened.storage,
  // The database under the app's former name: none, or one that can't be read.
  openExistingIdbStorage: async () => {
    if (opened.legacyFails) throw new Error('the legacy database can’t be read');
    return null;
  },
  deleteIdb: async () => {},
}));
// jsdom has no canvas: no thumbnails (they are drawn after the document is written).
vi.mock('../../src/services/thumbnail.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/thumbnail.ts')>()),
  drawThumbnail: async () => null,
}));

/**
 * The service and the stores it works on, fresh for each test (the service
 * keeps the open project in module state and subscribes to the document once
 * per start).
 */
async function start(storage: ProjectStorage = memoryStorage()) {
  opened.storage = storage;
  vi.resetModules();
  const projects = await import('../../src/services/projects.ts');
  const { getDocument, setDocument } = await import('../../src/state/document.ts');
  const { historyDepth } = await import('../../src/state/history.ts');
  const { useProject } = await import('../../src/state/project.ts');
  const { nudge } = await import('../../src/state/actions/pieces.ts');
  const { undoLast } = await import('../../src/state/actions/edit.ts');
  const support = await import('../support/state.ts');
  const notices: string[] = [];
  support.resetState();
  await projects.initProjects({ notify: (kind) => void notices.push(kind) });
  const status = () => useProject.getState().status;
  const x = () => getDocument().items[0]?.x;
  /** Puts one piece (a new image) on the sheet, selected. */
  const addPiece = (x0 = 20, y0 = 20) => {
    const key = support.fakeImageMm(40, 30);
    setDocument({ items: [support.piece(1, key, x0, y0)], selection: [1] });
  };
  /** The open project as stored. */
  const stored = async () => (await storage.get(projects.projectSession().record!.id))!;
  return { projects, storage, status, x, addPiece, stored, nudge, undoLast, historyDepth, getDocument, setDocument, notices };
}

beforeEach(() => {
  opened.legacyFails = false;
  vi.useFakeTimers();
  // One tab: no other tab to ask for the project.
  vi.stubGlobal('BroadcastChannel', undefined);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('autosave', () => {
  test('a new project starts saved, and files just added are saved right away', async () => {
    const app = await start();
    expect(app.status()).toBe('saved');
    expect(app.notices).toEqual([]);
    app.addPiece();
    expect(app.status()).toBe('pending');
    await vi.advanceTimersByTimeAsync(0);
    expect(app.status()).toBe('saved');
    expect((await app.stored()).doc.items).toHaveLength(1);
  });

  test('after a change it says «Guardando…», keeps waiting ~1 s after the last change, then saves it', async () => {
    const app = await start();
    app.addPiece(20, 20);
    await vi.advanceTimersByTimeAsync(0);
    expect(app.status()).toBe('saved');

    app.nudge(1, 0);
    expect(app.status()).toBe('pending');
    await vi.advanceTimersByTimeAsync(600);
    expect(app.status()).toBe('pending');
    expect((await app.stored()).doc.items[0].x).toBe(20);

    // Another change restarts the wait.
    app.nudge(1, 0);
    await vi.advanceTimersByTimeAsync(600);
    expect(app.status()).toBe('pending');
    expect((await app.stored()).doc.items[0].x).toBe(20);

    await vi.advanceTimersByTimeAsync(400);
    expect(app.status()).toBe('saved');
    expect((await app.stored()).doc.items[0].x).toBe(22);
  });

  test('undoing back to what is saved says «Guardado» again right away', async () => {
    const app = await start();
    app.addPiece(20, 20);
    await vi.advanceTimersByTimeAsync(0);
    app.nudge(1, 0);
    expect(app.status()).toBe('pending');
    app.undoLast();
    expect(app.status()).toBe('saved');
  });

  // Writing it again would move its «modified» date: the «Proyectos» list
  // would show it as just changed and could reorder it.
  test('undoing back to what is saved doesn’t write the project again', async () => {
    const app = await start();
    app.addPiece(20, 20);
    await vi.advanceTimersByTimeAsync(0);
    const modified = (await app.stored()).modified;
    app.nudge(1, 0);
    app.undoLast();
    await vi.advanceTimersByTimeAsync(2000);
    expect((await app.stored()).modified).toBe(modified);
  });
});

describe('the settings a project keeps', () => {
  test('«Nuevo proyecto» keeps the open one’s settings, «Girar si conviene» and «Permitir superposición» included', async () => {
    const app = await start();
    app.setDocument({ rotate: false, allowOverlap: true, margin: 7, gap: 3, landscape: true });
    await app.projects.newProject();
    expect(app.getDocument()).toMatchObject({ rotate: false, allowOverlap: true, margin: 7, gap: 3, landscape: true, items: [] });
    expect((await app.stored()).doc).toMatchObject({ rotate: false, allowOverlap: true });
  });

  test('a project saved before «Permitir superposición» was the project’s opens with the value this browser had', async () => {
    const storage = memoryStorage();
    const record = await storedProject(storage, 'p1', 'Viejo', 33, 1000);
    const { allowOverlap: _, ...v4 } = record.doc;
    await storage.write({ ...record, version: 4, doc: { ...v4, version: 4 } as ProjectDoc });
    localStorage.setItem('scooch:last-project', 'p1');
    localStorage.setItem('scooch:piece-preferences', JSON.stringify({ allowOverlap: true }));
    const app = await start(storage);
    expect(app.x()).toBe(33);
    expect(app.getDocument().allowOverlap).toBe(true);
  });
});

describe('the last-moment journal', () => {
  /** A storage whose writes stop reaching it (like IndexedDB when the page goes away). */
  function closingStorage() {
    const storage = memoryStorage();
    const state = { closed: false };
    const write = storage.write.bind(storage);
    storage.write = (...args) => (state.closed ? new Promise<void>(() => {}) : write(...args));
    return Object.assign(storage, { close: () => (state.closed = true), open: () => (state.closed = false) });
  }

  test('two tabs with different projects closing at once each keep their own last change', async () => {
    const storage = closingStorage();
    await storedProject(storage, 'p1', 'Uno', 11, 1000);
    await storedProject(storage, 'p2', 'Dos', 22, 2000);
    localStorage.setItem('scooch:last-project', 'p1');
    const a = await start(storage);
    localStorage.setItem('scooch:last-project', 'p2');
    const b = await start(storage);
    expect([a.x(), b.x()]).toEqual([11, 22]);
    a.setDocument({ selection: [1] });
    b.setDocument({ selection: [1] });
    a.nudge(5, 0);
    b.nudge(7, 0);
    // Both pages go away (the same window event reaches both «tabs»); nothing reaches the storage any more.
    storage.close();
    window.dispatchEvent(new Event('pagehide'));
    storage.open();

    localStorage.setItem('scooch:last-project', 'p1');
    const again = await start(storage);
    expect(again.x()).toBe(16);
    await again.projects.openProject('p2');
    expect(again.x()).toBe(29);
  });

  test('a move right before closing is kept even if the system clock went back since the last save', async () => {
    const storage = closingStorage();
    vi.setSystemTime(10_000);
    await storedProject(storage, 'p1', 'Uno', 11, 1000);
    localStorage.setItem('scooch:last-project', 'p1');
    const app = await start(storage);
    app.setDocument({ selection: [1] });
    app.nudge(1, 0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(app.status()).toBe('saved');
    vi.setSystemTime(5_000); // the clock steps back
    app.nudge(1, 0);
    storage.close();
    window.dispatchEvent(new Event('pagehide'));
    storage.open();
    const again = await start(storage);
    expect(again.x()).toBe(13);
  });
});

describe('the last opened project', () => {
  test('a last project saved by a newer version opens another one but stays the last opened (the newer version opens it)', async () => {
    const storage = memoryStorage();
    await storedProject(storage, 'p1', 'Este', 11, 1000);
    const newer = await storedProject(storage, 'pnew', 'Del futuro', 22, 2000);
    await storage.write({ ...newer, doc: { ...newer.doc, version: 99 } });
    localStorage.setItem('scooch:last-project', 'pnew');
    const app = await start(storage);
    expect(app.projects.projectSession().record?.id).toBe('p1');
    expect(app.notices).toEqual(['openFailed']);
    expect(localStorage.getItem('scooch:last-project')).toBe('pnew');
  });

  test('when moving the projects saved under the former name fails, the new blank project doesn’t replace the last opened one', async () => {
    opened.legacyFails = true;
    localStorage.setItem('scooch:last-project', 'pold');
    const app = await start(memoryStorage());
    expect(app.projects.projectSession().record?.name).toBe('Sin título');
    expect(localStorage.getItem('scooch:last-project')).toBe('pold');
  });

  test('a project opened or created by the person becomes the last opened', async () => {
    const storage = memoryStorage();
    await storedProject(storage, 'p1', 'Uno', 11, 1000);
    const app = await start(storage);
    await app.projects.openProject('p1');
    expect(localStorage.getItem('scooch:last-project')).toBe('p1');
    const created = await app.projects.newProject();
    expect(localStorage.getItem('scooch:last-project')).toBe(created.id);
  });
});

describe('two tabs', () => {
  // Real timers: the tabs talk through a channel and wait for each other.
  beforeEach(() => {
    vi.useRealTimers();
    FakeBroadcastChannel.reset();
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });

  test('renaming the project in the tab that stopped saving it (another tab took it) keeps the new name', async () => {
    const storage = memoryStorage();
    await storedProject(storage, 'p1', 'Tarjetas', 11, 1000);
    localStorage.setItem('scooch:last-project', 'p1');
    const a = await start(storage);
    const b = await start(storage);
    await vi.waitFor(() => expect(a.status()).toBe('readonly'));
    expect(b.status()).toBe('saved');

    await a.projects.rename('p1', 'Desde la otra pestaña');
    expect((await storage.get('p1'))!.name).toBe('Desde la otra pestaña');
    await vi.waitFor(() => expect(b.projects.projectSession().record?.name).toBe('Desde la otra pestaña'));
    // What the tab that saves it writes next keeps that name.
    b.setDocument({ selection: [1] });
    b.nudge(1, 0);
    await b.projects.flush();
    expect((await storage.get('p1'))!).toMatchObject({ name: 'Desde la otra pestaña', doc: { items: [{ x: 12 }] } });
  });
});

describe('two tabs, with Web Locks', () => {
  let locks: FakeLockManager;
  beforeEach(() => {
    FakeBroadcastChannel.reset();
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    locks = new FakeLockManager();
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
  });
  afterEach(() => {
    delete (navigator as { locks?: unknown }).locks;
  });

  test('opening a project no other tab has doesn’t wait for any answer', async () => {
    const storage = memoryStorage();
    await storedProject(storage, 'p1', 'Uno', 11, 1000);
    await storedProject(storage, 'p2', 'Dos', 22, 2000);
    localStorage.setItem('scooch:last-project', 'p1');
    const app = await start(storage);
    expect(locks.heldNames()).toEqual(['scooch-projects:p1']);
    let opened = false;
    const opening = app.projects.openProject('p2').then(() => (opened = true));
    // No time passes: only what is already queued runs.
    await vi.advanceTimersByTimeAsync(0);
    expect(opened).toBe(true);
    await opening;
    expect(app.x()).toBe(22);
    expect(locks.heldNames(), 'the lock of the project it saves now, only').toEqual(['scooch-projects:p2']);
  });

  test('a second tab takes the project from the first one, which saves what was pending and stops saving', async () => {
    vi.useRealTimers();
    const storage = memoryStorage();
    await storedProject(storage, 'p1', 'Uno', 11, 1000);
    localStorage.setItem('scooch:last-project', 'p1');
    const a = await start(storage);
    a.setDocument({ selection: [1] });
    a.nudge(4, 0);
    expect(a.status()).toBe('pending');
    const b = await start(storage);
    expect(a.status()).toBe('readonly');
    expect(a.notices).toContain('takenOver');
    expect(b.status()).toBe('saved');
    expect(b.x(), 'what the first one had pending').toBe(15);
    expect(locks.heldNames()).toEqual(['scooch-projects:p1']);
  });

  test('a tab holding the project that doesn’t answer (frozen) loses it after a while, and stops saving when it wakes up', async () => {
    const storage = memoryStorage();
    await storedProject(storage, 'p1', 'Uno', 11, 1000);
    localStorage.setItem('scooch:last-project', 'p1');
    // The frozen tab: it holds the project's lock and never answers.
    let frozenLost = false;
    void locks.request('scooch-projects:p1', () => new Promise(() => {})).catch(() => (frozenLost = true));
    let app: Awaited<ReturnType<typeof start>> | undefined;
    void start(storage).then((started) => (app = started));
    await vi.waitFor(() => expect(app).toBeDefined(), { interval: 250, timeout: 10_000 });
    expect(app!.status()).toBe('saved');
    expect(app!.x()).toBe(11);
    expect(frozenLost).toBe(true);
  });
});

describe('the order of «Proyectos»', () => {
  test('the last opened project comes first; renaming one doesn’t move it', async () => {
    const storage = memoryStorage();
    await storedProject(storage, 'p1', 'Uno', 11, 1000);
    await storedProject(storage, 'p2', 'Dos', 22, 2000);
    localStorage.setItem('scooch:last-project', 'p1');
    const app = await start(storage);
    const order = async () => (await app.projects.list()).map((record) => record.id);
    expect(await order(), 'opened on start').toEqual(['p1', 'p2']);
    await vi.advanceTimersByTimeAsync(10);
    await app.projects.openProject('p2');
    expect(await order()).toEqual(['p2', 'p1']);
    const modified = (await storage.get('p1'))!.modified;
    await app.projects.rename('p1', 'Otro nombre');
    expect(await order()).toEqual(['p2', 'p1']);
    expect((await storage.get('p1'))!).toMatchObject({ name: 'Otro nombre', modified });
  });
});

describe('opening and deleting projects', () => {
  test('the last project opens at start, with an empty undo history', async () => {
    const storage = memoryStorage();
    await storedProject(storage, 'p1', 'Tarjetas', 33, 1000);
    localStorage.setItem('scooch:last-project', 'p1');
    const app = await start(storage);
    expect(app.status()).toBe('saved');
    expect(app.x()).toBe(33);
    expect(app.projects.projectSession().record?.name).toBe('Tarjetas');
    expect(app.historyDepth()).toEqual({ undo: 0, redo: 0 });
  });

  test('opening another project starts its undo history empty', async () => {
    const app = await start();
    await storedProject(app.storage, 'p1', 'Otro', 33, 1000);
    app.addPiece(20, 20);
    app.nudge(1, 0);
    expect(app.historyDepth()).toEqual({ undo: 1, redo: 0 });

    await app.projects.openProject('p1');
    expect(app.x()).toBe(33);
    expect(app.historyDepth()).toEqual({ undo: 0, redo: 0 });
    app.undoLast();
    expect(app.x()).toBe(33);
  });

  test('deleting another project leaves the open document and its undo history alone', async () => {
    const app = await start();
    await storedProject(app.storage, 'p1', 'Otro', 33, 1000);
    app.addPiece(20, 20);
    app.nudge(1, 0);
    const depth = app.historyDepth();
    expect(depth.undo).toBeGreaterThan(0);

    await app.projects.remove('p1');
    expect(await app.storage.get('p1')).toBeNull();
    expect(app.historyDepth()).toEqual(depth);
    expect(app.x()).toBe(21);
    app.undoLast();
    expect(app.x()).toBe(20);
  });

  test('deleting the open project opens the newest of the rest', async () => {
    const storage = memoryStorage();
    await storedProject(storage, 'p1', 'Viejo', 11, 1000);
    await storedProject(storage, 'p2', 'Nuevo', 22, 2000);
    localStorage.setItem('scooch:last-project', 'p1');
    const app = await start(storage);
    expect(app.x()).toBe(11);

    await app.projects.remove('p1');
    expect(app.projects.projectSession().record?.id).toBe('p2');
    expect(app.x()).toBe(22);
    expect(app.status()).toBe('saved');
  });
});
