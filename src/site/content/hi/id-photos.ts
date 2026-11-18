// «पासपोर्ट साइज़ फ़ोटो प्रिंट करें»: the app's document photo sizes, a sheet
// of copies, and the requirements the app doesn't check. «पासपोर्ट साइज़
// फ़ोटो» is what India calls a small document photo, not a size: which size
// an application asks for is the office's to say, and the page names no
// country or application for a size (facts/id-photos.ts).

import { idPhotosFacts } from '../../facts/id-photos.ts';
import { guide } from '../../guide.ts';
import { app, link, note, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { CUSTOM_SIZE, legalNames, q } from './chrome.ts';
import { PATHS } from './paths.ts';

export function idPhotos(k: Kit): SitePage {
  const { ui, num, mm, size, photoName, paperName } = k;
  const f = idPhotosFacts();
  const onA4 = (id: string) => num(f.onA4[id]);
  const passport = f.figure.piece;
  const more = f.more.map((m) => `${paperName(m.paper)} पर ${photoName(m.id)} की ${num(m.count)}`);

  return guide({
    id: 'id-photos',
    lang: 'hi',
    path: PATHS['id-photos'],
    title: `पासपोर्ट साइज़ फ़ोटो प्रिंट करें: A4 शीट पर कई कॉपियां · ${app}`,
    description: `अपनी फ़ोटो को ${size(4, 4, 'cm')}, ${size(3.5, 4.5, 'cm')} या ${size(2, 2, 'in')} में क्रॉप करें और A4 या ${paperName('letter')} शीट को काटने लायक कॉपियों से भरें। मुफ़्त, फ़ोटो अपलोड नहीं होती।`,
    h1: 'पासपोर्ट साइज़ और आईडी फ़ोटो एक शीट पर प्रिंट करें',
    crumb: 'पासपोर्ट साइज़ फ़ोटो प्रिंट करें',
    lead: `${app} से आप अपनी फ़ोटो को उस आकार में क्रॉप कर सकते हैं जो आपसे मांगा गया है, और शीट को काटने के लिए तैयार कॉपियों से भर सकते हैं। यह मुफ़्त है और फ़ोटो आपके डिवाइस से बाहर नहीं जाती: सब कुछ ब्राउज़र में होता है।`,
    ctas: f.open.map(({ id, href }) => ({ label: `${photoName(id)} के साथ खोलें`, href })),
    feature:
      note(
        `हर आवेदन के अपने नियम होते हैं: आकार, बैकग्राउंड, फ़्रेमिंग, चेहरे का आकार और यह कि घर पर प्रिंट की गई फ़ोटो चलेगी या नहीं। प्रिंट करने से पहले, फ़ोटो मांगने वाले दफ़्तर से उसके नियम पूछ लें। ${app} आपके चुने हुए आकार में फ़ोटो क्रॉप और प्रिंट करता है, लेकिन इन नियमों की जांच नहीं करता।`
      ) + sheetFigure(f.figure, `A4 शीट पर ${size(passport.w, passport.h)} की ${onA4(f.figure.photo)} फ़ोटो, जैसे ${q(ui('props.fill'))} उन्हें रखता है`),
    sections: [
      {
        h2: `${app} में मौजूद आकार`,
        html:
          table(
            [{ head: `${app} में आकार` }, { head: 'माप' }, ...f.papers.map((p) => ({ head: `${paperName(p)} पर`, num: true }))],
            f.rows.map((r) => [photoName(r.id), size(r.w, r.h), ...r.counts.map((n) => num(n))]),
            `${q(ui('props.fill'))} से हर शीट पर कॉपियां, ${mm(f.layout.margin)} मार्जिन और काटने के लिए ${mm(f.layout.gap)} अंतराल के साथ।`
          ) +
          paragraphs(
            `फ़ोटो का आकार वह दफ़्तर तय करता है जो फ़ोटो मांगता है, और यह देश और आवेदन के हिसाब से बदलता है। इनमें से कोई आकार चुनने से पहले उसके नियम देख लें। अगर कोई दूसरा आकार मांगा गया है, तो ${link(PATHS['how-many'], 'कैलकुलेटर')} में ${q(CUSTOM_SIZE)} चुनें और वहीं से शीट खोलें।`,
            ...(more.length ? [`${q(ui('bar.arrange'))} से, जो सीधी और घुमाई हुई फ़ोटो मिलाकर रखता है, कभी-कभी ज़्यादा फ़ोटो आती हैं: ${more.join(', ')}। ${link(PATHS['how-many'], 'कैलकुलेटर')} हर आकार के लिए यह दिखाता है।`] : [])
          ),
      },
      {
        h2: 'कैसे करें',
        html:
          steps([
            `ऊपर दिए किसी बटन से ${app} को अपने ज़रूरी आकार के साथ खोलें। शीट A4 पर सेट होगी, ${mm(f.layout.margin)} मार्जिन और ${mm(f.layout.gap)} अंतराल के साथ, और ${ui('cuts.title')} चालू होंगी।`,
            `${q(ui('bar.add'))} से अपनी फ़ोटो जोड़ें। वह बीच से उसी आकार में क्रॉप हो जाएगी।`,
            'अगर चेहरा ठीक से फ़्रेम नहीं हुआ, तो फ़ोटो को क्रॉप करने के लिए उस पर डबल क्लिक करें और इमेज को खिसकाएं।',
            `फ़ोटो चुनी हुई हो, तब ${ui('props.title')} के ${ui('props.tabs.piece')} टैब में ${q(ui('props.fill'))} दबाएं।`,
            `${q(ui('bar.print'))} दबाएं और “असली आकार” या “100%” चुनें। सारी कॉपियां काटने से पहले एक कॉपी को रूलर से नाप लें।`,
          ]) + paragraphs(`${paperName('letter')} कागज़ इस्तेमाल कर रहे हैं? शीट भरने से पहले उसे ${ui('props.title')} के ${ui('props.tabs.project')} टैब में बदलें।`),
      },
    ],
    faq: [
      {
        q: 'एक A4 शीट में कितनी पासपोर्ट साइज़ फ़ोटो आती हैं?',
        a: `${q(ui('props.fill'))}, ${mm(f.layout.margin)} मार्जिन और ${mm(f.layout.gap)} अंतराल के साथ: ${size(4, 4, 'cm')} की ${onA4('id-4x4')}, ${size(3.5, 4.5, 'cm')} की ${onA4('passport-35x45')} और ${size(2, 2, 'in')} की ${onA4('visa-5x5')}।`,
      },
      {
        q: 'क्या पासपोर्ट साइज़ फ़ोटो घर पर प्रिंट कर सकते हैं?',
        a: `हां: ${app} में शीट तैयार करें और अपने प्रिंटर से प्रिंट करें, हो सके तो फ़ोटो पेपर पर। अगर फ़ोटो किसी आवेदन के लिए है, तो पहले पूछ लें कि घर पर प्रिंट की गई फ़ोटो चलती है या नहीं।`,
      },
      {
        q: `क्या ${app} जांचता है कि फ़ोटो नियमों के मुताबिक है?`,
        a: `नहीं। यह सिर्फ़ आपके चुने हुए आकार में फ़ोटो को क्रॉप और प्रिंट करता है। बैकग्राउंड, रोशनी, फ़्रेमिंग और चेहरे का आकार आपकी फ़ोटो पर निर्भर करते हैं। ${link(PATHS['legal-terms'], legalNames(k).terms)} वाले पेज पर भी यही लिखा है।`,
      },
      { q: `${size(2, 2, 'in')} की फ़ोटो कितनी बड़ी होती है?`, a: `${size(f.twoInches, f.twoInches)}, यानी लगभग ${size(5, 5, 'cm')}। ${app} में यह ${photoName('visa-5x5')} आकार है।` },
      {
        q: 'अगर मुझे कोई दूसरा आकार चाहिए तो?',
        a: `${link(PATHS['how-many'], 'कैलकुलेटर')} में ${q(CUSTOM_SIZE)} चुनें, चौड़ाई और ऊंचाई लिखें और शीट को ${app} में खोलें: आप जो फ़ोटो जोड़ेंगे, वे उसी आकार में क्रॉप होंगी।`,
      },
    ],
  });
}
