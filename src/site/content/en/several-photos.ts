// «Print multiple pictures on one page»: the main guide.

import { severalPhotosFacts } from '../../facts/several-photos.ts';
import { guide } from '../../guide.ts';
import { app, link, MAX_ITEMS, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function severalPhotos({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = severalPhotosFacts();
  return guide({
    id: 'several-photos',
    lang: 'en',
    path: PATHS['several-photos'],
    title: `Print multiple pictures on one page at actual size · ${app}`,
    description: 'Arrange several photos on one A4, Letter or Legal sheet at their actual size, then download the PDF or print it. Free, no account, nothing uploaded.',
    h1: 'Print multiple pictures on one page',
    crumb: 'Multiple pictures on one page',
    lead: `With ${app} you put several photos on the same sheet, each at its real size, and print them together from your computer’s or your phone’s browser. It’s free, needs no account, and your photos never leave your device.`,
    ctas: [
      { label: `Open ${app} with an A4 sheet`, href: f.open.a4 },
      { label: 'Open with a Letter sheet', href: f.open.letter },
    ],
    feature: sheetFigure(f.figure, `${num(f.figure.count)} photos of ${photoName(f.figure.photo)} on an A4 sheet, with ${mm(f.layout.margin)} margins`),
    sections: [
      {
        h2: 'How to do it',
        html: steps([
          `Open ${app} with the paper you’ll use. If it’s a different one, change it in ${ui('props.title')}, in the ${ui('props.tabs.project')} tab: there’s A4, Letter, Legal, photo paper and custom sizes.`,
          `Press ${ui('bar.add')} or drop the photos on the sheet. You can add several at once, and PDFs too: each page is one more item.`,
          `Press ${ui('bar.arrange')}: ${app} places every photo without overlapping and adds the sheets it needs.`,
          `If you want them all the same size, select them and choose a ${ui('crop.size')} (${photoName('10x15')}, ${photoName('13x18')}, ${photoName('id-4x4')}…) or type the width and height.`,
          `Press ${ui('bar.print')} or ${ui('bar.download')}. In the print dialog, choose “Actual size” or “100%” so each photo prints at its size.`,
        ]),
      },
      {
        h2: 'How many photos fit on a sheet',
        html:
          paragraphs(`It depends on the size of the photos, the paper and the margin your printer leaves. These are the identical photos ${ui('bar.arrange')} places on each sheet:`) +
          table(
            [{ head: 'Photo' }, ...f.papers.map((p) => ({ head: paperName(p), num: true }))],
            f.rows.map((r) => [`${photoName(r.id)} <span class="muted">(${size(r.w, r.h)})</span>`, ...r.counts.map((n) => num(n))]),
            `With ${mm(f.layout.margin)} margins, ${mm(f.layout.gap)} of spacing between photos and ${ui('props.rotate')} on.`
          ) +
          paragraphs(`For other sizes and margins, use the ${link(PATHS['how-many'], 'photos-per-page calculator')}.`),
      },
      {
        h2: 'Actual size, nothing scaled',
        html: paragraphs(
          `${app} creates a PDF with the exact size of the sheet, and each photo keeps its size in millimeters, not pixels. What can change the size is the print dialog: with “Fit to page” or a similar option, the printer shrinks everything a little. That’s why it’s worth choosing “Actual size” or “100%” and printing a test before printing many copies.`,
          `There’s more in the guide to ${link(PATHS['actual-size'], 'printing an image at actual size')}.`
        ),
      },
      {
        h2: 'From your phone',
        html: paragraphs(
          `${app} works in your phone’s or tablet’s browser, with nothing to install. Add the photos from your gallery, press ${ui('bar.arrange')} and download the PDF to print it or take it to a print shop.`
        ),
      },
    ],
    faq: [
      { q: 'Can I print multiple pictures on one page from my phone?', a: `Yes. ${app} works in your phone’s browser: add the photos from your gallery, press ${ui('bar.arrange')} and download the PDF.` },
      { q: 'Do I need Word or another program?', a: 'No. Everything happens in the browser: there’s nothing to install and no account to create.' },
      {
        q: 'Why do my photos print smaller?',
        a: 'It’s almost always the scale in the print dialog. With “Fit to page” or a similar option, the printer shrinks the sheet to fit its printable area. Choose “Actual size” or “100%”.',
      },
      {
        q: 'Are my photos uploaded to a server?',
        a: `No. Your photos are opened and processed in your browser, and the PDF is created there too. The ${link(PATHS['legal-privacy'], 'privacy policy')} explains it.`,
      },
      { q: 'Can I mix photos of different sizes, or photos and PDF pages?', a: `Yes. ${ui('bar.arrange')} places items of any size together, and each page of a PDF is one more item.` },
      { q: 'Is there a watermark or a limit on photos?', a: `There’s no watermark. A project holds up to ${num(MAX_ITEMS)} items.` },
    ],
  });
}
