// The legal pages: the documents as they are written (see legal.ts), with a
// Spanish title and introduction for the two that are in English.

import { esc } from '../../html.ts';
import { app, ui } from '../../kit.ts';
import { legalLink, legalProblems, type LegalDoc, type LegalId } from '../../legal.ts';
import { headingId, renderMarkdown } from '../../markdown.ts';
import { LEGAL_PATHS } from '../../paths.ts';
import type { SitePage } from '../../types.ts';

const PAGES: Readonly<Record<LegalId, { h1: string; description: string; intro?: string }>> = {
  terms: {
    h1: ui('legal.terms'),
    description: `Las condiciones para usar ${app}, una herramienta web gratuita que acomoda imágenes y páginas de PDF en hojas a tamaño real.`,
  },
  privacy: {
    h1: ui('legal.privacy'),
    description: `Qué guarda ${app} en tu navegador, cómo borrarlo y qué datos técnicos recibe el alojamiento del sitio. Tus archivos no salen de tu dispositivo.`,
  },
  notices: {
    h1: 'Licencias de terceros',
    description: `Las bibliotecas y la fuente de terceros que incluye ${app}, con sus licencias y avisos de copyright.`,
    intro: `${app} incluye software de terceros, cada uno con su propia licencia. Este es el detalle, en inglés, como los textos de esas licencias.`,
  },
  license: {
    h1: 'Licencia del código',
    description: `El texto de la licencia PolyForm Noncommercial 1.0.0, bajo la que se publica el código fuente de ${app}.`,
    intro: `El código fuente de ${app} se publica bajo la licencia PolyForm Noncommercial 1.0.0. Este es su texto, en inglés; los <a href="${LEGAL_PATHS.terms}">${esc(ui('legal.terms'))}</a> explican qué permite.`,
  },
};

export function legalPage(doc: LegalDoc): SitePage {
  const page = PAGES[doc.id];
  const english = !!page.intro;
  // In English, the document's own title stays, one level down from the page's.
  const html = renderMarkdown(doc.markdown, { link: legalLink, shift: english ? 1 : 0 });
  const body = english
    ? `<p class="lead">${page.intro}</p>\n<div class="doc-lang" lang="en">${doc.title ? `<h2 id="${esc(headingId(doc.title))}">${esc(doc.title)}</h2>` : ''}\n${html}</div>`
    : html;
  return {
    id: `legal-${doc.id}`,
    lang: 'es',
    path: LEGAL_PATHS[doc.id],
    title: `${page.h1} · ${app}`,
    description: page.description,
    h1: page.h1,
    crumb: page.h1,
    kind: 'legal',
    // Search engines get the terms and the policy once they are final; the license texts never (they are in English, and not about the tool).
    indexable: !english && legalProblems(doc).length === 0,
    body,
  };
}
