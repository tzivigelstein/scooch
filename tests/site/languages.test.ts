// @vitest-environment jsdom
// The same page in every language. What ties the versions together for
// search engines (lang, hreflang and x-default, the sitemap) and for people
// (the links between languages), that each language's links stay in it, and
// that a translation is the Spanish page in other words: the same sections,
// tables, figures, calculator and links that open the editor, and the same
// numbers and measures. Spanish is the reference.
import { describe, expect, test } from 'vitest';
import { CATALOGUES } from '../../src/copy/all.ts';
import { calc, type CalcState, type CalcTexts } from '../../src/site/calc.ts';
import { SITE_LANGUAGES } from '../../src/site/content/index.ts';
import { CALC_START } from '../../src/site/facts/how-many.ts';
import { PROBE } from '../../src/site/kit.ts';
import { LANGUAGES, pathPrefix, type Lang } from '../../src/site/langs.ts';
import { renderPage, type Chrome } from '../../src/site/layout.ts';
import { alternates, sitemapXml } from '../../src/site/seo.ts';
import { pageFile, readLegal, sitePages, siteFiles } from '../../src/site/site.ts';
import type { PageId, SitePage } from '../../src/site/types.ts';

const ROOT = process.cwd();
const URL_ = 'https://example.com';
const legal = readLegal(ROOT);
const pages = sitePages(legal);
const probes = sitePages(legal, { probe: true });
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

  test('the Spanish addresses are still the ones published, a new page’s added at its place', () => {
    expect(Object.values(language('es').paths)).toEqual([
      '/es/imprimir-varias-fotos-en-una-hoja',
      '/es/cuantas-fotos-caben-en-una-hoja',
      '/es/fotos-10x15-en-hoja-a4',
      '/es/foto-carnet-para-imprimir',
      '/es/imprimir-misma-foto-varias-veces',
      '/es/imprimir-imagen-tamano-real',
      '/es/hacer-stickers-en-casa',
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

/** The text of some HTML, without scripts. */
const textOf = (html: string) => parse(`<body>${html.replace(/<script[\s\S]*?<\/script>/g, '')}</body>`).body.textContent!.replace(/\s+/g, ' ');

const decimalOf = (lang: Lang) => new Intl.NumberFormat(CATALOGUES[lang].meta.numberLocale).formatToParts(1.5).find((p) => p.type === 'decimal')!.value;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A text with each date written in its language's long form, as Intl writes
 * it («19 de noviembre de 2026», «November 19, 2026», «2026年11月19日»),
 * turned into one mark of its day («⟦date:2026-11-19⟧»): a translation's date
 * is compared whole, whatever the order and the month names of its language.
 */
function markDates(text: string, lang: Lang) {
  const format = new Intl.DateTimeFormat(CATALOGUES[lang].meta.numberLocale, { dateStyle: 'long', timeZone: 'UTC' });
  const months = Array.from({ length: 12 }, (_, m) => format.formatToParts(Date.UTC(2000, m, 1)).find((p) => p.type === 'month')!.value);
  // Longest first, so «1» never stands for the start of «11».
  const monthNames = [...months].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const source = format
    .formatToParts(Date.UTC(2000, 0, 1))
    .map(({ type, value }) => (type === 'day' ? '(?<day>\\d{1,2})' : type === 'year' ? '(?<year>\\d{4})' : type === 'month' ? `(?<month>${monthNames})` : escapeRegExp(value).replace(/\s+/g, '\\s+')))
    .join('');
  return text.replace(new RegExp(source, 'g'), (...args) => {
    const { day, month, year } = args.at(-1) as Record<'day' | 'month' | 'year', string>;
    return ` ⟦date:${year}-${String(months.indexOf(month) + 1).padStart(2, '0')}-${day.padStart(2, '0')}⟧ `;
  });
}

/**
 * The facts a page writes with its kit (in probe mode, createKit: numbers,
 * measures, paper and photo names), the dates it writes out, and the numbers
 * typed by hand, read with the language's decimal separator. Interface names
 * are words: left out.
 */
function numbersOf(page: SitePage) {
  // A legal document's bold terms name the interface («Atajos de 1 tecla», «Single-key shortcuts»): words too.
  let body = page.kind === 'legal' ? page.body.replace(/<strong>[\s\S]*?<\/strong>/g, ' ') : page.body;
  // A text in another language (a license text, in English) is read as that language writes numbers.
  const foreign = /<div class="doc-lang" lang="([\w-]+)">([\s\S]*)<\/div>$/.exec(body);
  if (foreign) body = body.slice(0, foreign.index);
  const text = markDates(textOf([page.title, page.description, page.h1, page.crumb, body, ...(page.faq ?? []).flatMap(({ q, a }) => [q, a])].join(' \n ')), page.lang);
  const facts = [...new Set((text.match(PROBE) ?? []).filter((mark) => !mark.startsWith('⟦ui:')))].sort();
  const typed = [...new Set([...typedNumbers(text.replace(PROBE, ' '), page.lang), ...(foreign ? typedNumbers(textOf(foreign[2]), foreign[1] as Lang) : [])])].sort();
  return { facts, typed };
}

/** The numbers typed in a text, read with the decimal separator of `lang`; versions («1.0.0») as they are. */
function typedNumbers(text: string, lang: Lang) {
  const rest = text.replace(/\b\d+\.\d+\.\d+\b/g, (version) => ` v${version} `);
  const decimal = decimalOf(lang);
  const number = new RegExp(`(?<![A-Za-z\\d_.,v])\\d+(?:${decimal === '.' ? '\\.' : decimal}\\d+)?`, 'g');
  return [...(rest.match(number) ?? []).map((n) => String(Number(n.replace(decimal, '.')))), ...(rest.match(/v\d+\.\d+\.\d+/g) ?? [])];
}

/** A number in a table cell, whatever the language writes it with. */
const cellNumber = (text: string, lang: Lang) => Number(text.replace(/\s/g, '').replace(decimalOf(lang), '.'));

/**
 * What must be the same in every language's version of a page: its kind,
 * scripts and whether it is indexed; the order of its blocks (headings, steps
 * and their count, tables and their size, notes, figures, the calculator, the
 * buttons, the questions); the numbers of its tables; what its figures draw;
 * where its links go (the editor's set up the same way, the site's to the
 * same page); and its external links and placeholders.
 */
function structureOf(page: SitePage, html: string) {
  const d = parse(html);
  const main = d.querySelector('main')!;
  const blocks: string[] = [];
  const walk = (parent: Element) => {
    for (const el of parent.children) {
      const tag = el.tagName.toLowerCase();
      let block: string | null = tag;
      if (el.matches('nav.crumbs, h1, script')) block = null;
      else if (el.matches('div.doc-lang')) {
        walk(el);
        block = null;
      } else if (el.matches('p.lead')) block = 'lead';
      else if (el.matches('p.note')) block = 'note';
      else if (el.matches('div.ctas')) block = `buttons(${el.children.length})`;
      else if (el.matches('div.table-wrap')) block = `table(${el.querySelectorAll('tr').length}×${el.querySelector('tr')!.children.length})`;
      else if (el.matches('ol.steps')) block = `steps(${el.children.length})`;
      else if (el.matches('ol, ul')) block = `${tag}(${el.children.length})`;
      else if (el.matches('section.calc')) block = 'calculator';
      else if (el.matches('section.faq')) block = `questions(${el.querySelectorAll('h3').length})`;
      if (block && !(block === 'p' && blocks.at(-1) === 'p')) blocks.push(block);
    }
  };
  walk(main);
  const target = (href: string) => {
    if (href === '/' || href.startsWith('/?')) return href;
    const to = byPath.get(href.split('#')[0]);
    return to ? `${to.id} (${to.lang === page.lang ? 'same language' : to.lang})` : `missing ${href}`;
  };
  return {
    kind: page.kind,
    indexable: page.indexable,
    scripts: page.scripts ?? [],
    blocks,
    tables: [...main.querySelectorAll('table')].map((t) => [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td.num')].map((td) => cellNumber(td.textContent!, page.lang)))),
    figures: [...main.querySelectorAll('svg')].map((svg) => svg.outerHTML.replace(/ aria-label="[^"]*"/, '')),
    editorLinks: [...main.querySelectorAll('a[href^="/?"]')].map((a) => a.getAttribute('href')),
    // A link that says another language (a translation's link to the Spanish reference) is the translation's own.
    siteLinks: [...main.querySelectorAll('a[href^="/"]:not([href^="/?"]):not([hreflang])')].map((a) => target(a.getAttribute('href')!)).sort(),
    externalLinks: [...main.querySelectorAll('a[href^="http"], a[href^="mailto:"]')].map((a) => a.getAttribute('href')).sort(),
    placeholders: [...new Set(main.textContent!.match(/<[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ /]*[A-ZÁÉÍÓÚÑ]>/g) ?? [])].sort(),
  };
}

const calcTextsOf = (page: SitePage) => JSON.parse(doc(page).getElementById('calc-texts')!.textContent!) as CalcTexts;

/** The calculator's form: every field with its name, type, limits and first value, and every option. */
const formOf = (page: SitePage) =>
  [...doc(page).querySelectorAll('#calc :is(input, select)')].map((el) => ({
    id: el.id,
    name: el.getAttribute('name'),
    type: el.getAttribute('type'),
    limits: ['min', 'max', 'step', 'value'].map((a) => el.getAttribute(a)),
    checked: el.hasAttribute('checked'),
    hidden: el.closest('[hidden]') !== null,
    options: [...el.querySelectorAll('option')].map((o) => [o.getAttribute('value'), o.hasAttribute('selected')]),
  }));

/** The parameters a calculator text takes («{n}», «{paper}»), by text. */
const placeholdersOf = (texts: CalcTexts) =>
  Object.fromEntries(
    Object.entries(texts)
      .filter(([key]) => !['locale', 'max', 'papers', 'photos'].includes(key))
      .flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : Object.entries(value as Record<string, string>).map(([form, text]) => [`${key}.${form}`, text])))
      .map(([key, text]) => [key, [...new Set(text.match(/\{\w+\}/g) ?? [])].sort()])
  );

/** Forms that put the packer's limits to work: other papers and orientations, custom sizes, none fitting, the cap. */
const CALC_CASES: CalcState[] = [
  CALC_START,
  { ...CALC_START, paper: 'letter', photo: 'passport-35x45' },
  { ...CALC_START, paper: 'A3', landscape: true, photo: 'instant', rotate: false },
  { ...CALC_START, photo: 'custom', w: 25, h: 30, margin: 0, gap: 0 },
  { ...CALC_START, photo: 'custom', w: 300, h: 400 },
  { ...CALC_START, photo: 'custom', w: 5, h: 5, margin: 0, gap: 0 },
  { ...CALC_START, paper: 'photo-10x15', photo: 'visa-5x5', margin: 2.5, gap: 1.5 },
];

const behaviourOf = (texts: CalcTexts) =>
  CALC_CASES.map((state) => {
    const { count, capped, grid, href, svg } = calc(state, texts);
    return { count, capped, grid, href, svg: svg.replace(/ aria-label="[^"]*"/, '') };
  });

describe('a translation is the Spanish page in other words', () => {
  test('every page of another language has a Spanish version', () => {
    for (const { page, es } of translated) expect(es, page.path).toBeDefined();
  });

  test.each(translated.map((t) => [t.page.path, t]))('%s: the same blocks, tables, figures and links as the Spanish page', (_, { page, es }) => {
    expect(structureOf(page, files.get(pageFile(page))!)).toEqual(structureOf(es, files.get(pageFile(es))!));
  });

  test.each(translated.map((t) => [t.page.path, t]))('%s: the same facts and the same numbers typed by hand as the Spanish page', (_, { id, lang }) => {
    expect(numbersOf(versionOf(probes, id, lang)!)).toEqual(numbersOf(versionOf(probes, id, 'es')!));
  });

  test.each(translated.filter((t) => t.id === 'how-many').map((t) => [t.page.path, t]))('%s: the calculator has the same form, texts with the same parameters, and the same answers', (_, { page, es }) => {
    expect(formOf(page)).toEqual(formOf(es));
    const [texts, spanish] = [calcTextsOf(page), calcTextsOf(es)];
    expect({ max: texts.max, papers: Object.keys(texts.papers), photos: Object.keys(texts.photos) }).toEqual({ max: spanish.max, papers: Object.keys(spanish.papers), photos: Object.keys(spanish.photos) });
    expect(texts.locale).toBe(CATALOGUES[page.lang].meta.numberLocale);
    expect(placeholdersOf(texts)).toEqual(placeholdersOf(spanish));
    expect(behaviourOf(texts)).toEqual(behaviourOf(spanish));
  });
});

describe('the comparison of a translation with the Spanish page', () => {
  // A copy of a Spanish page with one thing changed must not compare equal.
  const page = versionOf(pages, 'photos-10x15', 'es')!;
  const probe = versionOf(probes, 'photos-10x15', 'es')!;
  const html = files.get(pageFile(page))!;
  const same = structureOf(page, html);

  test('finds a section that is missing', () => {
    expect(structureOf(page, html.replace(/<h2 id="cuántas-entran[\s\S]*?(?=<h2)/, ''))).not.toEqual(same);
  });

  test('finds a number of a table that changed', () => {
    expect(structureOf(page, html.replace(/(<td role="cell" data-label="[^"]*" class="num"><span>)3</, '$14<'))).not.toEqual(same);
  });

  test('finds a button that opens the editor set up otherwise', () => {
    expect(structureOf(page, html.replace('margin=3', 'margin=4'))).not.toEqual(same);
  });

  test('finds a fact left out, and a number typed by hand that changed', () => {
    const numbers = numbersOf(probe);
    expect(numbersOf({ ...probe, body: probe.body.replaceAll('⟦mm:10⟧', '') })).not.toEqual(numbers);
    expect(numbersOf({ ...probe, faq: probe.faq!.map((q) => ({ ...q, q: q.q.replace('4 ', '5 ') })) })).not.toEqual(numbers);
  });

  test('reads a date in each language’s long form as that day, and finds a date that changed', () => {
    const written: Partial<Record<Lang, string>> = { es: '19 de noviembre de 2026', en: 'November 19, 2026', 'zh-Hans': '2026年11月19日', hi: '19 नवंबर 2026', fr: '19 novembre 2026' };
    for (const { lang } of SITE_LANGUAGES) expect(markDates(`(${written[lang]})`, lang), lang).toBe('( ⟦date:2026-11-19⟧ )');
    const privacy = versionOf(probes, 'legal-privacy', 'es')!;
    expect(numbersOf({ ...privacy, body: privacy.body.replace('19 de noviembre', '20 de noviembre') })).not.toEqual(numbersOf(privacy));
  });
});
