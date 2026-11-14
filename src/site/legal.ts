// The legal documents the site publishes, as they are written:
// docs/legal/terminos.md and privacidad.md, LICENSE and
// THIRD_PARTY_NOTICES.md. Publishing only drops what is for whoever edits
// them (comments, the privacy policy's reminder for when analytics are added,
// the notices' «How to update this file») and points their links to each
// other at the pages. Placeholders and the draft note stay visible: they
// keep a page out of search engines, and stop a release (see config.ts).

import { LEGAL_PATHS } from './paths.ts';
import { findPlaceholders, stripComments } from './markdown.ts';

export type LegalId = keyof typeof LEGAL_PATHS;

/** Each document and its file, relative to the repository. */
export const LEGAL_FILES: Readonly<Record<LegalId, string>> = Object.freeze({
  terms: 'docs/legal/terminos.md',
  privacy: 'docs/legal/privacidad.md',
  notices: 'THIRD_PARTY_NOTICES.md',
  license: 'LICENSE',
});

export interface LegalDoc {
  id: LegalId;
  file: string;
  /** The document's own title (its first «#» heading, taken out of `markdown`), or null. */
  title: string | null;
  /** What the page renders. */
  markdown: string;
  placeholders: string[];
  /** It still starts with «_Borrador. …_». */
  draftNote: boolean;
}

// What the documents link to, by file name: their pages.
const PAGES: Readonly<Record<string, string>> = {
  'terminos.md': LEGAL_PATHS.terms,
  'privacidad.md': LEGAL_PATHS.privacy,
  LICENSE: LEGAL_PATHS.license,
  'THIRD_PARTY_NOTICES.md': LEGAL_PATHS.notices,
};

/** Where a link of a legal document goes on the site. A relative link to anything without a page is a mistake. */
export function legalLink(href: string) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [file, anchor] = href.split('#');
  const page = PAGES[file.split('/').pop()!];
  if (!page) throw new Error(`A legal document links to «${href}», which has no page on the site`);
  return anchor ? `${page}#${anchor}` : page;
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

/** A document ready to publish from its text. */
export function publishLegal(id: LegalId, text: string): LegalDoc {
  let lines = stripComments(text).replace(/\r\n?/g, '\n').split('\n');
  if (id === 'privacy') {
    // «Analítica» only says that there is none and what to write if some is
    // added: true today, and «Lo que no hacemos» already says it to the reader.
    const onlyTheNote = (section: string[]) => {
      const body = section.filter((line) => line.trim());
      return body.length > 0 && body.every((line) => line.startsWith('>')) && body.join(' ').includes('PENDIENTE');
    };
    lines = withoutSection(lines, /^#{2,}\s+Analítica\s*$/, (section) => !onlyTheNote(section));
  }
  if (id === 'notices') lines = withoutSection(lines, /^##\s+How to update this file\s*$/);
  const first = lines.findIndex((line) => /^#\s/.test(line));
  const title = first >= 0 ? lines[first].replace(/^#\s+/, '').trim() : null;
  if (first >= 0) lines.splice(first, 1);
  const markdown = lines.join('\n').trim();
  return {
    id,
    file: LEGAL_FILES[id],
    title,
    markdown,
    placeholders: findPlaceholders(markdown),
    draftNote: markdown.split(/\n\s*\n/).some((block) => block.trim().startsWith('_Borrador.')),
  };
}

/** What stops publishing a document as it is (one sentence each). */
export function legalProblems(doc: LegalDoc): string[] {
  const problems: string[] = [];
  if (doc.placeholders.length) problems.push(`${doc.file} still has placeholders: ${doc.placeholders.join(', ')}`);
  if (doc.draftNote) problems.push(`${doc.file} still starts with the draft note («_Borrador. …_»)`);
  return problems;
}
