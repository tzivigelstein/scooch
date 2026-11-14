// A guide page from its parts: the answer first (lead), the buttons that open
// the editor set up, then the sections and the questions.

import { esc } from './html.ts';
import type { Lang } from './langs.ts';
import { headingId } from './markdown.ts';
import type { FaqItem, SitePage } from './types.ts';

export interface Cta {
  label: string;
  href: string;
}

export interface GuideSpec {
  id: string;
  lang: Lang;
  /** «/es/…», without a trailing slash. */
  path: string;
  title: string;
  description: string;
  h1: string;
  crumb: string;
  /** The answer, in a sentence or two (HTML). */
  lead: string;
  /** The first one is the main action. */
  ctas: readonly Cta[];
  /** What goes right after the buttons (a figure, the calculator). */
  feature?: string;
  sections: readonly { h2: string; html: string }[];
  faq: readonly FaqItem[];
  scripts?: string[];
}

export const ctaLinks = (ctas: readonly Cta[]) =>
  ctas.length ? `<div class="ctas">${ctas.map((cta, i) => `<a class="btn ${i === 0 ? 'btn-primary' : 'btn-secondary'}" href="${esc(cta.href)}">${esc(cta.label)}</a>`).join('')}</div>` : '';

export function guide(spec: GuideSpec): SitePage {
  const sections = spec.sections.map((s) => `<h2 id="${esc(headingId(s.h2))}">${esc(s.h2)}</h2>${s.html}`).join('\n');
  return {
    id: spec.id,
    lang: spec.lang,
    path: spec.path,
    title: spec.title,
    description: spec.description,
    h1: spec.h1,
    crumb: spec.crumb,
    kind: 'guide',
    indexable: true,
    body: `<p class="lead">${spec.lead}</p>\n${ctaLinks(spec.ctas)}\n${spec.feature ?? ''}\n${sections}`,
    faq: [...spec.faq],
    scripts: spec.scripts,
  };
}
