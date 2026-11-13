// What only the production build in a real browser shows: the first paint
// before the app mounts (light and dark), the page without JavaScript, the
// texts index.html carries, the font and the lazy chunks of pdf.js and pdf-lib.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from '../support/test.ts';

const THEMES = {
  light: { bg: [255, 255, 255], text: 'rgb(14, 16, 20)' },
  dark: { bg: [21, 23, 28], text: 'rgb(238, 240, 243)' },
} as const;

/** The color of the page's top-left corner, from a tiny screenshot decoded in the page. */
async function cornerColor(page: Page) {
  const png = await page.screenshot({ clip: { x: 2, y: 2, width: 4, height: 4 } });
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
  const bootStyle = boot && getComputedStyle(boot);
  const name = document.querySelector('.boot-name');
  return {
    bg: getComputedStyle(document.body).backgroundColor,
    color: getComputedStyle(document.body).color,
    h1: r && h1 ? { w: r.width, h: r.height, clip: getComputedStyle(h1).clipPath } : null,
    boot: boot && bootStyle ? { opacity: Number(bootStyle.opacity), display: bootStyle.display, name: name?.textContent ?? null, nameFont: name ? getComputedStyle(name).fontFamily : null } : null,
    mounted: !!document.querySelector('#paper'),
  };
};

test.describe('before the app mounts', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  for (const scheme of ['light', 'dark'] as const) {
    const theme = THEMES[scheme];

    test.describe(`${scheme} theme, without JavaScript`, () => {
      // Without JavaScript the browser cancels the module preloads.
      test.use({ javaScriptEnabled: false, colorScheme: scheme, allowErrors: [/^requestfailed: .*\/assets\/[\w-]+\.js$/] });

      test('the app’s background and text, a hidden fallback heading, the message in the app’s font and no boot screen', async ({ page }) => {
        await page.goto('./');
        const st = await page.evaluate(bootState);
        expect(closeTo(await cornerColor(page), theme.bg), 'background').toBe(true);
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

    test.describe(`${scheme} theme, slow load`, () => {
      test.use({ colorScheme: scheme });

      test('the first paint has the app’s background, the boot screen fades in later and the app replaces it', async ({ page }) => {
        let release!: () => void;
        const held = new Promise<void>((done) => (release = done));
        await page.route(/\/(assets\/index-[\w-]+\.js|src\/main\.tsx)(\?.*)?$/, async (route) => {
          await held;
          await route.continue();
        });
        await page.goto('./', { waitUntil: 'commit' });
        await page.locator('.boot').waitFor({ state: 'attached' });
        const first = await page.evaluate(bootState);
        expect(closeTo(await cornerColor(page), theme.bg), 'first paint background').toBe(true);
        expect(first.color).toBe(theme.text);
        // Nothing else shows at first: no flash on fast loads.
        expect(first.boot!.opacity).toBeLessThan(0.5);
        // Later, the brand with the app's name fades in.
        await expect.poll(async () => (await page.evaluate(bootState)).boot?.opacity).toBe(1);
        const later = await page.evaluate(bootState);
        expect(later.boot!.name).toBe('Scooch');
        expect(later.boot!.nameFont).toMatch(/Inter|system-ui/);
        expect(later.h1!.w).toBeLessThanOrEqual(1);
        expect(later.h1!.h).toBeLessThanOrEqual(1);
        release();
        await expect(page.locator('.boot')).toHaveCount(0);
        await expect(page.locator('#paper')).toBeAttached();
        const mounted = await page.evaluate(bootState);
        expect(closeTo(await cornerColor(page), theme.bg), 'mounted background').toBe(true);
        expect(mounted.bg).toBe(`rgb(${theme.bg.join(', ')})`);
      });
    });
  }
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
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.unicodeRange.slice(0, 12)}`),
      button: getComputedStyle(document.getElementById('arrange')!).fontFamily,
    }));
    expect(fonts.family, 'body uses Inter Variable with system-ui behind').toMatch(/^"?Inter Variable"?, system-ui/);
    expect(fonts.check && fonts.loaded.some((f) => f.startsWith('Inter Variable')), 'Inter is loaded').toBe(true);
    expect(fonts.button, 'buttons inherit Inter').toMatch(/Inter Variable/);
    const woff = initial.filter((u) => /\.woff2/.test(u));
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
