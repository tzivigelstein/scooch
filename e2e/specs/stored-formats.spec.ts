// What the browser kept from other versions of the app, put in the real
// IndexedDB before the app starts: a document of the oldest format opens and
// is saved in the current one; one saved by a newer version and a damaged one
// are reported, not opened; the databases of the earlier layouts (each binary
// inside its file row; binaries stored once per content as Blobs; both
// recorded from those versions) and interrupted moves open whole and end up
// with every binary stored as bytes; the data saved under the app's former
// name («pliego») moves to «scooch», also where indexedDB.databases() is
// missing. Every seed holds Blobs, so in WebKit these run in a browser profile
// on disk (seedingTest).
// Every format's migration, value by value: tests/core/documents.test.js and
// tests/core/projectdoc.test.js; the layouts, row by row: tests/services/idb-storage.test.ts;
// the key and project moves: tests/services/migrate.test.ts.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { DOC_VERSION } from '../../src/core/projectdoc.js';
import { pasteFromEmptyClipboard } from '../support/keyboard.ts';
import { App, expect, fixture } from '../support/test.ts';
import { cards, databases, hideDatabases, LAST_PROJECT, openProjects, saved, seedBlob, seedingTest as test, seedStorage, storedProjects, storedRecord, type Seed } from '../support/projects.ts';

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
    await expect(page.locator('#project')).toHaveAttribute('data-status', /^(pending|saving)$/);
    await saved(page);
    const stored = await storedRecord(page, 'pv0');
    expect(stored?.version).toBe(DOC_VERSION);
    expect(stored?.doc).toMatchObject({ version: DOC_VERSION, paper: 'letter', landscape: true, sheets: [{ id: expect.any(Number) }] });

    await openProjects(page);
    await expect(page.locator('#projects .project-card [data-kind="damaged"]')).toHaveCount(0);
  });

  test('a document saved by a newer version: a notice that offers to reload (not Eliminar), a new project opens, and «Proyectos» marks it «Versión más nueva»', async ({ page }, testInfo) => {
    const newer = { ...documentOf(`v${DOC_VERSION}`), version: DOC_VERSION + 1, somethingNew: { kept: true } };
    await seedStorage(page, scooch([record('pnewer', 'Del futuro', newer)], [], 'pnewer'));
    const app = new App(page, testInfo);
    await app.open();
    await expect.poll(() => app.notice()).toMatchObject({ text: expect.stringMatching(/versión más nueva/), action: 'Recargar la página', warn: true });
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
    await expect.poll(() => app.notice()).toEqual({ text: 'No se pudo abrir «Roto» porque sus datos están dañados', action: 'Eliminar proyecto', warn: true });
    await expect(app.pieces()).toHaveCount(0);

    await openProjects(page);
    const damaged = page.locator('#projects .project-card', { hasText: 'Roto' });
    await expect(damaged.locator('[data-kind="damaged"]')).toHaveText('Dañado');
    await expect(damaged.locator('.project-open')).toBeDisabled();
  });
});

// ---------- The layout of the database ----------

// e2e/fixtures/scooch-v1-layout.json: what the app stored with layout version 1
// (recorded from that build): «Tarjetas» with two originals of the same bytes,
// a two-page PDF and a WebP re-encoded as PNG; «Segundo»; and «Tarjetas
// (copia)», whose rows repeat every binary of «Tarjetas».
type BlobSeed = { $blob: string; type: string };
const V1 = JSON.parse(readFileSync(fixture('scooch-v1-layout.json'), 'utf8')) as {
  version: number;
  storage: Record<string, string>;
  projects: { id: string; name: string }[];
  files: { project: string; key: string; blob: BlobSeed }[];
};
const sha256 = (seed: BlobSeed) => createHash('sha256').update(Buffer.from(seed.$blob, 'base64')).digest('hex');
/** Every different content in the recording, by hash: what layouts 2 and 3 store, once each. */
const V1_HASHES = [...new Set(V1.files.map((row) => sha256(row.blob)))].sort();

// e2e/fixtures/scooch-v2-layout.json: what the app stored with layout version 2
// (recorded from that build): «Tarjetas» (card00.png and rotated.pdf, its saved
// undo history keeping card01.png, deleted), «Segundo» (small.jpg) and «Tarjetas
// (copia)»; the clipboard keeps square.webp, cut from «Tarjetas».
const V2 = JSON.parse(readFileSync(fixture('scooch-v2-layout.json'), 'utf8')) as Omit<Required<Seed>, 'db' | 'blobs'> & { blobs: { hash: string; blob: BlobSeed }[] };
const V2_HASHES = V2.blobs.map((row) => sha256(row.blob)).sort();

/** The pieces of the open project by name, and whether their image loaded. */
const loadedPieces = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('#sheets .piece')].map((n) => `${n.getAttribute('aria-label')!.split(',')[0]}${n.querySelector('img')!.naturalWidth > 0 ? '' : ' (not loaded)'}`).sort());

/** Opens every project of the recording from «Proyectos» and checks its pieces show. */
async function openEachRecordedProject(page: Page) {
  const expected: Record<string, string[]> = {
    Tarjetas: ['card00.png', 'card00.png', 'card01.png', 'square.webp', 'twopage.pdf (página 1)'],
    Segundo: ['small.jpg'],
    'Tarjetas (copia)': ['card00.png', 'card00.png', 'card01.png', 'square.webp', 'twopage.pdf (página 1)'],
  };
  for (const [name, pieces] of Object.entries(expected)) {
    if ((await page.locator('#project-name-text').textContent()) !== name) {
      await openProjects(page);
      await page.locator('#projects .project-card').filter({ has: page.locator('.project-title', { hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`) }) }).locator('.project-open').click();
      await expect(page.locator('#project-name-text')).toHaveText(name);
    }
    await expect.poll(() => loadedPieces(page), { message: name }).toEqual(pieces);
  }
  await saved(page);
}

test.describe('the layout of the database', () => {
  test('the projects stored by layout 1 open as they were, and every binary ends up stored once, as bytes', async ({ page }, testInfo) => {
    expect(V1.version).toBe(1);
    expect(V1_HASHES.length, 'the recording repeats binaries').toBeLessThan(V1.files.length);
    await seedStorage(page, { db: 'scooch', version: 1, projects: V1.projects, files: V1.files, storage: V1.storage });
    const app = new App(page, testInfo);
    await app.open();
    await expect(page.locator('#project-name-text')).toHaveText('Tarjetas');
    await expect.poll(() => storedProjects(page)).toMatchObject({ files: V1.files.length, unconverted: 0, asBlobs: 0, hashes: V1_HASHES });
    await openEachRecordedProject(page);
  });

  test('a move to binaries stored once per content interrupted halfway finishes on the next start, losing nothing', async ({ page }, testInfo) => {
    // The database already has the current stores; the copy's rows and half of
    // «Tarjetas»'s were moved (their binary stored once by hash); the rest still
    // keep their binary inside, like the previous layout.
    const tarjetas = V1.projects.find((p) => p.name === 'Tarjetas')!.id;
    const copy = V1.projects.find((p) => p.name === 'Tarjetas (copia)')!.id;
    let half = 0;
    const moved = (row: (typeof V1.files)[number]) => row.project === copy || (row.project === tarjetas && half++ % 2 === 0);
    const files = V1.files.map((row) => (moved(row) ? { project: row.project, key: row.key, hash: sha256(row.blob) } : row));
    const blobs = [...new Map(V1.files.filter(moved).map((row) => [sha256(row.blob), { hash: sha256(row.blob), blob: row.blob }])).values()];
    expect(files.filter((row) => 'blob' in row).length).toBeGreaterThan(0);
    await seedStorage(page, { db: 'scooch', version: 2, projects: V1.projects, files, blobs, storage: V1.storage });
    const app = new App(page, testInfo);
    await app.open();
    await expect(page.locator('#project-name-text')).toHaveText('Tarjetas');
    await expect.poll(() => storedProjects(page)).toMatchObject({ files: V1.files.length, unconverted: 0, asBlobs: 0, hashes: V1_HASHES });
    await openEachRecordedProject(page);
  });

  test('a database upgraded to layout 2 before any row moved opens whole', async ({ page }, testInfo) => {
    await seedStorage(page, { db: 'scooch', version: 2, projects: V1.projects, files: V1.files, blobs: [], storage: V1.storage });
    const app = new App(page, testInfo);
    await app.open();
    await expect.poll(() => storedProjects(page)).toMatchObject({ files: V1.files.length, unconverted: 0, asBlobs: 0, hashes: V1_HASHES });
    await openEachRecordedProject(page);
  });

  test('the projects stored by layout 2 (binaries and thumbnails as Blobs) open as they were, with their thumbnails, the saved undo steps and the cut piece, and end up stored as bytes', async ({ page }, testInfo) => {
    expect(V2.version).toBe(2);
    await seedStorage(page, { db: 'scooch', version: 2, projects: V2.projects, files: V2.files, blobs: V2.blobs, history: V2.history, clipboard: V2.clipboard, storage: V2.storage });
    expect((await storedProjects(page)).asBlobs, 'the recording stores Blobs').toBe(V2.blobs.length + V2.projects.length);
    const app = new App(page, testInfo);
    await app.open();
    await expect(page.locator('#project-name-text')).toHaveText('Segundo');
    await expect.poll(() => loadedPieces(page)).toEqual(['small.jpg']);
    // Every binary is still referenced (by a project, the saved history or the clipboard): none goes.
    await expect.poll(() => storedProjects(page)).toMatchObject({ files: V2.files.length, unconverted: 0, asBlobs: 0, hashes: V2_HASHES });

    await openProjects(page);
    await expect.poll(async () => (await cards(page)).map((c) => `${c.name} ${c.thumb}`).sort()).toEqual(['Segundo true', 'Tarjetas (copia) true', 'Tarjetas true']);
    await page.locator('#projects .project-card').filter({ has: page.locator('.project-title', { hasText: /^Tarjetas$/ }) }).locator('.project-open').click();
    await expect(page.locator('#project-name-text')).toHaveText('Tarjetas');
    await expect.poll(() => loadedPieces(page)).toEqual(['card00.png', 'rotated.pdf']);
    // Its last step deleted card01.png, which only the saved history keeps.
    await expect(page.locator('#undo')).toBeEnabled();
    await app.pieces().first().focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => loadedPieces(page)).toEqual(['card00.png', 'card01.png', 'rotated.pdf']);
    // square.webp was cut: only the clipboard keeps it.
    await pasteFromEmptyClipboard(page);
    await expect.poll(() => loadedPieces(page)).toEqual(['card00.png', 'card01.png', 'rotated.pdf', 'square.webp']);
    await saved(page);
    expect((await storedProjects(page)).asBlobs).toBe(0);
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
          unit: document.getElementById('margin')?.getAttribute('aria-label') ?? '',
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

      await test.step('«pliego» is gone; «scooch» has both projects, their thumbnails and files, each binary stored once', async () => {
        const names = await databases(page);
        expect(names).not.toContain('pliego');
        expect(names).toContain('scooch');
        const stored = await storedProjects(page);
        expect(stored.projects.map((p) => p.id).sort()).toEqual(LEGACY.projects.map((p) => p.id).sort());
        expect(stored.projects.every((p) => p.thumb)).toBe(true);
        expect(stored.files).toBeGreaterThanOrEqual(LEGACY.files.length);
        expect(stored.unconverted).toBe(0);
        const legacyHashes = new Set((LEGACY.files as { blob: BlobSeed }[]).map((row) => sha256(row.blob)));
        expect(stored.hashes.filter((hash) => legacyHashes.has(hash)).length).toBe(legacyHashes.size);
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
