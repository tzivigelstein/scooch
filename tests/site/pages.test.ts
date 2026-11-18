// @vitest-environment jsdom
// Every page of the site as the build writes it (siteFiles), parsed: what
// search engines read, the links that open the editor, and the copy rules
// that can be checked by machine, in every language. What differs between
// languages is checked in tests/site/languages.test.ts, and the build's own
// output in e2e/specs/site-pages.spec.ts.
import { describe, expect, test } from 'vitest';
import { PHOTO_SIZES } from '../../src/core/crop.js';
import { deepLinkSearch, parseDeepLink, setsUp } from '../../src/core/deeplink.js';
import { SITE_LANGUAGES } from '../../src/site/content/index.ts';
import { createKit } from '../../src/site/kit.ts';
import type { Lang } from '../../src/site/langs.ts';
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
const language = (lang: Lang) => SITE_LANGUAGES.find((l) => l.lang === lang)!;

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

  test('every guide of a language is in the footer of each of its pages, and so are its legal pages', () => {
    for (const page of pages) {
      const { paths } = language(page.lang);
      const guides = pages.filter((p) => p.lang === page.lang && (p.kind === 'guide' || p.kind === 'faq')).map((p) => p.path);
      const links = [...doc(page).querySelectorAll('footer a')].map((a) => a.getAttribute('href'));
      expect(links, page.path).toEqual(expect.arrayContaining([...guides, paths['legal-terms'], paths['legal-privacy'], paths['legal-notices'], paths['legal-license']]));
    }
  });

  test('every link to another page of the site goes to one that exists, and every link within a page to a heading it has', () => {
    const paths = new Set(['/', ...pages.map((p) => p.path)]);
    for (const page of pages) {
      const d = doc(page);
      for (const a of d.querySelectorAll('a[href^="/"]')) {
        const href = a.getAttribute('href')!;
        if (href.startsWith('/?')) continue;
        expect(paths, `${page.path} links to ${href}`).toContain(href.split('#')[0]);
      }
      for (const a of d.querySelectorAll('a[href^="#"]')) expect(d.getElementById(decodeURIComponent(a.getAttribute('href')!.slice(1))), `${page.path} links to ${a.getAttribute('href')}`).not.toBeNull();
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

/**
 * Words that would call a document photo size the usual one, or name a
 * country, in each language: the photo ID guide makes no such claim (the
 * office that asks for the photo says which size). A new language adds its own.
 */
const NO_CLAIMS: Partial<Record<Lang, RegExp>> = {
  es: /habitual|usual|Argentina|México|España|Estados Unidos|EE\.\s?UU\.|India|Colombia|Chile|Perú|Schengen/i,
  en: /\b(usual|typical|standard|common|United States|U\.S\.|USA?|American|India|Indian|UK|British|Canada|Mexico|Schengen|EU)\b/i,
  // «身份证» is the mainland identity card: naming it would tie a size to a country's document.
  'zh-Hans': /通常|常用|常见(?!问题)|标准|一般|普遍|中国|大陆|内地|国内|香港|澳门|台湾|美国|英国|印度|加拿大|墨西哥|西班牙|欧盟|申根|身份证/,
  // \b would split words at accented letters: whole words are told by \p{L}. «US» alone is the app's «Lettre US».
  fr: /(?<!\p{L})(habituel\p{L}*|usuel\p{L}*|courante?s?|typiques?|standards?|normes?|officiel\p{L}*|France|français\p{L}*|Belgique|belges?|Suisse|suisses?|Canada|canadien\p{L}*|Québec|ANTS|Schengen|UE|USA|États-Unis|américain\p{L}*|europé\p{L}*)(?!\p{L})/iu,
};

describe('the photo ID guide', () => {
  test.each(SITE_LANGUAGES.map((l) => [l.lang]))('%s: its table lists exactly the app’s document photo sizes, and no size is called the usual one or tied to a country', (lang) => {
    const page = pages.find((p) => p.id === 'id-photos' && p.lang === lang)!;
    const { photoName } = createKit(language(lang));
    const d = doc(page);
    expect([...d.querySelectorAll('tbody th')].map((th) => th.textContent)).toEqual(PHOTO_SIZES.filter((s) => s.group === 'id').map((s) => photoName(s.id)));
    expect(NO_CLAIMS[lang], `NO_CLAIMS needs ${lang}’s words`).toBeDefined();
    expect(`${page.title} ${page.description} ${d.querySelector('main')!.textContent}`).not.toMatch(NO_CLAIMS[lang]!);
  });
});

describe('the files for crawlers', () => {
  test('the sitemap lists the editor and exactly the indexable pages, and no legal draft', () => {
    const locs = [...files.get('sitemap.xml')!.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([`${URL_}/`, ...pages.filter((p) => p.indexable).map((p) => `${URL_}${p.path}`)]);
    for (const { paths } of SITE_LANGUAGES) expect(locs).not.toContain(`${URL_}${paths['legal-terms']}`);
  });

  test('robots.txt lets every crawler read everything and points to the sitemap', () => {
    const robots = files.get('robots.txt')!;
    expect(robots).toMatch(/^User-agent: \*\nAllow: \/$/m);
    expect(robots).not.toMatch(/Disallow/);
    expect(robots).toContain(`Sitemap: ${URL_}/sitemap.xml`);
  });

  test('llms.txt says what the tool is and links every indexable guide and the questions, in every language', () => {
    const llms = files.get('llms.txt')!;
    expect(llms).toMatch(/^# Scooch\n\n> .+herramienta web gratuita/);
    for (const page of pages.filter((p) => p.indexable && p.kind !== 'legal')) expect(llms).toContain(`](${URL_}${page.path})`);
    for (const { paths } of SITE_LANGUAGES) expect(llms).not.toContain(paths['legal-terms']);
  });
});

/**
 * The copy rules of each language's guide (docs/copy.md, docs/copy/<lang>.md)
 * that a machine can check, on what its pages say. A new language adds its own.
 */
const COPY_RULES: Partial<Record<Lang, readonly (readonly [string, RegExp])[]>> = {
  es: [
    ['exclamations', /[!¡]/],
    ['voseo', /\b(podés|tenés|elegí|apretá|soltá|usás|hacé|mirá)\b/i],
    ['words the guide replaces', /\b(acá|achic\w*|apretar|clickea\w*|simplemente)\b/i],
    ['a number glued to its unit', /\d(mm|cm)\b/],
    ['a number and its unit that may break apart', /\d (mm|cm|ppp|%)(?![\w])/],
  ],
  en: [
    ['exclamations', /!/],
    ['straight quotes or guillemets instead of curly ones', /['"«»]/],
    ['a space before %', /\d\s%/],
    ['a number glued to its unit', /\d(mm|cm|in|ppi)\b/],
    ['a number and its unit that may break apart', /\d (mm|cm|in|ppi)\b/],
    ['words the glossary replaces', /\b(simply|just|please|pieces?|uploads?)\b/i],
  ],
  'zh-Hans': [
    ['exclamations', /[!！]/],
    ['straight quotes or guillemets instead of “ ”', /["'«»]/],
    ['half-width punctuation next to Chinese', /\p{Script=Han}[,.:;?()]|[,.:;?()]\p{Script=Han}/u],
    ['a space between Chinese and Latin letters or numbers', /\p{Script=Han}[  ][A-Za-z\d]|[A-Za-z\d][  ]\p{Script=Han}/u],
    ['a space before %', /\d\s%/],
    ['a number glued to its unit', /\d(mm|cm|in|ppi)\b/],
    ['a number and its unit that may break apart', /\d (mm|cm|in|ppi)\b/],
    // 页面 only for a PDF's page and the print dialog's “适合页面”; 复制 is copying to the clipboard.
    ['words the glossary replaces', /元素|对象|画布|磁铁|出血|复制|(?<!PDF|适合)页面/],
  ],
  // The no-break spaces are the catalogue's (src/copy/fr.ts): U+00A0 before «:» and inside « », U+202F before ; ? % and !.
  // Whole words are told by \p{L}: \b would split them at accented letters («prêtes»).
  fr: [
    ['exclamations', /!/],
    ['straight quotes or English quotes instead of « » and ’', /["“”'‘]/],
    ['a colon without a no-break space before it', /[^ ]:/],
    ['; ? or % without a narrow no-break space before it', /[^ ][;?%]/],
    ['guillemets without no-break spaces inside', /«[^ ]|[^ ]»/],
    ['a number glued to its unit', /\d(mm|cm|po|ppp)\b/],
    ['a number and its unit that may break apart', /\d (mm|cm|po|pouces|ppp)(?![\w])/],
    ['tutoiement instead of vous', /(?<!\p{L})(tu|toi|ton|tes)(?!\p{L})/iu],
    ['words the glossary replaces', /(?<!\p{L})(pièces?|objets?|téléverse\p{L}*|importe[rz]|astuces?|simplement|plan de travail)(?!\p{L})/iu],
  ],
};

describe('copy rules a machine can check', () => {
  test.each(SITE_LANGUAGES.map((l) => [l.lang]))('%s: every guide and the questions follow them', (lang) => {
    const rules = COPY_RULES[lang];
    expect(rules, `COPY_RULES needs ${lang}’s rules`).toBeDefined();
    for (const page of pages.filter((p) => p.lang === lang && p.kind !== 'legal')) {
      const body = doc(page).body;
      for (const script of body.querySelectorAll('script')) script.remove();
      const text = body.textContent!;
      for (const [rule, pattern] of rules!) expect(text, `${page.path}: ${rule}`).not.toMatch(pattern);
    }
  });
});
