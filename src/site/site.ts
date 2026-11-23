// The whole site from its sources: every page of every language as HTML, the
// sitemap, robots.txt and llms.txt, the editor's metadata, and what keeps it
// from being published as it is. Used by the Vite plugin (plugin.ts) and the tests.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { urlProblems, type Site } from './config.ts';
import { SITE_LANGUAGES } from './content/index.ts';
import { appFacts, llmsIntro } from './content/es/index.ts';
import { esc, scriptJson } from './html.ts';
import { createKit, type Kit } from './kit.ts';
import type { Lang } from './langs.ts';
import { LEGAL_IDS, legalFile, legalProblems, publishLegal, type LegalDoc } from './legal.ts';
import { renderPage } from './layout.ts';
import { llmsTxt, robotsTxt, shareTags, sitemapXml, webAppLd, type LlmsSection } from './seo.ts';
import type { PageAssets, SiteLanguage, SitePage } from './types.ts';

const languageOf = (lang: Lang) => SITE_LANGUAGES.find((l) => l.lang === lang)!;

/** The legal documents of every language, read from the repository at `root`; a translation that isn't there has no page. */
export function readLegal(root: string): LegalDoc[] {
  return SITE_LANGUAGES.flatMap(({ lang, legalMarkers }) =>
    LEGAL_IDS.flatMap((id) => {
      const file = resolve(root, legalFile(lang, id));
      return existsSync(file) ? [publishLegal(id, readFileSync(file, 'utf8'), { lang, markers: legalMarkers })] : [];
    })
  );
}

/** Each language's kit (`probe`: see createKit). */
export const siteKits = ({ probe = false } = {}) => new Map<Lang, Kit>(SITE_LANGUAGES.map((language) => [language.lang, createKit(language, { probe })]));

/** Every page, in every language that has content, Spanish first. */
export function sitePages(legal: readonly LegalDoc[], { probe = false } = {}): SitePage[] {
  const kits = siteKits({ probe });
  return SITE_LANGUAGES.flatMap((language: SiteLanguage) =>
    language.pages(
      kits.get(language.lang)!,
      legal.filter((doc) => doc.lang === language.lang)
    )
  );
}

/** The file a page is written to: «/es/x» → «es/x.html» (served at /es/x, see vercel.json). */
export const pageFile = (page: Pick<SitePage, 'path'>) => `${page.path.slice(1)}.html`;

/** Why the site can't be published as it is: the address and the legal texts (each once). */
export const publishProblems = (site: Site, legal: readonly LegalDoc[]) => [...new Set([...urlProblems(site), ...legal.flatMap(legalProblems)])];

/**
 * Every text file of the site: the pages (as .html), sitemap.xml, robots.txt
 * and llms.txt. `assets`: each page script's address, and Inter's faces with
 * where each file is served.
 */
export function siteFiles(site: Pick<Site, 'url'>, legal: readonly LegalDoc[], assets: PageAssets): Map<string, string> {
  const pages = sitePages(legal);
  const kits = siteKits();
  const chromes = new Map(SITE_LANGUAGES.map((language) => [language.lang, language.chrome(kits.get(language.lang)!)]));
  const files = new Map<string, string>();
  for (const page of pages) files.set(pageFile(page), renderPage(page, { url: site.url, pages, ...assets }, chromes.get(page.lang)!));
  files.set('sitemap.xml', sitemapXml(site.url, pages));
  files.set('robots.txt', robotsTxt(site.url));
  const intro = llmsIntro(kits.get('es')!);
  const sections = SITE_LANGUAGES.flatMap(({ lang, llms }): LlmsSection[] => {
    const indexed = (kind: SitePage['kind']) => pages.filter((p) => p.lang === lang && p.kind === kind && p.indexable).map((p) => ({ title: p.crumb, path: p.path, note: p.description }));
    return [
      { title: llms.guides, links: indexed('guide') },
      { title: llms.faq, links: indexed('faq') },
      { title: llms.legal, links: indexed('legal') },
    ];
  });
  files.set('llms.txt', llmsTxt(site.url, { summary: intro.summary, facts: intro.facts(site.url), sections }));
  return files;
}

/** What the editor's index.html gets in its <head>: canonical URL, share tags and the tool's structured data (in Spanish). */
export function editorHead(site: Pick<Site, 'url'>) {
  const k = siteKits().get('es')!;
  const title = k.ui('app.title');
  const description = k.ui('app.description');
  return [
    `<link rel="canonical" href="${esc(`${site.url}/`)}">`,
    ...shareTags(site.url, { title, description, path: '/', imageAlt: languageOf('es').chrome(k).imageAlt }).map(([attr, name, content]) => `<meta ${attr}="${name}" content="${esc(content)}">`),
    `<script type="application/ld+json">${scriptJson(webAppLd(site.url, appFacts(k)))}</script>`,
  ];
}
