// The addresses of the English pages, with the words people search for
// (docs/site.md). Changing one breaks every link to it, and search engines
// may have it: add a redirect in vercel.json.

import type { PageId } from '../../types.ts';

export const PATHS: Readonly<Record<PageId, string>> = Object.freeze({
  'several-photos': '/en/print-multiple-pictures-on-one-page',
  'how-many': '/en/how-many-photos-fit-on-a-page',
  'photos-10x15': '/en/print-4x6-photos-on-a4',
  'id-photos': '/en/print-passport-photos-at-home',
  'same-photo': '/en/print-same-picture-multiple-times',
  'actual-size': '/en/print-image-actual-size',
  faq: '/en/faq',
  'legal-terms': '/en/terms',
  'legal-privacy': '/en/privacy',
  'legal-notices': '/en/third-party-licenses',
  'legal-license': '/en/license',
});
