// «Print stickers at home»: a sheet of stickers, each with the contour cut
// line (Contour), what it needs (transparency) and what the PDF's line is:
// a printed vector stroke to cut by hand, with no layer of its own and no
// registration marks (services/pdf.ts, services/contours.ts, core/contour.js).

import { stickersFacts } from '../../facts/stickers.ts';
import { guide } from '../../guide.ts';
import { app, link, note, paragraphs, shapesFigure, steps, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function stickers({ ui, num, mm, size }: Kit): SitePage {
  const f = stickersFacts();
  const contour = ui('cuts.modes.contour');
  const cutLines = ui('cuts.title').toLowerCase();
  const cutMargin = ui('cuts.margin').toLowerCase();
  const gap = ui('props.gap').toLowerCase();
  const letter = ui('papers.names.letter');
  const sticker = size(f.sticker.w, f.sticker.h);
  return guide({
    id: 'stickers',
    lang: 'en',
    path: PATHS.stickers,
    title: `Print stickers at home with a cut line around each shape · ${app}`,
    description: 'Make a printable sticker sheet from your PNG images, each with a cut line that follows its shape. Download or print the PDF. Free, no account, nothing uploaded.',
    h1: 'Make a sticker sheet at home, each sticker with its cut line',
    crumb: 'Stickers at home',
    lead: `With ${app} you arrange your images on a sheet at actual size, and each one gets a cut line that follows its shape: the ${contour} option of the ${cutLines}. Print the sheet at home and cut out each sticker along its line, with scissors or a craft knife.`,
    ctas: [
      { label: `Open ${app} with an A4 sheet`, href: f.open.a4 },
      { label: `Open with a ${letter} sheet`, href: f.open.letter },
    ],
    feature: shapesFigure(f.figure, `${num(f.figure.count)} stickers of ${sticker} on an A4 sheet, each with its cut line ${mm(f.cutMargin)} from its shape`),
    sections: [
      {
        h2: 'What you need',
        html:
          `<ul><li>Images with a transparent background, in PNG or WebP: the line follows the part that isn’t transparent.</li><li>Sticker paper the size of your sheet (A4, ${letter}…) that works with your printer.</li><li>Scissors or a craft knife, and a ruler to check the size.</li></ul>` +
          note(
            `A JPG has no transparency: its cut line is the image’s rectangle, as with ${ui('cuts.modes.outline')}. The same goes for a PNG with no transparent parts and for the pages of a PDF. ${app} doesn’t remove backgrounds: if your image has a white background, remove it first with another program and save it as a PNG.`
          ),
      },
      {
        h2: 'How to do it',
        html:
          steps([
            `Open ${app} with one of the buttons above: the sheet gets ${mm(f.layout.margin)} margins, ${mm(f.layout.gap)} of spacing and the ${cutLines} set to ${contour}, with a ${mm(f.cutMargin)} ${cutMargin}. If you already have it open, choose ${contour} under ${ui('cuts.title')}, in the ${ui('props.tabs.project')} tab of ${ui('props.title')}.`,
            `Add your images with ${ui('bar.add')} or drop them on the sheet. Each image with transparency shows its line within moments.`,
            `Give each sticker its size: select it and type the ${ui('props.widthTip')} or the ${ui('props.heightTip')} in ${ui('props.title')}, in the ${ui('props.tabs.piece')} tab. The other side adjusts by itself.`,
            `Under ${ui('cuts.title')}, open ${ui('cuts.more')} to check the ${cutMargin}: the distance between the image and its line. With ${mm(f.cutMargin)}, each sticker gets a border of paper around it. To change it, type another value.`,
            `Press ${ui('bar.arrange')}: ${app} places the stickers without overlapping, with the ${gap} between them, and adds as many sheets as it takes.`,
            `Press ${ui('bar.print')} or ${ui('bar.download')} and, in the print dialog, choose “Actual size” or “100%”. Then cut out each sticker along its line.`,
          ]) +
          paragraphs(`${ui('bar.arrange')} counts each sticker as a rectangle with its ${cutMargin}, and leaves the ${gap} between those rectangles. If you change the ${cutMargin} after arranging, press ${ui('bar.arrange')} again.`),
      },
      {
        h2: 'What the cut line is, and what it isn’t',
        html: paragraphs(
          `The line goes around the part of the image that isn’t transparent, at the distance of the ${cutMargin}; with a negative margin, it goes into the image. A pixel counts as part of the shape from ${num(f.opacity)}% opacity, so a very soft shadow stays outside. The line is smoothed: it doesn’t follow the pixels’ steps.`,
          `In the PDF, each line is a vector stroke made of straight segments, with the ${ui('cuts.weight').toLowerCase()}, ${ui('cuts.color').toLowerCase()} and ${ui('cuts.dash').toLowerCase()} you choose in ${ui('cuts.more')}. It’s on the same page as the stickers and prints with them: it’s a guide for cutting by hand. Cut along the line and the stickers keep their shape, what print shops call die-cut.`,
          `The PDF has no registration marks and doesn’t put the lines on a layer of their own: they are strokes on the page like any other. If your cutting machine’s software imports strokes from a PDF, you can try it, but ${app} hasn’t been tested with any machine, and printing first and then cutting with a machine needs alignment marks this PDF doesn’t have.`,
          `Holes in an image, like the middle of a ring or of a letter O, get no line: the line only goes around the outside. Separate parts get a line each, unless they are closer than twice the ${cutMargin}: then they share one. Very small stray dots, like what’s left of a badly erased background, are ignored.`,
          `The line is worked out in the background, from a preview of the image, and with large images it can take a moment to appear. The PDF waits until every line is ready.`
        ),
      },
      {
        h2: 'Tips for good stickers',
        html: paragraphs(
          `Leave a few millimeters of ${gap}: each line stays inside its sticker’s rectangle with the ${cutMargin}, so with ${mm(f.layout.gap)} of spacing the lines of two neighboring stickers don’t touch, and they’re easier to cut out.`,
          `Choose the size of your sticker paper under ${ui('props.sheet')}, and leave a margin: many printers can’t print all the way to the edge of the sheet.`,
          `Print a test on plain paper first, at “Actual size” or “100%”, and measure a sticker with a ruler.`,
          `If you don’t want the line to show on the sticker’s edge, choose a ${ui('cuts.weights.thin').toLowerCase()}, ${ui('cuts.colors.gray').toLowerCase()} line in ${ui('cuts.more')}.`,
          `For a sheet full of the same sticker, use ${ui('props.fill')}: the guide to ${link(PATHS['same-photo'], 'printing the same picture multiple times')} explains it.`
        ),
      },
    ],
    faq: [
      {
        q: 'Why does my image have a rectangular line?',
        a: `Because it has no transparent parts: it’s a JPG, a PNG with a background or a PDF page. ${contour} needs transparency: remove the background with another program, save the image as a PNG and add it again.`,
      },
      {
        q: 'Can I send the PDF to a cutting machine?',
        a: `The PDF has each line as a vector stroke on the same page as the stickers, with no registration marks and no separate layer. If your machine’s software imports strokes from a PDF, you can try it, but ${app} hasn’t been tested with any. It’s meant for cutting by hand.`,
      },
      {
        q: 'How many stickers fit on an A4 sheet?',
        a: `It depends on their size, the ${cutMargin} and the spacing. With ${mm(f.layout.margin)} margins, ${mm(f.layout.gap)} of spacing and a ${mm(f.cutMargin)} ${cutMargin}, ${num(f.figure.count)} stickers of ${sticker} fit, as in the drawing. ${ui('bar.arrange')} places them and adds sheets if needed.`,
      },
      {
        q: 'What happens with separate letters and holes?',
        a: `Each separate part gets its own line, unless they are closer than twice the ${cutMargin}. With a ${cutMargin} larger than half the space between the letters, a word becomes a single sticker. Holes, like the middle of an O, get no line.`,
      },
      {
        q: 'What paper should I use?',
        a: `Sticker paper the same size as the sheet you choose in ${app} (A4, ${letter}…) that works with your printer. Before using it, print a test on plain paper.`,
      },
    ],
  });
}
