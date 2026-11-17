// «Print an image at actual size»: exact measures, and why printers change them.

import { actualSizeFacts } from '../../facts/actual-size.ts';
import { guide } from '../../guide.ts';
import { app, paragraphs, steps, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function actualSize({ ui, num, mm, size }: Kit): SitePage {
  const f = actualSizeFacts();
  return guide({
    id: 'actual-size',
    lang: 'en',
    path: PATHS['actual-size'],
    title: `Print an image at actual size, in cm, mm or inches · ${app}`,
    description: 'Type the width and height you want on paper and get a PDF at exactly that size. Free and in your browser, with nothing to install and no account.',
    h1: 'Print an image at actual size',
    crumb: 'Image at actual size',
    lead: `Type the size you want on paper, in millimeters, centimeters or inches, and ${app} creates a PDF at exactly that size. Print it at “Actual size” or “100%” and the image comes out as you set it.`,
    ctas: [
      { label: `Open ${app} with an A4 sheet`, href: f.open.a4 },
      { label: 'Open with a Letter sheet', href: f.open.letter },
    ],
    sections: [
      {
        h2: 'How to do it',
        html: steps([
          `Open ${app} and add the image with ${ui('bar.add')}.`,
          `Select it and type the ${ui('props.widthTip')} or the ${ui('props.heightTip')} in ${ui('props.title')}, in the ${ui('props.tabs.piece')} tab. The other side adjusts by itself, so the image isn’t distorted.`,
          `Prefer centimeters or inches? Change it in ${ui('prefs.title')}, under ${ui('prefs.units')}.`,
          `Press ${ui('bar.print')} and, in the print dialog, choose “Actual size” or “100%”.`,
          'Measure the print with a ruler before printing many copies.',
        ]),
      },
      {
        h2: 'Why the printer changes the size',
        html: paragraphs(
          `The PDF from ${app} has the exact size of the sheet and of each image. The size changes at the last step, in the print dialog: with “Fit to page”, “Fit to printable area” or a similar option, the printer shrinks everything to fit what it can print. Choose “Actual size” or “100%”, and check that the paper in the dialog is the same as the sheet’s.`,
          `If the image touches the edge of the sheet, it may be cut off: many printers can’t print all the way to the edge. Leave a margin; ${app} warns you when an item crosses the margin or goes off the sheet.`
        ),
      },
      {
        h2: `The ${ui('props.actual')} button`,
        html: paragraphs(
          `In ${ui('props.title')}, the ${ui('props.actual')} button sets the image to the size its own resolution says. For example, a photo of ${num(f.px.w)} × ${num(f.px.h)} pixels at ${num(f.ppi)} ppi measures ${size(f.printed.w, f.printed.h)}. Use it if the image already has the right size, like a scanned plan or pattern.`
        ),
      },
      {
        h2: 'Print quality',
        html: paragraphs(
          `${app} shows the ppi (pixels per inch) each image will print at, and warns you if it may look pixelated at the size you chose. The larger you print it, the fewer ppi it has.`
        ),
      },
    ],
    faq: [
      {
        q: 'How do I print an image at an exact size in centimeters?',
        a: `Add it to ${app}, change the units to centimeters in ${ui('prefs.title')} and type the width or the height in ${ui('props.title')}. Then print at “Actual size” or “100%”.`,
      },
      { q: 'Why does the image print smaller than it should?', a: 'It’s almost always the scale in the print dialog. Choose “Actual size” or “100%” instead of “Fit to page”.' },
      {
        q: 'Can I print a PDF at actual size?',
        a: 'Yes. Add the PDF: each page is an item with its original size. Put it on a sheet of the same size or larger and print at “Actual size” or “100%”.',
      },
      { q: 'What is ppi?', a: `Pixels per inch: how many of the image’s pixels fit in each printed inch. With few ppi, the image can look pixelated; ${app} warns you when the resolution is low for the size you chose.` },
      {
        q: 'Why leave a margin?',
        a: `Because many printers can’t print all the way to the edge of the paper, and whatever falls outside their printable area is cut off. How much margin you need depends on the printer: ${app} starts with ${mm(f.layout.margin)} when you open it from this page.`,
      },
    ],
  });
}
