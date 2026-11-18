// «एक शीट में कितनी फ़ोटो आती हैं?»: the calculator (calc-form.ts, run again
// in the browser by calculator.ts) and reference tables.

import { PHOTO_SIZES } from '../../../core/crop.js';
import { PAPERS } from '../../../core/papers.js';
import type { CalcTexts } from '../../calc.ts';
import { calculatorHtml } from '../../calc-form.ts';
import { CALC_START, howManyFacts } from '../../facts/how-many.ts';
import { guide } from '../../guide.ts';
import { app, MAX_ITEMS, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { bare, CUSTOM_SIZE, q } from './chrome.ts';
import { PATHS } from './paths.ts';

// Hindi's «one» is 0 and 1 (Intl.PluralRules): «फ़ोटो» doesn't change, so both forms are the same.
export const calcTexts = ({ ui, paperName, photoName }: Kit): CalcTexts => ({
  locale: 'hi',
  max: MAX_ITEMS,
  papers: Object.fromEntries(PAPERS.map((p) => [p.id, paperName(p.id)])),
  photos: Object.fromEntries(PHOTO_SIZES.map((s) => [s.id, photoName(s.id)])),
  orientation: { portrait: ui('props.portrait'), landscape: ui('props.landscape') },
  count: { one: 'फ़ोटो प्रति शीट', other: 'फ़ोटो प्रति शीट', capped: '{n} से ज़्यादा' },
  photoPreset: '{name} ({size})',
  summary: '{paper} पर {photo}, {margin} मार्जिन और {gap} अंतराल के साथ',
  noRotate: `, ${q(ui('props.rotate'))} बंद`,
  noteNone: 'फ़ोटो शीट के प्रिंट होने वाले हिस्से में नहीं आती। मार्जिन कम करें या बड़ा कागज़ चुनें।',
  noteSame: {
    one: `अपनी फ़ोटो जोड़ें और उसे रखने के लिए ${q(ui('bar.arrange'))} दबाएं।`,
    other: `अपनी फ़ोटो जोड़ें और ${q(ui('props.fill'))} इस्तेमाल करें: यह एक बार में {n} कॉपियां रख देता है।`,
  },
  noteMore: `${q(ui('props.fill'))} {grid} फ़ोटो रखता है, सभी एक ही दिशा में। {n} तक पहुंचने के लिए फ़ोटो को तब तक डुप्लिकेट करें जब तक {n} न हो जाएं, फिर ${q(ui('bar.arrange'))} दबाएं: ${app} ज़रूरत के हिसाब से कुछ फ़ोटो घुमा देता है।`,
  noteCapped: 'एक प्रोजेक्ट में {max} आइटम तक हो सकते हैं।',
  figure: { one: 'एक {paper} शीट पर {n} फ़ोटो', other: 'एक {paper} शीट पर {n} फ़ोटो' },
});

export function howMany(k: Kit): SitePage {
  const { ui, num, mm, size, photoName, paperName } = k;
  const f = howManyFacts();
  const calculator = calculatorHtml(k, CALC_START, calcTexts(k), {
    name: 'कैलकुलेटर',
    custom: CUSTOM_SIZE,
    width: 'फ़ोटो की चौड़ाई, mm में',
    height: 'फ़ोटो की ऊंचाई, mm में',
    margin: `${ui('props.margin')}, mm में`,
    gap: `फ़ोटो के बीच ${ui('props.gap')}, mm में`,
    noscript: 'कैलकुलेटर के लिए JavaScript चाहिए। नीचे की टेबल में सबसे ज़्यादा इस्तेमाल होने वाले आकार हैं।',
    open: `इस शीट के साथ ${app} में खोलें`,
  });
  const fourBySix = bare(photoName('10x15'));

  return guide({
    id: 'how-many',
    lang: 'hi',
    path: PATHS['how-many'],
    title: `एक A4 शीट में कितनी फ़ोटो आती हैं? कैलकुलेटर · ${app}`,
    description: `देखें कि ${fourBySix}, आईडी, पासपोर्ट साइज़ या किसी दूसरे आकार की कितनी फ़ोटो आपके मार्जिन के साथ A4, ${paperName('letter')} या ${paperName('legal')} शीट में आती हैं, और शीट को एडिटर में खोलें।`,
    h1: 'एक शीट में कितनी फ़ोटो आती हैं?',
    crumb: 'एक शीट में कितनी फ़ोटो',
    lead: `कागज़, फ़ोटो का आकार, मार्जिन और अंतराल चुनें। कैलकुलेटर वही तरीका इस्तेमाल करता है जो ${app} का ${q(ui('bar.arrange'))} बटन करता है, इसलिए जो संख्या यहां दिखती है, वही आपको एडिटर में मिलेगी।`,
    ctas: [],
    feature: calculator,
    scripts: ['calculator'],
    sections: [
      {
        h2: 'ज़्यादा इस्तेमाल होने वाले कागज़ों पर फ़ोटो प्रति शीट',
        html: table(
          [{ head: 'फ़ोटो' }, ...f.papers.map((p) => ({ head: paperName(p), num: true }))],
          f.rows.map((r) => [`${photoName(r.id)} <span class="muted">(${size(r.w, r.h)})</span>`, ...r.counts.map((n) => num(n))]),
          `${mm(f.margin)} मार्जिन, फ़ोटो के बीच ${mm(f.gap)} अंतराल और ${q(ui('props.rotate'))} चालू होने पर। ${q(ui('bar.arrange'))} इतनी ही फ़ोटो रखता है।`
        ),
      },
      {
        h2: 'नतीजा किन बातों से बदलता है',
        html: `<ul>
<li><strong>मार्जिन।</strong> कई प्रिंटर कागज़ के किनारे तक प्रिंट नहीं करते। मार्जिन कम हो तो ज़्यादा फ़ोटो आती हैं, लेकिन तभी जब आपका प्रिंटर वहां तक प्रिंट कर सके।</li>
<li><strong>अंतराल।</strong> फ़ोटो के बीच कुछ मिलीमीटर की जगह हो तो उन्हें काटना आसान होता है, हालांकि कभी-कभी एक फ़ोटो कम आती है।</li>
<li><strong>घुमाना।</strong> ${q(ui('props.rotate'))} चालू हो तो ${app} कुछ फ़ोटो को घुमाकर ज़्यादा फ़ोटो रख सकता है।</li>
<li><strong>सही आकार।</strong> ${app} में ${photoName('10x15')} की फ़ोटो ${size(f.tenByFifteen.w, f.tenByFifteen.h)} की होती है, यानी फ़ोटो लैब के प्रिंट का असली आकार। कुछ मिलीमीटर से नतीजा बदल जाता है।</li>
</ul>`,
      },
    ],
    faq: [
      {
        q: `एक A4 शीट में ${fourBySix} की कितनी फ़ोटो आती हैं?`,
        a: `${mm(5)} मार्जिन के साथ ${num(f.a4Wide)}। ${mm(f.narrowMargin)} या उससे कम मार्जिन और बिना अंतराल के ${num(f.a4Narrow)}: दो पोर्ट्रेट और उनके नीचे एक लैंडस्केप।`,
      },
      {
        q: 'एक A4 शीट में 4 × 4 सेमी की कितनी आईडी फ़ोटो आती हैं?',
        a: `${num(f.id4Cut)}, ${mm(f.margin)} मार्जिन और काटने के लिए ${mm(f.gap)} अंतराल के साथ। बिना अंतराल के ${num(f.id4Tight)}।`,
      },
      {
        q: `एक ${paperName('letter')} शीट में कितनी पासपोर्ट साइज़ फ़ोटो आती हैं?`,
        a: `${size(f.passport.w, f.passport.h)} की, ${mm(f.margin)} मार्जिन और ${mm(f.gap)} अंतराल के साथ: ${num(f.passport.count)}${f.passport.grid < f.passport.count ? `, सीधी और घुमाई हुई फ़ोटो मिलाकर; सिर्फ़ पंक्तियों और कॉलम में ${num(f.passport.grid)}` : ''}।`,
      },
      {
        q: 'दूसरे कैलकुलेटर अलग संख्या क्यों बताते हैं?',
        a: 'क्योंकि वे दूसरा मार्जिन, दूसरा अंतराल या थोड़ा अलग आकार मानकर चलते हैं, या फ़ोटो को घुमाते नहीं। यहां आप हर चीज़ बदलकर देख सकते हैं कि शीट पर फ़ोटो कैसे आती हैं।',
      },
    ],
  });
}
