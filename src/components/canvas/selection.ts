// What marks the selection on the sheets: with one piece, its frame (#frame);
// with several, a frame around the selected ones of each sheet, each with its
// handle. The toolbar goes next to the piece or next to the primary's frame.
// Positions depend on the measured layout, so they are painted directly, from
// the document or from the live values of a gesture.

import { NARROW_QUERY } from '../../config.ts';
import { bounds } from '../../core/align.js';
import { clip, liftOff, pickSpot } from '../../core/placement.js';
import type { Rect } from '../../core/types.ts';
import { clamp } from '../../core/util.js';
import { t } from '../../copy/index.ts';
import { sizeText } from '../../services/measure.ts';
import type { Piece } from '../../state/document.ts';
import { getDocument } from '../../state/document.ts';
import { imageBoxOf, itemsOn, sheetSize } from '../../state/selectors.ts';
import { layerStyle, measureBoxes, mmToPx, pageNode, sheetBoxes, stageBars, toClient } from './viewport.ts';

/** The box of the selected pieces of each sheet (mm, on its sheet): sheet → rect. */
export function groupBoxes(list: readonly Piece[]) {
  const bySheet = new Map<number, Rect[]>();
  for (const item of list) {
    if (!bySheet.has(item.sheet)) bySheet.set(item.sheet, []);
    bySheet.get(item.sheet)!.push(imageBoxOf(item));
  }
  return new Map([...bySheet].map(([id, rects]) => [id, bounds(rects)!]));
}

export interface SelectionTarget extends Rect {
  sheet: number;
  ids: Set<number>;
}

/**
 * Where the toolbar goes: the selected piece or, with several, the box of the
 * selected ones on the primary's sheet. null without a selection.
 */
export function selectionTarget(list: readonly Piece[], bySheet = list.length > 1 ? groupBoxes(list) : null): SelectionTarget | null {
  if (!list.length) return null;
  const primaryId = getDocument().selection.at(-1);
  const primary = list.find((item) => item.id === primaryId) ?? list.at(-1)!;
  if (!sheetBoxes().get(primary.sheet)) return null;
  const rect = list.length > 1 ? bySheet!.get(primary.sheet)! : imageBoxOf(primary);
  return { sheet: primary.sheet, x: rect.x, y: rect.y, w: rect.w, h: rect.h, ids: new Set(list.map((item) => item.id)) };
}

/**
 * Paints the frames and the toolbar's size for `list` (the selected pieces, or
 * their live copies during a gesture). `place`: also places the toolbar.
 */
export function paintSelection(list: readonly Piece[], { place = true } = {}) {
  const group = list.length > 1;
  const single = !group ? list[0] : undefined;
  const frame = document.getElementById('frame');
  const style = single && layerStyle(single.sheet, imageBoxOf(single));
  if (frame) {
    frame.hidden = !style;
    if (style) Object.assign(frame.style, style);
    // The cut box, faint, while cut lines are on and the cut margin moves them off the image.
    const { mode, margin } = getDocument().cuts;
    const cut = mode !== 'none' && margin !== 0;
    frame.toggleAttribute('data-cut', cut);
    if (cut) frame.style.setProperty('--cut', `${mmToPx(margin)}px`);
  }
  const bySheet = group ? groupBoxes(list) : new Map<number, Rect>();
  const frames = [...document.querySelectorAll<HTMLElement>('#sheets > .group-frame')];
  [...bySheet].forEach(([sheet, rect], i) => {
    const groupStyle = layerStyle(sheet, rect);
    if (groupStyle && frames[i]) Object.assign(frames[i].style, groupStyle);
  });
  const target = selectionTarget(list, bySheet);
  const size = document.getElementById('piece-size');
  if (target && size) size.textContent = group ? t('pieces.count', { n: list.length }) : sizeText(target.w, target.h);
  if (target && place) placePiecebar(target);
}

/** Paints the selection of the document (measuring the sheets first). */
export function paintCommittedSelection() {
  measureBoxes();
  const { items, selection } = getDocument();
  paintSelection(items.filter((item) => selection.includes(item.id)));
}

/**
 * The piece's toolbar. On narrow screens it is docked at the bottom, above the
 * «Piezas» and «Propiedades» buttons (the CSS does it). Otherwise it tries
 * above, below (centered or aligned with an edge of the piece) and outside the
 * sheet on each side, and keeps the spot covering the fewest pieces; on a tie,
 * in that order. It never leaves the canvas or sits under a panel open over
 * the canvas. With no room beside the piece, it goes over it, lifted off the
 * notice and the zoom control if they are in the way. If the piece scrolled
 * out of view, the toolbar hides until it is back.
 */
export function placePiecebar(target: SelectionTarget) {
  const bar = document.getElementById('piecebar');
  if (bar) placeBar(bar, target);
}

/** Places a floating bar next to `target` like the piece's toolbar (see placePiecebar). */
export function placeBar(bar: HTMLElement, target: Pick<SelectionTarget, 'sheet' | 'x' | 'y' | 'w' | 'h' | 'ids'>) {
  const canvasEl = document.getElementById('canvas');
  const stageEl = document.getElementById('stage');
  if (!canvasEl || !stageEl) return;
  if (window.matchMedia(NARROW_QUERY).matches) {
    bar.style.transform = '';
    bar.dataset.side = 'docked';
    bar.classList.remove('is-offscreen');
    return;
  }
  const page = pageNode(target.sheet);
  if (!page || !sheetBoxes().has(target.sheet)) return;
  const canvas = canvasEl.getBoundingClientRect();
  const stage = stageEl.getBoundingClientRect();
  // Rectangles in mm on the sheet → px on the canvas (the bar's coordinates).
  const onCanvas = (r: Rect) => {
    const c = toClient(target.sheet, r)!;
    return { x: c.x - canvas.left, y: c.y - canvas.top, w: c.w, h: c.h };
  };
  const [W, H] = sheetSize();
  const sheet = onCanvas({ x: 0, y: 0, w: W, h: H });
  const piece = onCanvas(target);
  const visible = { x: stage.left - canvas.left, y: stage.top - canvas.top, w: stage.width, h: stage.height };
  const offscreen = !clip(piece, visible) && !bar.contains(document.activeElement);
  bar.classList.toggle('is-offscreen', offscreen);
  if (offscreen) return;
  const w = bar.offsetWidth;
  const h = bar.offsetHeight;
  const gap = 12;
  const edge = 8;
  // Available area: the canvas minus the pieces panel when it is open over it
  // (from the left). With offset*: the final position, even while the panel
  // is still sliding in.
  const panels = [...document.querySelectorAll<HTMLElement>('.panel.is-open')].map((panel) => ({
    x: panel.offsetLeft - canvasEl.offsetLeft,
    y: panel.offsetTop - canvasEl.offsetTop,
    w: panel.offsetWidth,
    h: panel.offsetHeight,
  }));
  const minX = Math.max(edge, ...panels.filter((r) => r.x <= edge).map((r) => r.x + r.w + edge));
  // The zoom control floats in a corner of the canvas, and the notice over it:
  // the bar never covers them.
  for (const el of document.querySelectorAll('.zoom-control, #pill:not([hidden])')) {
    const r = el.getBoundingClientRect();
    if (r.width) panels.push({ x: r.left - canvas.left, y: r.top - canvas.top, w: r.width, h: r.height });
  }
  // Off the stage's scrollbars too.
  const bars = stageBars();
  const area = { x: minX, y: edge, w: canvas.width - edge - minX - bars.right, h: canvas.height - 2 * edge - bars.bottom };
  const inX = (x: number) => clamp(x, area.x, Math.max(area.x, area.x + area.w - w));
  const above = piece.y - h - gap;
  const below = piece.y + piece.h + gap + 6; // room for the handle
  const beside = clamp(piece.y, edge, canvas.height - h - edge);
  const xs = [piece.x + piece.w / 2 - w / 2, piece.x, piece.x + piece.w - w];
  const candidates = [
    ...xs.map((x) => ({ side: 'above', x: inX(x), y: above, w, h })),
    ...xs.map((x) => ({ side: 'below', x: inX(x), y: below, w, h })),
    { side: 'left', x: sheet.x - w - gap, y: beside, w, h },
    { side: 'right', x: sheet.x + sheet.w + gap, y: beside, w, h },
  ];
  // What shows of the sheet's other pieces (the sheet clips what sticks out)
  // and the sheet's heading (with its remove button).
  const head = page.firstElementChild!.getBoundingClientRect();
  const covers = itemsOn(target.sheet)
    .filter((other) => !target.ids.has(other.id))
    .map((other) => clip(onCanvas(imageBoxOf(other)), sheet))
    .filter((r) => !!r)
    .concat({ x: head.left - canvas.left, y: head.top - canvas.top, w: head.width, h: head.height });
  // If it fits nowhere, over the piece, inside the canvas: lifted off the
  // notice and the zoom control when it would sit on them.
  const over = { side: 'over', x: inX(xs[0]), y: clamp(above, edge, canvas.height - h - edge), w, h };
  const spot = pickSpot(candidates, { bounds: area, covers, blocked: panels }) ?? liftOff(over, { bounds: area, blocked: panels, gap }) ?? over;
  bar.style.transform = `translate(${Math.round(spot.x)}px, ${Math.round(spot.y)}px)`;
  bar.dataset.side = spot.side;
}
