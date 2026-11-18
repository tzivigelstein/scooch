// The Hindi legal pages: the terms and the privacy policy from their
// translations (docs/legal/hi, the Spanish versions being the reference), and
// the license texts, in English, with a Hindi title and introduction.

import { esc } from '../../html.ts';
import { app, type Kit } from '../../kit.ts';
import type { LegalDoc, LegalId, LegalMarkers } from '../../legal.ts';
import { legalPage as page, type LegalPageTexts } from '../../legal-page.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

// «लंबित» (pending) starts the analytics reminder and appears nowhere else in the policy.
export const LEGAL_MARKERS: LegalMarkers = { draft: '_ड्राफ़्ट।', analytics: 'एनालिटिक्स', pending: 'लंबित' };

const texts = ({ ui }: Kit): Readonly<Record<LegalId, LegalPageTexts>> => ({
  terms: {
    h1: ui('legal.terms'),
    description: `${app} इस्तेमाल करने की शर्तें: एक मुफ़्त वेब टूल, जो इमेज और PDF के पेजों को शीटों पर असली आकार में व्यवस्थित करता है।`,
  },
  privacy: {
    h1: ui('legal.privacy'),
    description: `${app} आपके ब्राउज़र में क्या सेव करता है, उसे कैसे मिटाएं और साइट की होस्टिंग को कौन-सा तकनीकी डेटा मिलता है। आपकी फ़ाइलें डिवाइस से बाहर नहीं जातीं।`,
  },
  notices: {
    h1: 'थर्ड-पार्टी लाइसेंस',
    description: `${app} में शामिल थर्ड-पार्टी लाइब्रेरी और फ़ॉन्ट, उनके लाइसेंस और कॉपीराइट नोटिस के साथ।`,
    intro: `${app} में थर्ड-पार्टी सॉफ़्टवेयर शामिल है, और हर एक का अपना लाइसेंस है। नीचे इसका ब्योरा है, इन लाइसेंसों के टेक्स्ट की तरह अंग्रेज़ी में।`,
  },
  license: {
    h1: 'कोड का लाइसेंस',
    description: `PolyForm Noncommercial 1.0.0 लाइसेंस का टेक्स्ट, जिसके तहत ${app} का सोर्स कोड प्रकाशित किया जाता है।`,
    intro: `${app} का सोर्स कोड PolyForm Noncommercial 1.0.0 लाइसेंस के तहत प्रकाशित किया जाता है। नीचे इसका टेक्स्ट है, अंग्रेज़ी में; <a href="${PATHS['legal-terms']}">${esc(ui('legal.terms'))}</a> बताती हैं कि यह किन बातों की अनुमति देता है।`,
  },
});

const LEGAL = { terms: PATHS['legal-terms'], privacy: PATHS['legal-privacy'], notices: PATHS['legal-notices'], license: PATHS['legal-license'] };

export const legalPage = (k: Kit, doc: LegalDoc): SitePage => page(doc, texts(k)[doc.id], LEGAL);
