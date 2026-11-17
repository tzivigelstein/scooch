// «Print passport and ID photos on one sheet»: the app's document photo
// sizes, a sheet of copies, and the requirements the app doesn't check. Which
// size an application asks for is the office's to say: the page names no
// country or application for a size (facts/id-photos.ts).

import { idPhotosFacts } from '../../facts/id-photos.ts';
import { guide } from '../../guide.ts';
import { app, link, note, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function idPhotos({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = idPhotosFacts();
  const onA4 = (id: string) => num(f.onA4[id]);
  const passport = f.figure.piece;
  const more = f.more.map((m) => `${num(m.count)} of ${photoName(m.id)} on ${paperName(m.paper)}`);

  return guide({
    id: 'id-photos',
    lang: 'en',
    path: PATHS['id-photos'],
    title: `Print passport photos at home: a sheet of copies · ${app}`,
    description: `Crop your photo to ${size(4, 4, 'cm')}, ${size(3.5, 4.5, 'cm')} or ${size(2, 2, 'in')} and fill an A4 or Letter sheet with copies to cut out. Free, and your photo isn’t uploaded.`,
    h1: 'Print passport and ID photos on one sheet',
    crumb: 'Passport photos to print',
    lead: `With ${app} you crop your photo to the size you were asked for and fill a sheet with copies ready to cut. It’s free and the photo never leaves your device: everything happens in the browser.`,
    ctas: f.open.map(({ id, href }) => ({ label: `Open with ${photoName(id)}`, href })),
    feature:
      note(
        `Each application sets its own requirements: the size, the background, the framing, the size of the face and whether it accepts photos printed at home. Before printing, check with the office that asks for the photo. ${app} crops and prints at the size you choose, but it doesn’t check those requirements.`
      ) + sheetFigure(f.figure, `${onA4(f.figure.photo)} photos of ${size(passport.w, passport.h)} on an A4 sheet, as ${ui('props.fill')} places them`),
    sections: [
      {
        h2: `Sizes ${app} comes with`,
        html:
          table(
            [{ head: `Size in ${app}` }, { head: 'Dimensions' }, ...f.papers.map((p) => ({ head: `On ${paperName(p)}`, num: true }))],
            f.rows.map((r) => [photoName(r.id), size(r.w, r.h), ...r.counts.map((n) => num(n))]),
            `Copies per sheet with ${ui('props.fill')}, with ${mm(f.layout.margin)} margins and ${mm(f.layout.gap)} of spacing to cut them.`
          ) +
          paragraphs(
            `The office that asks for the photo decides its size, and it changes from one country and one application to another. Check its requirement before choosing one of these sizes. If it asks for another size, choose Other size in the ${link(PATHS['how-many'], 'calculator')} and open the sheet from there.`,
            ...(more.length ? [`With ${ui('bar.arrange')}, which mixes upright and rotated photos, more sometimes fit: ${more.join(', ')}. The ${link(PATHS['how-many'], 'calculator')} shows it for each size.`] : [])
          ),
      },
      {
        h2: 'How to do it',
        html:
          steps([
            `Open ${app} at the size you need, with one of the buttons above. The sheet is set to A4, with ${mm(f.layout.margin)} margins, ${mm(f.layout.gap)} of spacing and ${ui('cuts.title').toLowerCase()}.`,
            `Add your photo with ${ui('bar.add')}. It’s cropped to that size, centered.`,
            'If the face isn’t framed well, double-click the photo to crop it and move the image.',
            `With the photo selected, press ${ui('props.fill')} in ${ui('props.title')}, in the ${ui('props.tabs.piece')} tab.`,
            `Press ${ui('bar.print')} and choose “Actual size” or “100%”. Measure one copy with a ruler before cutting them all.`,
          ]) + paragraphs(`Using Letter paper? Change it in ${ui('props.title')}, in the ${ui('props.tabs.project')} tab, before filling the sheet.`),
      },
    ],
    faq: [
      {
        q: 'How many ID photos fit on an A4 sheet?',
        a: `With ${ui('props.fill')}, ${mm(f.layout.margin)} margins and ${mm(f.layout.gap)} of spacing: ${onA4('id-4x4')} at ${size(4, 4, 'cm')}, ${onA4('passport-35x45')} at ${size(3.5, 4.5, 'cm')} and ${onA4('visa-5x5')} at ${size(2, 2, 'in')}.`,
      },
      {
        q: 'Can I print passport photos at home?',
        a: `Yes: you make the sheet in ${app} and print it on your printer, ideally on photo paper. If the photo is for an application, first check whether they accept photos printed at home.`,
      },
      {
        q: `Does ${app} check that the photo meets the requirements?`,
        a: `No. It only crops it and prints it at the size you choose. The background, the lighting, the framing and the size of the face depend on the photo you use. The ${link(PATHS['legal-terms'], 'terms of use')} say so too.`,
      },
      { q: `How big is a ${size(2, 2, 'in')} photo?`, a: `${size(f.twoInches, f.twoInches)}, about ${size(5, 5, 'cm')}. In ${app} it’s the ${photoName('visa-5x5')} size.` },
      {
        q: 'What if I need another size?',
        a: `In the ${link(PATHS['how-many'], 'calculator')}, choose Other size, type the width and height and open the sheet in ${app}: the photos you add are cropped to that size.`,
      },
    ],
  });
}
