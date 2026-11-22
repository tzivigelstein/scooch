// Each language other than Spanish, in a real browser that speaks it
// (navigator.languages, so «Automático» picks it): the page is in it before
// the app's script runs, only its texts download, and the key screens (the
// top bar, both tabs, the list of photo sizes, Preferences, the shortcuts, the palette, the summary
// after downloading and a usage tip) show no Spanish, scroll nothing sideways and cut no
// control's text, at 1440 and 390 px; axe finds nothing in one state. And
// choosing a language in Preferences, once, end to end; and the scale field
// writing and reading the decimal separator of the language on screen (a
// number input would take the browser's: what each language writes and
// reads is in tests/core/units.test.js and
// tests/components/PieceSection.test.tsx). The rest of the suite
// runs in Spanish (playwright.config.ts). How texts are chosen, switched and
// kept, without a browser: tests/services/language.test.ts and
// tests/components/language-switch.test.tsx.
import type { Page } from '@playwright/test';
import { LANGUAGES, type Language } from '../../src/core/language.js';
import { CATALOGUES } from '../../src/copy/all.ts';
import { textsFor, type Catalogue } from '../../src/copy/index.ts';
import { readLayout, scan } from '../support/accessibility.ts';
import { holdApp, layoutShift, readAbout, skeletonShown, watchHandOff } from '../support/boot.ts';
import { horizontalOverflow } from '../support/layout.ts';
import { App, expect, test } from '../support/test.ts';

/** A browser of each language, as a person there would have it. */
const LOCALES: Readonly<Record<string, string>> = { en: 'en-US', 'zh-Hans': 'zh-CN', hi: 'hi-IN', fr: 'fr-FR' };

const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

/** Every text of a catalogue, as one list. */
const texts = (tree: unknown): string[] => (typeof tree === 'string' ? [tree] : Object.values(tree as object).flatMap(texts));
const words = (catalogue: Catalogue) => new Set(texts(catalogue).flatMap((text) => text.toLowerCase().match(/\p{L}{4,}/gu) ?? []));

/** The Spanish words that aren't also words of `language` (so finding one on the page means a Spanish text). */
function spanishOnly(language: Language) {
  const own = words(CATALOGUES[language]);
  return [...words(CATALOGUES.es)].filter((word) => !own.has(word));
}

/** The texts on the page (shown or for screen readers) that have one of `words`, where they are. Runs in the page. */
const readWords = (words: string[]) => {
  const wanted = new Set(words);
  const found: string[] = [];
  const away = (el: Element) => !!el.closest('[hidden], dialog:not([open]), noscript, script, style, template');
  const look = (text: string | null, where: string) => {
    const hit = (text ?? '').toLowerCase().match(/\p{L}{4,}/gu)?.find((word) => wanted.has(word));
    if (hit) found.push(`${where}: «${text!.trim().slice(0, 90)}» (${hit})`);
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.parentElement && !away(node.parentElement)) look(node.textContent, `#${node.parentElement.id || node.parentElement.className}`);
  const ATTRIBUTES = ['aria-label', 'aria-roledescription', 'aria-valuetext', 'placeholder', 'title', 'data-tip', 'data-tip-note'];
  for (const el of document.querySelectorAll(ATTRIBUTES.map((a) => `[${a}]`).join())) if (!away(el)) for (const a of ATTRIBUTES) look(el.getAttribute(a), `#${el.id || el.className} [${a}]`);
  look(document.title, 'title');
  return found;
};

/**
 * Controls of the bar, the panels, dialogs and menus that stick out of the box
 * that clips them (a panel, a dialog's body): longer labels pushing them past
 * its edge, where nobody can see or reach them. Runs in the page.
 */
const readCutOff = () => {
  const out: string[] = [];
  const name = (el: Element) => `${el.id ? `#${el.id}` : el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')} «${(el.textContent ?? '').trim().slice(0, 40)}»`;
  const controls = document.querySelectorAll('.topbar button, .panel button, .panel select, .panel [role="combobox"], .panel input, .panel .seg > span, dialog[open] button, dialog[open] select, dialog[open] input, dialog[open] .seg > span, [role="menu"] [role^="menuitem"], .select-list [role="option"]');
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || el.closest('[hidden], dialog:not([open])')) continue;
    for (let box = el.parentElement; box && box !== document.body; box = box.parentElement) {
      if (getComputedStyle(box).overflowX === 'visible') continue;
      const left = box.getBoundingClientRect().left + box.clientLeft;
      const past = Math.max(r.right - (left + box.clientWidth), left - r.left);
      if (past > 1) out.push(`${name(el)} ${Math.round(past)} px past ${name(box).split(' «')[0]}`);
      break;
    }
  }
  return out;
};

/** No Spanish, no sideways scroll, no clipped or wrapped control text, no controls on top of each other or cut off. */
async function checkScreen(page: Page, language: Language, screen: string) {
  expect(await page.evaluate(readWords, spanishOnly(language)), `${screen}: Spanish texts`).toEqual([]);
  expect(await horizontalOverflow(page), `${screen}: sideways scroll`).toBeLessThanOrEqual(0);
  expect(await page.evaluate(readCutOff), `${screen}: controls cut off by their panel or dialog`).toEqual([]);
  const layout = await page.evaluate(readLayout);
  expect(layout.clipped, `${screen}: clipped text`).toEqual([]);
  expect(layout.wrapped, `${screen}: one-line text on two lines`).toEqual([]);
  expect(layout.overlapping, `${screen}: controls on top of each other`).toEqual([]);
}

/** Opens and closes each key screen, checking it. */
async function walkScreens(app: App, language: Language) {
  const { page } = app;
  await checkScreen(page, language, 'empty editor');
  await app.addFiles(['tile000.png', 'tile001.png']);
  await app.selectIds([1]);
  await app.openMeasures();
  await checkScreen(page, language, 'the item tab');
  await page.locator('#photo-size').click();
  await expect(page.locator('#photo-size-list')).toBeVisible();
  await checkScreen(page, language, 'the photo size list');
  await page.keyboard.press('Escape');
  await expect(page.locator('#photo-size-list')).toBeHidden();
  await app.closePopover();
  await app.showTab('project');
  await checkScreen(page, language, 'the project tab');
  await app.closePopover();

  // Its button, or its key where the narrow bar has no button for it.
  for (const [button, key, dialog] of [
    ['#prefs-open', null, '#prefs'],
    ['#help', '?', '#shortcuts'],
    ['#palette-open', 'Control+K', '#palette'],
  ] as const) {
    if (key && !(await page.locator(button).isVisible())) await page.keyboard.press(key);
    else await page.locator(button).click();
    await expect(page.locator(dialog)).toHaveAttribute('open', '');
    await checkScreen(page, language, dialog);
    await page.keyboard.press('Escape');
    await expect(page.locator(dialog)).not.toHaveAttribute('open', '');
  }

  await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  await expect(page.locator('#print-summary')).toHaveAttribute('open', '');
  await checkScreen(page, language, 'the summary after downloading');
  await page.locator('#summary-done').click();

  // A usage tip, with its buttons: one piece duplicated three times with the toolbar offers «Duplicar ×N».
  await app.clickPiece(app.piece(1));
  for (let i = 0; i < 3; i++) await page.locator('#piecebar [data-action="duplicate"]').click();
  await expect(page.locator('#usage-tip')).toBeVisible();
  await checkScreen(page, language, 'a usage tip');
}

for (const language of LANGUAGES.filter((l) => l !== 'es')) {
  const { t } = textsFor(CATALOGUES[language]);

  test.describe(`${language} (a browser in ${LOCALES[language]})`, () => {
    test.use({ locale: LOCALES[language] });

    for (const size of WIDTHS) {
      test(`at ${size.width} px: in ${language} before the app’s script runs (its skeleton’s sentence whole on the sheet), only its texts download, nothing moves as the app takes over, and the key screens show no Spanish, overflow nothing and cut no text`, async ({ page }, info) => {
        await page.setViewportSize(size);
        const chunks: string[] = [];
        const devanagari: string[] = [];
        page.on('request', (request) => {
          const name = /\/assets\/copy-([\w-]+?)-[\w-]{8}\.js$/.exec(request.url())?.[1];
          if (name) chunks.push(name);
          if (/noto-sans-devanagari/.test(request.url())) devanagari.push(request.url());
        });
        // The advice before downloading off, the summary after on.
        await page.addInitScript(() => localStorage.setItem('scooch:print-preferences', JSON.stringify({ v: 1, tip: false, summary: true })));
        await page.addInitScript(watchHandOff);
        const release = await holdApp(page);
        await page.goto('./', { waitUntil: 'commit' });
        await skeletonShown(page);
        expect(
          await page.evaluate(() => ({
            lang: document.documentElement.lang,
            title: document.title,
            loading: document.querySelector('.boot')?.getAttribute('aria-label'),
            about: document.querySelector('.boot-about')?.textContent,
            heading: document.querySelector('.boot h1')?.textContent,
          })),
          'the loading screen'
        ).toEqual({ lang: language, title: t('app.title'), loading: t('busy.loading'), about: t('app.description'), heading: t('app.heading') });
        expect((await page.evaluate(readAbout)).onSheet, 'the sentence whole on the sheet').toBe(true);
        expect(await page.locator('.boot-about').evaluate((el) => getComputedStyle(el).fontFamily.includes('Noto Sans Devanagari')), 'the sentence in the Devanagari font').toBe(language === 'hi');
        release();

        const app = new App(page, info);
        app.printing = true;
        await app.ready();
        // The skeleton left in the frame the project arrived, with nothing moving.
        expect(await page.evaluate(() => window.handOff)).toEqual({ loading: false, sheets: 1, pieces: 0 });
        expect(await page.evaluate(layoutShift), 'layout shift while loading').toBe(0);
        expect(chunks, 'the texts downloaded').toEqual([language]);
        await expect(page.locator('html')).toHaveAttribute('lang', language);
        await walkScreens(app, language);
        // Hindi's font, with Hindi only (the other languages show «हिन्दी» in Preferences with the system's font).
        expect(devanagari.length > 0, 'the Devanagari font downloaded').toBe(language === 'hi');
        if (language === 'hi') expect(await page.evaluate(() => document.fonts.check('16px "Noto Sans Devanagari Variable"', 'हिन्दी')), 'the Devanagari font in use').toBe(true);
      });
    }

    test('axe finds nothing with an item selected and its properties shown', async ({ app, page }) => {
      await app.addFiles(['tile000.png', 'tile001.png']);
      await app.selectIds([2]);
      await app.openMeasures();
      const result = await scan(page);
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  });
}

test('choosing a language in Preferences shows it at once, without a reload, keeping the selection and undo; another tab follows, and a reload keeps it', async ({ app, page, context }) => {
  await app.addFiles(['tile000.png', 'tile001.png']);
  await app.selectIds([2]);
  await page.keyboard.press('r');
  const before = await app.ids();
  const other = await context.newPage();
  await other.goto('./');
  await expect(other.locator('html')).toHaveAttribute('lang', 'es');
  await page.evaluate(() => ((window as unknown as { kept: boolean }).kept = true));

  await page.locator('#prefs-open').click();
  await page.locator('#language').selectOption('fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#prefs-title')).toHaveText('Préférences');
  await page.keyboard.press('Escape');
  await expect(page.locator('#undo')).toHaveAttribute('aria-label', 'Annuler');
  await expect(app.piece(2)).toHaveAttribute('aria-label', /pivoté de 90°/);
  expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept), 'the same page, not reloaded').toBe(true);
  expect(await app.selectedIds()).toEqual([2]);
  expect(await app.ids()).toEqual(before);
  await expect(other.locator('html')).toHaveAttribute('lang', 'fr');
  // The page's own texts follow; the tab's title is the project's name, in no language.
  await expect(other.locator('meta[name="description"]')).toHaveAttribute('content', textsFor(CATALOGUES.fr).t('app.description'));
  await expect(other).toHaveTitle('Sin título — Scooch');

  await app.undo();
  await expect(app.piece(2)).not.toHaveAttribute('aria-label', /pivoté/);
  await page.reload();
  await app.ready();
  await expect(page.locator('#undo')).toHaveAttribute('aria-label', 'Annuler');
});

test('the scale field writes and reads the decimal separator of the language on screen', async ({ app, page }) => {
  await app.addFiles(['small.jpg']);
  await app.clickPiece(app.pieceNamed('small.jpg'));
  await app.openMeasures();
  const scale = page.locator('#scale');
  const said = async () => (await page.locator('#slider').getAttribute('aria-valuetext'))?.replace(/\u00a0/g, ' ');
  await scale.fill('147.6');
  await scale.press('Enter');
  await expect(scale).toHaveValue('147,6');
  expect(await said()).toBe('147,6 %');

  await page.locator('#prefs-open').click();
  await page.locator('#language').selectOption('en');
  await page.keyboard.press('Escape');
  await expect(scale).toHaveValue('147.6');
  await scale.fill('120,5');
  await scale.press('Enter');
  await expect(scale).toHaveValue('120.5');
  expect(await said()).toBe('120.5%');
});
