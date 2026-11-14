// Each language other than Spanish, in a real browser that speaks it
// (navigator.languages, so «Automático» picks it): the page is in it before
// the app's script runs, only its texts download, and the key screens (the
// top bar, both tabs, Preferences, the shortcuts, the palette and the summary
// after downloading) show no Spanish, scroll nothing sideways and cut no
// control's text, at 1440 and 390 px; axe finds nothing in one state. The rest
// of the suite runs in Spanish (playwright.config.ts). How texts are chosen,
// switched and kept, without a browser: tests/services/language.test.ts and
// tests/components/language-switch.test.tsx.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { LANGUAGES, type Language } from '../../src/core/language.js';
import { CATALOGUES } from '../../src/copy/all.ts';
import { textsFor, type Catalogue } from '../../src/copy/index.ts';
import { AXE_TAGS, readLayout } from '../support/accessibility.ts';
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

/** No Spanish, no sideways scroll, no clipped or wrapped control text, no controls on top of each other. */
async function checkScreen(page: Page, language: Language, screen: string) {
  expect(await page.evaluate(readWords, spanishOnly(language)), `${screen}: Spanish texts`).toEqual([]);
  expect(await horizontalOverflow(page), `${screen}: sideways scroll`).toBeLessThanOrEqual(0);
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
}

for (const language of LANGUAGES.filter((l) => l !== 'es')) {
  const { t } = textsFor(CATALOGUES[language]);

  test.describe(`${language} (a browser in ${LOCALES[language]})`, () => {
    test.use({ locale: LOCALES[language] });

    for (const size of WIDTHS) {
      test(`at ${size.width} px: in ${language} before the app’s script runs, only its texts download, and the key screens show no Spanish, overflow nothing and cut no text`, async ({ page }, info) => {
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
        let release!: () => void;
        const held = new Promise<void>((done) => (release = done));
        await page.route(/\/assets\/index-[\w-]+\.js$/, async (route) => {
          await held;
          await route.continue();
        });
        await page.goto('./', { waitUntil: 'commit' });
        await page.locator('.boot-about').waitFor({ state: 'attached' });
        expect(
          await page.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, about: document.querySelector('.boot-about')?.textContent, heading: document.querySelector('.boot h1')?.textContent })),
          'the loading screen'
        ).toEqual({ lang: language, title: t('app.title'), about: t('app.description'), heading: t('app.heading') });
        release();

        const app = new App(page, info);
        app.printing = true;
        await app.ready();
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
      const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  });
}
