// The PDF of the document: one page the size of the paper per sheet, in
// order, skipping empty ones, with its pieces (cropped and rotated) and, if
// the document asks for them, its cut lines.

import { APP_NAME } from '../config.ts';
import { cutLines, cutStyle } from '../core/cutmarks.js';
import { slug } from '../core/util.ts';
import { t } from '../copy/index.ts';
import { getAsset } from '../state/assets.ts';
import { getDocument, type Piece } from '../state/document.ts';
import { imageBoxOf, itemsOn, sheetSize } from '../state/selectors.ts';
import { paperName, paperSlug } from './measure.ts';
import { buildPdf } from './pdf.ts';

export const pdfFileName = () => `${slug(APP_NAME, t('print.fallbackName'))}-${paperSlug()}.pdf`;

/** The bytes of the document's PDF. */
export function makePdf() {
  const [W, H] = sheetSize();
  const { sheets, cuts } = getDocument();
  const piece = (item: Piece) => ({ asset: getAsset(item.asset), x: item.x, y: item.y, scale: item.scale, r: item.r, crop: item.crop ?? null });
  const pages = sheets
    .map((sheet) => itemsOn(sheet.id))
    .filter((items) => items.length)
    .map((items) => ({
      pieces: items.map(piece),
      lines: cutLines(items.map(imageBoxOf), { ...cuts, bounds: { x: 0, y: 0, w: W, h: H } }),
    }));
  return buildPdf({ width: W, height: H, pages, title: t('print.pdfTitle', { paper: paperName() }), creator: APP_NAME, cutStyle: cutStyle(cuts) });
}
