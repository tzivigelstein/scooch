// The English legal pages: the terms and the privacy policy from their
// translations (docs/legal/en, the Spanish versions being the reference), and
// the license texts, which are in English already.

import { app, type Kit } from '../../kit.ts';
import type { LegalDoc, LegalId, LegalMarkers } from '../../legal.ts';
import { legalPage as page, type LegalPageTexts } from '../../legal-page.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export const LEGAL_MARKERS: LegalMarkers = { draft: '_Draft.', analytics: 'Analytics', pending: 'PENDING' };

const TEXTS: Readonly<Record<LegalId, LegalPageTexts>> = {
  terms: {
    h1: 'Terms of use',
    description: `The terms for using ${app}, a free web tool that arranges images and PDF pages on sheets of paper at actual size.`,
  },
  privacy: {
    h1: 'Privacy policy',
    description: `What ${app} stores in your browser, how to delete it, and what technical data the site’s hosting receives. Your files never leave your device.`,
  },
  notices: {
    h1: 'Third-party licenses',
    description: `The third-party libraries and font that ${app} includes, with their licenses and copyright notices.`,
    intro: `${app} includes third-party software, each piece with its own license. These are the details.`,
  },
  license: {
    h1: 'Code license',
    description: `The text of the PolyForm Noncommercial 1.0.0 license, under which the source code of ${app} is published.`,
    intro: `The source code of ${app} is published under the PolyForm Noncommercial 1.0.0 license. This is its text; the <a href="${PATHS['legal-terms']}">terms of use</a> explain what it allows.`,
  },
};

const LEGAL = { terms: PATHS['legal-terms'], privacy: PATHS['legal-privacy'], notices: PATHS['legal-notices'], license: PATHS['legal-license'] };

export const legalPage = (_: Kit, doc: LegalDoc): SitePage => page(doc, TEXTS[doc.id], LEGAL);
