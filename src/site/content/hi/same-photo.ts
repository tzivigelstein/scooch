// «एक पेज पर एक ही फ़ोटो कई बार प्रिंट करें»: कॉपियों से भरें and डुप्लिकेट करें.

import { samePhotoFacts, type Copy } from '../../facts/same-photo.ts';
import { guide } from '../../guide.ts';
import { app, link, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { q } from './chrome.ts';
import { PATHS } from './paths.ts';

export function samePhoto({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = samePhotoFacts();
  const copyName = (copy: Copy) => (copy.kind === 'photo' ? photoName(copy.id) : copy.kind === 'label' ? 'लेबल' : 'चौकोर स्टिकर');

  return guide({
    id: 'same-photo',
    lang: 'hi',
    path: PATHS['same-photo'],
    title: `एक पेज पर एक ही फ़ोटो कई बार प्रिंट करें · ${app}`,
    description: 'एक फ़ोटो, लोगो या लेबल की कॉपियों से पूरी शीट भरें, आपके चुने हुए आकार में और कटिंग लाइनों के साथ। मुफ़्त, बिना अकाउंट और बिना फ़ाइलें अपलोड किए।',
    h1: 'एक पेज पर एक ही फ़ोटो कई बार प्रिंट करें',
    crumb: 'एक ही फ़ोटो कई बार',
    lead: `आकार चुनें, और ${app} एक ही कदम में आपकी फ़ोटो, लोगो या लेबल की कॉपियों से शीट भर देता है। हर कॉपी असली आकार में प्रिंट होती है, और ज़रूरत हो तो कटिंग लाइनों के साथ।`,
    ctas: [
      { label: `A4 शीट के साथ ${app} खोलें`, href: f.open.a4 },
      { label: `${paperName('letter')} शीट के साथ खोलें`, href: f.open.letter },
    ],
    feature: sheetFigure(f.figure, `A4 शीट पर ${size(f.label.w, f.label.h)} के ${num(f.figure.count)} लेबल, ${mm(f.layout.gap)} अंतराल के साथ`),
    sections: [
      {
        h2: 'कैसे करें',
        html:
          steps([
            `ऊपर दिए किसी बटन से ${app} खोलें और ${q(ui('bar.add'))} से अपनी इमेज जोड़ें।`,
            `हर कॉपी का आकार तय करें: ${ui('props.title')} में ${ui('crop.size')} चुनें या चौड़ाई और ऊंचाई लिखें।`,
            `${ui('props.tabs.piece')} टैब में ${q(ui('props.fill'))} दबाएं। लागू करने से पहले यह बताता है कि कितनी कॉपियां आएंगी। यह उस शीट के बाकी आइटम की जगह ले लेता है, और आप इसे पहले जैसा कर सकते हैं।`,
            `कॉपियों की एक तय संख्या चाहिए? ${q(ui('props.duplicate'))} इस्तेमाल करें: हर कॉपी किसी खाली जगह पर जाती है, और जगह न हो तो नई शीट पर।`,
            `${q(ui('bar.print'))} दबाएं और “असली आकार” या “100%” चुनें। ${ui('cuts.title')} दिखाती हैं कि हर कॉपी कहां से काटनी है।`,
          ]) + paragraphs(`कॉपियों के बीच ज़्यादा जगह छोड़ने के लिए, शीट भरने से पहले ${ui('props.tabs.project')} टैब में ${ui('props.gap')} बढ़ाएं।`),
      },
      {
        h2: 'कितनी कॉपियां आती हैं',
        html:
          table(
            [{ head: 'कॉपी' }, ...f.papers.map((p) => ({ head: paperName(p), num: true }))],
            f.rows.map(({ copy, counts }) => [`${copyName(copy)} <span class="muted">(${size(copy.w, copy.h)})</span>`, ...counts.map((n) => num(n))]),
            `${q(ui('props.fill'))} से हर शीट पर कॉपियां, ${mm(f.layout.margin)} मार्जिन और ${mm(f.layout.gap)} अंतराल के साथ।`
          ) + paragraphs(`किसी भी दूसरे आकार के लिए ${link(PATHS['how-many'], 'कितनी फ़ोटो आएंगी, यह बताने वाला कैलकुलेटर')} इस्तेमाल करें।`),
      },
    ],
    faq: [
      {
        q: 'एक शीट पर कितनी कॉपियां आती हैं?',
        a: `यह आकार, मार्जिन और अंतराल पर निर्भर करता है। ${q(ui('props.fill'))} लागू करने से पहले बता देता है कि कितनी आएंगी, और ${link(PATHS['how-many'], 'कैलकुलेटर')} शुरू करने से पहले ही बता देता है।`,
      },
      {
        q: 'क्या एक ही शीट पर कई अलग-अलग फ़ोटो की कॉपियां बना सकते हैं?',
        a: `हां। फ़ोटो चुनें और ${q(ui('props.duplicate'))} इस्तेमाल करें: हर फ़ोटो की उतनी कॉपियां बनती हैं जितनी आप चुनते हैं। फिर ${q(ui('bar.arrange'))} दबाएं।`,
      },
      { q: 'क्या कॉपियों की क्वालिटी कम हो जाती है?', a: `नहीं। सभी कॉपियां मूल फ़ाइल से बनती हैं। अगर चुने हुए आकार के लिए इमेज का रिज़ॉल्यूशन कम है, तो ${app} बताता है कि वह धुंधली दिख सकती है।` },
      {
        q: 'काटने के लिए जगह कैसे छोड़ें?',
        a: `${ui('props.title')} के ${ui('props.tabs.project')} टैब में ${ui('props.gap')} बढ़ाएं और ${ui('cuts.title')} चालू करें। कुछ मिलीमीटर के अंतराल से काटना आसान होता है।`,
      },
    ],
  });
}
