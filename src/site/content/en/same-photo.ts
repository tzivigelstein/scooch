// «Print the same picture multiple times on one page»: Fill with copies and Duplicate.

import { samePhotoFacts, type Copy } from '../../facts/same-photo.ts';
import { guide } from '../../guide.ts';
import { app, link, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function samePhoto({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = samePhotoFacts();
  const copyName = (copy: Copy) => (copy.kind === 'photo' ? photoName(copy.id) : copy.kind === 'label' ? 'Label' : 'Square sticker');

  return guide({
    id: 'same-photo',
    lang: 'en',
    path: PATHS['same-photo'],
    title: `Print the same picture multiple times on one page · ${app}`,
    description: 'Fill a sheet with copies of a photo, a logo or a label at the size you choose, with cut lines. Free, with no account and nothing uploaded.',
    h1: 'Print the same picture multiple times on one page',
    crumb: 'The same picture multiple times',
    lead: `Choose the size, and ${app} fills the sheet with copies of your photo, logo or label in one step. Each copy prints at actual size, with cut lines if you need them.`,
    ctas: [
      { label: `Open ${app} with an A4 sheet`, href: f.open.a4 },
      { label: 'Open with a Letter sheet', href: f.open.letter },
    ],
    feature: sheetFigure(f.figure, `${num(f.figure.count)} labels of ${size(f.label.w, f.label.h)} on an A4 sheet, with ${mm(f.layout.gap)} of spacing`),
    sections: [
      {
        h2: 'How to do it',
        html:
          steps([
            `Open ${app} with one of the buttons above and add your image with ${ui('bar.add')}.`,
            `Give each copy its size: choose a ${ui('crop.size')} in ${ui('props.title')} or type the width and height.`,
            `Press ${ui('props.fill')}, in the ${ui('props.tabs.piece')} tab. Before you apply it, it says how many copies fit. It replaces the other items on that sheet, and you can undo it.`,
            `Want an exact number? Use ${ui('props.duplicate')}: each copy goes into a free spot and, if there’s none, onto a new sheet.`,
            `Press ${ui('bar.print')} and choose “Actual size” or “100%”. The ${ui('cuts.title').toLowerCase()} mark where to cut each copy.`,
          ]) + paragraphs(`To leave more room between copies, increase the ${ui('props.gap')} in the ${ui('props.tabs.project')} tab before filling the sheet.`),
      },
      {
        h2: 'How many copies fit',
        html:
          table(
            [{ head: 'Copy' }, ...f.papers.map((p) => ({ head: paperName(p), num: true }))],
            f.rows.map(({ copy, counts }) => [`${copyName(copy)} <span class="muted">(${size(copy.w, copy.h)})</span>`, ...counts.map((n) => num(n))]),
            `Copies per sheet with ${ui('props.fill')}, with ${mm(f.layout.margin)} margins and ${mm(f.layout.gap)} of spacing.`
          ) + paragraphs(`For any other size, use the ${link(PATHS['how-many'], 'photos-per-page calculator')}.`),
      },
    ],
    faq: [
      {
        q: 'How many copies fit on a sheet?',
        a: `It depends on the size, the margin and the spacing. ${ui('props.fill')} tells you how many before you apply it, and the ${link(PATHS['how-many'], 'calculator')} tells you before you start.`,
      },
      {
        q: 'Can I make copies of several different photos on the same sheet?',
        a: `Yes. Select the photos and use ${ui('props.duplicate')}: each one is copied as many times as you choose. Then press ${ui('bar.arrange')}.`,
      },
      { q: 'Do the copies lose quality?', a: `No. They all use the original file. If the image’s resolution is low for the size you chose, ${app} warns you that it may look pixelated.` },
      {
        q: 'How do I leave room to cut?',
        a: `Increase the ${ui('props.gap')} in ${ui('props.title')}, in the ${ui('props.tabs.project')} tab, and turn on the ${ui('cuts.title').toLowerCase()}. With a few millimeters of spacing, cutting is easier.`,
      },
    ],
  });
}
