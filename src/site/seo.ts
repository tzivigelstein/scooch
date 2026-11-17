// What search engines and AI assistants read besides the pages' text:
// structured data (JSON-LD), share tags, hreflang links, the sitemap,
// robots.txt and llms.txt.

import { APP_NAME } from '../config.ts';
import { esc, plainText } from './html.ts';
import { DEFAULT_LANGS, hreflangOf } from './langs.ts';
import type { FaqItem, SitePage } from './types.ts';

/** The image shown when a page is shared (src/site/share.png). */
export const SHARE_IMAGE = Object.freeze({ path: '/share.png', width: 1200, height: 630 });

const SCHEMA = 'https://schema.org';

export interface Alternate {
  hreflang: string;
  path: string;
}

/**
 * The hreflang links of a page: its indexable versions in every language,
 * and x-default. None while it exists in one language only.
 */
export function alternates(page: Pick<SitePage, 'id' | 'indexable'>, pages: readonly SitePage[]): Alternate[] {
  if (!page.indexable) return [];
  const versions = pages.filter((p) => p.id === page.id && p.indexable);
  if (versions.length < 2) return [];
  const links: Alternate[] = versions.map((p) => ({ hreflang: hreflangOf(p.lang), path: p.path }));
  const fallback = DEFAULT_LANGS.map((lang) => versions.find((p) => p.lang === lang)).find((p) => p !== undefined);
  if (fallback) links.push({ hreflang: 'x-default', path: fallback.path });
  return links;
}

export const breadcrumbLd = (url: string, items: readonly { name: string; path: string }[]) => ({
  '@context': SCHEMA,
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: `${url}${item.path}` })),
});

/** Only for questions the page shows. */
export const faqLd = (faq: readonly FaqItem[]) => ({
  '@context': SCHEMA,
  '@type': 'FAQPage',
  mainEntity: faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: plainText(a) } })),
});

export interface AppFacts {
  lang: string;
  description: string;
  requirements: string;
  features: readonly string[];
}

/** The tool itself (on the editor's page). Free: a price of 0; no ratings or reviews, there are none. */
export const webAppLd = (url: string, facts: AppFacts) => ({
  '@context': SCHEMA,
  '@type': 'WebApplication',
  name: APP_NAME,
  url: `${url}/`,
  description: facts.description,
  inLanguage: facts.lang,
  applicationCategory: 'DesignApplication',
  operatingSystem: 'Any',
  browserRequirements: facts.requirements,
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: facts.features,
  image: `${url}${SHARE_IMAGE.path}`,
});

/** Open Graph and Twitter tags of a page, as [attribute, name, content]. */
export function shareTags(url: string, { title, description, path, imageAlt }: { title: string; description: string; path: string; imageAlt: string }) {
  return [
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', APP_NAME],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:url', `${url}${path}`],
    ['property', 'og:image', `${url}${SHARE_IMAGE.path}`],
    ['property', 'og:image:width', String(SHARE_IMAGE.width)],
    ['property', 'og:image:height', String(SHARE_IMAGE.height)],
    ['property', 'og:image:alt', imageAlt],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', `${url}${SHARE_IMAGE.path}`],
    ['name', 'twitter:image:alt', imageAlt],
  ] as const;
}

/** The sitemap: the editor and every indexable page, with their hreflang versions. */
export function sitemapXml(url: string, pages: readonly SitePage[]) {
  const listed = pages.filter((p) => p.indexable);
  const entries = [{ path: '/', links: [] as Alternate[] }, ...listed.map((p) => ({ path: p.path, links: alternates(p, pages) }))];
  const xhtml = entries.some((e) => e.links.length) ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : '';
  const body = entries
    .map((e) => {
      const links = e.links.map((l) => `\n    <xhtml:link rel="alternate" hreflang="${esc(l.hreflang)}" href="${esc(`${url}${l.path}`)}"/>`).join('');
      return `  <url>\n    <loc>${esc(`${url}${e.path}`)}</loc>${links}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xhtml}>\n${body}\n</urlset>\n`;
}

/** Every crawler may read everything, AI assistants included: nothing on the site is private (files never leave the browser). */
export const robotsTxt = (url: string) =>
  `# Search engines and AI assistants (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…)\n# may read every page: nothing here is private, people's files never leave their browser.\nUser-agent: *\nAllow: /\n\nSitemap: ${url}/sitemap.xml\n`;

export interface LlmsSection {
  title: string;
  links: readonly { title: string; path: string; note?: string }[];
}

/** llms.txt (llmstxt.org): what the site is, in a few lines, and its pages by section. */
export function llmsTxt(url: string, { summary, facts, sections }: { summary: string; facts: readonly string[]; sections: readonly LlmsSection[] }) {
  const lines = [`# ${APP_NAME}`, '', `> ${summary}`, '', ...facts.map((f) => `- ${f}`)];
  for (const section of sections) {
    if (!section.links.length) continue;
    lines.push('', `## ${section.title}`, '');
    for (const l of section.links) lines.push(`- [${l.title}](${url}${l.path})${l.note ? `: ${l.note}` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}
