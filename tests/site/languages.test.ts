// @vitest-environment jsdom
// The same page in every language. What ties the versions together for
// search engines (lang, hreflang and x-default, the sitemap) and for people
// (the links between languages), and that each language's links stay in it.
import { describe, expect, test } from 'vitest';
import { SITE_LANGUAGES } from '../../src/site/content/index.ts';
import { LANGUAGES, pathPrefix, type Lang } from '../../src/site/langs.ts';
import { renderPage, type Chrome } from '../../src/site/layout.ts';
import { alternates, sitemapXml } from '../../src/site/seo.ts';
import { pageFile, readLegal, sitePages, siteFiles } from '../../src/site/site.ts';
import type { PageId, SitePage } from '../../src/site/types.ts';

const ROOT = process.cwd();
const URL_ = 'https://example.com';
const legal = readLegal(ROOT);
const pages = sitePages(legal);
const files = siteFiles({ url: URL_ }, legal, { calculator: '/assets/calculator-test.js' });
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const doc = (page: SitePage) => parse(files.get(pageFile(page))!);
const language = (lang: Lang) => SITE_LANGUAGES.find((l) => l.lang === lang)!;
const addressed = pages.filter((p) => p.kind !== 'error');
const byPath = new Map(pages.map((p) => [p.path, p]));
const versionOf = (list: readonly SitePage[], id: string, lang: Lang) => list.find((p) => p.id === id && p.lang === lang);
/** Each page of another language than Spanish, with its Spanish version. */
const translated = addressed.filter((p) => p.lang !== 'es').map((p) => ({ id: p.id, lang: p.lang, page: p, es: versionOf(pages, p.id, 'es')! }));

describe('the languages', () => {
  test('the site’s languages are some of the app’s, each once, Spanish first', () => {
    expect(SITE_LANGUAGES[0].lang).toBe('es');
    for (const { lang } of SITE_LANGUAGES) expect(LANGUAGES).toContain(lang);
    expect(new Set(SITE_LANGUAGES.map((l) => l.lang)).size).toBe(SITE_LANGUAGES.length);
  });

  test('every address of a language is under its prefix, in lowercase letters, digits and hyphens', () => {
    for (const { lang, paths } of SITE_LANGUAGES) for (const path of Object.values(paths)) expect(path, lang).toMatch(new RegExp(`^${pathPrefix(lang)}/[a-z0-9]+(-[a-z0-9]+)*$`));
  });

  test('the Spanish addresses are still the ones published before there were other languages', () => {
    expect(Object.values(language('es').paths)).toEqual([
      '/es/imprimir-varias-fotos-en-una-hoja',
      '/es/cuantas-fotos-caben-en-una-hoja',
      '/es/fotos-10x15-en-hoja-a4',
      '/es/foto-carnet-para-imprimir',
      '/es/imprimir-misma-foto-varias-veces',
      '/es/imprimir-imagen-tamano-real',
      '/es/preguntas-frecuentes',
      '/es/terminos',
      '/es/privacidad',
      '/es/licencias-de-terceros',
      '/es/licencia',
    ]);
  });

  test('every page says its language and lives at its language’s address for it', () => {
    for (const page of addressed) {
      expect(doc(page).documentElement.lang, page.path).toBe(page.lang);
      expect(page.path, page.id).toBe(language(page.lang).paths[page.id as PageId]);
    }
  });

  test('a translation shows none of the Spanish page’s headings: no Spanish text under another language’s address', () => {
    for (const { page, es } of translated.filter((t) => t.id !== 'legal-notices' && t.id !== 'legal-license')) {
      const headings = (p: SitePage) => [...doc(p).querySelectorAll('main :is(h1, h2, h3)')].map((h) => h.textContent!.trim());
      const spanish = new Set(headings(es));
      expect(headings(page).filter((h) => spanish.has(h)), page.path).toEqual([]);
    }
  });
});

describe('hreflang and the sitemap', () => {
  const es = pages[0];

  test('a page in one language gets no hreflang links', () => {
    expect(alternates(es, [es])).toEqual([]);
  });

  test('once a page exists in another language, every indexable version links to every other, plus x-default', () => {
    const en: SitePage = { ...es, lang: 'en', path: '/en/print-multiple-pictures-on-one-page' };
    const fr: SitePage = { ...es, lang: 'fr', path: '/fr/imprimer-plusieurs-photos', indexable: false };
    expect(alternates(es, [es, en, fr])).toEqual([
      { hreflang: 'es', path: es.path },
      { hreflang: 'en', path: en.path },
      { hreflang: 'x-default', path: en.path },
    ]);
    expect(alternates(fr, [es, en, fr])).toEqual([]);
  });

  test('every indexable page lists each of its indexable versions in its head, x-default last, and each of them lists it back', () => {
    for (const page of addressed) {
      const links = [...doc(page).querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')]);
      const versions = pages.filter((p) => p.id === page.id && p.indexable);
      if (!page.indexable || versions.length < 2) {
        expect(links, page.path).toEqual([]);
        continue;
      }
      const fallback = versions.find((p) => p.lang === 'en') ?? versions.find((p) => p.lang === 'es')!;
      expect(links, page.path).toEqual([...versions.map((p) => [p.lang, `${URL_}${p.path}`]), ['x-default', `${URL_}${fallback.path}`]]);
    }
  });

  test('the sitemap gives each page it lists the same versions as the page’s head', () => {
    const sitemap = parse(sitemapXml(URL_, pages).replace(/xhtml:link/g, 'xlink'));
    for (const url of sitemap.querySelectorAll('url')) {
      const loc = url.querySelector('loc')!.textContent!;
      const page = byPath.get(loc.slice(URL_.length));
      const listed = [...url.querySelectorAll('xlink')].map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')]);
      const head = page ? [...doc(page).querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')]) : [];
      expect(listed, loc).toEqual(head);
    }
  });
});

describe('the links between languages', () => {
  const chrome = { skip: '', open: '', crumbs: '', guides: '', legal: '', languages: 'Idioma', about: '', faq: '', imageAlt: '', legalLinks: [] } satisfies Chrome;
  const es: SitePage = { id: 'x', lang: 'es', path: '/es/x', title: 'X', description: 'X', h1: 'X', crumb: 'X', kind: 'guide', indexable: true, body: '' };
  const en: SitePage = { ...es, lang: 'en', path: '/en/x', indexable: false };
  const footer = (page: SitePage, all: SitePage[]) => parse(renderPage(page, { url: URL_, pages: all, scripts: {} }, chrome)).querySelector('nav[aria-labelledby="footer-languages"]');

  test('the footer links every version of the page, indexed or not, each named in its own language, the current one marked', () => {
    const nav = footer(es, [en, es])!;
    expect(nav.querySelector('h2')!.textContent).toBe('Idioma');
    expect([...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('hreflang'), a.getAttribute('lang'), a.getAttribute('aria-current')])).toEqual([
      ['Español', '/es/x', 'es', 'es', 'page'],
      ['English', '/en/x', 'en', 'en', null],
    ]);
  });

  test('a page in one language, or the error page, has no links to other languages', () => {
    expect(footer(es, [es])).toBeNull();
    expect(footer({ ...es, kind: 'error' }, [es, { ...en, kind: 'error' }])).toBeNull();
  });

  test('every page of the site links exactly its versions', () => {
    for (const page of addressed) {
      const versions = LANGUAGES.flatMap((lang) => pages.filter((p) => p.id === page.id && p.lang === lang)).map((p) => p.path);
      const links = [...doc(page).querySelectorAll('nav[aria-labelledby="footer-languages"] a')].map((a) => a.getAttribute('href'));
      expect(links, page.path).toEqual(versions.length > 1 ? versions : []);
    }
  });

  test('a page’s links stay in its language, but for those that say the other language with hreflang', () => {
    for (const page of addressed)
      for (const a of doc(page).querySelectorAll('a[href^="/"]')) {
        const href = a.getAttribute('href')!;
        if (href === '/' || href.startsWith('/?')) continue;
        const target = byPath.get(href.split('#')[0])!;
        expect(target.lang === page.lang || a.getAttribute('hreflang') === target.lang, `${page.path} links to ${href}`).toBe(true);
      }
  });
});
