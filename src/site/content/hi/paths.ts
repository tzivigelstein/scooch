// The addresses of the Hindi pages (docs/site.md). In Latin letters, with the
// English words people in India type when they search this in Latin letters
// («multiple photos in one page print», «passport size photo a4 sheet»): the
// Hindi part of their Hinglish searches has no settled spelling (kaise /
// kese, karein / kare). Changing one breaks every link to it, and search
// engines may have it: add a redirect in vercel.json.

import type { PageId } from '../../types.ts';

export const PATHS: Readonly<Record<PageId, string>> = Object.freeze({
  'several-photos': '/hi/print-multiple-photos-in-one-page',
  'how-many': '/hi/how-many-photos-in-a4-sheet',
  'photos-10x15': '/hi/print-4x6-photos-on-a4',
  'id-photos': '/hi/passport-size-photo-a4-sheet',
  'same-photo': '/hi/print-same-photo-multiple-times',
  'actual-size': '/hi/print-image-actual-size-in-cm',
  stickers: '/hi/print-stickers-at-home',
  faq: '/hi/faq',
  'legal-terms': '/hi/terms',
  'legal-privacy': '/hi/privacy',
  'legal-notices': '/hi/third-party-licenses',
  'legal-license': '/hi/license',
});
