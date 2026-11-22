// The addresses of the Spanish pages (the legal ones are in src/site/paths.ts,
// which the translated legal pages link to as their reference). Changing one
// breaks every link to it, and search engines may have it: add a redirect in
// vercel.json.

import { LEGAL_PATHS } from '../../paths.ts';
import type { PageId } from '../../types.ts';

export const PATHS: Readonly<Record<PageId, string>> = Object.freeze({
  'several-photos': '/es/imprimir-varias-fotos-en-una-hoja',
  'how-many': '/es/cuantas-fotos-caben-en-una-hoja',
  'photos-10x15': '/es/fotos-10x15-en-hoja-a4',
  'id-photos': '/es/foto-carnet-para-imprimir',
  'same-photo': '/es/imprimir-misma-foto-varias-veces',
  'actual-size': '/es/imprimir-imagen-tamano-real',
  stickers: '/es/hacer-stickers-en-casa',
  faq: '/es/preguntas-frecuentes',
  'legal-terms': LEGAL_PATHS.terms,
  'legal-privacy': LEGAL_PATHS.privacy,
  'legal-notices': LEGAL_PATHS.notices,
  'legal-license': LEGAL_PATHS.license,
});
