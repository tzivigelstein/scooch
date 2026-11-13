// What the browser kept from other versions of the app, put in the real
// IndexedDB before the app starts: a document of the oldest format opens and
// is saved in the current one; one saved by a newer version and a damaged one
// are reported, not opened; the data saved under the app's former name
// («pliego») moves to «scooch», also where indexedDB.databases() is missing.
// Every format's migration, value by value: tests/core/documents.test.js and
// tests/core/projectdoc.test.js; the key and project moves: tests/services/migrate.test.ts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOC_VERSION } from '../../src/core/projectdoc.js';
import { App, expect, fixture, test } from '../support/test.ts';
import { databases, hideDatabases, LAST_PROJECT, openProjects, saved, seedBlob, seedStorage, storedProjects, storedRecord, type Seed } from '../support/projects.ts';

type Doc = Record<string, unknown> & { items: Record<string, unknown>[] };

/** A stored document of one format version (tests/fixtures/documents). */
const documentOf = (name: string): Doc => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../tests/fixtures/documents', `${name}.json`), 'utf8'));

/** A project record holding `doc`, as the app stores them. */
const record = (id: string, name: string, doc: Doc) => ({
  id,
  name,
  created: 1_000,
  modified: 2_000,
  version: (doc.version as number | undefined) ?? 0,
  doc,
  counts: { sheets: Array.isArray(doc.sheets) ? doc.sheets.length : 1, pieces: doc.items.length },
  thumb: null,
});

/** The «scooch» database with these projects, `last` the one opened last. */
const scooch = (projects: ReturnType<typeof record>[], files: Seed['files'], last: string): Seed => ({ db: 'scooch', version: 1, projects, files, storage: { [LAST_PROJECT]: last } });

test.describe('documents saved by other versions of the app', () => {
  test('a document of the oldest format (version 0: one sheet, «Carta») opens as it was, and the next save writes the current version', async ({ page }, testInfo) => {
    const jpg = seedBlob('small.jpg', 'image/jpeg');
    // Its one asset is a JPEG re-encoded from the original: original, bytes and preview.
    const files = ['src:1', 'bytes:1', 'preview:a1'].map((key) => ({ project: 'pv0', key, blob: jpg }));
    await seedStorage(page, scooch([record('pv0', 'Documento viejo', documentOf('v0'))], files, 'pv0'));
    const app = new App(page, testInfo);
    await app.open();
    await expect(page.locator('#project-name-text')).toHaveText('Documento viejo');
    await expect(app.pieces()).toHaveCount(1);
    await expect(app.pieceNamed('foto.jpg')).toHaveCount(1);
    await expect(page.locator('#sheets .page')).toHaveCount(1);
    // Where it was (1 × 2 mm, inside the 10 mm margin), so the app warns about the margin, not about the project.
    await expect.poll(async () => (await app.notice()).text).toBe('1 pieza pasa el margen y puede que la impresora no imprima ese borde');
    await app.openSheet();
    await expect(page.locator('#paper')).toHaveValue('letter');
    await expect(page.locator('#landscape')).toBeChecked();

    await app.pieces().first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#project-status-text')).toHaveText('Guardando…');
    await saved(page);
    const stored = await storedRecord(page, 'pv0');
    expect(stored?.version).toBe(DOC_VERSION);
    expect(stored?.doc).toMatchObject({ version: DOC_VERSION, paper: 'letter', landscape: true, sheets: [{ id: expect.any(Number) }] });

    await openProjects(page);
    await expect(page.locator('#projects .project-card [data-kind="damaged"]')).toHaveCount(0);
  });

  test('a document saved by a newer version: a notice with no Eliminar, a new project opens, and «Proyectos» marks it «Versión más nueva»', async ({ page }, testInfo) => {
    const newer = { ...documentOf(`v${DOC_VERSION}`), version: DOC_VERSION + 1, somethingNew: { kept: true } };
    await seedStorage(page, scooch([record('pnewer', 'Del futuro', newer)], [], 'pnewer'));
    const app = new App(page, testInfo);
    await app.open();
    await expect.poll(() => app.notice()).toMatchObject({ text: expect.stringMatching(/versión más nueva/), action: '', warn: true });
    await expect(page.locator('#project-name-text')).toHaveText('Sin título');
    await expect(app.pieces()).toHaveCount(0);

    await openProjects(page);
    const future = page.locator('#projects .project-card', { hasText: 'Del futuro' });
    await expect(future.locator('[data-kind="damaged"]')).toHaveText('Versión más nueva');
    await expect(future.locator('.project-open')).toBeDisabled();
  });

  test('a damaged document (its pieces point to no file): a notice that offers to delete it, and «Proyectos» marks it «Dañado»', async ({ page }, testInfo) => {
    const current = documentOf(`v${DOC_VERSION}`);
    const broken = { ...current, items: current.items.map((item) => ({ ...item, asset: 'a999' })) };
    await seedStorage(page, scooch([record('pbroken', 'Roto', broken)], [], 'pbroken'));
    const app = new App(page, testInfo);
    await app.open();
    await expect.poll(() => app.notice()).toEqual({ text: 'No se pudo abrir «Roto» porque sus datos están dañados', action: 'Eliminar', warn: true });
    await expect(app.pieces()).toHaveCount(0);

    await openProjects(page);
    const damaged = page.locator('#projects .project-card', { hasText: 'Roto' });
    await expect(damaged.locator('[data-kind="damaged"]')).toHaveText('Dañado');
    await expect(damaged.locator('.project-open')).toBeDisabled();
  });
});

// e2e/fixtures/legacy-pliego.json: what the app stored before it was renamed
// (made with that version): two projects, their files and the preferences.
const LEGACY = JSON.parse(readFileSync(fixture('legacy-pliego.json'), 'utf8')) as { version: number; storage: Record<string, string>; projects: { id: string }[]; files: unknown[] };

for (const listable of [true, false]) {
  test.describe(`data saved under the former name, ${listable ? 'with' : 'without'} indexedDB.databases()`, () => {
    test.beforeEach(async ({ page }) => {
      if (!listable) await hideDatabases(page);
    });

    test('the projects open as they were, the preferences apply, and no «pliego» database is left', async ({ page }, testInfo) => {
      await seedStorage(page, { db: 'pliego', version: LEGACY.version, projects: LEGACY.projects, files: LEGACY.files, storage: LEGACY.storage });
      const app = new App(page, testInfo);
      await app.open();
      await saved(page);

      await test.step('the last project opens with its pieces', async () => {
        await expect(page.locator('#project-name-text')).toHaveText('Tarjetas viejas');
        await expect
          .poll(() => page.evaluate(() => [...document.querySelectorAll('#sheets .piece')].map((n) => `${n.getAttribute('aria-label')!.split(',')[0]}${n.querySelector('img')!.naturalWidth > 0 ? '' : ' (not loaded)'}`)))
          .toEqual(['card00.png', 'card01.png', 'rotated.pdf']);
      });

      await test.step('the preferences apply: centimeters, a 5 mm grid, overlapping allowed, «Acomodar» folded, single keys off', async () => {
        const prefs = await page.evaluate(() => ({
          unit: document.getElementById('margin-unit')?.textContent ?? '',
          grid: (document.getElementById('grid-show') as HTMLInputElement).checked && document.querySelector<HTMLInputElement>('#grid-chips input:checked')?.value,
          overlap: (document.getElementById('allow-overlap') as HTMLInputElement).checked,
          arrange: document.querySelector('button[aria-controls="section-arrange"]')?.getAttribute('aria-expanded'),
        }));
        expect(prefs).toEqual({ unit: expect.stringMatching(/centímetros/), grid: '5', overlap: true, arrange: 'false' });
        await page.locator('#prefs-open').click();
        await expect(page.locator('#prefs[open] #single-keys')).not.toBeChecked();
        await expect(page.locator('#prefs input[name="unit"]:checked')).toHaveValue('cm');
        await page.keyboard.press('Escape');
      });

      await test.step('both projects are in «Proyectos», and the other one opens too', async () => {
        await page.locator('#projects-open').click();
        await expect(page.locator('#projects[open] .project-card img').first()).toBeVisible();
        await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#projects .project-card')].map((c) => `${c.querySelector('.project-title')?.textContent}${c.classList.contains('is-current') ? '*' : ''}`).sort())).toEqual(['Segundo', 'Tarjetas viejas*']);
        await page.locator('#projects .project-card', { hasText: 'Segundo' }).locator('[data-act="open"]').click();
        await expect(page.locator('#project-name-text')).toHaveText('Segundo');
        await expect(app.pieces()).toHaveCount(1);
        await expect.poll(() => app.pieces().first().locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      });

      await test.step('the custom paper it remembered', async () => {
        await app.openSheet();
        await page.locator('#paper').selectOption('custom');
        await expect(page.locator('#paper-w')).toHaveValue('12,3');
        await expect(page.locator('#paper-h')).toHaveValue('17');
      });

      await test.step('«pliego» is gone; «scooch» has both projects, their thumbnails and files', async () => {
        const names = await databases(page);
        expect(names).not.toContain('pliego');
        expect(names).toContain('scooch');
        const stored = await storedProjects(page);
        expect(stored.projects.map((p) => p.id).sort()).toEqual(LEGACY.projects.map((p) => p.id).sort());
        expect(stored.projects.every((p) => p.thumb)).toBe(true);
        expect(stored.files).toBeGreaterThanOrEqual(LEGACY.files.length);
      });
    });

    test('with nothing saved before, no empty «pliego» database is created', async ({ page }, testInfo) => {
      const app = new App(page, testInfo);
      await app.open();
      await saved(page);
      expect(await databases(page)).toEqual(['scooch']);
      expect((await storedProjects(page)).projects).toHaveLength(1);
    });
  });
}
