// Projects saved in the browser, with the real IndexedDB: restoring on reload
// (also the last-moment journal), the same PDF after restoring, the
// «Proyectos» dialog (Ctrl+O, new, open, duplicate, delete), switching
// projects without mixing them, two tabs, no storage, a full storage and a
// damaged project; renaming in place (the card and the top bar) and the
// tooltips and icon-only buttons. When autosave writes and what opening or
// deleting does to the undo history: tests/services/projects.test.ts.
import type { Page } from '@playwright/test';
import { App, expect, norm, test } from '../support/test.ts';
import {
  card,
  cards,
  focusedCard,
  labels,
  labelsWithoutSheetIds,
  liveObjectUrls,
  openProjects,
  patchStored,
  renameInBar,
  saved,
  savePending,
  saveStatus,
  status,
  storedProjects,
  storedRecord,
  trackObjectUrls,
} from '../support/projects.ts';

const PDFJS = /pdfjs-dist|pdf\.worker/;

/** The document settings as the Proyecto tab shows them. */
async function settings(app: App) {
  const page = app.page;
  await app.openSheet();
  await app.openSetting('#gap');
  await app.openSetting('#allow-rotate');
  return {
    paper: norm(await page.locator('#paper-label').textContent()),
    margin: await page.locator('#margin').inputValue(),
    gap: await page.locator('#gap').inputValue(),
    rotate: await page.locator('#allow-rotate').isChecked(),
    landscape: await page.locator('#landscape').isChecked(),
  };
}

/** Shows page `n` of the selected PDF piece and waits until it is in place. */
async function showPdfPage(app: App, n: number) {
  await app.openMeasures();
  await app.page.locator('#page').selectOption(String(n));
  await expect(app.page.locator('#page')).toHaveValue(String(n));
  await expect(app.page.locator('#page')).toBeEnabled();
}

/** A rich document: an image, a PDF on its page 2 on a second sheet, a JPEG with EXIF, a rotated PDF, and custom paper. */
async function richDocument(app: App) {
  const page = app.page;
  await app.addFiles(['card00.png', 'twopage.pdf', 'exif6.jpg', 'rotated.pdf']);
  await saved(page);
  await app.pieceNamed('twopage.pdf').focus();
  await showPdfPage(app, 2);
  await app.pieceNamed('twopage.pdf').focus();
  await page.keyboard.press('Shift+PageDown');
  await expect(page.locator('#sheets .page')).toHaveCount(2);
  await app.openSheet();
  await page.locator('#paper').selectOption('custom');
  await page.locator('#paper-w').fill('300');
  await page.locator('#paper-h').fill('250');
  await page.keyboard.press('Enter');
  await app.openSetting('#margin');
  await page.locator('#margin').fill('8');
  await page.keyboard.press('Enter');
  await app.openSetting('#gap');
  await page.locator('#gap').fill('3');
  await page.keyboard.press('Enter');
  await app.openSetting('#allow-rotate');
  await page.locator('#allow-rotate').click();
  await saved(page);
}

test.describe('saving and restoring', () => {
  test('a reload restores the pieces, their sheets and places, the name and the settings, and a PDF page without loading pdf.js', async ({ page, app }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __persist: number };
      w.__persist = 0;
      // Playwright's WebKit has no navigator.storage (Safari has): one that isn't persisted yet.
      if (!navigator.storage) Object.defineProperty(navigator, 'storage', { value: { persisted: async () => false, persist: async () => true }, configurable: true });
      const persist = navigator.storage.persist.bind(navigator.storage);
      navigator.storage.persist = () => {
        w.__persist++;
        return persist();
      };
    });
    await app.open(); // again, with the counter of persistent-storage requests
    await test.step('a new project is «Sin título» and saved, which shows nothing; its name is a button that says so', async () => {
      await expect(page.locator('#project-name-text')).toHaveText('Sin título');
      await saved(page);
      await expect(page.locator('#project-status')).toHaveCount(0);
      await expect(page.locator('#project-name')).toHaveAttribute('aria-label', 'Sin título: cambiar el nombre');
      await expect(page.locator('#project-name')).not.toHaveAttribute('aria-describedby');
    });

    await richDocument(app);
    await renameInBar(page, 'Tarjetas de prueba');
    await saved(page);
    expect(await page.evaluate(() => (window as unknown as { __persist: number }).__persist), 'persistent storage asked once in the session').toBe(1);
    const before = await labels(page);
    expect(before.join(' ')).toContain('twopage.pdf (página 2)');
    const settingsBefore = await settings(app);
    expect(settingsBefore).toMatchObject({ margin: '8', gap: '3', rotate: false });

    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.reload();
    await app.ready();
    expect(await labels(page)).toEqual(before);
    await expect(page.locator('#project-name-text')).toHaveText('Tarjetas de prueba');
    expect(await settings(app)).toEqual(settingsBefore);
    expect(requests.filter((u) => PDFJS.test(u)), 'the PDF page is restored without pdf.js').toEqual([]);

    await test.step('another page of the restored PDF loads pdf.js and shows it', async () => {
      await app.pieceNamed('twopage.pdf').focus();
      await showPdfPage(app, 1);
      await expect.poll(async () => (await labels(page)).join(' ')).toContain('twopage.pdf (página 1)');
      expect(requests.some((u) => /pdfjs-dist/.test(u))).toBe(true);
    });
  });

  test('a JPEG with EXIF orientation comes back with its preview upright', async ({ page, app }) => {
    await app.addFiles(['exif6.jpg']);
    await saved(page);
    await page.reload();
    await app.ready();
    const exif = await app.pieceNamed('exif6.jpg').evaluate(async (piece) => {
      const img = piece.querySelector('img')!;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return { w: img.naturalWidth, h: img.naturalHeight, top: [...ctx.getImageData(c.width / 2, 40, 1, 1).data].slice(0, 3) };
    });
    // exif6.jpg is stored landscape with a red band on its left: upright, it's portrait with the band on top.
    expect(exif.h, JSON.stringify(exif)).toBeGreaterThan(exif.w);
    expect(exif.top[0], JSON.stringify(exif)).toBeGreaterThan(150);
    expect(exif.top[1], JSON.stringify(exif)).toBeLessThan(80);
  });

  test('after a reload the download is the same PDF: pages, content, images and title', async ({ page, app }) => {
    await richDocument(app);
    const before = await app.downloadPdf();
    await page.reload();
    await app.ready();
    const after = await app.downloadPdf();
    expect(after.info.pages).toEqual(before.info.pages);
    expect(after.info.title).toBe(before.info.title);
    expect(after.name).toBe(before.name);
  });

  test('a move or a file added right before a reload is kept (the last-moment journal), and then saved', async ({ page, app }) => {
    // The journal is used when it is newer than the last save, by the clock:
    // the page's clock moves forward on purpose (this machine's may step back).
    const t0 = Date.now();
    await page.clock.setFixedTime(t0);
    await app.addFiles(['card10.png']);
    await saved(page);
    await page.clock.setFixedTime(t0 + 1_000);
    const first = app.pieces().first();
    await first.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    const moved = await first.getAttribute('aria-label');
    const x = (await app.geometry()).pieces[0].x;
    await savePending(page);
    await page.reload(); // right away: the ~1 s save hasn't gone out
    await app.ready();
    await expect(first).toHaveAttribute('aria-label', moved!);
    await saved(page);
    expect((await storedRecord(page))?.doc.items[0].x as number, 'written to the project, not only journaled').toBeCloseTo(x, 3);

    await page.clock.setFixedTime(t0 + 2_000);
    await app.addFiles(['card11.png']);
    await page.reload(); // right away after adding
    await app.ready();
    await expect(app.pieces()).toHaveCount(2);
  });

  // The journal is used while the stored record is still the one it started
  // from (an equality, see recoverJournal), not by comparing two wall-clock
  // times: the clock can step back between the last save and closing the tab.
  test('a move right before a reload is kept even if the system clock went back since the last save', async ({ page, app }) => {
    const t0 = Date.now();
    await page.clock.setFixedTime(t0);
    await app.addFiles(['card10.png']);
    await saved(page);
    await page.clock.setFixedTime(t0 - 5_000);
    const first = app.pieces().first();
    const before = (await first.getAttribute('aria-label'))!;
    await first.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    const moved = (await first.getAttribute('aria-label'))!;
    expect(moved).not.toBe(before);
    await page.reload();
    await app.ready();
    // Wait until the restored piece is in place (moved or not), then look.
    await expect.poll(async () => [before, moved].includes((await first.getAttribute('aria-label'))!)).toBe(true);
    expect(await first.getAttribute('aria-label')).toBe(moved);
  });
});

test.describe('the undo history', () => {
  test('undo and redo survive a reload: a move, and a piece removed with its file', async ({ page, app }) => {
    await app.addFiles(['card01.png', 'card02.png']);
    await saved(page);
    const before = await labels(page);
    const first = app.pieces().first();
    await first.focus();
    await page.keyboard.press('ArrowRight');
    const moved = await labels(page);
    await page.keyboard.press('Delete');
    await expect(app.pieces()).toHaveCount(1);
    await saved(page);
    await page.reload();
    await app.ready();
    await expect(app.pieces()).toHaveCount(1);
    await expect(page.locator('#undo')).toBeEnabled();
    await page.locator('#undo').click();
    await expect(app.pieces()).toHaveCount(2);
    expect(await labels(page)).toEqual(moved);
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('#sheets .piece img')].every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
    await page.keyboard.press('Control+z');
    await expect.poll(() => labels(page)).toEqual(before);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => labels(page)).toEqual(moved);
  });
});

test.describe('the projects dialog', () => {
  test('Ctrl+O opens it on «Nuevo proyecto», which starts a blank project; the list is newest first, arrows move between cards and Enter opens one', async ({ page, app }) => {
    // «Newest» is by the clock: the page's clock moves forward on purpose
    // between the two projects (this machine's may step back by seconds).
    const t0 = Date.now();
    await page.clock.setFixedTime(t0);
    await app.addFiles(['card01.png', 'card02.png']);
    await renameInBar(page, 'Proyecto A');
    await saved(page);
    const aLabels = await labels(page);

    await test.step('one project: the open one, with its thumbnail, time, sheets and pieces', async () => {
      // Playwright's WebKit has no navigator.storage (Safari has): one that knows the space used.
      await page.evaluate(() => navigator.storage ?? Object.defineProperty(navigator, 'storage', { value: { estimate: async () => ({ usage: 2.5e6, quota: 1e9 }) }, configurable: true }));
      await app.pieces().first().focus();
      await openProjects(page);
      await expect(page.locator('#project-new')).toBeFocused();
      await expect.poll(() => cards(page)).toEqual([expect.objectContaining({ name: 'Proyecto A', current: true, thumb: true, meta: 'ahora · 1 hoja · 2 piezas' })]);
      await expect(page.locator('#projects-empty')).toBeHidden();
      await expect(page.locator('#projects .projects-note')).toHaveText('El proyecto abierto se guarda solo');
      expect(norm(await page.locator('#projects-usage').textContent())).toMatch(/^\S+ \S+ de \S+ \S+ usados$/);
      await expect(page.getByRole('meter', { name: 'Espacio usado en este navegador' })).toBeVisible();
    });

    await test.step('«Nuevo proyecto»: blank, «Sin título», announced, the focus on the sheet', async () => {
      await page.keyboard.press('Enter');
      await expect(page.locator('#projects')).not.toHaveAttribute('open');
      await expect(page.locator('#project-name-text')).toHaveText('Sin título');
      await expect(app.pieces()).toHaveCount(0);
      await app.heard(/Se creó un proyecto nuevo\. «Proyecto A» quedó guardado\./);
      await expect(page.locator('#empty')).toBeFocused();
      await expect(page.locator('#clear')).toBeDisabled();
    });

    await saved(page);
    await page.clock.setFixedTime(t0 + 5_000);
    await app.addFiles(['card03.png', 'card04.png', 'card05.png']);
    await renameInBar(page, 'Proyecto B');
    await saved(page);

    await test.step('two projects, newest first; ↓, Home and End move between cards', async () => {
      await page.locator('#projects-open').click();
      await expect.poll(async () => (await cards(page)).map((c) => `${c.name}${c.current ? '*' : ''}`)).toEqual(['Proyecto B*', 'Proyecto A']);
      await page.locator('#projects .project-card .project-open').first().focus();
      await page.keyboard.press('ArrowDown');
      expect(await focusedCard(page)).toBe('Proyecto A');
      await page.keyboard.press('Home');
      expect(await focusedCard(page)).toBe('Proyecto B');
      await page.keyboard.press('End');
      expect(await focusedCard(page)).toBe('Proyecto A');
    });

    await test.step('Enter opens A: its pieces, not B’s, and it is announced', async () => {
      await page.keyboard.press('Enter');
      await expect(page.locator('#project-name-text')).toHaveText('Proyecto A');
      await saved(page);
      expect(await labels(page)).toEqual(aLabels);
      await app.heard(/Se abrió «Proyecto A»/);
    });
  });

  test('a duplicate gets the focus and the same pieces; deleting asks first, Esc keeps it, and deleting the open one opens the newest left', async ({ page, app }) => {
    await app.addFiles(['card01.png', 'card02.png']);
    await renameInBar(page, 'Proyecto A');
    await saved(page);
    const aLabels = await labelsWithoutSheetIds(page);
    await openProjects(page);
    await page.locator('#project-new').click();
    await expect(page.locator('#project-name-text')).toHaveText('Sin título');
    await saved(page);
    await app.addFiles(['card03.png']);
    await renameInBar(page, 'Proyecto B');
    await saved(page);

    await test.step('duplicate A: «Proyecto A (copia)», focused, with A’s pieces', async () => {
      await openProjects(page);
      await card(page, 'Proyecto A').locator('[data-act="duplicate"]').click();
      await expect(page.locator('#projects .project-card')).toHaveCount(3);
      await expect.poll(() => focusedCard(page)).toBe('Proyecto A (copia)');
      await card(page, 'Proyecto A (copia)').locator('.project-open').click();
      await expect(page.locator('#project-name-text')).toHaveText('Proyecto A (copia)');
      await saved(page);
      expect(await labelsWithoutSheetIds(page)).toEqual(aLabels);
    });

    await test.step('delete B: an explicit, irreversible confirmation focused on «Cancelar»; Esc keeps B and «Proyectos» open', async () => {
      await openProjects(page);
      await card(page, 'Proyecto B').locator('[data-act="delete"]').click();
      await expect(page.locator('#confirm')).toHaveAttribute('open', '');
      expect(norm(await page.locator('#confirm-title').textContent())).toBe('¿Eliminar «Proyecto B»?');
      await expect(page.locator('#confirm-body')).toContainText('No se puede deshacer');
      await expect(page.locator('#confirm-cancel')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator('#confirm')).not.toHaveAttribute('open');
      await expect(page.locator('#projects')).toHaveAttribute('open', '');
      await expect(card(page, 'Proyecto B')).toHaveCount(1);
    });

    await test.step('confirmed: B is gone and it is announced', async () => {
      await card(page, 'Proyecto B').locator('[data-act="delete"]').click();
      await page.locator('#confirm-ok').click();
      await expect(card(page, 'Proyecto B')).toHaveCount(0);
      await app.heard(/Se eliminó «Proyecto B»/);
    });

    await test.step('deleting the open project (the copy) opens the one left (A)', async () => {
      await page.locator('#projects .project-card.is-current [data-act="delete"]').click();
      await page.locator('#confirm-ok').click();
      await expect(page.locator('#project-name-text')).toHaveText('Proyecto A');
      await saved(page);
      expect(await labelsWithoutSheetIds(page)).toEqual(aLabels);
      await expect(page.locator('#projects .project-card')).toHaveCount(1);
    });
  });

  test('switching between two projects 10 times never mixes their pieces and leaves no object URL behind', async ({ page, app }) => {
    await trackObjectUrls(page);
    await app.open(); // again, with the URL counter
    await app.addFiles(['card01.png', 'card02.png']);
    await renameInBar(page, 'X');
    await saved(page);
    await openProjects(page);
    await page.locator('#project-new').click();
    await expect(page.locator('#project-name-text')).toHaveText('Sin título');
    await saved(page);
    await app.addFiles(['twopage.pdf', 'card06.png']);
    await renameInBar(page, 'Y');
    await saved(page);

    const open = async (name: string) => {
      await openProjects(page);
      await card(page, name).locator('.project-open').click();
      await expect(page.locator('#projects')).not.toHaveAttribute('open');
      await expect(page.locator('#project-name-text')).toHaveText(name);
      await saved(page);
    };
    await open('X');
    const x = await labels(page);
    await open('Y');
    const y = await labels(page);
    expect(x).not.toEqual(y);
    const baseline = await liveObjectUrls(page);
    for (let i = 0; i < 5; i++) {
      await open('X');
      expect(await labels(page)).toEqual(x);
      await open('Y');
      expect(await labels(page)).toEqual(y);
    }
    expect(await liveObjectUrls(page), `object URLs alive (${baseline} before)`).toBeLessThanOrEqual(baseline);
  });
});

test.describe('files shared between projects', () => {
  test('a photo added to two projects is stored once; deleting one project leaves it to the other, and what nothing uses goes', async ({ page, app }) => {
    await app.addFiles(['card01.png', 'card02.png']);
    await renameInBar(page, 'Con dos');
    await saved(page);
    const single = await storedProjects(page);
    await openProjects(page);
    await page.locator('#project-new').click();
    await expect(page.locator('#project-name-text')).toHaveText('Sin título');
    await saved(page);
    await app.addFiles(['card01.png']);
    await renameInBar(page, 'Con una');
    await saved(page);
    // card01.png's bytes are already stored: only the second project's own files are new rows.
    const both = await storedProjects(page);
    expect(both.files).toBe(single.files + 2);
    expect(both.blobs, 'the same original and preview, stored once').toBe(single.blobs);
    // As bytes: WebKit can't store a Blob in an ephemeral session (Safari's private windows).
    expect(both.asBlobs, 'binaries and thumbnails stored as Blobs').toBe(0);
    expect(both.projects.every((p) => p.thumb)).toBe(true);

    await openProjects(page);
    await card(page, 'Con dos').locator('[data-act="delete"]').click();
    await page.locator('#confirm-ok').click();
    await expect(card(page, 'Con dos')).toHaveCount(0);
    // card02.png's binaries go a few seconds later; card01.png's stay.
    await expect.poll(() => storedProjects(page), { timeout: 15_000 }).toMatchObject({ files: 2, blobs: 2 });
    await page.reload();
    await app.ready();
    await expect(page.locator('#project-name-text')).toHaveText('Con una');
    await expect.poll(() => app.pieces().first().locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  });
});

test.describe('two tabs', () => {
  test('a new tab opens the latest version; the old one stops saving until «Editar aquí», and then the other one stops', async ({ page: a, app, context }, testInfo) => {
    const TAKEN = 'Este proyecto se abrió en otra pestaña. Aquí ya no se guardan los cambios.';
    await app.addFiles(['card07.png']);
    await saved(a);
    await app.pieces().first().focus();
    await a.keyboard.press('ArrowRight');
    await savePending(a);

    const b = await context.newPage();
    const errorsB: string[] = [];
    b.on('pageerror', (e) => errorsB.push(e.message));
    b.on('console', (m) => m.type() === 'error' && errorsB.push(m.text()));
    const appB = new App(b, testInfo);
    await appB.open();
    const firstA = app.pieces().first();
    const firstB = appB.pieces().first();

    await test.step('the new tab opens what the old one had pending', async () => {
      await expect(firstB).toHaveAttribute('aria-label', /a 11\smm del borde izquierdo y 10\smm del superior/);
    });

    await test.step('the old tab says so, offers «Editar aquí» and stops saving', async () => {
      await expect.poll(() => app.notice()).toEqual({ text: TAKEN, action: 'Editar aquí', warn: true });
      await expect(status(a)).toHaveText('En otra pestaña');
    });

    await test.step('what the old tab edits doesn’t reach the new one', async () => {
      await firstB.focus();
      await b.keyboard.press('ArrowDown');
      await saved(b);
      await firstA.focus();
      await a.keyboard.press('ArrowRight');
      await expect(status(a)).toHaveText('En otra pestaña');
      // Reopening the project in the new tab asks the other tabs for it: an old
      // tab that still saved would hand over its own version now.
      await b.reload();
      await appB.ready();
      await expect(firstB).toHaveAttribute('aria-label', /a 11\smm del borde izquierdo y 11\smm del superior/);
      await saved(b);
    });

    await test.step('«Editar aquí»: the old tab reloads the latest and saves again; now the other one says so', async () => {
      await a.locator('#project-retry').click();
      await saved(a);
      await expect(firstA).toHaveAttribute('aria-label', /a 11\smm del borde izquierdo y 11\smm del superior/);
      await expect.poll(() => appB.notice()).toEqual({ text: TAKEN, action: 'Editar aquí', warn: true });
      await expect(status(b)).toHaveText('En otra pestaña');
    });
    expect(errorsB, 'no errors in the second tab').toEqual([]);
  });
});

test.describe('two tabs at once', () => {
  test('two tabs opening the same project at the same moment: exactly one saves it, and what the other does never reaches it', async ({ page: a, app, context }, testInfo) => {
    await app.addFiles(['card07.png']);
    await saved(a);
    const b = await context.newPage();
    const c = await context.newPage();
    const appB = new App(b, testInfo);
    const appC = new App(c, testInfo);
    // Both reload into the last project at once (like a browser restoring its tabs).
    await Promise.all([appB.open(), appC.open()]);
    const readonly = async (page: Page) => (await saveStatus(page).getAttribute('data-status')) === 'readonly';
    await expect.poll(async () => [await readonly(a), await readonly(b), await readonly(c)].filter(Boolean).length, { message: 'every tab but one stopped saving' }).toBe(2);
    const tabs = [a, b, c];
    const flags = await Promise.all(tabs.map(readonly));
    const saver = tabs[flags.indexOf(false)];
    const other = tabs[flags.indexOf(true)];
    const first = (page: Page) => page.locator('#sheets .piece').first();
    await first(other).focus();
    await other.keyboard.press('ArrowRight');
    await first(saver).focus();
    await saver.keyboard.press('ArrowDown');
    await saved(saver);
    const stored = await storedRecord(saver);
    expect({ x: stored?.doc.items[0].x, y: stored?.doc.items[0].y }, 'the saving tab’s move, not the other’s').toEqual({ x: 10, y: 11 });
  });
});

test.describe('when storage fails', () => {
  test('without IndexedDB the app works and says so once; adding and downloading still work, and «Proyectos» explains it', async ({ page }, testInfo) => {
    await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }));
    const app = new App(page, testInfo);
    await app.open();
    // The loading screen gave way to the app, which says what failed.
    await expect(page.locator('.boot')).toHaveCount(0);
    expect(await app.notice()).toEqual({
      text: 'Este navegador no permite guardar proyectos (por ejemplo, en una ventana privada). Lo que hagas se pierde al cerrar la pestaña.',
      action: '',
      warn: true,
    });
    await expect(status(page)).toHaveText('Sin guardar');
    await app.addFiles(['card08.png']);
    expect((await app.download()).name).toBe('scooch-a4.pdf');
    await page.keyboard.press('Control+o');
    await expect(page.locator('#projects')).toHaveAttribute('open', '');
    await expect(page.locator('#projects-unavailable')).toBeVisible();
    await expect(page.locator('#projects .project-card')).toHaveCount(0);
  });

  test.describe('a full storage', () => {
    test.use({ allowErrors: [/^The project could not be saved\./] });

    test('«No se guardó» with «Reintentar» and a notice that leads to «Proyectos»; «Reintentar» saves and says so', async ({ page }, testInfo) => {
      await page.addInitScript(() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
          if ((window as unknown as { __full?: boolean }).__full && this.name === 'files') throw new DOMException('lleno', 'QuotaExceededError');
          return put.apply(this, args);
        };
      });
      const app = new App(page, testInfo);
      await app.open();
      await page.evaluate(() => ((window as unknown as { __full: boolean }).__full = true));
      await app.addFiles(['card09.png']);
      await expect(status(page)).toHaveText('No se guardó');
      await expect(page.locator('#project-retry')).toBeVisible();
      expect(await app.notice()).toEqual({ text: 'No hay espacio para guardar el proyecto. Elimina proyectos que no uses y vuelve a intentarlo.', action: 'Ver proyectos', warn: true });
      await app.heard(/No hay espacio para guardar el proyecto/);

      await page.evaluate(() => ((window as unknown as { __full: boolean }).__full = false));
      await page.locator('#project-retry').click();
      await saved(page);
      await app.heard(/Se guardó el proyecto/);
      expect((await storedRecord(page))?.doc.items).toHaveLength(1);
    });
  });

  test('a damaged project: the app opens a new one, offers to delete it, and «Proyectos» marks it «Dañado» with only Eliminar', async ({ page, app }) => {
    await saved(page);
    await patchStored(page, (doc) => ({ ...doc, sheets: 'roto' }));
    await page.reload();
    await app.ready();
    await expect.poll(() => app.notice()).toEqual({ text: 'No se pudo abrir «Sin título» porque sus datos están dañados', action: 'Eliminar proyecto', warn: true });
    await expect(app.pieces()).toHaveCount(0);

    await openProjects(page);
    const damaged = page.locator('#projects .project-card.is-damaged');
    await expect(damaged).toHaveCount(1);
    await expect(damaged.locator('.project-open')).toBeDisabled();
    await expect(damaged.locator('[data-act="delete"]')).toBeEnabled();
    await expect(damaged.locator('.project-badge')).toHaveText('Dañado');
    await damaged.locator('[data-act="delete"]').click();
    await page.locator('#confirm-ok').click();
    await expect(damaged).toHaveCount(0);
    await expect(page.locator('#projects .project-card')).toHaveCount(1);
  });
});

// ---------- Renaming in place, tooltips and icon-only buttons ----------
// The theme changes none of this: one theme, the two widths where the cards and
// the top bar are laid out differently.

type Rect = { x: number; y: number; w: number; h: number };
const rect = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
};
const sameRect = (a: Rect, b: Rect) => (['x', 'y', 'w', 'h'] as const).every((k) => Math.abs(a[k] - b[k]) < 0.5);
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The visible buttons whose only content is an icon, with their accessible name and tooltip. */
const iconOnlyButtons = () =>
  [...document.querySelectorAll('button')]
    .filter((b) => {
      if (b.closest('[hidden], dialog:not([open])') || !b.getClientRects().length) return false;
      const copy = b.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('.sr-only, svg').forEach((n) => n.remove());
      return !copy.textContent?.trim();
    })
    .map((b) => ({ id: b.id || `${b.className} ${b.dataset.act ?? b.dataset.action ?? b.dataset.align ?? b.dataset.distribute ?? ''}`.trim(), name: b.getAttribute('aria-label') ?? '', tip: b.dataset.tip ?? '' }));

async function openWithCard(page: Page, app: App) {
  await app.addFiles(['card00.png', 'card01.png']);
  await saved(page);
  await page.locator('#projects-open').click();
  await expect(page.locator('#projects[open] .project-card img')).toBeVisible();
  return page.locator('#projects .project-card.is-current');
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`renaming in place and tooltips at ${viewport.width} px`, () => {
    test.use({ viewport });

    test('renaming in its card keeps the card’s size and thumbnail with the «Abierto» badge clear of the field; Enter, Esc, empty and leaving the field', async ({ page, app }, testInfo) => {
      const current = await openWithCard(page, app);
      const title = current.locator('.project-title');
      const before = await current.evaluate(rect);
      await current.locator('[data-act="rename"]').click();
      const input = current.locator('.project-title-input');
      await expect(input).toBeFocused();

      await test.step('the card measures the same and keeps its thumbnail; the badge doesn’t cover the field', async () => {
        const during = await current.evaluate(rect);
        expect(sameRect(during, before), JSON.stringify({ before, during })).toBe(true);
        await expect(current.locator('.project-thumb img')).toBeVisible();
        const badge = await current.locator('.project-badge').evaluate(rect);
        const field = await input.evaluate(rect);
        expect(intersects(badge, field), JSON.stringify({ badge, field })).toBe(false);
      });

      await test.step('the text is selected and the field has an accessible name', async () => {
        expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd, el.value.length])).toEqual([0, 'Sin título'.length, 'Sin título'.length]);
        await expect(input).toHaveAttribute('aria-label', 'Nombre del proyecto');
        await testInfo.attach(`rename-${viewport.width}`, { body: await page.screenshot(), contentType: 'image/png' });
      });

      await test.step('Enter saves; the card stays the same and the focus goes back to the pencil', async () => {
        await page.keyboard.type('Tarjetas');
        await page.keyboard.press('Enter');
        await expect(title).toHaveText('Tarjetas');
        expect(sameRect(await current.evaluate(rect), before), 'same card').toBe(true);
        await expect(current.locator('[data-act="rename"]')).toBeFocused();
      });

      await test.step('Esc cancels without closing the dialog', async () => {
        await page.keyboard.press('Enter');
        await expect(input).toBeFocused();
        await page.keyboard.type('nada');
        await page.keyboard.press('Escape');
        await expect(current.locator('[data-act="rename"]')).toBeFocused();
        await expect(title).toHaveText('Tarjetas');
        await expect(page.locator('#projects')).toHaveAttribute('open', '');
      });

      await test.step('empty keeps the name it had', async () => {
        await page.keyboard.press('Enter');
        await expect(input).toBeFocused();
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Enter');
        await expect(current.locator('[data-act="rename"]')).toBeFocused();
        await expect(title).toHaveText('Tarjetas');
      });

      await test.step('leaving the field saves it', async () => {
        await page.keyboard.press('Enter');
        await expect(input).toBeFocused();
        await page.keyboard.type('Tarjetas 2');
        await page.locator('#projects-title').click();
        await expect(title).toHaveText('Tarjetas 2');
        await expect(page.locator('#project-name-text')).toHaveText('Tarjetas 2');
      });
    });

    test('the card’s actions show their tooltip above the dialog, and with the keyboard right away', async ({ page, app }) => {
      const current = await openWithCard(page, app);
      const tip = page.locator('#projects #tooltip');
      await current.locator('[data-act="duplicate"]').hover();
      await expect(tip).toBeVisible();
      const onTop = await tip.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { text: el.textContent, top: el.contains(hit), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 };
      });
      expect(onTop).toEqual({ text: 'Duplicar', top: true, inside: true });

      await page.mouse.move(2, 2);
      await page.locator('#projects-close').focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(page.locator('#projects #tooltip:not([hidden])')).toHaveText('Cerrar');
    });

    test('every icon-only button, in the main window and in each dialog, has an accessible name and a tooltip', async ({ page, app }) => {
      const missing: string[] = [];
      const audit = async (where: string) => {
        const buttons = await page.evaluate(iconOnlyButtons);
        expect(buttons.length, `icon-only buttons in ${where}`).toBeGreaterThan(0);
        for (const b of buttons) if (!b.name.trim() || !b.tip.trim()) missing.push(`${where}: ${b.id} (${b.name ? '' : 'no name '}${b.tip ? '' : 'no tooltip'})`);
      };
      await openWithCard(page, app);
      await audit('Proyectos');
      await page.keyboard.press('Escape');
      await expect(page.locator('#projects')).not.toHaveAttribute('open');
      await app.pieces().first().click();
      await audit('main window');

      // (On narrow screens the shortcuts button hides: «?» opens the list everywhere.)
      await app.pieces().first().focus();
      await page.keyboard.press('?');
      await expect(page.locator('#shortcuts[open] #shortcuts-rows tr').first()).toBeVisible();
      await audit('Atajos');
      await page.locator('#shortcuts-prefs').click();
      await expect(page.locator('#prefs[open] #single-keys')).toBeAttached();
      await audit('Preferencias');
      await page.keyboard.press('Escape');
      await expect(page.locator('#prefs')).not.toHaveAttribute('open');

      // «Quitar todas» asks first.
      await page.evaluate(() => document.getElementById('clear')!.click());
      await expect(page.locator('#confirm')).toHaveAttribute('open', '');
      await audit('confirmation');
      await page.keyboard.press('Escape');

      // The summary after downloading (and its request for a donation): the advice and the summary on.
      await page.evaluate(() => localStorage.setItem('scooch:print-preferences', JSON.stringify({ v: 1, tip: true, summary: true })));
      await app.open(`?donar=${encodeURIComponent('https://www.patreon.com/ejemplo')}`);
      await page.locator('#export').click();
      await expect(page.locator('#print-tip')).toHaveAttribute('open', '');
      await Promise.all([page.waitForEvent('download'), page.locator('#print-tip-go').click()]);
      await expect(page.locator('#print-summary #summary-donate')).toBeVisible();
      await audit('summary after downloading');
      expect(missing).toEqual([]);
    });
  });
}

test('the top bar renames the project the same way: text selected, Esc cancels, empty keeps the name, Enter saves it cleaned and announces it', async ({ page, app }) => {
  const name = page.locator('#project-name');
  const text = page.locator('#project-name-text');
  const input = page.locator('#project-name-input');
  await name.click();
  await expect(input).toBeFocused();
  expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart === 0 && el.selectionEnd === el.value.length)).toBe(true);
  await expect(input).toHaveAttribute('aria-label', 'Nombre del proyecto');

  await page.keyboard.type('Hojas');
  await page.keyboard.press('Escape');
  await expect(name).toBeFocused();
  await expect(text).toHaveText('Sin título');

  await page.keyboard.press('Enter');
  await expect(input).toBeFocused();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await expect(name).toBeFocused();
  await expect(text).toHaveText('Sin título');

  await page.keyboard.press('Enter');
  await input.fill('Tarjetas  de prueba ');
  await page.keyboard.press('Enter');
  await expect(text).toHaveText('Tarjetas de prueba');
  await expect(name).toBeFocused();
  await app.heard(/Ahora se llama «Tarjetas de prueba»/);
  await saved(page);
});
