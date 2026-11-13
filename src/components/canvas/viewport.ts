// Where the sheets are on screen: the measured position of each sheet's box
// inside #sheets (for the selection frames and drags) and scrolling so a piece
// or a sheet is visible.

import { NARROW_QUERY } from '../../config.ts';
import type { Point, Rect } from '../../core/types.ts';
import { getDocument } from '../../state/document.ts';
import { dims, findItem, sheetSize } from '../../state/selectors.ts';
import { getView } from '../../state/view.ts';

export interface BoxOffset {
  left: number;
  top: number;
}

let boxes = new Map<number, BoxOffset>();

const stage = () => document.getElementById('stage');
const sheetsEl = () => document.getElementById('sheets');
export const pageNode = (id: number) => document.querySelector<HTMLElement>(`#sheets .page[data-sheet="${id}"]`);

/** Measures where each sheet's box is inside #sheets. */
export function measureBoxes() {
  const next = new Map<number, BoxOffset>();
  for (const sheet of getDocument().sheets) {
    const box = pageNode(sheet.id)?.querySelector<HTMLElement>('.sheet-box');
    if (box) next.set(sheet.id, { left: box.offsetLeft, top: box.offsetTop });
  }
  boxes = next;
  return boxes;
}

/** The last measured positions (measureBoxes). */
export const sheetBoxes = () => boxes;

/** px per mm of the sheets on screen. */
export const viewZoom = () => getView().zoom;

export interface LayerRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A rectangle in mm on a sheet → px in #sheets (where the frames and overlays live), from the last measure. */
export function toLayer(sheet: number, r: Rect): LayerRect | null {
  const box = boxes.get(sheet);
  if (!box) return null;
  const zoom = viewZoom();
  return { left: box.left + r.x * zoom, top: box.top + r.y * zoom, width: r.w * zoom, height: r.h * zoom };
}

/** The same as CSS values. */
export function layerStyle(sheet: number, r: Rect) {
  const p = toLayer(sheet, r);
  return p && { left: `${p.left}px`, top: `${p.top}px`, width: `${p.width}px`, height: `${p.height}px` };
}

/** A window point → px in #sheets. */
export function clientToLayer(clientX: number, clientY: number): Point {
  const r = sheetsEl()!.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

/** A window point → mm on a sheet (from the last measure). */
export function clientToSheet(sheet: number, clientX: number, clientY: number): Point | null {
  const box = boxes.get(sheet);
  if (!box) return null;
  const p = clientToLayer(clientX, clientY);
  const zoom = viewZoom();
  return { x: (p.x - box.left) / zoom, y: (p.y - box.top) / zoom };
}

/** The sheet that shows the most right now (id), or null. */
export function visibleSheet(): number | null {
  const stageEl = stage();
  const sheets = sheetsEl();
  if (!stageEl || !sheets) return null;
  const [, H] = sheetSize();
  const zoom = getView().zoom;
  const top = stageEl.scrollTop - sheets.offsetTop;
  const bottom = top + stageEl.clientHeight;
  let best: number | null = null;
  let most = -Infinity;
  for (const sheet of getDocument().sheets) {
    const box = boxes.get(sheet.id);
    if (!box) continue;
    const seen = Math.min(bottom, box.top + H * zoom) - Math.max(top, box.top);
    if (seen > most + 0.5) {
      best = sheet.id;
      most = seen;
    }
  }
  return best;
}

// Scrolls so the range [top, bottom] (in #sheets coordinates) is visible.
function scrollToRange(top: number, bottom: number) {
  const stageEl = stage();
  const sheets = sheetsEl();
  if (!stageEl || !sheets) return;
  const margin = 16;
  const offset = sheets.offsetTop;
  const viewTop = stageEl.scrollTop;
  const viewBottom = viewTop + stageEl.clientHeight;
  const a = offset + top - margin;
  const b = offset + bottom + margin;
  if (a < viewTop) stageEl.scrollTop = a;
  else if (b > viewBottom) stageEl.scrollTop = Math.min(a, b - stageEl.clientHeight);
}

// ---------- Revealing pieces ----------

/** Room kept around a revealed piece for its frame and handle, and above it for its toolbar (px). */
const REVEAL_PAD = 16;
const TOOLBAR_ROOM = 56;

/**
 * The part of the stage the person actually sees, in window coordinates:
 * without what floats over it (a panel open over the canvas, the bottom
 * buttons and docked toolbar, the notice).
 */
function visibleArea() {
  const stageEl = stage()!;
  const s = stageEl.getBoundingClientRect();
  const area = { left: s.left, top: s.top, right: s.left + stageEl.clientWidth, bottom: s.top + stageEl.clientHeight };
  const covers = document.querySelectorAll<HTMLElement>('.panel.is-drawer.is-open, .dock, #pill:not([hidden]), #piecebar[data-side="docked"]:not([hidden]), .zoom-control');
  for (const el of covers) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= area.left || r.left >= area.right || r.bottom <= area.top || r.top >= area.bottom) continue;
    if (r.top > s.top + s.height / 2) area.bottom = Math.min(area.bottom, r.top);
    else if (r.left <= area.left + 4) area.left = Math.max(area.left, r.right);
    else if (r.right >= area.right - 4) area.right = Math.min(area.right, r.left);
  }
  // Covered almost entirely (a list open over a phone's canvas): the whole stage.
  if (area.right - area.left < 48 || area.bottom - area.top < 48) return { left: s.left, top: s.top, right: s.left + stageEl.clientWidth, bottom: s.top + stageEl.clientHeight };
  return area;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Scrolls the stage so `rect` (mm, on `sheet`) and its frame and toolbar are
 * fully visible: nothing if they already are, centered otherwise. Smooth only
 * over a short distance and without reduced motion.
 */
export function revealRect(sheet: number, rect: Rect) {
  const stageEl = stage();
  const sheets = sheetsEl();
  measureBoxes();
  const p = toLayer(sheet, rect);
  if (!stageEl || !sheets || !p) return;
  const origin = sheets.getBoundingClientRect();
  const narrow = window.matchMedia(NARROW_QUERY).matches;
  const target = {
    left: origin.left + p.left - REVEAL_PAD,
    top: origin.top + p.top - REVEAL_PAD - (narrow ? 0 : TOOLBAR_ROOM),
    right: origin.left + p.left + p.width + REVEAL_PAD,
    bottom: origin.top + p.top + p.height + REVEAL_PAD,
  };
  const area = visibleArea();
  const fitsX = target.left >= area.left && target.right <= area.right;
  const fitsY = target.top >= area.top && target.bottom <= area.bottom;
  if (fitsX && fitsY) return;
  // Centered on what is seen; bigger than that, from its top left corner.
  const axis = (from: number, to: number, lo: number, hi: number, fits: boolean) =>
    fits ? 0 : to - from > hi - lo ? from - lo : (from + to) / 2 - (lo + hi) / 2;
  const dx = axis(target.left, target.right, area.left, area.right, fitsX);
  const dy = axis(target.top, target.bottom, area.top, area.bottom, fitsY);
  const smooth = !reducedMotion() && Math.hypot(dx, dy) < stageEl.clientHeight;
  stageEl.scrollTo({ left: stageEl.scrollLeft + dx, top: stageEl.scrollTop + dy, behavior: smooth ? 'smooth' : 'instant' });
}

/** Shows the piece if it is out of view (the list, the keyboard, adding, moving it to another sheet…). */
export function revealPiece(id: number) {
  const item = findItem(id);
  if (!item) return;
  const [w, h] = dims(item);
  revealRect(item.sheet, { x: item.x, y: item.y, w, h });
}

/**
 * Shows the box of some pieces (what was just added to the selection); if
 * they are on several sheets, the primary piece.
 */
export function revealPieces(ids: readonly number[], primary: number) {
  const items = ids.map((id) => findItem(id)).filter((item) => !!item);
  if (!items.length) return;
  if (new Set(items.map((item) => item.sheet)).size > 1) return revealPiece(primary);
  const rects = items.map((item) => {
    const [w, h] = dims(item);
    return { x: item.x, y: item.y, w, h };
  });
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  revealRect(items[0].sheet, { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y });
}

/** Shows the sheet (with its heading). */
export function revealSheet(id: number) {
  const page = pageNode(id);
  const box = measureBoxes().get(id);
  if (!page || !box) return;
  const [, H] = sheetSize();
  const head = page.firstElementChild as HTMLElement;
  scrollToRange(box.top - head.offsetHeight, box.top + H * getView().zoom);
}
