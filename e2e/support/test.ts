// The `test` every spec imports: Playwright's, plus
//   - `app`: the app opened and ready (see App below), with helpers that act
//     like a person (clicks, keys, files) and read what the page shows;
//   - a console guard: any console error, page error, failed request or HTTP
//     error fails the test, unless the test expects it (`allowErrors`).
import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { resolve } from 'node:path';
import { readGeometry, readLive, readNotice, readSheets, readSnapshot } from './geometry.ts';
import { pdfInfo } from './pdf.ts';

export { expect };

/** The folder of the files the tests load (images, PDFs). */
export const FIXTURES = resolve(import.meta.dirname, '../fixtures');
export const fixture = (name: string) => resolve(FIXTURES, name);
/** `tile000.png`… (531 × 591 px), `n` of them from `from`. */
export const tiles = (from: number, n: number) => Array.from({ length: n }, (_, i) => `tile${String(from + i).padStart(3, '0')}.png`);
/** `card00.png`… (business-card-sized images), `n` of them from `from`. */
export const cards = (from: number, n: number) => Array.from({ length: n }, (_, i) => `card${String(from + i).padStart(2, '0')}.png`);

/** Replaces non-breaking spaces with plain ones (the copy uses them between numbers and units). */
export const norm = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ');

/** Pages whose app starts with the advice before printing and the summary after turned off. */
const quietPages = new WeakSet<Page>();

export class App {
  /**
   * Whether the advice before printing (and downloading) and the summary
   * after show. Off unless a test turns them on before open(): they have
   * their own specs (print-and-download, donation), and other specs print or
   * download only to read the PDF.
   */
  printing = false;

  constructor(
    readonly page: Page,
    private readonly info: TestInfo
  ) {}

  /** Goes to the app (optionally with a query string) and waits until the project is open. */
  async open(query = '') {
    if (!this.printing && !quietPages.has(this.page)) {
      quietPages.add(this.page);
      // Only where the page hasn't got a preference of its own yet.
      await this.page.addInitScript(() => {
        if (localStorage.getItem('scooch:print-preferences') === null) localStorage.setItem('scooch:print-preferences', JSON.stringify({ v: 1, tip: false, summary: false }));
      });
    }
    await this.page.goto(query ? `./${query}` : './');
    await this.ready();
  }

  /** Waits until the app is mounted and its project restored or created. */
  async ready() {
    await this.page.locator('#paper option').first().waitFor({ state: 'attached' });
    await expect(this.page.locator('body')).not.toHaveClass(/\bis-loading\b/);
  }

  // ---------- Pieces ----------

  readonly pieces = () => this.page.locator('#sheets .piece');
  readonly piece = (id: number) => this.page.locator(`#sheets .piece[data-id="${id}"]`);
  readonly pieceNamed = (name: string) => this.page.locator(`#sheets .piece[aria-label^="${name}"]`);
  readonly row = (id: number) => this.page.locator(`#piece-list [role="option"][data-id="${id}"]`);

  /**
   * Adds files with the file input and waits until their pieces are on the
   * sheets (`expected` pieces in all; by default one more per file) and nothing
   * is loading any more.
   */
  async addFiles(names: readonly string[], expected?: number) {
    const before = await this.pieces().count();
    await this.page.locator('#file').setInputFiles(names.map(fixture));
    await expect(this.pieces()).toHaveCount(expected ?? before + names.length, { timeout: 60_000 });
    await this.idle();
  }

  /**
   * Adds files that may fail to load: waits until the loading notice has come
   * and gone (or pieces arrived).
   */
  async addFilesSettled(names: readonly string[]) {
    const before = await this.pieces().count();
    await this.page.locator('#file').setInputFiles(names.map(fixture));
    await expect
      .poll(async () => (await this.pieces().count()) > before || (await this.page.locator('#canvas[aria-busy="true"]').count()) > 0 || (await this.notice()).text !== '', { timeout: 30_000 })
      .toBe(true);
    await this.idle();
  }

  /** Waits until nothing is loading, creating or preparing (the notice says so meanwhile). */
  async idle() {
    await expect.poll(async () => /Cargando|Creando|Preparando/.test((await this.notice()).text), { timeout: 60_000 }).toBe(false);
  }

  /** The ids of the pieces, sorted. */
  async ids() {
    return (await this.geometry()).pieces.map((p) => p.id);
  }

  async selectedIds() {
    return this.page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#sheets .piece.is-selected')].map((p) => Number(p.dataset.id)).sort((a, b) => a - b));
  }

  /** Selects exactly those pieces: from the list when it shows, else on the sheet (click and Ctrl+click). */
  async selectIds(ids: readonly number[]) {
    await this.page.keyboard.press('Escape');
    const fromList = await this.row(ids[0]).isVisible();
    const target = fromList ? this.row : this.piece;
    await target(ids[0]).click({ force: !fromList });
    for (const id of ids.slice(1)) await target(id).click({ modifiers: ['Control'], force: !fromList });
    await expect.poll(() => this.selectedIds()).toEqual([...ids].sort((a, b) => a - b));
  }

  /** Clicks a piece in its center, or focuses it if something covers that point. */
  async clickPiece(piece: Locator) {
    const box = (await piece.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const covered = await piece.evaluate((el, [x, y]) => document.elementFromPoint(x, y)?.closest('.piece') !== el, [cx, cy]);
    if (covered) await piece.focus();
    else await this.page.mouse.click(cx, cy);
  }

  /** Drags a locator from its center by (dx, dy) px in `steps` mouse moves. */
  async drag(target: Locator, dx: number, dy: number, steps = 12) {
    const box = (await target.boundingBox())!;
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await this.page.mouse.move(sx, sy);
    await this.page.mouse.down();
    for (let i = 1; i <= steps; i++) await this.page.mouse.move(sx + (dx * i) / steps, sy + (dy * i) / steps);
    await this.page.mouse.up();
  }

  // ---------- Panels and fields ----------

  /** Opens the properties panel (on narrow screens) and one of its tabs. */
  async showTab(tab: 'piece' | 'sheet') {
    const panel = this.page.locator('#props-panel');
    const toggle = this.page.locator('#props-toggle');
    if (!(await panel.isVisible()) && (await toggle.isVisible())) await toggle.click();
    const button = this.page.locator(`#props-tab-${tab}`);
    if ((await button.getAttribute('aria-selected')) !== 'true') await button.click();
    await expect(button).toHaveAttribute('aria-selected', 'true');
  }

  /** Shows the selected piece's measures (the Pieza tab). */
  async openMeasures() {
    if (!(await this.page.locator('#pos-x').isVisible())) await this.showTab('piece');
    await expect(this.page.locator('#pos-x')).toBeVisible();
  }

  /** Shows a document setting (paper, gap, overlap, grid…): the Hoja tab, with its section open. */
  async openSetting(selector: string) {
    const field = this.page.locator(selector);
    if (await field.isVisible()) return;
    await this.showTab('sheet');
    const section = await this.page.evaluate((sel) => document.querySelector(sel)?.closest('.section-body')?.id ?? null, selector);
    if (section) {
      const toggle = this.page.locator(`[aria-controls="${section}"]`);
      if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    }
    await expect(field).toBeVisible();
  }

  /** The paper fields (the Hoja tab, «Hoja» section open). */
  openSheet = () => this.openSetting('#paper');

  /** Types a value in one of the piece's measure fields and confirms it (change). */
  async setMeasure(id: string, value: string | number) {
    await this.openMeasures();
    const field = this.page.locator(`#${id}`);
    await field.fill(String(value));
    await field.dispatchEvent('change');
  }

  /** Puts a piece at (x, y) mm with the X and Y fields (unit: mm). */
  async setPosition(id: number, x: number, y: number) {
    await this.page.keyboard.press('Escape');
    await this.row(id).click();
    await this.setMeasure('pos-x', String(x).replace('.', ','));
    await this.setMeasure('pos-y', String(y).replace('.', ','));
  }

  /** If the focus is inside a panel (a popover on narrow screens), Esc closes it. */
  async closePopover() {
    if (!(await this.page.evaluate(() => !!document.activeElement?.closest('.panel')))) return;
    await this.page.keyboard.press('Escape');
    await expect.poll(() => this.page.evaluate(() => !!document.activeElement?.closest('.panel'))).toBe(false);
  }

  async undo() {
    await this.page.locator('#undo').click();
  }

  async redo() {
    await this.page.locator('#redo').click();
  }

  // ---------- Reading what shows ----------

  /** Exact geometry in mm; pass the paper width in mm when the unit isn't mm. */
  geometry(paperW: number | null = null) {
    return this.page.evaluate(readGeometry, paperW);
  }

  /** A snapshot of the sheets and pieces, to compare «exactly the same». */
  snapshot() {
    return this.page.evaluate(readSnapshot);
  }

  /** Per sheet: its label, its name and its pieces in mm. */
  sheets() {
    return this.page.evaluate(readSheets);
  }

  /** The notice pill. */
  notice() {
    return this.page.evaluate(readNotice);
  }

  /** What the live regions say. */
  live() {
    return this.page.evaluate(readLive);
  }

  /** Waits until a live region says something matching `re`. */
  async heard(re: RegExp, timeout = 5_000) {
    await expect.poll(() => this.live(), { timeout, message: `announced ${re}` }).toMatch(re);
  }

  /** What has the focus. */
  active() {
    return this.page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return {
        id: el?.id ?? '',
        tag: el?.tagName ?? '',
        cls: (el?.className as unknown as { baseVal?: string })?.baseVal ?? String(el?.className ?? ''),
        label: el?.getAttribute('aria-label') ?? null,
        piece: el?.classList.contains('piece') ? Number(el.dataset.id) : null,
      };
    });
  }

  // ---------- Output ----------

  /** Clicks `selector` (Descargar PDF by default), saves the download in the test's output folder. */
  async download(selector = '#export') {
    const [download] = await Promise.all([this.page.waitForEvent('download'), this.page.locator(selector).click()]);
    const name = download.suggestedFilename();
    const file = this.info.outputPath(`${Date.now()}-${name}`);
    await download.saveAs(file);
    await expect.poll(async () => /Creando/.test((await this.notice()).text)).toBe(false);
    return { file, name };
  }

  /** Downloads the PDF and reads it. */
  async downloadPdf(selector = '#export') {
    const { file, name } = await this.download(selector);
    return { file, name, info: await pdfInfo(file) };
  }
}

interface Fixtures {
  /** The app, opened and ready, on the test's page. */
  app: App;
  /** Console errors (and failed requests) a test expects; anything else fails it. */
  allowErrors: RegExp[];
  /** What the console guard caught (exposed so a test can look at it). */
  consoleErrors: string[];
}

export const test = base.extend<Fixtures>({
  allowErrors: [[], { option: true }],
  consoleErrors: [
    async ({ page, allowErrors }, use) => {
      const errors: string[] = [];
      // With E2E_CONSOLE=strict (against the dev server), warnings count too.
      const strict = process.env.E2E_CONSOLE === 'strict';
      page.on('console', (m) => {
        if (m.type() === 'error' || (strict && m.type() === 'warning')) errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('requestfailed', (r) => {
        const reason = r.failure()?.errorText ?? '';
        // A request the page cancelled (a lazy chunk still prefetching when a
        // test navigates again) is no error; HTTP errors are caught below.
        if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(reason)) return;
        errors.push(`requestfailed: ${r.url()} (${reason})`);
      });
      page.on('response', (r) => {
        if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`);
      });
      await use(errors);
      const unexpected = errors.filter((e) => !allowErrors.some((re) => re.test(e)));
      expect(unexpected, 'no console errors, page errors or failed requests').toEqual([]);
    },
    { auto: true },
  ],
  app: async ({ page }, use, info) => {
    const app = new App(page, info);
    await app.open();
    await use(app);
  },
});
