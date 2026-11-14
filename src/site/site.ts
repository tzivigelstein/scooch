// The whole site from its sources: every page as HTML, the sitemap,
// robots.txt and llms.txt, the editor's metadata, and what keeps it from
// being published as it is. Used by the Vite plugin (plugin.ts) and the tests.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { t } from './copy.ts';
import { urlProblems, type Site } from './config.ts';
import * as es from './content/es/index.ts';
import { esc, scriptJson } from './html.ts';
import { LEGAL_FILES, legalProblems, publishLegal, type LegalDoc, type LegalId } from './legal.ts';
import { renderPage } from './layout.ts';
import { llmsTxt, robotsTxt, shareTags, sitemapXml, webAppLd } from './seo.ts';
import type { SitePage } from './types.ts';

/** The legal documents, read from the repository at `root`. */
export function readLegal(root: string): LegalDoc[] {
  return (Object.keys(LEGAL_FILES) as LegalId[]).map((id) => publishLegal(id, readFileSync(resolve(root, LEGAL_FILES[id]), 'utf8')));
}

/** Every page, in every language that has content. */
export const sitePages = (legal: readonly LegalDoc[]): SitePage[] => [...es.pages(legal)];

/** The file a page is written to: «/es/x» → «es/x.html» (served at /es/x, see vercel.json). */
export const pageFile = (page: Pick<SitePage, 'path'>) => `${page.path.slice(1)}.html`;

/** Why the site can't be published as it is: the address and the legal texts. */
export const publishProblems = (site: Site, legal: readonly LegalDoc[]) => [...urlProblems(site), ...legal.flatMap(legalProblems)];

/**
 * Every text file of the site: the pages (as .html), sitemap.xml, robots.txt
 * and llms.txt. `scripts`: each page script's address.
 */
export function siteFiles(site: Pick<Site, 'url'>, legal: readonly LegalDoc[], scripts: Readonly<Record<string, string>>): Map<string, string> {
  const pages = sitePages(legal);
  const files = new Map<string, string>();
  for (const page of pages) files.set(pageFile(page), renderPage(page, { url: site.url, pages, scripts }, es.chrome));
  files.set('sitemap.xml', sitemapXml(site.url, pages));
  files.set('robots.txt', robotsTxt(site.url));
  const indexed = (kind: SitePage['kind']) => pages.filter((p) => p.lang === 'es' && p.kind === kind && p.indexable).map((p) => ({ title: p.crumb, path: p.path, note: p.description }));
  files.set(
    'llms.txt',
    llmsTxt(site.url, {
      summary: es.llms.summary,
      facts: es.llms.facts(site.url),
      sections: [
        { title: es.llms.sections.guides, links: indexed('guide') },
        { title: es.llms.sections.faq, links: indexed('faq') },
        { title: es.llms.sections.legal, links: indexed('legal') },
      ],
    })
  );
  return files;
}

/** What the editor's index.html gets in its <head>: canonical URL, share tags and the tool's structured data. */
export function editorHead(site: Pick<Site, 'url'>) {
  const title = t('app.title');
  const description = t('app.description');
  return [
    `<link rel="canonical" href="${esc(`${site.url}/`)}">`,
    ...shareTags(site.url, { title, description, path: '/', imageAlt: es.chrome.imageAlt }).map(([attr, name, content]) => `<meta ${attr}="${name}" content="${esc(content)}">`),
    `<script type="application/ld+json">${scriptJson(webAppLd(site.url, es.appFacts))}</script>`,
  ];
}
