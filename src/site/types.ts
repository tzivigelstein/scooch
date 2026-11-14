// The shapes of the site's pages.

import type { Lang } from './langs.ts';

export interface FaqItem {
  q: string;
  /** HTML (links, emphasis). */
  a: string;
}

export interface SitePage {
  /** The same page in every language shares it (hreflang). */
  id: string;
  lang: Lang;
  /** «/es/imprimir-varias-fotos-en-una-hoja»: no trailing slash, as the canonical URL. */
  path: string;
  title: string;
  description: string;
  h1: string;
  /** Its name in the breadcrumb. */
  crumb: string;
  kind: 'guide' | 'faq' | 'legal' | 'error';
  /** Search engines may index it (it is in the sitemap, llms.txt and the hreflang links). */
  indexable: boolean;
  /** HTML after the <h1>. */
  body: string;
  /** Questions shown at the end of the page, also as FAQPage data. */
  faq?: FaqItem[];
  /** The scripts the page loads, by name ('calculator'). */
  scripts?: string[];
}

/** What rendering a page needs besides the page. */
export interface SiteContext {
  url: string;
  /** Every page of the site, for the footer and the hreflang links. */
  pages: readonly SitePage[];
  /** Script name → its address. */
  scripts: Readonly<Record<string, string>>;
}
