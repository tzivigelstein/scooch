// What only the production build in a real browser shows: the skeleton of
// the editor before the app mounts (light and dark, desktop and phone) and how
// the app takes its place, the page without JavaScript, the texts index.html
// carries, the font and the lazy chunks of pdf.js and pdf-lib. That the
// skeleton copies the stylesheet's values is in tests/site/boot-skeleton.test.ts.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { CATALOGUES } from '../../src/copy/all.ts';
import { textsFor } from '../../src/copy/index.ts';
import { DESKTOP, PHONE, axeSummary, scan, sizeTitle } from '../support/accessibility.ts';
import { holdApp, layoutShift, readAbout, skeletonShown, watchHandOff } from '../support/boot.ts';
import { App, expect, test } from '../support/test.ts';

const THEMES = {
  light: { bg: [255, 255, 255], canvas: [238, 240, 243], surface: [255, 255, 255], text: 'rgb(14, 16, 20)' },
  dark: { bg: [21, 23, 28], canvas: [11, 12, 15], surface: [23, 25, 30], text: 'rgb(238, 240, 243)' },
} as const;
const WHITE = [255, 255, 255];

/** The color of the page at (x, y), from a tiny screenshot decoded in the page. */
async function colorAt(page: Page, x = 2, y = 2) {
  const png = await page.screenshot({ clip: { x, y, width: 4, height: 4 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, png.toString('base64'));
}

const closeTo = (a: readonly number[], b: readonly number[], tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

const bootState = () => {
  const h1 = document.querySelector('h1');
  const r = h1?.getBoundingClientRect();
  const boot = document.querySelector('.boot');
  return {
    color: getComputedStyle(document.body).color,
    h1: r && h1 ? { w: r.width, h: r.height, clip: getComputedStyle(h1).clipPath } : null,
    boot: boot ? { display: getComputedStyle(boot).display } : null,
  };
};

type Box = { x: number; y: number; width: number; height: number } | null;

/** The boxes of the skeleton and of the app that takes its place, by part: the first of its elements that shows (null: none). */
const readBoxes = (parts: Record<string, string>) => {
  const box = (selector: string): Box => {
    for (const el of document.querySelectorAll(selector)) {
      const r = el.getBoundingClientRect();
      if (getComputedStyle(el).display !== 'none' && r.width > 1 && r.height > 1) return { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return null;
  };
  return Object.fromEntries(Object.entries(parts).map(([part, selector]) => [part, box(selector)]));
};
const SKELETON = { bar: '.boot-bar', left: '.boot-left', right: '.boot-right', canvas: '.boot-stage', sheet: '.boot-sheet', mark: '.boot svg', name: '.boot-name', piecesButton: '.boot-dock', propsButton: '.boot-dock + .boot-dock' };
// The pieces panel: a column on desktop, its rail on medium screens.
const MOUNTED = { bar: '.topbar', left: '.rail, #pieces-panel', right: '#props-panel', canvas: '#canvas', sheet: '#sheets .sheet', mark: '.brand-mark', name: '.brand-name', piecesButton: '#pieces-dock', propsButton: '#props-toggle' };

/**
 * Each part of the app against where the skeleton drew it, to a pixel: the
 * same boxes, and the same parts shown. The panel buttons' widths follow
 * their texts: only their outer edges and height count.
 */
function expectSameBoxes(drawn: Record<string, Box>, shown: Record<string, Box>) {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  for (const [part, d] of Object.entries(drawn)) {
    const s = shown[part];
    expect(s === null, `${part} shown in both or neither`).toBe(d === null);
    if (!d || !s) continue;
    const edges = part === 'piecesButton' ? ['x', 'y', 'height'] : part === 'propsButton' ? ['right', 'y', 'height'] : ['x', 'y', 'width', 'height'];
    const value = (b: NonNullable<Box>, edge: string) => (edge === 'right' ? b.x + b.width : b[edge as keyof typeof b]);
    for (const edge of edges) expect(near(value(s, edge), value(d, edge)), `${part} ${edge}: ${value(d, edge)} drawn, ${value(s, edge)} shown`).toBe(true);
  }
}

test.describe('before the app mounts', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  for (const scheme of ['light', 'dark'] as const) {
    const theme = THEMES[scheme];

    test.describe(`${scheme} theme, without JavaScript`, () => {
      // Without JavaScript the browser blocks the module preloads (reason «csp»).
      test.use({ javaScriptEnabled: false, colorScheme: scheme, allowErrors: [/^requestfailed: .*\/assets\/[\w-]+\.js \(csp\)$/] });

      test('the app’s background and text, a hidden fallback heading, the message in the app’s font and no boot screen', async ({ page }) => {
        await page.goto('./');
        const st = await page.evaluate(bootState);
        expect(closeTo(await colorAt(page), theme.bg), 'background').toBe(true);
        expect(st.color).toBe(theme.text);
        expect(st.h1!.w).toBeLessThanOrEqual(1);
        expect(st.h1!.h).toBeLessThanOrEqual(1);
        expect(st.h1!.clip).not.toBe('none');
        const message = await page.evaluate(() => {
          const p = document.querySelector('.noscript');
          const r = p?.getBoundingClientRect();
          return p && r ? { text: p.textContent ?? '', visible: r.width > 0 && r.height > 0, font: getComputedStyle(p).fontFamily } : null;
        });
        expect(message?.visible).toBe(true);
        expect(message?.text).toMatch(/activa JavaScript/);
        expect(message?.font).toMatch(/^"Inter Variable", system-ui/);
        expect(st.boot?.display).toBe('none');
      });
    });
  }
});

test.describe('the skeleton of the editor, before the app mounts', () => {
  for (const size of [DESKTOP, PHONE])
    for (const scheme of ['light', 'dark'] as const) {
      const theme = THEMES[scheme];
      const narrow = size.width < 800;

      test.describe(`${sizeTitle(size)}, ${scheme} theme`, () => {
        test.use({ viewport: size, colorScheme: scheme });

        test('shows at once the top bar with the brand, the panels or the panel buttons, and a white sheet saying what the tool does, in the theme’s colors', async ({ page, browserName }) => {
          const release = await holdApp(page);
          await page.goto('./', { waitUntil: 'commit' });
          await skeletonShown(page);
          const drawn = await page.evaluate(readBoxes, SKELETON);
          expect(drawn.bar).toMatchObject({ x: 0, y: 0, width: size.width });
          expect(drawn.mark).not.toBeNull();
          expect(drawn.sheet).not.toBeNull();
          const panels = [drawn.left, drawn.right, drawn.name].map((b) => b !== null);
          expect(panels, 'the pieces panel, the properties panel and the app’s name').toEqual(narrow ? [false, false, false] : [true, true, true]);
          expect([drawn.piecesButton, drawn.propsButton].map((b) => b !== null), 'the panel buttons').toEqual(narrow ? [true, true] : [false, false]);
          await expect(page.locator('.boot-name')).toHaveText('Scooch');
          expect(await page.locator('.boot-name').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"Inter Variable", system-ui/);

          // What the tool does, whole on the sheet, its column in the middle.
          const about = await page.evaluate(readAbout);
          const sheet = drawn.sheet!;
          expect(about.text).toMatch(/^Acomoda imágenes y páginas de PDF/);
          expect(about.onSheet, 'on the sheet').toBe(true);
          expect(Math.abs(about.offCenter), 'its column centered across the sheet').toBeLessThanOrEqual(1);

          // The theme from the first paint; the sheet white in both. Not read in
          // WebKit: a screenshot waits for document.fonts.ready, which WebKit
          // resolves only once the document has loaded (never, with the script held).
          if (browserName !== 'webkit') {
            expect(closeTo(await colorAt(page), theme.bg), 'top bar').toBe(true);
            expect(closeTo(await colorAt(page, drawn.canvas!.x + 4, drawn.canvas!.y + 4), theme.canvas), 'canvas').toBe(true);
            expect(closeTo(await colorAt(page, sheet.x + 8, sheet.y + 8), WHITE), 'sheet').toBe(true);
            if (drawn.left) expect(closeTo(await colorAt(page, drawn.left.x + 8, drawn.left.y + drawn.left.height - 12), theme.surface), 'pieces panel').toBe(true);
          }
          expect((await page.evaluate(bootState)).color).toBe(theme.text);
          // Reduced motion (as every test runs): nothing moves.
          expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
          release();
        });

        test('reads as a busy main region named «Cargando…» with the hidden heading and what the tool does, the drawing hidden, and nothing to focus', async ({ page }) => {
          const release = await holdApp(page);
          await page.goto('./', { waitUntil: 'commit' });
          await skeletonShown(page);
          await expect(page.locator('body')).toMatchAriaSnapshot(`
            - /children: equal
            - main "Cargando…":
              - /children: equal
              - heading /acomoda imágenes y PDF en una hoja/ [level=1]
              - paragraph: /^Acomoda imágenes y páginas de PDF/
          `);
          await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true');
          const exposed = page.locator('.boot *:not(h1, .boot-stage, .boot-sheet, .boot-about, [aria-hidden="true"], [aria-hidden="true"] *)');
          expect(await exposed.count(), 'all but the heading and what the tool does is hidden from assistive technology').toBe(0);
          const h1 = (await page.evaluate(bootState)).h1!;
          expect(h1.w <= 1 && h1.h <= 1 && h1.clip !== 'none', 'the heading takes no visible room').toBe(true);
          await page.keyboard.press('Tab');
          expect(await page.evaluate(() => document.activeElement === document.body), 'Tab finds nothing to focus').toBe(true);
          expect(await page.locator('.boot :is(a[href], button, input, select, textarea, [tabindex], [contenteditable])').count()).toBe(0);
          release();
        });

        test('when the app mounts, its top bar, panels, canvas and sheet are where the skeleton drew them, and nothing moved while loading', async ({ page }, testInfo) => {
          await page.addInitScript(watchHandOff);
          const release = await holdApp(page);
          await page.goto('./', { waitUntil: 'commit' });
          await skeletonShown(page);
          const drawn = await page.evaluate(readBoxes, SKELETON);
          release();
          await new App(page, testInfo).ready();
          await expect(page.locator('.boot')).toHaveCount(0);
          // The skeleton left in the same frame the project's sheet arrived.
          expect(await page.evaluate(() => window.handOff)).toEqual({ loading: false, sheets: 1, pieces: 0 });
          expectSameBoxes(drawn, await page.evaluate(readBoxes, MOUNTED));
          expect(await page.evaluate(layoutShift), 'layout shift while loading').toBe(0);
          expect(closeTo(await colorAt(page), theme.bg), 'the app’s top bar').toBe(true);
        });
      });
    }

  test('with a saved project, the skeleton stays until the project is open, then its sheet shows where the skeleton drew it, and nothing moved', async ({ app, page }) => {
    await app.addFiles(['small.jpg']);
    await expect(page.locator('#project')).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });
    await page.addInitScript(watchHandOff);
    const release = await holdApp(page);
    await page.reload({ waitUntil: 'commit' });
    await skeletonShown(page);
    const drawn = await page.evaluate(readBoxes, SKELETON);
    release();
    await app.ready();
    expect(await page.evaluate(() => window.handOff)).toEqual({ loading: false, sheets: 1, pieces: 1 });
    expectSameBoxes(drawn, await page.evaluate(readBoxes, MOUNTED));
    expect(await page.evaluate(layoutShift), 'layout shift while loading').toBe(0);
  });

  test.describe(() => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });

    test('without reduced motion, only the placeholders breathe, from a second into the load', async ({ page }) => {
      const release = await holdApp(page);
      await page.goto('./', { waitUntil: 'commit' });
      await skeletonShown(page);
      const animations = await page.evaluate(() =>
        document.getAnimations().map((a) => {
          const target = (a.effect as KeyframeEffect).target as Element;
          return {
            name: (a as CSSAnimation).animationName,
            delay: a.effect!.getTiming().delay,
            // A group of placeholders: no surface of its own, and not the sheet.
            surface: getComputedStyle(target).backgroundColor !== 'rgba(0, 0, 0, 0)',
            sheet: target.contains(document.querySelector('.boot-sheet')),
          };
        })
      );
      expect(animations.length).toBeGreaterThan(0);
      for (const a of animations) expect(a).toEqual({ name: 'boot-pulse', delay: 1000, surface: false, sheet: false });
      release();
    });
  });
});

test.describe('when the editor can’t open', () => {
  test.describe('its texts don’t download', () => {
    const FRENCH = /\/assets\/copy-fr-[\w-]+\.js$/;
    // The French texts' failed request (and the browser's line for it), and the app saying so in the console.
    // Each engine words the request's failure its own way (WebKit: «Blocked by Web Inspector»).
    test.use({ locale: 'fr-FR', allowErrors: [/^requestfailed: .*\/assets\/copy-fr-[\w-]+\.js \(.+\)$|^Failed to load resource: net::ERR_FAILED$|^The texts could not be loaded\./] });

    test('the skeleton gives way to a message in the page’s language with the focus on its reload button, which opens the editor once they do', async ({ page, browserName }, testInfo) => {
      const { t } = textsFor(CATALOGUES.fr);
      await page.route(FRENCH, (route) => route.abort('failed'));
      await page.goto('./');
      const failed = page.getByRole('alert');
      await expect(failed.locator('p')).toHaveText(t('app.bootFailed'));
      await expect(page.locator('.boot')).toHaveCount(0);
      const reload = failed.getByRole('button', { name: t('notices.reload') });
      await expect(reload).toBeFocused();
      const { violations } = await scan(page);
      expect(axeSummary(violations)).toEqual([]);
      if (browserName === 'webkit') {
        // Playwright's WebKit keeps the failed chunk in its memory cache (aborted or
        // answered with a 503) and doesn't ask for it again, even from a new page:
        // the editor can't open in this browser context.
        testInfo.annotations.push({ type: 'not in WebKit', description: 'the reload opening the editor' });
        return;
      }
      await page.unroute(FRENCH);
      await page.keyboard.press('Enter');
      await new App(page, testInfo).ready();
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      await expect(page.locator('#boot-failed')).toHaveCount(0);
    });
  });

  test.describe('it fails while it renders', () => {
    test.use({ allowErrors: [/^pageerror: .*the app failed on purpose/] });

    test('the skeleton gives way to the message in the page’s language', async ({ page }) => {
      // The rail asks for this media query while it renders: the first render fails.
      await page.addInitScript(() => {
        const matchMedia = window.matchMedia.bind(window);
        window.matchMedia = (query: string) => {
          if (query === '(max-width: 1099.98px)') throw new Error('the app failed on purpose');
          return matchMedia(query);
        };
      });
      await page.goto('./');
      const { t } = textsFor(CATALOGUES.es);
      await expect(page.getByRole('alert').locator('p')).toHaveText(t('app.bootFailed'));
      await expect(page.getByRole('alert').getByRole('button', { name: t('notices.reload') })).toBeFocused();
      await expect(page.locator('.boot')).toHaveCount(0);
    });
  });
});

const collectTexts = () => {
  const out: Record<string, string | null> = {};
  const attrs = { 'data-i18n-label': 'aria-label', 'data-i18n-tip': 'data-tip', 'data-i18n-note': 'data-tip-note', 'data-i18n-content': 'content' };
  document.querySelectorAll<HTMLElement>('[data-i18n],[data-i18n-label],[data-i18n-tip],[data-i18n-note],[data-i18n-content]').forEach((el, i) => {
    const id = `${i}:${el.tagName}#${el.id}`;
    if (el.dataset.i18n) out[`${id} text`] = el.textContent;
    for (const [src, dst] of Object.entries(attrs)) if (el.hasAttribute(src)) out[`${id} ${dst}`] = el.getAttribute(dst);
  });
  out.title = document.title;
  return out;
};

test.describe('texts in index.html', () => {
  test('without JavaScript every text and attribute is already there, and the title is the app’s', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('./');
    const bare = await page.evaluate(collectTexts);
    const empty = Object.entries(bare).filter(([, v]) => !v || !String(v).trim());
    expect(empty.map(([k]) => k)).toEqual([]);
    expect(bare.title).toMatch(/^Scooch/);
    await context.close();
  });

  test('applying the copy in the browser leaves the static texts as they were', async ({ browser, app }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('./');
    const bare = await page.evaluate(collectTexts);
    await context.close();
    const live = await app.page.evaluate(collectTexts);
    // What changes on purpose on start: the drop zone's text (single-key
    // shortcuts), bring-to-front's title, the piece total, the rotation and the
    // project name's tooltip.
    const dynamic = /#empty-text|#piece-front|#piece-total|#rotation-angle|#project-name /;
    const diffs = Object.keys(bare)
      .filter((k) => !dynamic.test(k) && bare[k] !== live[k])
      .map((k) => `${k}: «${bare[k]}» → «${live[k]}»`);
    expect(diffs).toEqual([]);
  });
});

test.describe('the build', () => {
  test('Inter is the font, only its Latin subset loads, and pdf.js and pdf-lib wait until they are needed', async ({ page, app }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    const initial = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => ({
      family: getComputedStyle(document.body).fontFamily,
      check: document.fonts.check('14px "Inter Variable"'),
      // WebKit gives the family in quotes.
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/^"(.*)"$/, '$1')} ${f.unicodeRange.slice(0, 12)}`),
      button: getComputedStyle(document.getElementById('arrange')!).fontFamily,
    }));
    expect(fonts.family, 'body uses Inter Variable with system-ui behind').toMatch(/^"?Inter Variable"?, system-ui/);
    expect(fonts.check && fonts.loaded.some((f) => f.startsWith('Inter Variable')), 'Inter is loaded').toBe(true);
    expect(fonts.button, 'buttons inherit Inter').toMatch(/Inter Variable/);
    // WebKit lists it twice: it fetches it again instead of using the preload.
    const woff = [...new Set(initial.filter((u) => /\.woff2/.test(u)))];
    expect(woff, 'only the Latin subset').toHaveLength(1);
    expect(woff[0]).toMatch(/inter-latin-wght/);
    expect(initial.filter((u) => /pdfjs|pdf\.worker|pdf-lib/.test(u)), 'nothing of pdf.js or pdf-lib on start').toEqual([]);

    await app.addFiles(['small.jpg']);
    expect(requests.filter((u) => /pdfjs|pdf\.worker/.test(u)), 'an image doesn’t load pdf.js').toEqual([]);

    await app.addFiles(['twopage.pdf']);
    await expect(app.pieces()).toHaveCount(2);
    expect(requests.some((u) => /pdfjs-dist-[\w-]+\.js$/.test(u)), 'a PDF loads pdf.js').toBe(true);
    expect(requests.some((u) => /pdf\.worker\.min-[\w-]+\.mjs$/.test(u)), 'and its worker').toBe(true);
    const thumb = await page.evaluate(async () => {
      const img = document.querySelector<HTMLImageElement>('#sheets .piece[aria-label^="twopage.pdf"] img')!;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    });
    expect(thumb[0], 'the PDF was drawn by the worker').toBeGreaterThan(100);
    expect(thumb[1]).toBeGreaterThan(100);
    expect(requests.filter((u) => /pdf-lib/.test(u)), 'pdf-lib not yet').toEqual([]);

    const { file } = await app.download();
    expect(requests.some((u) => /pdf-lib-[\w-]+\.js$/.test(u)), 'exporting loads pdf-lib').toBe(true);
    expect(readFileSync(file).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
