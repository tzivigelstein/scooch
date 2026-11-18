// The addresses of the Simplified Chinese pages: short English words, since
// people in mainland China search these tasks in characters, not in pinyin
// (docs/site.md). Changing one breaks every link to it, and search engines
// may have it: add a redirect in vercel.json.

import type { PageId } from '../../types.ts';

export const PATHS: Readonly<Record<PageId, string>> = Object.freeze({
  'several-photos': '/zh-hans/multiple-photos-on-one-sheet',
  'how-many': '/zh-hans/photos-per-sheet-calculator',
  'photos-10x15': '/zh-hans/6-inch-photos-on-a4',
  'id-photos': '/zh-hans/id-photo-layout',
  'same-photo': '/zh-hans/same-photo-multiple-copies',
  'actual-size': '/zh-hans/print-image-actual-size',
  faq: '/zh-hans/faq',
  'legal-terms': '/zh-hans/terms',
  'legal-privacy': '/zh-hans/privacy',
  'legal-notices': '/zh-hans/third-party-licenses',
  'legal-license': '/zh-hans/license',
});
