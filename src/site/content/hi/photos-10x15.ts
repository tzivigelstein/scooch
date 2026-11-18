// «A4 शीट पर 4 × 6 फ़ोटो»: how many fit by margin, and how to print them.

import { tenByFifteenFacts } from '../../facts/photos-10x15.ts';
import { guide } from '../../guide.ts';
import { app, link, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { bare, q } from './chrome.ts';
import { PATHS } from './paths.ts';

export function tenByFifteen({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = tenByFifteenFacts();
  const p = f.photo;
  /** «4 × 6 इंच», and «4 × 6» where Hindi writes it before «फ़ोटो». */
  const name = photoName('10x15');
  const short = bare(name);
  const columns = [{ head: 'मार्जिन' }, ...f.papers.flatMap((paper) => f.gaps.map((gap) => ({ head: `${paperName(paper)}, ${gap ? `${mm(gap)} अंतराल` : 'बिना अंतराल'}`, num: true })))];
  const rows = f.rows.map((r) => [mm(r.margin), ...r.counts.map((n) => num(n))]);

  return guide({
    id: 'photos-10x15',
    lang: 'hi',
    path: PATHS['photos-10x15'],
    title: `${short} फ़ोटो A4 या ${paperName('letter')} शीट पर प्रिंट करें · ${app}`,
    description: `${short} फ़ोटो: ${mm(f.a4.margin)} मार्जिन के साथ एक A4 शीट पर ${num(f.onA4)} आती हैं, और ${paperName('letter')} पर ${mm(f.letter.margin)} के साथ। उन्हें असली आकार में व्यवस्थित करें और मुफ़्त में PDF डाउनलोड करें।`,
    h1: `A4 शीट पर ${short} फ़ोटो`,
    crumb: `A4 पर ${short} फ़ोटो`,
    lead: `अगर आपका प्रिंटर ${mm(f.a4.margin)} या उससे कम मार्जिन छोड़ता है और फ़ोटो के बीच अंतराल नहीं है, तो एक A4 शीट पर ${name} की ${num(f.onA4)} फ़ोटो असली आकार में आती हैं: ऊपर दो पोर्ट्रेट और नीचे एक लैंडस्केप। ${mm(f.wideMargin)} मार्जिन के साथ ${num(f.onA4Wide)} आती हैं। ${app} उन्हें अपने-आप व्यवस्थित करके प्रिंट के लिए तैयार कर देता है।`,
    ctas: [
      { label: `A4 पर ${short} फ़ोटो के साथ ${app} खोलें`, href: f.open.a4 },
      { label: `${paperName('letter')} शीट के साथ खोलें`, href: f.open.letter },
    ],
    feature: sheetFigure(f.figure, `A4 शीट पर ${name} की ${num(f.onA4)} फ़ोटो, ${mm(f.a4.margin)} मार्जिन के साथ`),
    sections: [
      {
        h2: 'कैसे करें',
        html: steps([
          `ऊपर वाले बटन से ${app} खोलें: शीट A4 पर सेट होगी, ${mm(f.a4.margin)} मार्जिन के साथ और फ़ोटो के बीच बिना अंतराल के।`,
          `${q(ui('bar.add'))} से अपनी फ़ोटो जोड़ें या उन्हें शीट पर छोड़ें। हर फ़ोटो बीच से ${name} में क्रॉप हो जाती है; लैंडस्केप फ़ोटो ${photoName('10x15', { turned: true })} में।`,
          'अगर कोई फ़ोटो ठीक से फ़्रेम नहीं हुई, तो उसे क्रॉप करने के लिए उस पर डबल क्लिक करें और इमेज को खिसकाएं।',
          `${q(ui('bar.arrange'))} दबाएं: हर शीट पर ${num(f.onA4)} फ़ोटो आती हैं, और ${app} ज़रूरत के हिसाब से शीटें जोड़ता है।`,
          `अगर आप उन्हें काटेंगे, तो ${ui('props.title')} के ${ui('props.tabs.project')} टैब में ${ui('cuts.title')} चालू करें।`,
          `${q(ui('bar.print'))} दबाएं और प्रिंट डायलॉग में “असली आकार” या “100%” चुनें।`,
        ]),
      },
      {
        h2: 'मार्जिन के हिसाब से कितनी आती हैं',
        html:
          paragraphs(`मार्जिन आपके प्रिंटर पर निर्भर करता है: कई प्रिंटर हर किनारे पर कुछ मिलीमीटर बिना प्रिंट किए छोड़ देते हैं। हर स्थिति में ${q(ui('bar.arrange'))} इतनी फ़ोटो रखता है:`) +
          table(columns, rows, `हर शीट पर ${name} (${size(p.w, p.h)}) की फ़ोटो, ${q(ui('props.rotate'))} चालू होने पर।`),
      },
      {
        h2: `${short} फ़ोटो का आकार`,
        html: paragraphs(
          `${app} में ${name} की फ़ोटो ${size(p.w, p.h)} की होती है: यह फ़ोटो लैब के प्रिंट का असली आकार है, जिसे ${bare(photoName('10x15', { turned: true }))} भी कहते हैं।`,
          `अगर आपको ठीक ${size(f.exact.w, f.exact.h)} चाहिए, तो ${name} चुनें और फिर ${ui('props.title')} में चौड़ाई ${mm(f.exact.w)} लिखें: ऊंचाई ${mm(f.exact.h)} हो जाएगी। इस आकार की ${num(f.exact.count)} फ़ोटो ${mm(f.wideMargin)} मार्जिन के साथ भी एक A4 शीट पर आ जाती हैं।`
        ),
      },
    ],
    faq: [
      {
        q: `एक A4 शीट पर ${short} की कितनी फ़ोटो आती हैं?`,
        a: `${num(f.onA4)}, अगर मार्जिन ${mm(f.a4.margin)} या उससे कम हो और फ़ोटो के बीच अंतराल न हो; ${mm(f.wideMargin)} मार्जिन के साथ ${num(f.onA4Wide)}।`,
      },
      {
        q: `क्या एक A4 शीट पर ${name} की 4 फ़ोटो प्रिंट हो सकती हैं?`,
        a: `${name} में नहीं: उन्हें क्रॉप किए बिना 4 फ़ोटो रखने का कोई तरीका नहीं है। हां, ${size(f.quarter.w, f.quarter.h)} की ${num(f.quarter.count)} फ़ोटो आ सकती हैं, जो थोड़ी छोटी हैं (A4 शीट का एक चौथाई), और वह भी तभी जब प्रिंटर बिना मार्जिन के प्रिंट करे।`,
      },
      {
        q: `एक ${paperName('letter')} शीट पर ${short} की कितनी फ़ोटो आती हैं?`,
        a: `${mm(f.letter.margin)} मार्जिन के साथ ${num(f.onLetter)}${f.sameWithGap ? `, उनके बीच ${mm(f.cutGap)} अंतराल होने पर भी` : ''}।`,
      },
      {
        q: 'कौन-सा कागज़ इस्तेमाल करें?',
        a: `A4 या ${paperName('letter')} साइज़ का फ़ोटो पेपर, ग्लॉसी या मैट, जो आपका प्रिंटर लेता हो। प्रिंट डायलॉग में कागज़ का वही प्रकार चुनें, ताकि प्रिंटर उसके हिसाब से क्वालिटी रखे।`,
      },
      { q: 'और अगर मेरी फ़ोटो दूसरे आकार की हों?', a: `${link(PATHS['how-many'], 'कितनी फ़ोटो आएंगी, यह बताने वाला कैलकुलेटर')} इस्तेमाल करें: आकार और मार्जिन चुनें, और शीट को ${app} में खोलें।` },
    ],
  });
}
