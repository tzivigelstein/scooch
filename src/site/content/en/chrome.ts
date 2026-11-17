// The frame of the English pages and the sentences some of them share. Copy
// rules: docs/copy/en.md (US English).

import { CUSTOM_MAX, CUSTOM_MIN, PAPERS } from '../../../core/papers.js';
import { PHOTO_SIZES } from '../../../core/crop.js';
import { app, type Kit } from '../../kit.ts';
import type { Chrome } from '../../layout.ts';
import { PATHS } from './paths.ts';

// The app's English names for the legal pages say «(in Spanish)»: these pages aren't.
export const chrome = (_: Kit): Chrome => ({
  skip: 'Skip to content',
  open: `Open ${app}`,
  crumbs: 'Breadcrumb',
  guides: 'Guides',
  legal: 'Legal',
  languages: 'Language',
  about: `${app} is free, needs no account, and your files never leave your browser.`,
  faq: 'Frequently asked questions',
  imageAlt: `${app}: photos arranged on a sheet at actual size`,
  legalLinks: [
    ['Terms of use', PATHS['legal-terms']],
    ['Privacy policy', PATHS['legal-privacy']],
    ['Third-party licenses', PATHS['legal-notices']],
    ['Code license', PATHS['legal-license']],
  ],
});

/** A photo size's name without its unit, as English writes it before «photos»: «4 × 6 in» → «4 × 6». */
export const bare = (name: string) => name.replace(/\s+in$/u, '');

const photoPapers = PAPERS.filter((p) => p.group === 'photo');
const otherPapers = PAPERS.filter((p) => p.group !== 'photo');

/** «A0, …, Tabloid and photo paper in 3.5 × 5 in, …» */
export const papersSentence = ({ paperName, list, num, mm }: Kit) =>
  `${otherPapers.map((p) => paperName(p.id)).join(', ')} and photo paper in ${list(photoPapers.map((p) => paperName(p.id).replace(/^Photo /, '')))}, plus custom sizes from ${num(CUSTOM_MIN)} to ${mm(CUSTOM_MAX)} per side`;

/** «3.5 × 5 in, 4 × 6 in, …, Visa 2 × 2 in and Instant» */
export const photoSizesSentence = ({ photoName, list }: Kit) => list(PHOTO_SIZES.map((s) => photoName(s.id)));

export const llmsSections = { guides: 'Guides in English', faq: 'Frequently asked questions in English', legal: 'Legal information in English' };
