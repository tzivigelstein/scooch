// @vitest-environment jsdom
// Every page of the site as the build writes it (siteFiles), parsed: what
// search engines read, the links that open the editor, and the copy rules
// that can be checked by machine. The build's own output is checked in
// e2e/specs/site-pages.spec.ts.
import { describe, expect, test } from 'vitest';
import { deepLinkSearch, parseDeepLink, setsUp } from '../../src/core/deeplink.js';
import { alternates } from '../../src/site/seo.ts';
import { pageFile, readLegal, sitePages, siteFiles } from '../../src/site/site.ts';
import type { SitePage } from '../../src/site/types.ts';

// Vitest runs from the repository (in jsdom, import.meta.url isn't a file URL).
const ROOT = process.cwd();
const URL_ = 'https://example.com';
const legal = readLegal(ROOT);
const pages = sitePages(legal);
const files = siteFiles({ url: URL_ }, legal, { calculator: '/assets/calculator-test.js' });
const doc = (page: SitePage) => new DOMParser().parseFromString(files.get(pageFile(page))!, 'text/html');
const addressed = pages.filter((p) => p.kind !== 'error');

describe('every page', () => {
  test.each(addressed.map((p) => [p.path, p]))('%s: one h1, a title, a description, a canonical URL and valid structured data', (_, page) => {
    const d = doc(page);
    expect(d.querySelectorAll('h1')).toHaveLength(1);
    expect(d.querySelector('h1')!.textContent).toBe(page.h1);
    expect(d.title).toBe(page.title);
    expect(page.title.length).toBeLessThanOrEqual(65);
    const description = d.querySelector('meta[name="description"]')!.getAttribute('content')!;
    expect(description).toBe(page.description);
    expect(description.length).toBeGreaterThanOrEqual(70);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(d.querySelector('link[rel="canonical"]')!.getAttribute('href')).toBe(`${URL_}${page.path}`);
    expect(d.documentElement.lang).toBe(page.lang);
    const data = [...d.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent!));
    expect(data.map((item) => item['@type'])).toEqual(page.faq?.length ? ['BreadcrumbList', 'FAQPage'] : ['BreadcrumbList']);
    for (const item of data) expect(item['@context']).toBe('https://schema.org');
    expect(data[0].itemListElement.map((i: { item: string }) => i.item)).toEqual([`${URL_}/`, `${URL_}${page.path}`]);
  });

  test('titles, descriptions and addresses are each the page’s own', () => {
    for (const key of ['title', 'description', 'path'] as const) expect(new Set(addressed.map((p) => p[key])).size).toBe(addressed.length);
  });

  test.each(pages.map((p) => [p.path, p]))('%s: nothing of the editor and nothing from another server is loaded', (_, page) => {
    const html = files.get(pageFile(page))!;
    expect(html).not.toMatch(/assets\/index-|src\/main|rel="(modulepreload|stylesheet)"/);
    const d = doc(page);
    const loaded = [...d.querySelectorAll('script[src], link[rel="preload"], img[src], iframe[src]')].map((el) => el.getAttribute('src') ?? el.getAttribute('href')!);
    expect(loaded).toEqual(page.scripts?.length ? ['/assets/calculator-test.js'] : []);
  });

  test.each(addressed.map((p) => [p.path, p]))('%s: share tags point to the page and the share image', (_, page) => {
    const d = doc(page);
    const meta = (name: string) => d.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content');
    expect(meta('og:url')).toBe(`${URL_}${page.path}`);
    expect(meta('og:title')).toBe(page.title);
    expect(meta('og:image')).toBe(`${URL_}/share.png`);
    expect(meta('twitter:card')).toBe('summary_large_image');
  });

  test('the questions in the structured data are the ones the page shows', () => {
    for (const page of pages.filter((p) => p.faq?.length)) {
      const d = doc(page);
      const data = [...d.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent!)).find((item) => item['@type'] === 'FAQPage');
      const shown = [...d.querySelectorAll('.faq h3')].map((h) => h.textContent);
      expect(data.mainEntity.map((q: { name: string }) => q.name)).toEqual(shown);
      for (const q of data.mainEntity) expect(q.acceptedAnswer.text).not.toMatch(/<|&[a-z]+;/);
    }
  });

  test('the brand in every page’s header is a link to the editor, named after the app', () => {
    for (const page of pages) {
      const brand = doc(page).querySelector('header .brand')!;
      expect(brand.tagName, page.path).toBe('A');
      expect(brand.getAttribute('href'), page.path).toBe('/');
      expect(brand.textContent, page.path).toBe('Scooch');
    }
  });

  test('pages that aren’t indexed say so, and only they', () => {
    for (const page of pages) expect(doc(page).querySelector('meta[name="robots"]')?.getAttribute('content') ?? 'index').toBe(page.indexable ? 'index' : 'noindex');
  });

  test('every guide is in every page’s footer, and the legal pages are linked from every page', () => {
    const guides = pages.filter((p) => p.kind === 'guide' || p.kind === 'faq').map((p) => p.path);
    for (const page of pages) {
      const d = doc(page);
      const links = [...d.querySelectorAll('footer a')].map((a) => a.getAttribute('href'));
      expect(links).toEqual(expect.arrayContaining([...guides, '/es/terminos', '/es/privacidad', '/es/licencias-de-terceros', '/es/licencia']));
    }
  });

  test('every link to another page of the site goes to one that exists', () => {
    const paths = new Set(['/', ...pages.map((p) => p.path)]);
    for (const page of pages)
      for (const a of doc(page).querySelectorAll('a[href^="/"]')) {
        const href = a.getAttribute('href')!;
        if (href.startsWith('/?')) continue;
        expect(paths, `${page.path} links to ${href}`).toContain(href.split('#')[0]);
      }
  });
});

describe('links that open the editor', () => {
  const links = pages.flatMap((page) => [...doc(page).querySelectorAll('a[href^="/?"]')].map((a) => ({ page: page.path, href: a.getAttribute('href')! })));

  test('every guide has at least one', () => {
    for (const page of pages.filter((p) => p.kind === 'guide')) expect(links.some((l) => l.page === page.path), page.path).toBe(true);
  });

  test.each(links.map((l) => [l.page, l.href]))('%s → %s: every value is read, none is ignored', (_, href) => {
    const link = parseDeepLink(href.slice(1));
    expect(setsUp(link)).toBe(true);
    const photo = link!.photo && (link!.photo.id ?? { w: link!.photo.w, h: link!.photo.h });
    expect(deepLinkSearch({ ...link!.settings, ...(photo ? { photo } : {}) })).toBe(href.slice(1));
  });
});

describe('the files for crawlers', () => {
  test('the sitemap lists the editor and exactly the indexable pages', () => {
    const locs = [...files.get('sitemap.xml')!.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([`${URL_}/`, ...pages.filter((p) => p.indexable).map((p) => `${URL_}${p.path}`)]);
    expect(locs).not.toContain(`${URL_}/es/terminos`);
  });

  test('robots.txt lets every crawler read everything and points to the sitemap', () => {
    const robots = files.get('robots.txt')!;
    expect(robots).toMatch(/^User-agent: \*\nAllow: \/$/m);
    expect(robots).not.toMatch(/Disallow/);
    expect(robots).toContain(`Sitemap: ${URL_}/sitemap.xml`);
  });

  test('llms.txt says what the tool is and links every indexable guide and the questions', () => {
    const llms = files.get('llms.txt')!;
    expect(llms).toMatch(/^# Scooch\n\n> .+herramienta web gratuita/);
    for (const page of pages.filter((p) => p.indexable && p.kind !== 'legal')) expect(llms).toContain(`](${URL_}${page.path})`);
    expect(llms).not.toContain('/es/terminos');
  });
});

describe('hreflang', () => {
  test('a page in one language gets no hreflang links', () => {
    for (const page of pages) expect(alternates(page, pages)).toEqual([]);
    expect(files.get(pageFile(pages[0]))).not.toContain('hreflang');
    expect(files.get('sitemap.xml')).not.toContain('xhtml');
  });

  test('once a page exists in another language, every version links to every other, plus x-default', () => {
    const es = pages[0];
    const en: SitePage = { ...es, lang: 'en', path: '/en/print-multiple-pictures-on-one-page' };
    const fr: SitePage = { ...es, lang: 'fr', path: '/fr/imprimer-plusieurs-photos', indexable: false };
    expect(alternates(es, [es, en, fr])).toEqual([
      { hreflang: 'es', path: es.path },
      { hreflang: 'en', path: en.path },
      { hreflang: 'x-default', path: en.path },
    ]);
    expect(alternates(fr, [es, en, fr])).toEqual([]);
  });
});

describe('copy rules a machine can check (docs/copy.md)', () => {
  const texts = pages.filter((p) => p.lang === 'es' && p.kind !== 'legal').map((p) => ({ path: p.path, text: doc(p).body.textContent! }));

  test.each([
    ['exclamations', /[!¡]/],
    ['voseo', /\b(podés|tenés|elegí|apretá|soltá|usás|hacé|mirá)\b/i],
    ['words the guide replaces', /\b(acá|achic\w*|apretar|clickea\w*|simplemente)\b/i],
    ['a number glued to its unit', /\d(mm|cm)\b/],
  ])('no %s', (_, pattern) => {
    for (const { path, text } of texts) expect(text, path).not.toMatch(pattern);
  });

  test('a number and its unit never break apart', () => {
    for (const { path, text } of texts) expect(text, path).not.toMatch(/\d (mm|cm|ppp|%)(?![\w])/);
  });
});
