// Arrange (on as many sheets as needed), shrink to use one sheet, place what
// is new, fill a sheet with copies and settle pieces that changed size. The
// geometry is in core/pack.js, core/sheets.js and core/resize.js.

import { CROWD_LIMIT, MAX_ITEMS } from '../../config.ts';
import { isIdentity, pieceSize } from '../../core/crop.js';
import { fitScale, pack, packedRotation, packSheets } from '../../core/pack.js';
import { settleResized, withCenterKept as centerKept } from '../../core/resize.js';
import { arrangeSheets, placeIntoSheets, samePlan, type ArrangePlan } from '../../core/sheets.js';
import type { Item } from '../../core/types.ts';
import { clamp, tidy } from '../../core/util.js';
import { formatList, sentences, t } from '../../copy/index.ts';
import { paperName } from '../../services/measure.ts';
import { getAsset } from '../assets.ts';
import { getDocument, newItem, newItemId, newSheetId, setDocument, type Piece } from '../document.ts';
import { commit } from '../history.ts';
import { area, boxOf, boxWith, currentSheet, dims, findItem, itemsOn, layoutPad, pieceName, primaryItem, selectedItem, sheetIndex } from '../selectors.ts';
import { animateNext } from '../view.ts';
import { flushUi } from '../flush.ts';
import { revealPiece } from '../../components/canvas/viewport.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { say, sayUndoable } from './notify.ts';
import { setSelection } from './selection.ts';
import { applyStartSize } from './deeplink.ts';

const packOptions = () => ({ gap: getDocument().gap, rotate: getDocument().rotate });

// What the packers place: each piece's layout box (with the cut margin around
// it), its image scaled by `k`.
const rects = (items: readonly Piece[], k = 1) => {
  const pad = layoutPad();
  return items.map((item) => {
    const [w, h] = dims(item);
    return { id: item.id, w: w * k + 2 * pad, h: h * k + 2 * pad };
  });
};

// ---------- Geometry of one piece ----------

/** `item` with `patch` applied, moved so its center stays where it was. */
export const withCenterKept = (item: Piece, patch: Partial<Item>): Item => centerKept(item, patch, getAsset(item.asset));

/** The position that centers the piece on its sheet. */
export function centeredOnSheet(item: Piece) {
  const { W, H } = area();
  const [w, h] = dims(item);
  return { x: (W - w) / 2, y: (H - h) / 2 };
}

/** The largest size inside the printable area (or the sheet, without room), centered; with its cut margin. */
export function fittedToSheet(item: Piece): Item {
  const { W, H, aw, ah } = area();
  const [w, h] = dims(item);
  const pad = layoutPad();
  const factor = aw > 2 * pad && ah > 2 * pad ? Math.min((aw - 2 * pad) / w, (ah - 2 * pad) / h) : Math.min(W / w, H / h);
  const scaled = { ...item, scale: clamp(item.scale * factor, 1, 1000) };
  return { ...scaled, ...centeredOnSheet(scaled) };
}

// ---------- Arrange ----------

// Signature of the document right after the last arrange: if nothing changed
// since, arranging again leaves everything as it is and adds no undo step.
let lastArranged: string | null = null;

// There was one sheet and what was added didn't fit: the new sheets were the
// app's doing, not the person's. Arranging offers to shrink back to one sheet,
// as if there were still one. Arranging forgets it.
let spilled = false;

/** Sheets become the person's decision (they added or removed one, or changed project). */
export const forgetSpill = () => {
  spilled = false;
};

function layoutSignature() {
  const { paper, landscape, margin, gap, rotate, sheets, items } = getDocument();
  return JSON.stringify([
    paper,
    landscape,
    margin,
    gap,
    rotate,
    layoutPad(),
    sheets.map((sheet) => sheet.id),
    items.map((item) => [item.id, item.asset, item.sheet, item.scale, item.r, item.x, item.y]),
  ]);
}

/** Applies an arrangeSheets plan (layout boxes): new sheets, positions and rotations. */
function applyPlan(plan: Pick<ArrangePlan, 'sheets' | 'placements'>) {
  const pad = layoutPad();
  const items = getDocument().items.map((item) => {
    const p = plan.placements.get(item.id);
    if (!p) return item;
    return { ...item, sheet: p.sheet, x: tidy(p.x + pad), y: tidy(p.y + pad), r: packedRotation(item.r, p.rotated) };
  });
  setDocument({ sheets: plan.sheets.map((id) => ({ id })), items });
  lastArranged = layoutSignature();
}

const arrangedText = (n: number, sheets: number) => (sheets > 1 ? t('notices.arrangedSheets', { n, sheets }) : t('notices.arranged', { n }));

/**
 * Arranges ALL the pieces without overlaps, on as many sheets as needed
 * (creates or removes sheets: no empty sheets are left at the end). Returns
 * the result ('arranged', 'same' or 'error') or null if there was nothing to do.
 * The canvas shows the result: a notice only when it needs sheets that weren't
 * there, when something didn't fit or when shrinking to one sheet is offered.
 */
export function arrange(): 'arranged' | 'same' | 'error' | null {
  const { items, sheets, busy } = getDocument();
  const n = items.length;
  if (!n || busy) return null;
  const { aw, ah, m } = area();
  if (aw <= 0 || ah <= 0) {
    say(t('errors.marginTooBig'), { warn: true });
    return 'error';
  }
  if (lastArranged === layoutSignature()) {
    announce(t('announce.arrangedAlready', { n }));
    return 'same';
  }
  const before = sheets.length;
  const sheetIds = sheets.map((sheet) => sheet.id);
  const all = items.map(boxOf);
  const plan = arrangeSheets(all, sheetIds, { area: { w: aw, h: ah }, margin: m, ...packOptions(), newId: newSheetId });
  if (samePlan(plan, all, sheetIds, tidy)) {
    lastArranged = layoutSignature();
    announce(t('announce.arrangedAlready', { n }));
    return 'same';
  }
  const selectedSheet = primaryItem()?.sheet;
  commit();
  animateNext();
  applyPlan(plan);
  followSelection(selectedSheet);
  const fromOne = before === 1 || spilled;
  spilled = false;
  const placed = n - plan.unplaced.length;

  // The ones that don't fit even alone stay where they were, and fitting them is offered.
  if (plan.unplaced.length) {
    const names = formatList(plan.unplaced.map(pieceName));
    const unplaced = t('notices.unplaced', { n: plan.unplaced.length, names });
    const text = sentences([placed ? arrangedText(placed, plan.packed) : '', unplaced]);
    const ids = [...plan.unplaced];
    say(text, { warn: true, action: { label: t('props.fit'), run: () => fitPieces(ids) } });
    return 'arranged';
  }
  // There was one sheet and now more are needed: shrinking to use one is offered.
  if (fromOne && plan.packed > 1) {
    const k = fitScale(rects(getDocument().items), aw, ah, packOptions());
    if (k > 0) {
      const factor = Math.floor(k * 0.999 * 1000) / 1000;
      say(arrangedText(n, plan.packed), {
        action: { label: t('notices.shrinkToOne', { pct: factor * 100 }), run: () => shrinkAndArrange(factor, k) },
      });
      return 'arranged';
    }
  }
  if (plan.sheets.length > before) say(arrangedText(n, plan.packed));
  else announce(arrangedText(n, plan.packed));
  return 'arranged';
}

/** The view goes to the selected piece when the change took it to another sheet than `before` (and it is out of sight). */
function followSelection(before: number | undefined) {
  const primary = primaryItem();
  if (!primary || primary.sheet === before) return;
  flushUi();
  revealPiece(primary.id);
}

/**
 * How many sheets the pieces would take arranged (a quick check, without
 * changing anything), or null when some don't fit even alone.
 */
export function sheetsNeeded(): number | null {
  const { aw, ah } = area();
  const { items } = getDocument();
  if (!items.length || aw <= 0 || ah <= 0) return null;
  const { sheets, unplaced } = packSheets(rects(items), aw, ah, packOptions());
  return unplaced.length ? null : sheets.length;
}

/** «Ajustar a la hoja» for the pieces that didn't fit even alone, in one step. */
function fitPieces(ids: readonly number[]) {
  const items = ids.map((id) => findItem(id)).filter((item) => !!item);
  if (!items.length || getDocument().busy) return;
  commit();
  animateNext();
  const fitted = new Map(items.map((item) => [item.id, fittedToSheet(item)]));
  setDocument({ items: getDocument().items.map((item) => fitted.get(item.id) ?? item) });
  announce(t('notices.fitted', { n: items.length }));
}

/**
 * Shrinks every piece by the same factor and arranges them on ONE sheet (the
 * first; the others are removed). One undo step.
 */
export function shrinkAndArrange(factor: number, exact: number) {
  const { aw, ah, m } = area();
  const n = getDocument().items.length;
  // Packing is heuristic and not strictly monotonic: if the rounded factor
  // doesn't fit, the exact one from fitScale (which did) is used and, just in
  // case, slightly smaller ones.
  const candidates = [factor, exact];
  for (let f = factor * 0.99; candidates.length < 20; f *= 0.99) candidates.push(f);
  for (const f of candidates) {
    const placements = pack(rects(getDocument().items, f), aw, ah, packOptions());
    if (!placements) continue;
    commit();
    animateNext();
    const sheet = getDocument().sheets[0].id;
    setDocument({ items: getDocument().items.map((item) => ({ ...item, scale: item.scale * f })) });
    applyPlan({
      sheets: [sheet],
      placements: new Map(placements.map((p) => [p.id, { sheet, x: m + p.x, y: m + p.y, rotated: p.rotated }])),
    });
    announce(t('notices.shrunk', { n, pct: f * 100 }));
    return true;
  }
  say(t('errors.shrinkFailed'), { warn: true });
  return false;
}

// ---------- What is new (added files, copies) ----------

/**
 * Ids for pieces and sheets that aren't in the document yet: the real ones to
 * add them, made-up ones to preview where they would go. Made-up ones go up
 * like the real ones: the packer breaks ties by id.
 */
export interface NewIds {
  item: () => number;
  sheet: () => number;
}

const REAL_IDS: NewIds = { item: newItemId, sheet: newSheetId };

/**
 * Where new pieces would go without moving the ones already there, without
 * changing anything: gaps from sheet index `from` on, then the next sheets or
 * new ones at the end (ids from `newSheet`). `rotate`: whether they may turn
 * to fit better. Returns the sheet, position and rotation of each one placed
 * (by id), the sheets to add and the ids that don't fit even alone on an
 * empty sheet.
 */
export function placementsFor(fresh: readonly Item[], from: number, { rotate = getDocument().rotate, newSheet = newSheetId } = {}) {
  const placed = new Map<number, Pick<Item, 'sheet' | 'x' | 'y' | 'r'>>();
  const { m, aw, ah } = area();
  if (aw <= 0 || ah <= 0) return { placed, sheets: [] as number[], unplaced: fresh.map((item) => item.id) };
  const { items, sheets, gap } = getDocument();
  const pad = layoutPad();
  const plan = placeIntoSheets(rects(fresh), items.map((item) => boxWith(item, pad)), sheets.map((sheet) => sheet.id), {
    from,
    area: { w: aw, h: ah },
    margin: m,
    gap,
    rotate,
    newId: newSheet,
  });
  const byId = new Map(fresh.map((item) => [item.id, item]));
  for (const p of plan.placements) {
    const { r } = byId.get(p.id)!;
    placed.set(p.id, { sheet: p.sheet, x: tidy(p.x + pad), y: tidy(p.y + pad), r: packedRotation(r, p.rotated) });
  }
  return { placed, sheets: plan.sheets, unplaced: plan.unplaced };
}

/** Adds sheets at the end (new ids). */
function addSheets(ids: readonly number[]) {
  if (!ids.length) return;
  const { sheets } = getDocument();
  if (sheets.length === 1) spilled = true;
  setDocument({ sheets: [...sheets, ...ids.map((id) => ({ id }))] });
}

/**
 * Where new pieces go without moving the ones already there (placementsFor).
 * Sets the new pieces' sheet and position (they are not in the document yet),
 * adds the new sheets and returns the ids that don't fit even alone on an
 * empty sheet.
 */
export function placeInto(fresh: Item[], from: number, { rotate = getDocument().rotate } = {}): number[] {
  const { placed, sheets, unplaced } = placementsFor(fresh, from, { rotate });
  for (const item of fresh) Object.assign(item, placed.get(item.id));
  addSheets(sheets);
  return unplaced;
}

/**
 * Places what was just loaded starting with the current sheet, without moving
 * what was there. Only what doesn't fit even alone on a sheet overlaps,
 * cascading from the center of the current sheet.
 */
export function placeNew(keys: readonly string[]) {
  const { W, H, aw, ah } = area();
  const sheet = currentSheet();
  const crowded = keys.length > 1 || getDocument().items.length > 0;
  const fresh = keys.map((key) => {
    const item = newItem(key, { sheet });
    if (applyStartSize(item)) return item;
    const [w, h] = dims(item);
    const fit = aw > 0 && ah > 0 ? Math.min(aw / w, ah / h) : 1;
    item.scale = Math.min(1, crowded ? fit * CROWD_LIMIT : fit) * 100;
    return item;
  });
  const unplaced = new Set(placeInto(fresh, sheetIndex(sheet)));
  const cascade = fresh.filter((item) => unplaced.has(item.id));
  cascade.forEach((item, i) => {
    const [w, h] = dims(item);
    const offset = (i - (cascade.length - 1) / 2) * 5;
    item.x = tidy((W - w) / 2 + offset);
    item.y = tidy((H - h) / 2 + offset);
  });
  setDocument({ items: [...getDocument().items, ...fresh] });
  setSelection([fresh[fresh.length - 1].id]);
}

/**
 * Where `times` copies of each of `items` would go, without changing
 * anything: identical (unrotated, with their crop), in the free gaps from
 * sheet index `from` (default: the first one's sheet), continuing on the next
 * sheets and on new ones. The ones that don't fit even alone go 5 mm right
 * and down from their original (overlapping). Returns the copies (ids from
 * `ids.item`) and the sheets to add (ids from `ids.sheet`).
 */
export function copiesOf(items: readonly Piece[], times = 1, from = sheetIndex(items[0].sheet), ids: NewIds = REAL_IDS) {
  const copies: Item[] = [];
  const original = new Map<number, Piece>();
  for (let i = 0; i < times; i++) {
    for (const item of items) {
      const copy = { ...item, id: ids.item() };
      original.set(copy.id, item);
      copies.push(copy);
    }
  }
  const { placed, sheets, unplaced } = placementsFor(copies, from, { rotate: false, newSheet: ids.sheet });
  const away = new Set(unplaced);
  for (const copy of copies) {
    if (!away.has(copy.id)) {
      Object.assign(copy, placed.get(copy.id));
      continue;
    }
    const item = original.get(copy.id)!;
    copy.sheet = item.sheet;
    copy.x = item.x + 5;
    copy.y = item.y + 5;
  }
  return { copies, sheets };
}

/** Adds the copies of copiesOf (and the sheets they need). Returns the copies. */
export function duplicatePieces(items: readonly Piece[], times = 1, from = sheetIndex(items[0].sheet)): Item[] {
  const { copies, sheets } = copiesOf(items, times, from);
  addSheets(sheets);
  setDocument({ items: [...getDocument().items, ...copies] });
  return copies;
}

// ---------- Pieces that changed size ----------

/**
 * What core/resize needs to know of the document to settle pieces that
 * changed size: the asset sizes, the sheet, the gap, the cut margin and
 * whether overlaps are allowed. `newSheet`: the ids of the sheets it adds.
 */
export function resizeOptions(newSheet: () => number = newSheetId) {
  const { W, H, m } = area();
  const { gap, allowOverlap } = getDocument();
  return { assetOf: (item: Item) => getAsset(item.asset), W, H, margin: m, gap, pad: layoutPad(), allowOverlap, newSheet };
}

/**
 * Puts the pieces of a resize plan where it says (core/resize: center kept
 * on the sheet, moved off the others unless overlaps are allowed), adding the
 * sheets it needs. Changes the document: commit before.
 */
export function applySettled(changed: readonly Item[], sheets: readonly number[]) {
  addSheets(sheets);
  const byId = new Map(changed.map((item) => [item.id, item]));
  setDocument({ items: getDocument().items.map((item) => byId.get(item.id) ?? item) });
}

/**
 * Applies pieces that changed size (same ids, already with their new values)
 * so they stay valid (core/resize.settleResized). Returns the ids that moved
 * aside. Changes the document: commit before.
 */
export function settle(changed: readonly Item[]): number[] {
  const { items, sheets } = getDocument();
  const plan = settleResized(
    changed,
    items,
    sheets.map((sheet) => sheet.id),
    resizeOptions()
  );
  applySettled(plan.items, plan.sheets);
  return plan.moved;
}

// ---------- Print resolution ----------

export type Resolution = { vector: true } | { vector?: false; ppp: number; level: 'good' | 'ok' | 'low' };

/**
 * At how many ppi a piece prints: pixels of the visible area (with its crop)
 * over its unrotated printed width, in inches. PDF pages with no rotation of
 * their own go as vectors; rotated ones, as their preview. QR codes, as
 * vectors.
 */
export function printResolution(item: Piece): Resolution {
  const asset = getAsset(item.asset);
  if (asset.kind === 'qr' || (asset.kind === 'pdf' && asset.pageRotation % 360 === 0)) return { vector: true };
  const pixels = asset.px[0] * (isIdentity(item.crop) ? 1 : item.crop!.w);
  const inches = pieceSize(asset, item).uw / 25.4;
  const ppp = Math.round(pixels / inches);
  return { ppp, level: ppp >= 200 ? 'good' : ppp >= 120 ? 'ok' : 'low' };
}

// ---------- Fill with copies (the piece's sheet) ----------

export function fillPlan(item: Piece) {
  const { aw, ah } = area();
  const { gap: g, rotate } = getDocument();
  // Each copy takes its layout box: the image and, with a positive cut margin, the margin around it.
  const pad = layoutPad();
  const [w, h] = dims(item).map((v) => v + 2 * pad);
  const grid = (cw: number, ch: number) => {
    const cols = Math.max(0, Math.floor((aw + g + 1e-6) / (cw + g)));
    const rows = Math.max(0, Math.floor((ah + g + 1e-6) / (ch + g)));
    return { cols, rows, count: cols * rows, w: cw, h: ch, rotated: false };
  };
  const plan = grid(w, h);
  if (rotate && Math.abs(w - h) > 1e-6) {
    const turned = { ...grid(h, w), rotated: true };
    if (turned.count > plan.count) return turned;
  }
  return plan;
}

/** Summary for «Rellenar con copias»: text, warning (what it replaces) and whether it can be done. */
export function fillSummary(item: Piece) {
  const { count } = fillPlan(item);
  const { sheets, items } = getDocument();
  const many = sheets.length > 1;
  const sheet = sheetIndex(item.sheet) + 1;
  const warning = many ? t('props.fillWarningSheet', { i: sheet }) : t('props.fillWarning');
  const others = items.length - itemsOn(item.sheet).length;
  if (!count) return { text: t('props.fillNoFit'), warning, ok: false };
  if (count + others > MAX_ITEMS) return { text: t('props.fillTooMany', { n: count, max: MAX_ITEMS }), warning, ok: false };
  const text = many ? t('props.fillSummarySheet', { n: count, i: sheet }) : t('props.fillSummary', { n: count, paper: paperName() });
  return { text, warning, ok: true };
}

/**
 * The copies «Rellenar con copias» would leave on `item`'s sheet in place of
 * its pieces, without changing anything (ids from `newId`), or null when it
 * can't (nothing fits, or too many).
 */
export function fillCopies(item: Piece, newId = newItemId): Item[] | null {
  const plan = fillPlan(item);
  if (!fillSummary(item).ok) return null;
  const { W, H } = area();
  const g = getDocument().gap;
  const x0 = (W - (plan.cols * plan.w + (plan.cols - 1) * g)) / 2;
  const y0 = (H - (plan.rows * plan.h + (plan.rows - 1) * g)) / 2;
  const r = packedRotation(item.r, plan.rotated);
  const pad = layoutPad();
  const copies: Item[] = [];
  for (let row = 0; row < plan.rows; row++) {
    for (let col = 0; col < plan.cols; col++) {
      const x = tidy(x0 + col * (plan.w + g) + pad);
      const y = tidy(y0 + row * (plan.h + g) + pad);
      copies.push({ id: newId(), asset: item.asset, sheet: item.sheet, scale: item.scale, r, x, y, crop: item.crop ?? null });
    }
  }
  return copies;
}

/** Replaces the pieces of the selected one's sheet with copies of it (the other sheets don't change). */
export function fillWithCopies() {
  const item = selectedItem();
  if (!item || getDocument().busy || !fillSummary(item).ok) return false;
  const sheet = item.sheet;
  commit();
  const copies = fillCopies(item)!;
  // The copies take the place of that sheet's first piece in the overall order.
  const items = getDocument().items;
  const at = items.findIndex((other) => other.sheet === sheet);
  const rest = items.filter((other) => other.sheet !== sheet);
  rest.splice(Math.min(at, rest.length), 0, ...copies);
  setDocument({ items: rest });
  setSelection([copies[0].id]);
  followSelection(item.sheet);
  // It replaced the sheet's other pieces: easy to miss, and to want back.
  const many = getDocument().sheets.length > 1;
  sayUndoable(many ? t('notices.filledSheet', { n: copies.length, i: sheetIndex(sheet) + 1 }) : t('notices.filled', { n: copies.length }));
  return true;
}
