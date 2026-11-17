// A legal page: its document as it is written (legal.ts), with the page's
// own words in its language: title, description and, for the license texts
// (in English whatever the page's language), an introduction.

import { esc } from './html.ts';
import { app } from './kit.ts';
import { legalLink, legalProblems, legalTextLang, type LegalDoc, type LegalId } from './legal.ts';
import { headingId, renderMarkdown } from './markdown.ts';
import type { SitePage } from './types.ts';

export interface LegalPageTexts {
  h1: string;
  description: string;
  /** Before a license text: what it is (HTML). */
  intro?: string;
}

/** `paths`: the addresses of the legal pages in the document's language. */
export function legalPage(doc: LegalDoc, texts: LegalPageTexts, paths: Readonly<Record<LegalId, string>>): SitePage {
  const licenseText = doc.id === 'notices' || doc.id === 'license';
  const foreign = legalTextLang(doc.lang, doc.id) !== doc.lang;
  // A license text keeps its own title, one level down from the page's.
  const html = renderMarkdown(doc.markdown, { link: (href) => legalLink(href, doc, paths), shift: licenseText ? 1 : 0 });
  const body = licenseText
    ? `<p class="lead">${texts.intro ?? ''}</p>\n<div class="doc-lang"${foreign ? ' lang="en"' : ''}>${doc.title ? `<h2 id="${esc(headingId(doc.title))}">${esc(doc.title)}</h2>` : ''}\n${html}</div>`
    : html;
  return {
    id: `legal-${doc.id}`,
    lang: doc.lang,
    path: paths[doc.id],
    title: `${texts.h1} · ${app}`,
    description: texts.description,
    h1: texts.h1,
    crumb: texts.h1,
    kind: 'legal',
    // Search engines get the terms and the policy once they are final; the license texts never (they are not about the tool).
    indexable: !licenseText && legalProblems(doc).length === 0,
    body,
  };
}
