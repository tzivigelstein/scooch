// «4 × 6 photos on an A4 sheet»: how many fit by margin, and how to print them.

import { tenByFifteenFacts } from '../../facts/photos-10x15.ts';
import { guide } from '../../guide.ts';
import { app, link, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { bare } from './chrome.ts';
import { PATHS } from './paths.ts';

export function tenByFifteen({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = tenByFifteenFacts();
  const p = f.photo;
  /** «4 × 6 in», and «4 × 6» where English writes it before «photos». */
  const name = photoName('10x15');
  const short = bare(name);
  const columns = [{ head: 'Margin' }, ...f.papers.flatMap((paper) => f.gaps.map((gap) => ({ head: `${paperName(paper)}, ${gap ? `${mm(gap)} spacing` : 'no spacing'}`, num: true })))];
  const rows = f.rows.map((r) => [mm(r.margin), ...r.counts.map((n) => num(n))]);

  return guide({
    id: 'photos-10x15',
    lang: 'en',
    path: PATHS['photos-10x15'],
    title: `Print ${short} photos on A4 or Letter paper · ${app}`,
    description: `${short} photos: ${num(f.onA4)} fit on an A4 sheet with ${mm(f.a4.margin)} margins, and on Letter with ${mm(f.letter.margin)}. Arrange them at actual size and download the PDF, free.`,
    h1: `${short} photos on an A4 sheet`,
    crumb: `${short} photos on A4`,
    lead: `${num(f.onA4)} photos of ${name} fit on an A4 sheet at actual size if your printer leaves a margin of ${mm(f.a4.margin)} or less and the photos have no spacing: two upright on top and one sideways below. With ${mm(f.wideMargin)} margins, ${num(f.onA4Wide)} fit. ${app} arranges them for you and gets them ready to print.`,
    ctas: [
      { label: `Open ${app} with ${short} photos on A4`, href: f.open.a4 },
      { label: 'Open with a Letter sheet', href: f.open.letter },
    ],
    feature: sheetFigure(f.figure, `${num(f.onA4)} photos of ${name} on an A4 sheet with ${mm(f.a4.margin)} margins`),
    sections: [
      {
        h2: 'How to do it',
        html: steps([
          `Open ${app} with the button above: the sheet is set to A4, with ${mm(f.a4.margin)} margins and no spacing between photos.`,
          `Add your photos with ${ui('bar.add')} or drop them on the sheet. Each one is cropped to ${name}, centered; landscape ones, to ${photoName('10x15', { turned: true })}.`,
          'If one isn’t framed well, double-click it to crop it and move the image.',
          `Press ${ui('bar.arrange')}: ${num(f.onA4)} fit on each sheet, and ${app} adds the sheets it needs.`,
          `If you’re going to cut them, turn on ${ui('cuts.title')} in ${ui('props.title')}, in the ${ui('props.tabs.project')} tab.`,
          `Press ${ui('bar.print')} and choose “Actual size” or “100%” in the print dialog.`,
        ]),
      },
      {
        h2: 'How many fit, by margin',
        html:
          paragraphs(`The margin depends on your printer: many leave a few millimeters unprinted at each edge. This is what ${ui('bar.arrange')} places in each case:`) +
          table(columns, rows, `${name} photos (${size(p.w, p.h)}) per sheet, with ${ui('props.rotate')} on.`),
      },
      {
        h2: `The size of a ${short} photo`,
        html: paragraphs(
          `In ${app}, a ${name} photo measures ${size(p.w, p.h)}: the real size of lab prints, also written ${bare(photoName('10x15', { turned: true }))}.`,
          `If you need exactly ${size(f.exact.w, f.exact.h)}, choose ${name} and then type ${mm(f.exact.w)} as the width in ${ui('props.title')}: the height becomes ${mm(f.exact.h)}. At that size, ${num(f.exact.count)} fit on an A4 sheet even with ${mm(f.wideMargin)} margins.`
        ),
      },
    ],
    faq: [
      {
        q: `How many ${short} photos fit on an A4 sheet?`,
        a: `${num(f.onA4)} if the margin is ${mm(f.a4.margin)} or less and there’s no spacing between the photos; with ${mm(f.wideMargin)} margins, ${num(f.onA4Wide)}.`,
      },
      {
        q: `Can you print 4 photos of ${name} on one A4 sheet?`,
        a: `Not at ${name}: there’s no way to place 4 without cropping them. What does fit is ${num(f.quarter.count)} photos of ${size(f.quarter.w, f.quarter.h)}, a little smaller (a quarter of an A4 sheet), and only if the printer prints without margins.`,
      },
      {
        q: `How many ${short} photos fit on a Letter sheet?`,
        a: `${num(f.onLetter)} with ${mm(f.letter.margin)} margins${f.sameWithGap ? `, even with ${mm(f.cutGap)} of spacing between them` : ''}.`,
      },
      {
        q: 'What paper should I use?',
        a: 'A4 or Letter photo paper that your printer accepts, glossy or matte. In the print dialog, choose that paper type so the printer uses the right quality for it.',
      },
      { q: 'What if my photos are other sizes?', a: `Use the ${link(PATHS['how-many'], 'photos-per-page calculator')}: choose the size and the margin, and open the sheet in ${app}.` },
    ],
  });
}
