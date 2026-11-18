// The Hindi pages, in the order the footer lists the guides: the same pages as
// the Spanish ones, in other words (tests/site/languages.test.ts).

import type { SiteLanguage } from '../../types.ts';
import { actualSize } from './actual-size.ts';
import { chrome, llmsSections } from './chrome.ts';
import { faqPage } from './faq.ts';
import { howMany } from './how-many.ts';
import { idPhotos } from './id-photos.ts';
import { LEGAL_MARKERS, legalPage } from './legal.ts';
import { PATHS } from './paths.ts';
import { tenByFifteen } from './photos-10x15.ts';
import { samePhoto } from './same-photo.ts';
import { severalPhotos } from './several-photos.ts';

// Measures as the app's Hindi names write photo sizes («आईडी 4 × 4 सेमी», «4 × 6 इंच»); millimeters as its fields do.
export const hi: SiteLanguage = {
  lang: 'hi',
  units: { mm: 'mm', cm: 'सेमी', in: 'इंच' },
  paths: PATHS,
  legalMarkers: LEGAL_MARKERS,
  chrome,
  llms: llmsSections,
  pages: (k, legal) => [severalPhotos(k), howMany(k), tenByFifteen(k), idPhotos(k), samePhoto(k), actualSize(k), faqPage(k), ...legal.map((doc) => legalPage(k, doc))],
};
