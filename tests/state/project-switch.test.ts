// @vitest-environment jsdom
// Opening another project from the interface (src/state/actions/projects.ts):
// the view starts over with the new document, at the top of its first sheet,
// which is the current one. With a storage in memory instead of IndexedDB.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../../src/core/projectstore.js';
import type { ProjectStorage } from '../../src/core/types.ts';
import { storedProject } from '../support/projects.ts';

const opened = vi.hoisted(() => ({ storage: null as ProjectStorage | null }));
vi.mock('../../src/services/storage/idb.ts', () => ({
  openIdbStorage: async () => opened.storage,
  openExistingIdbStorage: async () => null,
  deleteIdb: async () => {},
}));
vi.mock('../../src/services/thumbnail.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/thumbnail.ts')>()),
  drawThumbnail: async () => null,
}));

beforeAll(() => {
  URL.createObjectURL ??= () => 'blob:test';
  URL.revokeObjectURL ??= () => {};
});

beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', undefined);
  localStorage.clear();
  document.body.innerHTML = '<div id="stage"><div id="sheets"></div></div><div id="live-polite"></div><div id="live-assertive"></div>';
});
afterEach(() => vi.unstubAllGlobals());

describe('switching projects', () => {
  test('the new project shows from the top of its first sheet, and that sheet is the current one', async () => {
    const storage = memoryStorage();
    await storedProject(storage, 'p1', 'Tres hojas', 30, 1000, { sheets: 3 });
    await storedProject(storage, 'p2', 'Otro', 40, 2000, { sheets: 2 });
    localStorage.setItem('scooch:last-project', 'p1');
    opened.storage = storage;
    vi.resetModules();
    const { startProjects, openWithUi } = await import('../../src/state/actions/projects.ts');
    const { getView, setView } = await import('../../src/state/view.ts');
    const { currentSheet } = await import('../../src/state/selectors.ts');
    await startProjects();

    // Looking at the third sheet, a bit to the right (zoomed in).
    const stage = document.getElementById('stage')!;
    stage.scrollTop = 1800;
    stage.scrollLeft = 120;
    setView({ sheet: 3 });

    await openWithUi('p2', 'Otro');
    expect(stage.scrollTop).toBe(0);
    expect(stage.scrollLeft).toBe(0);
    expect(getView().sheet).toBe(1);
    expect(currentSheet()).toBe(1);
  });
});
