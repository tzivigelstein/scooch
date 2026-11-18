// The frame of the French pages and the sentences some of them share. Copy
// rules: docs/copy/fr.md (vous, no-break spaces as in src/copy/fr.ts).

import { CUSTOM_MAX, CUSTOM_MIN, PAPERS } from '../../../core/papers.js';
import { PHOTO_SIZES } from '../../../core/crop.js';
import { app, type Kit } from '../../kit.ts';
import type { Chrome } from '../../layout.ts';
import { PATHS } from './paths.ts';

// The app's French names for the legal pages say «(en espagnol)»: these pages aren't.
export const chrome = (_: Kit): Chrome => ({
  skip: 'Aller au contenu',
  open: `Ouvrir ${app}`,
  crumbs: 'Fil d’Ariane',
  guides: 'Guides',
  legal: 'Informations légales',
  languages: 'Langue',
  about: `${app} est gratuit, ne demande aucun compte et vos fichiers ne quittent pas votre navigateur.`,
  faq: 'Questions fréquentes',
  imageAlt: `${app} : des photos disposées sur une feuille en taille réelle`,
  legalLinks: [
    ['Conditions d’utilisation', PATHS['legal-terms']],
    ['Politique de confidentialité', PATHS['legal-privacy']],
    ['Licences tierces', PATHS['legal-notices']],
    ['Licence du code', PATHS['legal-license']],
  ],
});

const photoPapers = PAPERS.filter((p) => p.group === 'photo');
const otherPapers = PAPERS.filter((p) => p.group !== 'photo');

/** «A0, …, Tabloïd et du papier photo en 9 × 13, …» */
export const papersSentence = ({ paperName, list, num, mm }: Kit) =>
  `${otherPapers.map((p) => paperName(p.id)).join(', ')} et du papier photo en ${list(photoPapers.map((p) => paperName(p.id).replace(/^Photo /, '')))}, ainsi que des formats personnalisés de ${num(CUSTOM_MIN)} à ${mm(CUSTOM_MAX)} de côté`;

/** «9 × 13, 10 × 15, …, Visa 5 × 5 et Instantané» */
export const photoSizesSentence = ({ photoName, list }: Kit) => list(PHOTO_SIZES.map((s) => photoName(s.id)));

export const llmsSections = { guides: 'Guides en français', faq: 'Questions fréquentes en français', legal: 'Informations légales en français' };
