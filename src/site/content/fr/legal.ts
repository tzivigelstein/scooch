// The French legal pages: the terms and the privacy policy from their
// translations (docs/legal/fr, the Spanish versions being the reference), and
// the license texts, in English, with a French title and introduction.

import { app, type Kit } from '../../kit.ts';
import type { LegalDoc, LegalId, LegalMarkers } from '../../legal.ts';
import { legalPage as page, type LegalPageTexts } from '../../legal-page.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export const LEGAL_MARKERS: LegalMarkers = { draft: '_Brouillon.', analytics: 'Mesure d’audience', pending: 'À COMPLÉTER' };

const TEXTS: Readonly<Record<LegalId, LegalPageTexts>> = {
  terms: {
    h1: 'Conditions d’utilisation',
    description: `Les conditions d’utilisation de ${app}, un outil web gratuit qui dispose des images et des pages de PDF sur des feuilles en taille réelle.`,
  },
  privacy: {
    h1: 'Politique de confidentialité',
    description: `Ce que ${app} enregistre dans votre navigateur, comment l’effacer et ce que reçoit l’hébergeur du site. Vos fichiers ne quittent pas votre appareil.`,
  },
  notices: {
    h1: 'Licences tierces',
    description: `Les bibliothèques et la police de tiers incluses dans ${app}, avec leurs licences et leurs mentions de droits d’auteur.`,
    intro: `${app} inclut des logiciels tiers, chacun sous sa propre licence. En voici le détail, en anglais, comme les textes de ces licences.`,
  },
  license: {
    h1: 'Licence du code',
    description: `Le texte de la licence PolyForm Noncommercial 1.0.0, sous laquelle le code source de ${app} est publié.`,
    intro: `Le code source de ${app} est publié sous la licence PolyForm Noncommercial 1.0.0. En voici le texte, en anglais ; les <a href="${PATHS['legal-terms']}">conditions d’utilisation</a> expliquent ce qu’elle permet.`,
  },
};

const LEGAL = { terms: PATHS['legal-terms'], privacy: PATHS['legal-privacy'], notices: PATHS['legal-notices'], license: PATHS['legal-license'] };

export const legalPage = (_: Kit, doc: LegalDoc): SitePage => page(doc, TEXTS[doc.id], LEGAL);
