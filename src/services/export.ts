// The PDF of the document: one page the size of the paper per sheet, in
// order, skipping empty ones, with its pieces (cropped and rotated) and, if
// the document asks for them, its cut lines (contour ones once every shape
// is traced).

import { APP_NAME } from '../config.ts';
import { cutStyle } from '../core/cutmarks.js';
import { pdfKey } from '../core/savings.js';
import { slug } from '../core/util.ts';
import { OUTPUT_TEXTS, outputText } from '../copy/output.ts';
import { getAsset } from '../state/assets.ts';
import { getDocument, type Piece } from '../state/document.ts';
import { itemsOn, sheetSize } from '../state/selectors.ts';
import { shapesReady, sheetCuts } from './contours.ts';
import { paperSlug, writtenPaperName } from './measure.ts';
import { buildPdf } from './pdf.ts';

/** «scooch-a4.pdf»: the same in every language, like the PDF's title (copy/output.ts). */
export const pdfFileName = () => `${slug(APP_NAME, OUTPUT_TEXTS.fallbackName)}-${paperSlug()}.pdf`;

/** The bytes of the document's PDF. */
export async function makePdf() {
  const [W, H] = sheetSize();
  const { sheets, cuts } = getDocument();
  const title = outputText(OUTPUT_TEXTS.title, { app: APP_NAME, paper: writtenPaperName() });
  const filled = sheets.map((sheet) => itemsOn(sheet.id)).filter((items) => items.length);
  // The assets as they are now: nothing the document does meanwhile changes this PDF.
  const assets = new Map(filled.flat().map((item) => [item.asset, getAsset(item.asset)]));
  const assetOf = (key: string) => assets.get(key)!;
  const piece = (item: Piece) => ({ asset: assetOf(item.asset), x: item.x, y: item.y, scale: item.scale, r: item.r, crop: item.crop ?? null });
  if (cuts.mode === 'contour') await shapesReady(filled.flat(), cuts.margin, assetOf);
  const pages = filled.map((items) => ({ pieces: items.map(piece), ...sheetCuts(items, cuts, W, H, assetOf) }));
  return buildPdf({ width: W, height: H, pages, title, creator: APP_NAME, cutStyle: cutStyle(cuts) });
}

/**
 * The key of what makePdf draws (see pdfKey): the paper, the cut lines and
 * each printed sheet's pieces, their files told apart by content. The same
 * document gives the same key, however many times it goes out.
 */
export function pdfContentKey() {
  const { sheets, cuts } = getDocument();
  const piece = (item: Piece) => {
    const asset = getAsset(item.asset);
    const file = asset.hashes?.bytes ?? asset.hashes?.src ?? `${asset.src}:${asset.name}`;
    return [file, asset.kind === 'pdf' ? asset.page : 0, asset.w, asset.h, item.x, item.y, item.scale, item.r, item.crop ?? null];
  };
  const pages = sheets
    .map((sheet) => itemsOn(sheet.id))
    .filter((items) => items.length)
    .map((items) => items.map(piece));
  return pdfKey({ size: sheetSize(), cuts, pages });
}
