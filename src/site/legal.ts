// The legal documents the site publishes, as they are written: the terms and
// the privacy policy (docs/legal/terminos.md and privacidad.md, the
// reference, and a translation of each in docs/legal/<lang>/terms.md and
// privacy.md), LICENSE and THIRD_PARTY_NOTICES.md (English, the same file in
// every language). Publishing only drops what is for whoever edits them
// (comments, the privacy policy's reminder for when analytics are added, the
// notices' «How to update this file») and points their links to each other at
// the pages. Placeholders and the draft note stay visible: they keep a page
// out of search engines, and stop a release (see config.ts).

import type { Lang } from './langs.ts';
import { findPlaceholders, stripComments, type MarkdownLink } from './markdown.ts';
import { LEGAL_PATHS } from './paths.ts';

export type LegalId = keyof typeof LEGAL_PATHS;

export const LEGAL_IDS = Object.freeze(Object.keys(LEGAL_PATHS) as LegalId[]);

/** The words of a language's documents that publishing looks for. */
export interface LegalMarkers {
  /** How the draft note starts: «_Borrador.», «_Draft.». */
  draft: string;
  /** The privacy policy's analytics heading («Analítica»)… */
  analytics: string;
  /** …and the word its reminder starts with («PENDIENTE»): while the section only holds the reminder, it is left out. */
  pending: string;
}

/** The file a document is read from, relative to the repository, for a language's pages. */
export function legalFile(lang: Lang, id: LegalId): string {
  if (id === 'notices') return 'THIRD_PARTY_NOTICES.md';
  if (id === 'license') return 'LICENSE';
  if (lang === 'es') return id === 'terms' ? 'docs/legal/terminos.md' : 'docs/legal/privacidad.md';
  return `docs/legal/${lang}/${id}.md`;
}

/** The language a document is written in: the license texts are in English whatever the page's language. */
export const legalTextLang = (lang: Lang, id: LegalId): Lang => (id === 'notices' || id === 'license' ? 'en' : lang);

export interface LegalDoc {
  id: LegalId;
  /** The language of the pages it is published in. */
  lang: Lang;
  file: string;
  /** The document's own title (its first «#» heading, taken out of `markdown`), or null. */
  title: string | null;
  /** What the page renders. */
  markdown: string;
  placeholders: string[];
  /** How its language's draft note starts. */
  draftMarker: string;
  /** It still has the draft note. */
  draftNote: boolean;
}

/** A path relative to the repository, from `href` relative to the file `from`. */
function resolveFile(from: string, href: string) {
  const parts = from.split('/').slice(0, -1);
  for (const part of href.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

/**
 * Where a link of a legal document goes on the site: another document's page
 * in the same language, or the Spanish reference (from a translation, said
 * with hreflang). A relative link to anything without a page is a mistake.
 * `paths`: the addresses of the legal pages of the document's language.
 */
export function legalLink(href: string, doc: Pick<LegalDoc, 'lang' | 'file'>, paths: Readonly<Record<LegalId, string>>): MarkdownLink {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [target, anchor] = href.split('#');
  const file = resolveFile(doc.file, target);
  const withAnchor = (page: string) => (anchor ? `${page}#${anchor}` : page);
  const own = LEGAL_IDS.find((id) => legalFile(doc.lang, id) === file);
  if (own) return withAnchor(paths[own]);
  const spanish = LEGAL_IDS.find((id) => legalFile('es', id) === file);
  if (spanish) return { href: withAnchor(LEGAL_PATHS[spanish]), hreflang: 'es' };
  throw new Error(`${doc.file} links to «${href}», which has no page on the site`);
}

/** The lines of `md` minus the section under the heading `title` (until the next heading of its level or above). */
function withoutSection(lines: string[], title: RegExp, keep: (section: string[]) => boolean = () => false) {
  const start = lines.findIndex((line) => title.test(line));
  if (start < 0) return lines;
  const level = /^#+/.exec(lines[start])![0].length;
  let end = start + 1;
  while (end < lines.length && !(/^#+\s/.test(lines[end]) && /^#+/.exec(lines[end])![0].length <= level)) end++;
  const section = lines.slice(start + 1, end);
  return keep(section) ? lines : [...lines.slice(0, start), ...lines.slice(end)];
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A document ready to publish from its text, for the pages of `lang`. */
export function publishLegal(id: LegalId, text: string, { lang, markers }: { lang: Lang; markers: LegalMarkers }): LegalDoc {
  let lines = stripComments(text).replace(/\r\n?/g, '\n').split('\n');
  if (id === 'privacy') {
    // The analytics section only says that there is none and what to write if
    // some is added: true today, and «Lo que no hacemos» already says it to the reader.
    const onlyTheNote = (section: string[]) => {
      const body = section.filter((line) => line.trim());
      return body.length > 0 && body.every((line) => line.startsWith('>')) && body.join(' ').includes(markers.pending);
    };
    lines = withoutSection(lines, new RegExp(`^#{2,}\\s+${escapeRegExp(markers.analytics)}\\s*$`), (section) => !onlyTheNote(section));
  }
  if (id === 'notices') lines = withoutSection(lines, /^##\s+How to update this file\s*$/);
  const first = lines.findIndex((line) => /^#\s/.test(line));
  const title = first >= 0 ? lines[first].replace(/^#\s+/, '').trim() : null;
  if (first >= 0) lines.splice(first, 1);
  const markdown = lines.join('\n').trim();
  return {
    id,
    lang,
    file: legalFile(lang, id),
    title,
    markdown,
    placeholders: findPlaceholders(markdown),
    draftMarker: markers.draft,
    draftNote: markdown.split(/\n\s*\n/).some((block) => block.trim().startsWith(markers.draft)),
  };
}

/** What stops publishing a document as it is (one sentence each). */
export function legalProblems(doc: LegalDoc): string[] {
  const problems: string[] = [];
  if (doc.placeholders.length) problems.push(`${doc.file} still has placeholders: ${doc.placeholders.join(', ')}`);
  if (doc.draftNote) problems.push(`${doc.file} still starts with the draft note («${doc.draftMarker} …_»)`);
  return problems;
}
