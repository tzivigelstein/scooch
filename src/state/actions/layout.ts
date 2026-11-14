// Arrange (on as many sheets as needed), shrink to use one sheet, place what
// is new and fill a sheet with copies. The geometry is in core/pack.js and
// core/sheets.js.

import { CROWD_LIMIT, MAX_ITEMS } from '../../config.ts';
import { overlapsAny } from '../../core/collide.js';
import { isIdentity, pieceSize } from '../../core/crop.js';
import { fitScale, pack, packSheets } from '../../core/pack.js';
import { arrangeSheets, freeSpotNear, keepCenterInside, placeIntoSheets, samePlan, type ArrangePlan } from '../../core/sheets.js';
import type { Item } from '../../core/types.ts';
import { clamp, tidy } from '../../core/util.ts';
import { formatList, t } from '../../copy/index.ts';
import { paperName } from '../../services/measure.ts';
import { getAsset } from '../assets.ts';
import { getDocument, newItem, newItemId, newSheetId, setDocument, type Piece } from '../document.ts';
import { commit } from '../history.ts';
import { area, boxOf, boxWith, currentSheet, dims, findItem, itemsOn, layoutPad, pieceName, selectedItem, sheetIndex } from '../selectors.ts';
import { animateNext } from '../view.ts';
import { say } from './notify.ts';
import { setSelection } from './selection.ts';

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
export function withCenterKept(item: Piece, patch: Partial<Item>): Item {
  const [w, h] = dims(item);
  const next = { ...item, ...patch };
  const [nw, nh] = dims(next);
  return { ...next, x: item.x + w / 2 - nw / 2, y: item.y + h / 2 - nh / 2 };
}

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
    return { ...item, sheet: p.sheet, x: tidy(p.x + pad), y: tidy(p.y + pad), r: p.rotated ? (((item.r + 90) % 360) as Item['r']) : item.r };
  });
  setDocument({ sheets: plan.sheets.map((id) => ({ id })), items });
  lastArranged = layoutSignature();
}

const arrangedText = (n: number, sheets: number) => (sheets > 1 ? t('notices.arrangedSheets', { n, sheets }) : t('notices.arranged', { n }));

/**
 * Arranges ALL the pieces without overlaps, on as many sheets as needed
 * (creates or removes sheets: no empty sheets are left at the end). Returns
 * the result ('arranged', 'same' or 'error') or null if there was nothing to do.
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
    say(arrangedText(n, sheets.length));
    return 'same';
  }
  const before = sheets.length;
  const sheetIds = sheets.map((sheet) => sheet.id);
  const all = items.map(boxOf);
  const plan = arrangeSheets(all, sheetIds, { area: { w: aw, h: ah }, margin: m, ...packOptions(), newId: newSheetId });
  if (samePlan(plan, all, sheetIds, tidy)) {
    lastArranged = layoutSignature();
    say(arrangedText(n, sheets.length));
    return 'same';
  }
  commit();
  animateNext();
  applyPlan(plan);
  const fromOne = before === 1 || spilled;
  spilled = false;
  const placed = n - plan.unplaced.length;

  // The ones that don't fit even alone stay where they were, and fitting them is offered.
  if (plan.unplaced.length) {
    const names = formatList(plan.unplaced.map(pieceName));
    const unplaced = t('notices.unplaced', { n: plan.unplaced.length, names });
    const text = placed ? t('notices.twoSentences', { first: arrangedText(placed, plan.packed), second: unplaced }) : unplaced;
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
  say(arrangedText(n, plan.packed));
  return 'arranged';
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
  say(t('notices.fitted', { n: items.length }));
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
    say(t('notices.shrunk', { n, pct: f * 100 }));
    return true;
  }
  say(t('errors.shrinkFailed'), { warn: true });
  return false;
}

// ---------- What is new (added files, copies) ----------

/**
 * Where new pieces go without moving the ones already there: fills gaps from
 * sheet index `from` and continues on the next ones or on new sheets at the
 * end. `rotate`: whether they may turn to fit better. Sets the new pieces'
 * sheet and position (they are not in the document yet), adds the new sheets
 * and returns the ids that don't fit even alone on an empty sheet.
 */
export function placeInto(fresh: Item[], from: number, { rotate = getDocument().rotate } = {}): number[] {
  const { m, aw, ah } = area();
  if (aw <= 0 || ah <= 0) return fresh.map((item) => item.id);
  const { items, sheets, gap } = getDocument();
  const pad = layoutPad();
  const plan = placeIntoSheets(rects(fresh), items.map((item) => boxWith(item, pad)), sheets.map((sheet) => sheet.id), {
    from,
    area: { w: aw, h: ah },
    margin: m,
    gap,
    rotate,
    newId: newSheetId,
  });
  for (const p of plan.placements) {
    const item = fresh.find((f) => f.id === p.id)!;
    item.sheet = p.sheet;
    item.x = tidy(p.x + pad);
    item.y = tidy(p.y + pad);
    if (p.rotated) item.r = ((item.r + 90) % 360) as Item['r'];
  }
  if (plan.sheets.length && sheets.length === 1) spilled = true;
  if (plan.sheets.length) setDocument({ sheets: [...sheets, ...plan.sheets.map((id) => ({ id }))] });
  return plan.unplaced;
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
 * `times` copies of each of `items`, identical (unrotated, with their crop),
 * in the free gaps from sheet index `from` (default: the first one's sheet),
 * continuing on the next sheets and on new ones, without moving anything. The
 * ones that don't fit even alone go 5 mm right and down from their original
 * (overlapping, with a notice). Returns the copies, already added.
 */
export function duplicatePieces(items: readonly Piece[], times = 1, from = sheetIndex(items[0].sheet)): Item[] {
  const copies: Item[] = [];
  const original = new Map<number, Piece>();
  for (let i = 0; i < times; i++) {
    for (const item of items) {
      const copy = { ...item, id: newItemId() };
      original.set(copy.id, item);
      copies.push(copy);
    }
  }
  const unplaced = new Set(placeInto(copies, from, { rotate: false }));
  for (const copy of copies) {
    if (!unplaced.has(copy.id)) continue;
    const item = original.get(copy.id)!;
    copy.sheet = item.sheet;
    copy.x = item.x + 5;
    copy.y = item.y + 5;
  }
  setDocument({ items: [...getDocument().items, ...copies] });
  return copies;
}

// ---------- Pieces that changed size ----------

/**
 * Applies pieces that changed size (same ids, already with their new values)
 * so they stay valid: each center stays on its sheet and, unless overlaps are
 * allowed, a piece that would land on another moves to the closest free spot
 * of its sheet or, without room there, to the free gaps of the next sheets
 * (adding one if needed). One that doesn't fit even alone stays where it is.
 * Returns the ids that moved aside. Changes the document: commit before.
 */
export function settle(changed: readonly Item[]): number[] {
  const { W, H, m } = area();
  const next = new Map(changed.map((item) => [item.id, { ...item }]));
  for (const item of next.values()) {
    const [w, h] = dims(item);
    Object.assign(item, keepCenterInside({ x: item.x, y: item.y, w, h }, W, H));
  }
  let items = getDocument().items.map((item) => next.get(item.id) ?? item);
  const moved: number[] = [];
  const homeless = new Set<number>();
  const pad = layoutPad();
  if (!getDocument().allowOverlap) {
    for (const item of next.values()) {
      const rect = boxWith(item, pad);
      const others = items.filter((other) => other.sheet === item.sheet && other.id !== item.id && !homeless.has(other.id)).map((other) => boxWith(other, pad));
      if (!overlapsAny(rect, others)) continue;
      const spot = freeSpotNear(rect, others, { W, H, margin: m });
      if (spot) {
        item.x = tidy(spot.x + pad);
        item.y = tidy(spot.y + pad);
        moved.push(item.id);
      } else homeless.add(item.id);
      items = items.map((other) => (other.id === item.id ? item : other));
    }
  }
  if (!homeless.size) {
    setDocument({ items });
    return moved;
  }
  // Without room on their sheet: placed like new pieces from that sheet on.
  setDocument({ items: items.filter((item) => !homeless.has(item.id)) });
  const away = items.filter((item) => homeless.has(item.id)).map((item) => ({ ...item }));
  const unplaced = new Set(placeInto(away, sheetIndex(away[0].sheet), { rotate: false }));
  const placed = new Map(away.filter((item) => !unplaced.has(item.id)).map((item) => [item.id, item]));
  setDocument({ items: items.map((item) => placed.get(item.id) ?? item) });
  return [...moved, ...placed.keys()];
}

// ---------- Print resolution ----------

export type Resolution = { vector: true } | { vector?: false; ppp: number; level: 'good' | 'ok' | 'low' };

/**
 * At how many ppi a piece prints: pixels of the visible area (with its crop)
 * over its unrotated printed width, in inches. PDF pages with no rotation of
 * their own go as vectors; rotated ones, as their preview.
 */
export function printResolution(item: Piece): Resolution {
  const asset = getAsset(item.asset);
  if (asset.kind === 'pdf' && asset.pageRotation % 360 === 0) return { vector: true };
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

/** Replaces the pieces of the selected one's sheet with copies of it (the other sheets don't change). */
export function fillWithCopies() {
  const item = selectedItem();
  if (!item || getDocument().busy) return false;
  const plan = fillPlan(item);
  if (!fillSummary(item).ok) return false;
  const { W, H } = area();
  const g = getDocument().gap;
  const x0 = (W - (plan.cols * plan.w + (plan.cols - 1) * g)) / 2;
  const y0 = (H - (plan.rows * plan.h + (plan.rows - 1) * g)) / 2;
  const r = (plan.rotated ? (item.r + 90) % 360 : item.r) as Item['r'];
  const sheet = item.sheet;
  const pad = layoutPad();

  commit();
  const copies: Item[] = [];
  for (let row = 0; row < plan.rows; row++) {
    for (let col = 0; col < plan.cols; col++) {
      const x = tidy(x0 + col * (plan.w + g) + pad);
      const y = tidy(y0 + row * (plan.h + g) + pad);
      copies.push(newItem(item.asset, { sheet, scale: item.scale, r, x, y, crop: item.crop ?? null }));
    }
  }
  // The copies take the place of that sheet's first piece in the overall order.
  const items = getDocument().items;
  const at = items.findIndex((other) => other.sheet === sheet);
  const rest = items.filter((other) => other.sheet !== sheet);
  rest.splice(Math.min(at, rest.length), 0, ...copies);
  setDocument({ items: rest });
  setSelection([copies[0].id]);
  const many = getDocument().sheets.length > 1;
  say(many ? t('notices.filledSheet', { n: plan.count, i: sheetIndex(sheet) + 1 }) : t('notices.filled', { n: plan.count }));
  return true;
}
