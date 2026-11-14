// Where the sheets are on screen: the measured position of each sheet's box
// inside #sheets (for the selection frames and drags) and scrolling so a piece
// or a sheet is visible.

import { NARROW_QUERY } from '../../config.ts';
import { t } from '../../copy/index.ts';
import { sheetAt } from '../../core/sheets.js';
import type { Point, Rect } from '../../core/types.ts';
import { getDocument } from '../../state/document.ts';
import { dims, findItem, sheetSize } from '../../state/selectors.ts';
import { clampPercent, fromPercent, pinchSpan, pinchView, stepPercent, toPercent, type PinchPair } from '../../core/zoom.js';
import { flushUi } from '../../state/flush.ts';
import { isDragging } from '../../state/gesture.ts';
import { getView, setView, type ZoomMode } from '../../state/view.ts';
import { announce, cancelAnnounce } from '../feedback/announcer.ts';
import { stopGlide } from './glide.ts';

export interface BoxOffset {
  left: number;
  top: number;
}

let boxes = new Map<number, BoxOffset>();
// The page heading's height and the gap between pages (px), measured with the boxes.
let spacing = { head: 0, gap: 0 };

const stage = () => document.getElementById('stage');
const sheetsEl = () => document.getElementById('sheets');
export const pageNode = (id: number) => document.querySelector<HTMLElement>(`#sheets .page[data-sheet="${id}"]`);

/** Measures where each sheet's box is inside #sheets (to the subpixel: offsetTop rounds). */
export function measureBoxes() {
  const next = new Map<number, BoxOffset>();
  const origin = sheetsEl()?.getBoundingClientRect();
  for (const sheet of getDocument().sheets) {
    const box = pageNode(sheet.id)?.querySelector<HTMLElement>('.sheet-box');
    if (!box || !origin) continue;
    const r = box.getBoundingClientRect();
    next.set(sheet.id, { left: r.left - origin.left, top: r.top - origin.top });
  }
  boxes = next;
  const first = getDocument().sheets[0];
  const el = sheetsEl();
  spacing = {
    head: (first && (pageNode(first.id)?.firstElementChild as HTMLElement | null)?.offsetHeight) || 0,
    gap: (el && parseFloat(getComputedStyle(el).rowGap)) || 0,
  };
  return boxes;
}

/** The last measured positions (measureBoxes). */
export const sheetBoxes = () => boxes;

/** px per mm of the sheets on screen. */
export const viewZoom = () => getView().zoom;

/** The stage's scrollbars (px; 0 when they overlay the content): {right, bottom}. */
export function stageBars() {
  const stageEl = stage();
  return stageEl ? { right: stageEl.offsetWidth - stageEl.clientWidth, bottom: stageEl.offsetHeight - stageEl.clientHeight } : { right: 0, bottom: 0 };
}

/**
 * Tells the canvas how wide the stage's scrollbars are (--stage-bar-right,
 * --stage-bar-bottom), so what floats over the stage stays off them.
 */
export function syncStageBars() {
  const canvas = stage()?.parentElement;
  if (!canvas) return;
  const { right, bottom } = stageBars();
  for (const [name, value] of [['--stage-bar-right', right], ['--stage-bar-bottom', bottom]] as const) {
    if (canvas.style.getPropertyValue(name) !== `${value}px`) canvas.style.setProperty(name, `${value}px`);
  }
}

// ---------- Zoom ----------

const clampZoom = (next: number, current = viewZoom()) => fromPercent(clampPercent(toPercent(next), toPercent(current)));

/** The zoom in percent (a screen measure: 100 % is not the printed size). */
export const zoomPercent = (zoom = viewZoom()) => toPercent(zoom);

/** The room the sheets have in the stage (without its padding): {width, height} in px. */
function stageRoom(stageEl: HTMLElement) {
  const style = getComputedStyle(stageEl);
  return {
    width: stageEl.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    height: stageEl.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
  };
}

/** Is the sheets' column wider than the stage (so it scrolls sideways)? */
export function sheetsAreWide(zoom = viewZoom()) {
  const stageEl = stage();
  if (!stageEl) return false;
  const [W] = sheetSize();
  return W * zoom > stageRoom(stageEl).width + 0.5;
}

/**
 * The zoom that fits a sheet (with its heading and, below, the button to add
 * another) in the visible height and width ('fit'), or only its width.
 */
export function fitZoom(mode: 'fit' | 'width') {
  const stageEl = stage();
  const sheets = sheetsEl();
  if (!stageEl || !sheets) return viewZoom();
  const [W, H] = sheetSize();
  const room = stageRoom(stageEl);
  if (mode === 'width') return Math.max(0.05, room.width / W);
  const foot = sheets.querySelector<HTMLElement>('.sheets-foot');
  const head = sheets.querySelector<HTMLElement>('.page-head')?.offsetHeight ?? 0;
  const gap = parseFloat(getComputedStyle(sheets).rowGap) || 0;
  const footSpace = foot ? foot.offsetHeight + gap + parseFloat(getComputedStyle(foot).marginTop || '0') : 0;
  return Math.max(0.05, Math.min(room.width / W, (room.height - head - footSpace) / H));
}

/**
 * Sets the zoom keeping the sheet point under window point `at` (default: the
 * middle of the stage) where it was. `mode`: 'manual' (the person's, kept as
 * it is) unless it is a fit. Nothing changes during a drag.
 */
export function zoomTo(next: number, { at = null as Point | null, mode = 'manual' as ZoomMode } = {}) {
  stopGlide();
  const stageEl = stage();
  const sheets = sheetsEl();
  if (!stageEl || !sheets || isDragging()) return;
  const zoom = mode === 'manual' ? clampZoom(next) : next;
  if (Math.abs(zoom - viewZoom()) < 1e-9 && getView().zoomMode === mode) return;
  const s = stageEl.getBoundingClientRect();
  const point = at ?? { x: s.left + stageEl.clientWidth / 2, y: s.top + stageEl.clientHeight / 2 };
  measureBoxes();
  const anchor = sheetPoint(point.x, point.y);
  setView({ zoom, zoomMode: mode });
  flushUi();
  measureBoxes();
  if (!anchor) return;
  // The same sheet point under the window point: scroll by how far it went.
  const layer = toLayer(anchor.sheet, { x: anchor.x, y: anchor.y, w: 0, h: 0 });
  if (!layer) return;
  const origin = sheets.getBoundingClientRect();
  stageEl.scrollLeft = stageEl.classList.contains('is-wide') ? stageEl.scrollLeft + origin.left + layer.left - point.x : 0;
  stageEl.scrollTop += origin.top + layer.top - point.y;
}

/** Zooms by `factor` around window point `at` (the middle of the stage by default). */
export const zoomBy = (factor: number, at: Point | null = null) => zoomTo(viewZoom() * factor, { at });

/** What holds the sheets under the fingers during a pinch: a sheet and where its box's corner should be (window px). */
export interface PinchAnchor {
  sheet: number;
  corner: Point;
}

/**
 * One step of a two-finger pinch: the fingers went from `before` to `after`
 * (window px). Zooms as they spread or close (a zoom of the person's) and
 * scrolls so the sheet point under their midpoint stays under it. `anchor`:
 * what the last step returned (null on the first one, which takes the sheet
 * nearest to the fingers). Nothing changes during a drag.
 */
export function pinchTo(before: PinchPair, after: PinchPair, anchor: PinchAnchor | null): PinchAnchor | null {
  const stageEl = stage();
  const sheets = sheetsEl();
  if (!stageEl || !sheets || isDragging()) return anchor;
  measureBoxes();
  const mid = pinchSpan(before);
  const sheet = anchor?.sheet ?? sheetAtLayerY(clientToLayer(mid.x, mid.y).y);
  const corner = () => {
    const box = boxes.get(sheet);
    const origin = sheets.getBoundingClientRect();
    return box && { x: origin.left + box.left, y: origin.top + box.top };
  };
  const shown = corner();
  if (!shown) return null;
  // The sheet's box scales from its corner: pinchView's content, scrolled so its origin is at the corner.
  const at = anchor?.corner ?? shown;
  const next = pinchView(before, after, { zoom: viewZoom(), scroll: { x: -at.x, y: -at.y } });
  if (next.zoom !== viewZoom()) {
    setView({ zoom: next.zoom, zoomMode: 'manual' });
    flushUi();
    measureBoxes();
  }
  const now = corner()!;
  const { scrollLeft, scrollTop } = stageEl;
  stageEl.scrollLeft = stageEl.classList.contains('is-wide') ? scrollLeft + now.x + next.scroll.x : 0;
  stageEl.scrollTop = scrollTop + now.y + next.scroll.y;
  // Where the corner ended: where it should be, kept exact so no rounding adds
  // up over the steps, unless the stage couldn't scroll that far (an end of the
  // scroll, or across when the sheets fit the width).
  const x = now.x - (stageEl.scrollLeft - scrollLeft);
  const y = now.y - (stageEl.scrollTop - scrollTop);
  return { sheet, corner: { x: Math.abs(x + next.scroll.x) > 1 ? x : -next.scroll.x, y: Math.abs(y + next.scroll.y) > 1 ? y : -next.scroll.y } };
}

/** A zoom level in percent (from the zoom menu or the command palette), and says it. */
export function zoomToPercent(pct: number) {
  zoomTo(fromPercent(pct));
  announce(t('zoom.changed', { pct }));
}

/** One level in (1) or out (−1), around the middle of the stage, and says the new level. */
export function stepZoom(dir: 1 | -1) {
  zoomTo(fromPercent(stepPercent(zoomPercent(), dir)));
  announce(t('zoom.changed', { pct: Math.round(zoomPercent()) }), { key: 'zoom', delay: 300 });
}

/**
 * «Ajustar hoja» / «Ajustar ancho»: fits `sheet` (its top, with its heading,
 * in view) and keeps fitting it when the window changes. It says so.
 */
export function fitSheet(mode: 'fit' | 'width', sheet: number) {
  if (isDragging()) return;
  cancelAnnounce('zoom'); // a level still waiting to be said is no longer the zoom
  zoomTo(fitZoom(mode), { mode });
  const box = measureBoxes().get(sheet);
  const stageEl = stage();
  const sheets = sheetsEl();
  if (box && stageEl && sheets) {
    const head = (pageNode(sheet)?.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
    stageEl.scrollTop = sheets.offsetTop + box.top - head - 8;
    stageEl.scrollLeft = 0;
  }
  announce(t(mode === 'fit' ? 'zoom.fitDone' : 'zoom.widthDone'));
}

// ---------- From the screen to the sheets and back ----------

/** A length on screen (px) in mm at the current zoom, and back. */
export const pxToMm = (px: number) => px / viewZoom();
export const mmToPx = (mm: number) => mm * viewZoom();

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
  return { left: box.left + mmToPx(r.x), top: box.top + mmToPx(r.y), width: mmToPx(r.w), height: mmToPx(r.h) };
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
  return layerToSheet(sheet, p.x, p.y);
}

/** A point in #sheets (px) → mm on a sheet (from the last measure). */
export function layerToSheet(sheet: number, x: number, y: number): Point | null {
  const box = boxes.get(sheet);
  if (!box) return null;
  return { x: pxToMm(x - box.left), y: pxToMm(y - box.top) };
}

/**
 * The sheet at height `y` in #sheets (px): the one that contains it or, in a
 * gap or past the ends, the nearest one (from the last measure).
 */
export function sheetAtLayerY(y: number): number {
  const [, H] = sheetSize();
  const { sheets } = getDocument();
  const tops = sheets.map((sheet) => boxes.get(sheet.id)?.top ?? 0);
  return sheets[sheetAt(y, tops, mmToPx(H))].id;
}

// The sheet nearest to a window point and that point in its mm (outside it too).
function sheetPoint(clientX: number, clientY: number) {
  if (!boxes.size || !sheetsEl()) return null;
  const p = clientToLayer(clientX, clientY);
  const sheet = sheetAtLayerY(p.y);
  const at = layerToSheet(sheet, p.x, p.y);
  return at && { sheet, ...at };
}

/** A rectangle in mm on a sheet → window coordinates (measured now). */
export function toClient(sheet: number, r: Rect): Rect | null {
  const p = toLayer(sheet, r);
  const sheets = sheetsEl();
  if (!p || !sheets) return null;
  const origin = sheets.getBoundingClientRect();
  return { x: origin.left + p.left, y: origin.top + p.top, w: p.width, h: p.height };
}

// ---------- A new sheet from a drag ----------

/** Where a drag can create a sheet: its place in the list and where its box would be (#sheets px). */
export interface NewSheetSpot {
  index: number;
  box: LayerRect;
  kind: 'gap' | 'end';
}

/** The sheet whose box contains a #sheets point (id), or null. */
export function sheetAtPoint(p: Point): number | null {
  const [W, H] = sheetSize();
  for (const [id, box] of boxes) {
    if (p.x >= box.left && p.x <= box.left + mmToPx(W) && p.y >= box.top && p.y <= box.top + mmToPx(H)) return id;
  }
  return null;
}

// The measured sheet boxes in order, the page heading and the gap between pages (px).
function column() {
  const tops = getDocument().sheets.map((sheet) => boxes.get(sheet.id));
  if (!tops.length || tops.some((box) => !box)) return null;
  const [W, H] = sheetSize().map(mmToPx);
  return { tops: tops as BoxOffset[], ...spacing, W, H };
}

/** Where a sheet added after the last one would be (its box, #sheets px). */
export function endSheetBox(): LayerRect | null {
  const c = column();
  if (!c) return null;
  return { left: c.tops[0].left, top: c.tops.at(-1)!.top + c.H + c.gap + c.head, width: c.W, height: c.H };
}

/**
 * Where a drag whose center (#sheets px) is outside every sheet could create
 * one: in the gap under the pointer (between two sheets or above the first)
 * or, with the center or the pointer below the last sheet, after it. null
 * when it is beside the sheets (the drop goes to the nearest one).
 */
export function newSheetSpot(center: Point, pointer: Point): NewSheetSpot | null {
  const c = column();
  if (!c) return null;
  const { tops, head, gap, W, H } = c;
  const left = tops[0].left;
  for (let i = 0; i < tops.length; i++) {
    const above = i === 0 ? -Infinity : tops[i - 1].top + H;
    if (pointer.y >= above && pointer.y < tops[i].top) {
      // The bar sits in the middle of the gap (above the first sheet, in the stage's padding).
      const line = i === 0 ? tops[0].top - head - gap / 2 : (above + tops[i].top - head) / 2;
      return { index: i, box: { left, top: line, width: W, height: H }, kind: 'gap' };
    }
  }
  const bottom = tops.at(-1)!.top + H;
  if (center.y > bottom || pointer.y > bottom) return { index: tops.length, box: endSheetBox()!, kind: 'end' };
  return null;
}

/** The sheet that shows the most right now (id), or null. */
export function visibleSheet(): number | null {
  const stageEl = stage();
  const sheets = sheetsEl();
  if (!stageEl || !sheets) return null;
  const H = mmToPx(sheetSize()[1]);
  const top = stageEl.scrollTop - sheets.offsetTop;
  const bottom = top + stageEl.clientHeight;
  let best: number | null = null;
  let most = -Infinity;
  for (const sheet of getDocument().sheets) {
    const box = boxes.get(sheet.id);
    if (!box) continue;
    const seen = Math.min(bottom, box.top + H) - Math.max(top, box.top);
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
  stopGlide();
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

/** Back to the top of the first sheet (another project opened: its sheets are another column). */
export function scrollToStart() {
  stopGlide();
  const stageEl = stage();
  if (!stageEl) return;
  stageEl.scrollTop = 0;
  stageEl.scrollLeft = 0;
}

/** Shows the sheet (with its heading). */
export function revealSheet(id: number) {
  stopGlide();
  const page = pageNode(id);
  const box = measureBoxes().get(id);
  if (!page || !box) return;
  const head = page.firstElementChild as HTMLElement;
  scrollToRange(box.top - head.offsetHeight, box.top + mmToPx(sheetSize()[1]));
}
