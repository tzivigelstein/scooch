// The site's static pages as the build writes them and a browser shows them,
// in every language (what each page says is checked in tests/site): every page is
// a file of its own with what search engines read and nothing of the editor;
// the sitemap lists exactly the indexable ones; axe finds nothing in light or
// dark; nothing moves while loading; few, small, same-origin requests; no page
// or table scrolls sideways at phone, tablet and desktop widths; the
// calculator answers; the editor's page carries its metadata.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import { scan } from '../support/accessibility.ts';
import { expect, norm, test } from '../support/test.ts';

// Where playwright.config.ts builds the app.
const BUILD = join(process.env.E2E_OUT ?? 'e2e/out', 'build');
const html = (file: string) => readFileSync(join(BUILD, file), 'utf8');
/** Every page of every language: a folder of the build per language, besides the editor's assets. */
const pageFiles = () =>
  readdirSync(BUILD, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'assets')
    .flatMap((d) => readdirSync(join(BUILD, d.name)).map((f) => `${d.name}/${f}`));
const pathOf = (file: string) => `/${file.replace(/\.html$/, '')}`;
const indexable = (file: string) => !/<meta name="robots" content="noindex">/.test(html(file));

test.describe('the build', () => {
  test('every page is a static file with one h1, a title, a description, a canonical URL, valid structured data and nothing of the editor', () => {
    const files = pageFiles();
    expect(files.length).toBeGreaterThanOrEqual(22);
    for (const file of [...files, '404.html']) {
      const text = html(file);
      expect(text.match(/<h1[\s>]/g), file).toHaveLength(1);
      expect(text, file).toMatch(/<title>[^<]{10,}<\/title>/);
      expect(text, file).toMatch(/<meta name="description" content="[^"]{40,}">/);
      expect(text, file).not.toMatch(/assets\/index-|rel="modulepreload"|rel="stylesheet"/);
      for (const [, json] of text.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) expect(() => JSON.parse(json), file).not.toThrow();
      if (file === '404.html') continue;
      expect(text, file).toMatch(new RegExp(`<link rel="canonical" href="https://[^"]+${pathOf(file)}">`));
      expect(text, file).toContain('"@type":"BreadcrumbList"');
    }
  });

  test('the sitemap lists the editor and exactly the indexable pages', () => {
    const locs = [...html('sitemap.xml').matchAll(/<loc>https:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1]);
    const expected = ['/', ...pageFiles().filter(indexable).map(pathOf)];
    expect([...locs].sort()).toEqual([...expected].sort());
    expect(locs).not.toContain('/es/terminos');
  });

  test('robots.txt, llms.txt and the share image are there', () => {
    expect(html('robots.txt')).toMatch(/^User-agent: \*\nAllow: \/$/m);
    expect(html('llms.txt')).toMatch(/^# Scooch\n/);
    expect(existsSync(join(BUILD, 'share.png'))).toBe(true);
  });

  test('a content page weighs little: its HTML and its script together, gzipped', () => {
    // The license texts are as long as they are.
    for (const file of pageFiles().filter((f) => !/licen[cs]/.test(f))) {
      const text = html(file);
      const scripts = [...text.matchAll(/<script type="module" src="\/([^"]+)"/g)].map((m) => readFileSync(join(BUILD, m[1])));
      const bytes = [Buffer.from(text), ...scripts].reduce((sum, b) => sum + gzipSync(b, { level: 9 }).length, 0);
      expect(bytes, file).toBeLessThan(20_000);
    }
  });
});

/** Opens a page and returns its layout shift and what it requested. */
async function load(page: Page, path: string) {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(path);
  await page.waitForLoadState('load');
  const shift = await page.evaluate(
    () =>
      new Promise<number>((done) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!entry.hadRecentInput) total += entry.value;
        }).observe({ type: 'layout-shift', buffered: true });
        requestAnimationFrame(() => requestAnimationFrame(() => done(total)));
      })
  );
  return { shift, requests };
}

// Listed by hand: tests are collected before the build is written.
const SHOWN = [
  ...['imprimir-varias-fotos-en-una-hoja', 'cuantas-fotos-caben-en-una-hoja', 'fotos-10x15-en-hoja-a4', 'foto-carnet-para-imprimir', 'imprimir-misma-foto-varias-veces', 'imprimir-imagen-tamano-real', 'preguntas-frecuentes', 'terminos', 'privacidad', 'licencias-de-terceros', 'licencia'].map((name) => `es/${name}.html`),
  ...['print-multiple-pictures-on-one-page', 'how-many-photos-fit-on-a-page', 'print-4x6-photos-on-a4', 'print-passport-photos-at-home', 'print-same-picture-multiple-times', 'print-image-actual-size', 'faq', 'terms', 'privacy', 'third-party-licenses', 'license'].map((name) => `en/${name}.html`),
];

test.describe('in the browser', () => {
  for (const file of SHOWN) {
    test(`${pathOf(file)}: axe finds nothing in light and dark, nothing moves while loading, and every request stays on the site`, async ({ page, baseURL }) => {
      const { shift, requests } = await load(page, `.${pathOf(file)}`);
      expect(shift).toBe(0);
      const origin = new URL(baseURL!).origin;
      expect(requests.filter((url) => !url.startsWith(origin) && !url.startsWith('data:'))).toEqual([]);
      expect(requests.filter((url) => /\.js$/.test(url)).every((url) => /\/assets\/calculator-[\w-]+\.js$/.test(url))).toBe(true);
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        const { violations } = await scan(page);
        expect(violations.map((v) => `${scheme}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      }
    });
  }

  test('at 390, 768 and 1440 px no page scrolls sideways, and every table fits without scrolling (on a phone, one block per row where needed)', async ({ page }) => {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const file of SHOWN) {
        await page.goto(`.${pathOf(file)}`);
        const { sideways, tables } = await page.evaluate(() => ({
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          tables: [...document.querySelectorAll('.table-wrap')].map((box) => box.scrollWidth - box.clientWidth),
        }));
        expect(sideways, `${pathOf(file)} at ${width} px`).toBeLessThanOrEqual(0);
        expect(tables.filter((extra) => extra > 0), `${pathOf(file)} at ${width} px`).toEqual([]);
        // With wider letters too (another font, as on a system without the
        // ones this machine has): a long name breaks instead of pushing its column out.
        const wider = await page.evaluate(() => {
          document.documentElement.style.letterSpacing = '0.04em';
          return [...document.querySelectorAll('.table-wrap')].map((box) => box.scrollWidth - box.clientWidth);
        });
        expect(wider.filter((extra) => extra > 0), `${pathOf(file)} at ${width} px, with wider letters`).toEqual([]);
      }
    }
  });

  test('on a phone, a five-column table shows one block per row, is still a table with its column headers, and axe finds nothing in light and dark', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./es/fotos-10x15-en-hoja-a4');
    const table = page.getByRole('table');
    expect(await table.locator('tbody tr').first().evaluate((row) => getComputedStyle(row).display)).toBe('block');
    await expect(table.getByRole('columnheader')).toHaveCount(5);
    await expect(table.getByRole('rowheader')).toHaveCount(4);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const { violations } = await scan(page);
      expect(violations.map((v) => `${scheme}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  });

  test('the calculator answers for another paper, photo and margin, and its link opens the editor set up like that', async ({ page }) => {
    await page.goto('./es/cuantas-fotos-caben-en-una-hoja');
    await expect(page.locator('#calc-count strong')).toHaveText('2');
    await page.locator('#calc-paper').selectOption('letter');
    await page.locator('#calc-photo').selectOption('passport-35x45');
    await expect(page.locator('#calc-count strong')).toHaveText('30');
    expect(norm(await page.locator('#calc-summary').textContent())).toBe('Pasaporte 3,5 × 4,5 (35 × 45 mm) en Carta vertical, con margen de 5 mm y separación de 2 mm');
    await expect(page.locator('#calc-figure .photo')).toHaveCount(30);
    await expect(page.locator('#calc-open')).toHaveAttribute('href', '/?paper=letter&orientation=portrait&margin=5&gap=2&photo=passport-35x45&rotate=on');
    await page.locator('#calc-photo').selectOption('custom');
    await expect(page.locator('#calc-w')).toBeVisible();
    await page.locator('#calc-w').fill('25');
    await page.locator('#calc-h').fill('30');
    await page.locator('#calc-margin').fill('0');
    await page.locator('#calc-margin').blur();
    await expect(page.locator('#calc-open')).toHaveAttribute('href', /photo=25x30mm/);
    await expect(page.locator('#calc-open')).toHaveAttribute('href', /margin=0/);
  });

  test('the English calculator gives the same answer in English, and opens the editor set up the same way', async ({ page }) => {
    await page.goto('./en/how-many-photos-fit-on-a-page');
    await page.locator('#calc-paper').selectOption('letter');
    await page.locator('#calc-photo').selectOption('passport-35x45');
    await expect(page.locator('#calc-count strong')).toHaveText('30');
    expect(norm(await page.locator('#calc-summary').textContent())).toBe('Passport 3.5 × 4.5 cm (35 × 45 mm) on Letter portrait, with a 5 mm margin and 2 mm spacing');
    await expect(page.locator('#calc-open')).toHaveAttribute('href', '/?paper=letter&orientation=portrait&margin=5&gap=2&photo=passport-35x45&rotate=on');
  });

  test('the editor’s page carries its canonical URL, share tags and structured data, and says what it does before it loads', async ({ page }) => {
    const index = html('index.html');
    expect(index).toMatch(/<link rel="canonical" href="https:\/\/[^"]+\/">/);
    expect(index).toMatch(/<meta property="og:image" content="https:\/\/[^"]+\/share\.png">/);
    const [, json] = index.match(/<script type="application\/ld\+json">(.*?)<\/script>/)!;
    expect(JSON.parse(json)).toMatchObject({ '@type': 'WebApplication', name: 'Scooch', isAccessibleForFree: true });
    expect(index).toMatch(/<p class="boot-about">Acomoda imágenes y páginas de PDF/);
    const { shift } = await load(page, './');
    await expect(page.locator('.boot')).toHaveCount(0);
    expect(shift).toBe(0);
  });
});
