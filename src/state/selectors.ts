// Derived values of the document: sizes, boxes, the selection and problems.
// They read the stores when called (for actions) or take a state (for components).

import type { GroupOptions } from '../core/group.js';
import { sizeOf } from '../core/papers.js';
import { pieceSize } from '../core/crop.js';
import { footprintPad } from '../core/cutmarks.js';
import { pieceProblems, problemSummary } from '../core/sheets.js';
import type { Box, Rect } from '../core/types.ts';
import { fine } from '../core/util.ts';
import { t } from '../copy/index.ts';
import { sizeText } from '../services/measure.ts';
import { findAsset, getAsset } from './assets.ts';
import { getDocument, type DocumentData, type DocumentState, type Piece } from './document.ts';
import { getPrefs } from './prefs.ts';
import { getView } from './view.ts';

type Doc = Pick<DocumentData, 'paper' | 'landscape' | 'margin'>;

/** Width and height of every sheet, in mm. */
export function sheetSize(doc: Doc = getDocument()): [number, number] {
  const size = sizeOf(doc.paper, doc.landscape) ?? sizeOf('A4', doc.landscape)!;
  return [size.w, size.h];
}

/** The sheet, its margin and the printable area (the sheet minus the margin). */
export function area(doc: Doc = getDocument()) {
  const [W, H] = sheetSize(doc);
  const m = doc.margin;
  return { W, H, m, aw: W - 2 * m, ah: H - 2 * m };
}

/** Width and height on the sheet, rotated and cropped (crop.pieceSize: the one formula). */
export function dims(item: Piece): [number, number] {
  const { w, h } = pieceSize(getAsset(item.asset), item);
  return [w, h];
}

/**
 * How much bigger than its image each piece is for the layout: the cut margin
 * while cut lines are on and it is positive (core/cutmarks.footprintPad).
 */
export const layoutPad = (doc: Pick<DocumentData, 'cuts'> = getDocument()) => footprintPad(doc.cuts);

/**
 * A piece's box for the layout (arranging, gaps, overlaps, the sheet's edges,
 * moving and aligning): its image or, with a positive cut margin, its cut box.
 */
export const boxOf = (item: Piece): Box => boxWith(item, layoutPad());

/** A piece's box with `pad` mm around its image (boxOf with the pad already known). */
export function boxWith(item: Piece, pad: number): Box {
  const [w, h] = dims(item);
  return { id: item.id, sheet: item.sheet, x: item.x - pad, y: item.y - pad, w: w + 2 * pad, h: h + 2 * pad };
}

/** A piece's image box on its sheet (what is drawn; scaling and the cut lines start from it). */
export const imageBoxOf = (item: Piece): Box => boxWith(item, 0);

/** Where a piece goes for its layout box to be at (x, y). */
export const fromBox = (x: number, y: number, pad = layoutPad()) => ({ x: x + pad, y: y + pad });

/** A box grown by `d` mm on every side. */
export const grown = <T extends Rect>(r: T, d: number): T => (d ? { ...r, x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d } : r);

export const boxes = (doc: Pick<DocumentData, 'items' | 'cuts'> = getDocument()) => {
  const pad = layoutPad(doc);
  return doc.items.map((item) => boxWith(item, pad));
};

/** The image boxes (for the scale plans, which take `pad` apart: see groupOptions). */
export const imageBoxes = (doc: Pick<DocumentData, 'items'> = getDocument()) => doc.items.map(imageBoxOf);

/**
 * What an image on `sheet` can't touch when it grows: the other pieces'
 * images grown by twice the cut margin (their cut boxes plus its own).
 */
export const obstaclesFor = (sheet: number, except: number | null) => {
  const pad = layoutPad();
  return othersOnSheet(sheet, except).map((box) => grown(box, pad));
};

export const findItem = (id: number | undefined, doc: Pick<DocumentData, 'items'> = getDocument()) => doc.items.find((item) => item.id === id);

/** Position of the sheet in the list (from 0), or −1. */
export const sheetIndex = (id: number, doc: Pick<DocumentData, 'sheets'> = getDocument()) => doc.sheets.findIndex((sheet) => sheet.id === id);

/** The pieces of a sheet, in stacking order. */
export const itemsOn = (id: number, doc: Pick<DocumentData, 'items'> = getDocument()) => doc.items.filter((item) => item.sheet === id);

/** The boxes of the other pieces of a sheet (pieces on other sheets never collide). */
export const othersOnSheet = (sheet: number, except: number | null, doc: Pick<DocumentData, 'items' | 'cuts'> = getDocument()) => {
  const pad = layoutPad(doc);
  return doc.items.filter((item) => item.sheet === sheet && item.id !== except).map((item) => boxWith(item, pad));
};

// ---------- Selection ----------

type Selection = Pick<DocumentState, 'items' | 'selection'>;

export const isSelected = (id: number, doc: Selection = getDocument()) => doc.selection.includes(id);
/** The selected pieces, in stacking order. */
export const selectedItems = (doc: Selection = getDocument()) => doc.items.filter((item) => doc.selection.includes(item.id));
/** The primary piece of the selection (the last one selected), or null. */
export const primaryItem = (doc: Selection = getDocument()) => findItem(doc.selection.at(-1), doc) ?? null;
/** The selected piece when there is exactly one; null with none or several. */
export const selectedItem = (doc: Selection = getDocument()) => (doc.selection.length === 1 ? primaryItem(doc) : null);

/** The current sheet: the primary piece's or, without a selection, the view's. */
export function currentSheet(doc: Pick<DocumentState, 'items' | 'selection' | 'sheets'> = getDocument(), viewSheet = getView().sheet) {
  const item = primaryItem(doc);
  if (item) return item.sheet;
  return sheetIndex(viewSheet, doc) >= 0 ? viewSheet : doc.sheets[0].id;
}

// ---------- Names and texts ----------

/** The file name of a piece («otra pieza» if it's gone). */
export function pieceName(id: number) {
  const item = findItem(id);
  return (item && findAsset(item.asset)?.name) ?? t('pieces.other');
}

/** «41,6 × 30 mm» for a piece, in the chosen unit. */
export function pieceSizeText(item: Piece) {
  const [w, h] = dims(item);
  return sizeText(w, h);
}

// ---------- Rules shared by the group plans ----------

/** What core/group.js needs to know about the sheet and the preferences (for plans on layout boxes). */
export function groupOptions(doc: Doc = getDocument()): GroupOptions & { W: number; H: number } {
  const { W, H } = area(doc);
  const { allowOverlap, grid } = getPrefs();
  return { W, H, allowOverlap, round: fine, snapStep: grid.snap ? grid.size : 0 };
}

/** The same for the scale plans, which work on image boxes and keep the cut margin apart. */
export const scaleOptions = () => ({ ...groupOptions(), pad: layoutPad() });

// ---------- Problems ----------

/** Problems of each piece (its layout box) on its sheet: {cut, pastMargin, overlap} by id. */
export function problemsById(doc: Pick<DocumentData, 'items' | 'paper' | 'landscape' | 'margin' | 'cuts'> = getDocument()) {
  const { W, H, m } = area(doc);
  return pieceProblems(boxes(doc), { W, H, margin: m });
}

/** How many pieces have each problem and on which sheets (indexes). */
export function sheetProblems(doc: DocumentData = getDocument()) {
  return problemSummary(
    problemsById(doc),
    boxes(doc),
    doc.sheets.map((sheet) => sheet.id)
  );
}
