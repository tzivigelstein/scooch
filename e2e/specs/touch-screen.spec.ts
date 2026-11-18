// The editor on a touch screen (a coarse pointer), with what only a browser
// shows: every text field and select at 16 px at least, so iOS doesn't zoom
// the page into the one it focuses, with nothing overflowing at 390 px in any
// language, while a mouse keeps the sizes it had; «Propiedades» opens with the
// focus on its tab, not in a field (where it goes, with a mouse and with a
// finger: tests/components/panels.test.tsx). Touch is emulated through
// Chromium's DevTools; on a real iPhone, Safari's own zoom still needs a look.
import type { Page } from '@playwright/test';
import { LANGUAGES } from '../../src/core/language.js';
import { readLayout } from '../support/accessibility.ts';
import { horizontalOverflow } from '../support/layout.ts';
import { expect, test, type App } from '../support/test.ts';

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true };

/** A browser of each language, as a person there would have it (as in languages.spec). */
const LOCALES: Readonly<Record<string, string>> = { es: 'es-419', en: 'en-US', 'zh-Hans': 'zh-CN', hi: 'hi-IN', fr: 'fr-FR' };

const coarse = (page: Page) => page.evaluate(() => matchMedia('(pointer: coarse)').matches);

/**
 * The text fields and selects shown (the native ones and the app's own), by
 * id: their font size in px, whether their value fits without scrolling, and
 * whether they stay inside the window. Runs in the page.
 */
const readFields = () =>
  Object.fromEntries(
    [...document.querySelectorAll<HTMLInputElement>('input, select, textarea, .select-button')]
      .filter((el) => el.getClientRects().length && !el.closest('[hidden], dialog:not([open])') && !['checkbox', 'radio', 'range', 'color', 'file'].includes(el.type))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return [el.id || el.className, { size: parseFloat(getComputedStyle(el).fontSize), fits: el.scrollWidth <= el.clientWidth + 1, inside: r.left >= -0.5 && r.right <= innerWidth + 0.5 }];
      })
  );

type Fields = ReturnType<typeof readFields>;

/** Of `fields`, those under 16 px. */
const small = (fields: Fields) => Object.entries(fields).filter(([, f]) => f.size < 16).map(([id, f]) => `${id} ${f.size}px`);

/** A two-page PDF and an image, the PDF selected, its tab shown («Pieza»: position, size, scale, photo size, copies, page). */
async function pdfSelected(app: App) {
  await app.addFiles(['small.jpg', 'twopage.pdf']);
  await app.clickPiece(app.pieceNamed('twopage.pdf'));
  await app.openMeasures();
}

/** «Proyecto» with a custom paper and cut lines, their options open: every field of the tab shows. */
async function everyProjectField(app: App) {
  const { page } = app;
  await app.openSheet();
  await page.locator('#paper').selectOption('custom');
  await expect(page.locator('#paper-w')).toBeVisible();
  await app.openSetting('#cut-mode');
  await page.locator('#cut-mode input[value="corners"]').check();
  const options = page.locator('#cut-options');
  if (!(await options.evaluate((d: HTMLDetailsElement) => d.open))) await page.locator('#cut-options summary').click();
  await page.locator('#cut-colors input[value="custom"]').check();
  await expect(page.locator('#cut-hex')).toBeVisible();
}

test.describe('on a phone, with a finger', () => {
  test.use(PHONE);

  test('every text field and select is 16 px at least: the tabs, the top bar’s name, a project card’s name, the searches and Idioma', async ({ app, page }) => {
    test.skip(!(await coarse(page)), 'this engine doesn’t report a touch screen as a coarse pointer');
    await pdfSelected(app);
    const piece = await page.evaluate(readFields);
    expect(Object.keys(piece)).toEqual(expect.arrayContaining(['pos-x', 'pos-y', 'width', 'height', 'scale', 'photo-size', 'dup-count', 'page']));
    expect(small(piece), 'Pieza').toEqual([]);

    await everyProjectField(app);
    const project = await page.evaluate(readFields);
    expect(Object.keys(project)).toEqual(expect.arrayContaining(['paper', 'paper-w', 'paper-h', 'margin', 'gap', 'grid-size', 'cut-margin', 'cut-hex']));
    expect(small(project), 'Proyecto').toEqual([]);
    await app.closePopover();

    await page.locator('#project-name').tap();
    await expect(page.locator('#project-name-input')).toBeFocused();
    expect(small(await page.evaluate(readFields)), 'the top bar’s name').toEqual([]);
    await page.keyboard.press('Escape');

    await page.locator('#projects-open').tap();
    await page.locator('#projects .project-card [data-act="rename"]').first().tap();
    await expect(page.locator('#projects .project-title-input')).toBeFocused();
    expect(small(await page.evaluate(readFields)), 'a project card’s name').toEqual([]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('#projects')).not.toHaveAttribute('open');

    for (const [open, dialog, field] of [
      [() => page.keyboard.press('?'), '#shortcuts', '#shortcuts-search'],
      [() => page.locator('#palette-open').tap(), '#palette', '#palette-input'],
      [() => page.locator('#prefs-open').tap(), '#prefs', '#language'],
    ] as const) {
      await open();
      await expect(page.locator(dialog)).toHaveAttribute('open', '');
      await expect(page.locator(field)).toBeVisible();
      expect(small(await page.evaluate(readFields)), dialog).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator(dialog)).not.toHaveAttribute('open', '');
    }
  });

  test('a project card being renamed keeps its size and its neighbors’ places', async ({ app, page }) => {
    test.skip(!(await coarse(page)), 'this engine doesn’t report a touch screen as a coarse pointer');
    await app.addFiles(['small.jpg']);
    await page.locator('#projects-open').tap();
    const card = page.locator('#projects .project-card').first();
    const meta = card.locator('.project-meta');
    // The card's top and height, and where the line under the name is.
    const places = async () => [await card.boundingBox(), await meta.boundingBox()].flatMap((box) => [box!.y, box!.height]);
    const before = await places();
    await card.locator('[data-act="rename"]').tap();
    await expect(card.locator('.project-title-input')).toBeFocused();
    const moved = (await places()).map((v, i) => Math.abs(v - before[i]));
    expect(Math.max(...moved), 'px moved').toBeLessThan(0.5);
  });

  test('«Propiedades» opens with the focus on its tab, not in a field that would bring up the on-screen keyboard', async ({ app, page }) => {
    test.skip(!(await coarse(page)), 'this engine doesn’t report a touch screen as a coarse pointer');
    await app.addFiles(['small.jpg']);
    await app.clickPiece(app.pieces().first());
    await page.locator('#props-toggle').tap();
    await expect(page.locator('#props-panel')).toBeVisible();
    await expect(page.locator('#props-tab-piece')).toBeFocused();
    await expect(page.locator('#pos-x')).toBeVisible();
  });

  test('the calculator’s fields on the site are 16 px at least', async ({ page }) => {
    await page.goto('./es/cuantas-fotos-caben-en-una-hoja');
    await page.locator('#calc-photo').selectOption('custom');
    const fields = await page.evaluate(readFields);
    expect(Object.keys(fields)).toEqual(expect.arrayContaining(['calc-paper', 'calc-photo', 'calc-w', 'calc-h', 'calc-margin']));
    expect(small(fields)).toEqual([]);
  });

  for (const language of LANGUAGES) {
    test.describe(`in ${language}`, () => {
      test.use({ locale: LOCALES[language] });

      test('at 390 px with 16 px fields nothing overflows: both tabs keep every field and its value inside, no text is cut and nothing scrolls sideways', async ({ app, page }) => {
        test.skip(!(await coarse(page)), 'this engine doesn’t report a touch screen as a coarse pointer');
        expect(await page.evaluate(() => document.documentElement.lang)).toBe(language);
        const check = async (screen: string) => {
          const fields = await page.evaluate(readFields);
          expect(small(fields), `${screen}: fields under 16 px`).toEqual([]);
          expect(Object.entries(fields).filter(([, f]) => !f.fits || !f.inside).map(([id]) => id), `${screen}: fields whose value doesn’t fit, or out of the window`).toEqual([]);
          const layout = await page.evaluate(readLayout);
          expect(layout.clipped, `${screen}: clipped text`).toEqual([]);
          expect(layout.overlapping, `${screen}: controls on top of each other`).toEqual([]);
          expect(await horizontalOverflow(page), `${screen}: sideways scroll`).toBeLessThanOrEqual(0);
        };
        await pdfSelected(app);
        await check('Pieza');
        await everyProjectField(app);
        await check('Proyecto');
      });
    });
  }
});

test.describe('with a mouse', () => {
  test('the fields keep their sizes: 13.5 px, 14 px in the shortcuts’ search', async ({ app, page }) => {
    await pdfSelected(app);
    const piece = await page.evaluate(readFields);
    expect([piece['pos-x'].size, piece['scale'].size, piece['photo-size'].size, piece['page'].size]).toEqual([13.5, 13.5, 13.5, 13.5]);
    await app.openSheet();
    expect((await page.evaluate(readFields))['paper'].size).toBe(13.5);
    await page.locator('#help').click();
    await expect(page.locator('#shortcuts-search')).toBeVisible();
    expect((await page.evaluate(readFields))['shortcuts-search'].size).toBe(14);
  });
});
