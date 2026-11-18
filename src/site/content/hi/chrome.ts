// The frame of the Hindi pages and the sentences some of them share. Copy
// rules: docs/copy/hi.md (the app's terms, «।» at the end of a sentence,
// curly quotes around the names of buttons and options).

import { CUSTOM_MAX, CUSTOM_MIN, PAPERS } from '../../../core/papers.js';
import { PHOTO_SIZES } from '../../../core/crop.js';
import { app, type Kit } from '../../kit.ts';
import type { Chrome } from '../../layout.ts';
import { PATHS } from './paths.ts';

export const chrome = ({ ui }: Kit): Chrome => ({
  skip: 'मुख्य सामग्री पर जाएं',
  open: `${app} खोलें`,
  crumbs: 'आप यहां हैं',
  guides: 'गाइड',
  legal: 'कानूनी जानकारी',
  languages: 'भाषा',
  about: `${app} मुफ़्त है, इसके लिए अकाउंट नहीं चाहिए और आपकी फ़ाइलें ब्राउज़र से बाहर नहीं जातीं।`,
  faq: 'अक्सर पूछे जाने वाले सवाल',
  imageAlt: `${app}: असली आकार में एक शीट पर व्यवस्थित फ़ोटो`,
  legalLinks: [
    [ui('legal.terms'), PATHS['legal-terms']],
    [ui('legal.privacy'), PATHS['legal-privacy']],
    ['थर्ड-पार्टी लाइसेंस', PATHS['legal-notices']],
    ['कोड का लाइसेंस', PATHS['legal-license']],
  ],
});

/** A name of the app in curly quotes, as Hindi writes a button or an option inside a sentence: «“व्यवस्थित करें” दबाएं». */
export const q = (name: string) => `“${name}”`;

/** A photo size's name without its unit, as Hindi writes it before «फ़ोटो»: «4 × 6 इंच» → «4 × 6». */
export const bare = (name: string) => name.replace(/\s+इंच$/u, '');

/** The calculator's option for a size of one's own (how-many.ts), which the photo ID guide names too. */
export const CUSTOM_SIZE = 'दूसरा आकार';

const photoPapers = PAPERS.filter((p) => p.group === 'photo');
const otherPapers = PAPERS.filter((p) => p.group !== 'photo');

/** «A0, …, टैब्लॉइड, फ़ोटो पेपर (3.5 × 5 इंच, …) और हर तरफ़ … तक के कस्टम आकार» */
export const papersSentence = ({ paperName, num, mm }: Kit) =>
  `${otherPapers.map((p) => paperName(p.id)).join(', ')}, फ़ोटो पेपर (${photoPapers.map((p) => paperName(p.id).replace(/^फ़ोटो /u, '')).join(', ')}) और हर तरफ़ ${num(CUSTOM_MIN)} से ${mm(CUSTOM_MAX)} तक के कस्टम आकार`;

/** «3.5 × 5 इंच, 4 × 6 इंच, …, वीज़ा 2 × 2 इंच और इंस्टैंट» */
export const photoSizesSentence = ({ photoName, list }: Kit) => list(PHOTO_SIZES.map((s) => photoName(s.id)));

export const llmsSections = { guides: 'हिन्दी में गाइड', faq: 'हिन्दी में अक्सर पूछे जाने वाले सवाल', legal: 'हिन्दी में कानूनी जानकारी' };
