// The addresses of the French pages, with the words people search for
// (docs/site.md), without accents. Changing one breaks every link to it, and
// search engines may have it: add a redirect in vercel.json.

import type { PageId } from '../../types.ts';

export const PATHS: Readonly<Record<PageId, string>> = Object.freeze({
  'several-photos': '/fr/imprimer-plusieurs-photos-sur-une-feuille',
  'how-many': '/fr/combien-de-photos-sur-une-feuille',
  'photos-10x15': '/fr/imprimer-photos-10x15-sur-a4',
  'id-photos': '/fr/photo-identite-a-imprimer',
  'same-photo': '/fr/imprimer-plusieurs-fois-la-meme-photo',
  'actual-size': '/fr/imprimer-image-taille-reelle',
  stickers: '/fr/faire-ses-stickers-soi-meme',
  faq: '/fr/questions-frequentes',
  'legal-terms': '/fr/conditions-utilisation',
  'legal-privacy': '/fr/confidentialite',
  'legal-notices': '/fr/licences-tierces',
  'legal-license': '/fr/licence',
});
