// The shapes of the site's pages and of a language's content.

import type { Kit, Units } from './kit.ts';
import type { Lang } from './langs.ts';
import type { Chrome } from './layout.ts';
import type { LegalDoc, LegalMarkers } from './legal.ts';

export interface FaqItem {
  q: string;
  /** HTML (links, emphasis). */
  a: string;
}

/** The pages every language may have; the same page in every language shares its id (hreflang). */
export const PAGE_IDS = Object.freeze([
  'several-photos',
  'how-many',
  'photos-10x15',
  'id-photos',
  'same-photo',
  'actual-size',
  'faq',
  'legal-terms',
  'legal-privacy',
  'legal-notices',
  'legal-license',
] as const);

export type PageId = (typeof PAGE_IDS)[number];

export interface SitePage {
  /** A PageId, or «not-found» for the error page. */
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
  /** Every page of the site, for the footer, the links between languages and the hreflang links. */
  pages: readonly SitePage[];
  /** Script name → its address. */
  scripts: Readonly<Record<string, string>>;
}

/**
 * A language's content (src/site/content/<lang>/index.ts): its pages, the
 * frame around them and the words publishing looks for. Registered in
 * src/site/content/index.ts; docs/site.md says how to add one.
 */
export interface SiteLanguage {
  lang: Lang;
  /** What its measures say after the numbers. */
  units: Units;
  /** The address of each of its pages: under pathPrefix(lang), lowercase. */
  paths: Readonly<Record<PageId, string>>;
  legalMarkers: LegalMarkers;
  /** The frame of its pages. */
  chrome: (k: Kit) => Chrome;
  /** The titles of its sections in llms.txt. */
  llms: { guides: string; faq: string; legal: string };
  /** Its pages, guides first in the order its footer lists them; `legal`: its legal documents. */
  pages: (k: Kit, legal: readonly LegalDoc[]) => SitePage[];
}
