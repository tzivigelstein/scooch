// Pointer gestures on the sheets. On a piece: selects it and drags it (if it
// was already among several selected, drags the group; a click without moving
// leaves only that one selected). With Shift or Ctrl/Cmd, adds or removes it.
// On a handle: scales the piece or the group. On an empty spot: a marquee to
// select (a click without dragging clears the selection). Two fingers zoom
// and pan the view, and take back whatever the first one started; lifted
// while panning, the view glides on.
//
// Performance: nothing re-renders while the pointer moves. The dragged pieces
// travel in the drag layer (no clipping, so they can cross sheets) and are
// painted directly, like the frames; the live values go to gestureStore for
// the parts that preview them. The document changes once, on drop.

import { useEffect, type RefObject } from 'react';
import { DRAG_THRESHOLD, PINCH_THRESHOLD } from '../config.ts';
import { bounds, scaleGroup } from '../core/align.js';
import { maxGrowth, overlapsAny } from '../core/collide.js';
import { planDrag, planDrop, planScale, scaleBounds, touchedBy, type Drag } from '../core/group.js';
import { GLIDE_WINDOW, releaseVelocity, type GlideSample } from '../core/glide.js';
import { keepCenterInside, placeOnNewSheet } from '../core/sheets.js';
import type { Box, Point, Rect } from '../core/types.ts';
import { pinchSpan, wheelFactor, type PinchPair } from '../core/zoom.js';
import { clamp, round1, tidy } from '../core/util.ts';
import { t } from '../copy/index.ts';
import { announce } from '../components/feedback/announcer.ts';
import { paintPiece, pieceView } from '../components/canvas/pieceView.ts';
import { groupBoxes, paintSelection, placePiecebar, selectionTarget } from '../components/canvas/selection.ts';
import {
  clientToLayer,
  layerToSheet,
  measureBoxes,
  mmToPx,
  newSheetSpot,
  pinchTo,
  pxToMm,
  sheetAtLayerY,
  sheetAtPoint,
  sheetBoxes,
  toLayer,
  viewZoom,
  visibleSheet,
  zoomBy,
  type BoxOffset,
  type NewSheetSpot,
  type PinchAnchor,
} from '../components/canvas/viewport.ts';
import { paintNewSheetSpot } from '../components/canvas/newSheetDrop.ts';
import { startGlide, stopGlide } from '../components/canvas/glide.ts';
import { getAsset } from '../state/assets.ts';
import { getDocument, patchItems, useDocument, type Piece } from '../state/document.ts';
import { flushUi } from '../state/flush.ts';
import { gestureStore } from '../state/gesture.ts';
import { commit } from '../state/history.ts';
import { getPrefs } from '../state/prefs.ts';
import {
  boxes,
  boxOf,
  currentSheet,
  dims,
  findItem,
  fromBox,
  groupOptions,
  imageBoxes,
  layoutPad,
  obstaclesFor,
  othersOnSheet,
  scaleOptions,
  selectedItems,
  sheetIndex,
  sheetSize,
} from '../state/selectors.ts';
import { animateNext, getView, setView } from '../state/view.ts';
import { focusSheetNode, pieceNode } from '../state/actions/focus.ts';
import { makePrimary, select, selectTouched, setSelection, toggleInSelection } from '../state/actions/selection.ts';
import { moveToNewSheetAt } from '../state/actions/sheets.ts';
import { startCrop } from '../components/canvas/cropMode.ts';
import { openContextMenuAt, openContextMenuFromKeyboard } from '../components/canvas/contextMenu.ts';
import { isTyping } from './dom.ts';

interface Pointer {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  scroll0: number;
  scrollLeft0: number;
  moved: boolean;
}

interface Travel {
  node: HTMLElement;
  parent: Node;
  next: Node | null;
}

interface MoveGesture extends Pointer {
  kind: 'move';
  item: Piece;
  node: HTMLElement;
  size: [number, number];
  others: Map<number, Box[]>; // sheet → the other pieces' boxes
  draft: Piece & { sheet: number };
  blocked: boolean;
  target: number;
  /** Over a placeholder: dropping creates a sheet there. */
  spot: NewSheetSpot | null;
  /** How far it was dragged (px, scroll included). */
  delta: Point;
}

interface ResizeGesture extends Pointer {
  kind: 'resize';
  item: Piece;
  node: HTMLElement;
  size: [number, number];
  growth: number;
  draft: Piece;
}

interface GroupMoveGesture extends Pointer {
  kind: 'group-move';
  item: Piece;
  items: Piece[];
  collapse: boolean;
  oneSheet: number | null;
  box: Rect;
  all: Box[];
  drafts: Map<number, Piece>;
  drag: Drag | null;
  dropTarget: number | null;
  blocked: boolean;
  target: number;
  spot: NewSheetSpot | null;
  delta: Point;
}

interface GroupResizeGesture extends Pointer {
  kind: 'group-resize';
  frame: Rect;
  items: Piece[];
  range: { min: number; max: number };
  drafts: Map<number, Piece>;
  k: number;
}

interface MarqueeGesture extends Pointer {
  kind: 'marquee';
  origin: { x: number; y: number };
  additive: boolean;
  sheetId: number | null;
  touched: number[];
}

type Gesture = MoveGesture | ResizeGesture | GroupMoveGesture | GroupResizeGesture | MarqueeGesture;

let gesture: Gesture | null = null;
let travels: Travel[] = []; // nodes moved to the drag layer, to put them back
let autoFrame = 0;
let scrollFrame = 0;
let unsubscribe: (() => void) | null = null;

const el = (id: string) => document.getElementById(id)!;

// Moves a node keeping its focus where the browser can (moveBefore). Moving
// the focused piece makes Chrome scroll the stage to where the node lands
// before it is painted there (the top of #sheets): the scroll is put back.
function place(container: Node, node: Node, before: Node | null) {
  if (node.parentNode === container && node.nextSibling === before) return;
  const stage = el('stage');
  const { scrollLeft, scrollTop } = stage;
  const move = (container as Node & { moveBefore?: (node: Node, child: Node | null) => void }).moveBefore;
  let moved = false;
  if (move && node.isConnected) {
    try {
      move.call(container, node, before);
      moved = true;
    } catch {
      // falls back to insertBefore
    }
  }
  if (!moved) container.insertBefore(node, before);
  if (stage.scrollTop !== scrollTop) stage.scrollTop = scrollTop;
  if (stage.scrollLeft !== scrollLeft) stage.scrollLeft = scrollLeft;
}

/** A piece travels in the drag layer while dragged (remembering where it was). */
function toDragLayer(node: HTMLElement) {
  travels.push({ node, parent: node.parentNode!, next: node.nextSibling });
  place(el('drag-layer'), node, null);
}

/** Puts the dragged pieces back where React rendered them, and how. */
function restore() {
  for (const { node, parent, next } of travels.reverse()) {
    if (parent.isConnected) place(parent, node, next && next.parentNode === parent ? next : null);
  }
  travels = [];
  const { items, selection } = getDocument();
  const marked = selection.length > 1 || getView().pinned;
  for (const item of items) {
    const node = pieceNode(item.id);
    if (node) paintPiece(node, pieceView(item, getAsset(item.asset), viewZoom(), marked && selection.includes(item.id)));
  }
}

function capture(e: PointerEvent) {
  // The capture goes on #sheets, which doesn't move: pieces may change sheet.
  try {
    el('sheets').setPointerCapture(e.pointerId);
  } catch {
    // A pointer no longer active (or a synthetic event): the gesture goes on without capture.
  }
}

const pointer = (e: PointerEvent): Pointer => ({
  pointerId: e.pointerId,
  startX: e.clientX,
  startY: e.clientY,
  lastX: e.clientX,
  lastY: e.clientY,
  scroll0: el('stage').scrollTop,
  scrollLeft0: el('stage').scrollLeft,
  moved: false,
});

const rectOf = (item: Piece): Rect => {
  const [w, h] = dims(item);
  return { x: item.x, y: item.y, w, h };
};

function begin(next: Gesture) {
  gesture = next;
  // A change to the document mid-gesture (a shortcut, another tab…) cancels it.
  unsubscribe = useDocument.subscribe(() => {
    if (gesture?.moved) finish(null);
  });
}

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'touch' && touchDown(e)) return;
  if (pan || gesture) return;
  if (e.button === 1 || (e.button === 0 && space.held)) return startPan(e);
  if (getDocument().busy || e.button !== 0) return;
  if (e.pointerType === 'touch') startLongPress(e);
  const target = e.target as Element;
  if (target.closest('.dropzone, .page-head, .sheets-foot')) return;
  const additive = e.shiftKey || e.ctrlKey || e.metaKey;
  const handle = target.closest<HTMLElement>('.handle');
  if (handle) return startResize(e, handle);
  const node = target.closest<HTMLElement>('.piece');
  if (!node) return startMarquee(e, additive);
  const item = findItem(Number(node.dataset.id));
  if (!item) return;
  e.preventDefault(); // no text selection (that's why the focus moves by hand)
  if (isTyping(document.activeElement)) (document.activeElement as HTMLElement).blur();
  let collapse = false;
  if (additive) {
    if (!toggleInSelection(item.id)) {
      flushUi();
      return pieceNode(item.id)?.focus({ preventScroll: true });
    }
  } else if (getDocument().selection.includes(item.id) && getDocument().selection.length > 1) {
    collapse = true;
    makePrimary(item.id);
  } else {
    select(item.id);
  }
  flushUi();
  const current = pieceNode(item.id) ?? node;
  current.focus({ preventScroll: true });
  capture(e);
  measureBoxes();
  const fresh = findItem(item.id)!;
  if (getDocument().selection.length > 1) return startGroupMove(e, fresh, collapse);
  begin({
    kind: 'move',
    item: fresh,
    node: current,
    ...pointer(e),
    size: dims(fresh),
    others: new Map(),
    draft: { ...fresh },
    blocked: false,
    target: fresh.sheet,
    spot: null,
    delta: { x: 0, y: 0 },
  });
}

function startResize(e: PointerEvent, handle: HTMLElement) {
  e.preventDefault();
  if (isTyping(document.activeElement)) (document.activeElement as HTMLElement).blur();
  measureBoxes();
  const { selection } = getDocument();
  if (selection.length > 1) {
    const sheet = Number(handle.dataset.sheet);
    const items = selectedItems();
    const frame = groupBoxes(items).get(sheet);
    if (!frame) return;
    capture(e);
    pieceNode(selection.at(-1))?.focus({ preventScroll: true });
    begin({
      kind: 'group-resize',
      ...pointer(e),
      frame,
      items,
      // Possible factors: scale limits, centers on the sheet and, without overlaps, not over others.
      range: scaleBounds(imageBoxes(), new Set(selection), items.map((item) => item.scale), 'top-left', scaleOptions()),
      drafts: new Map(items.map((item) => [item.id, { ...item }])),
      k: 1,
    });
    return;
  }
  const item = findItem(selection.at(-1));
  const node = item && pieceNode(item.id);
  if (!item || !node) return;
  node.focus({ preventScroll: true });
  capture(e);
  begin({
    kind: 'resize',
    item,
    node,
    ...pointer(e),
    size: dims(item),
    // Without overlaps, the handle stops when touching another piece.
    growth: !getDocument().allowOverlap ? maxGrowth(rectOf(item), obstaclesFor(item.sheet, item.id), 'top-left') : Infinity,
    draft: { ...item },
  });
}

function startGroupMove(e: PointerEvent, item: Piece, collapse: boolean) {
  const items = selectedItems();
  const sheets = new Set(items.map((other) => other.sheet));
  begin({
    kind: 'group-move',
    item,
    items,
    ...pointer(e),
    collapse,
    // On one sheet, the group may move to another; on several, each part stays on its own.
    oneSheet: sheets.size === 1 ? item.sheet : null,
    box: bounds(items.map(rectOf))!,
    all: boxes(),
    drafts: new Map(items.map((other) => [other.id, { ...other }])),
    drag: null,
    dropTarget: null,
    blocked: false,
    target: item.sheet,
    spot: null,
    delta: { x: 0, y: 0 },
  });
}

function startMarquee(e: PointerEvent, additive: boolean) {
  const page = (e.target as Element).closest<HTMLElement>('.page');
  capture(e);
  measureBoxes();
  const origin = clientToLayer(e.clientX, e.clientY);
  begin({ kind: 'marquee', ...pointer(e), origin, additive, sheetId: page ? Number(page.dataset.sheet) : null, touched: [] });
}

function cachedOthers(g: MoveGesture, sheetId: number) {
  if (!g.others.has(sheetId)) g.others.set(sheetId, othersOnSheet(sheetId, g.item.id));
  return g.others.get(sheetId)!;
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerType === 'touch' && touchMove(e)) return;
  if (pan && e.pointerId === pan.pointerId) return movePan(e);
  if (longPress && e.pointerId === longPress.pointerId && Math.hypot(e.clientX - longPress.x, e.clientY - longPress.y) > DRAG_THRESHOLD * 3) cancelLongPress();
  const g = gesture;
  if (!g || e.pointerId !== g.pointerId) return;
  g.lastX = e.clientX;
  g.lastY = e.clientY;
  updateGesture();
}

function updateGesture() {
  const g = gesture!;
  const px = g.lastX - g.startX;
  const py = g.lastY - g.startY;
  if (!g.moved && Math.hypot(px, py) < DRAG_THRESHOLD) return;
  const first = !g.moved;
  g.moved = true;
  if (first) gestureStore.setState({ dragging: true });
  if (g.kind === 'marquee') return updateMarquee(g, first);
  if (first) {
    el('canvas').classList.add('is-dragging');
    // To move between sheets, the pieces travel in a layer without clipping.
    if (g.kind === 'move') toDragLayer(g.node);
    if (g.kind === 'group-move') for (const item of g.items) toDragLayer(pieceNode(item.id)!);
    startAutoScroll();
  }
  // What the stage scrolled meanwhile (autoscroll) counts as moving.
  const dx = px + (el('stage').scrollLeft - g.scrollLeft0);
  const dy = py + (el('stage').scrollTop - g.scroll0);
  if (g.kind === 'resize') updateResize(g, dx, dy);
  else if (g.kind === 'move') updateMove(g, dx, dy);
  else if (g.kind === 'group-resize') updateGroupResize(g, dx, dy);
  else updateGroupMove(g, dx, dy);
}

const marked = () => getDocument().selection.length > 1 || getView().pinned;

function paintDraft(node: HTMLElement | null, draft: Piece, offset: BoxOffset | null = null) {
  if (node) paintPiece(node, pieceView(draft, getAsset(draft.asset), viewZoom(), marked(), offset));
}

function preview(drafts: readonly Piece[]) {
  paintSelection(drafts, { place: false });
  gestureStore.setState({ drafts });
}

function updateResize(g: ResizeGesture, px: number, dy: number) {
  // The drag projected on the diagonal: proportional scale.
  const [w, h] = g.size;
  const factor = ((w + pxToMm(px)) * w + (h + pxToMm(dy)) * h) / (w * w + h * h);
  let scale = clamp(round1(g.item.scale * factor), 1, 1000);
  if (scale > g.item.scale && Number.isFinite(g.growth)) {
    // Rounded down to 0.1 % so it doesn't go past the contact.
    scale = Math.min(scale, Math.max(g.item.scale, Math.floor(g.item.scale * g.growth * 10) / 10));
  }
  g.draft = { ...g.draft, scale };
  paintDraft(g.node, g.draft);
  preview([g.draft]);
}

function updateMove(g: MoveGesture, px: number, dy: number) {
  // Where the piece is in #sheets and which sheet it belongs to (the one with its center).
  const [W, H] = sheetSize();
  const [w, h] = g.size;
  const start = toLayer(g.item.sheet, rectOf(g.item))!;
  const ax = start.left + px;
  const ay = start.top + dy;
  g.delta = { x: px, y: dy };
  if (followNewSheet(g, { x: ax + start.width / 2, y: ay + start.height / 2 })) {
    // Over a placeholder: the piece follows the pointer until it is dropped.
    const free = layerToSheet(g.item.sheet, ax, ay)!;
    g.draft = { ...g.draft, x: free.x, y: free.y, sheet: g.item.sheet };
    paintDraft(g.node, g.draft, sheetBoxes().get(g.item.sheet));
    preview([g.draft]);
    return;
  }
  const target = sheetAtLayerY(ay + mmToPx(h) / 2);
  const at = layerToSheet(target, ax, ay)!;
  // Snapping: to the nearest multiple of the grid, which starts at the sheet's
  // corner. It may stick out of the sheet, but not more than half (the center stays in).
  const { grid } = getPrefs();
  const step = grid.size;
  const snap = grid.snap ? (v: number) => tidy(Math.round(v / step) * step) : (v: number) => v;
  const spot = keepCenterInside({ x: snap(at.x), y: snap(at.y), w, h }, W, H);
  g.draft = { ...g.draft, x: spot.x, y: spot.y, sheet: target };
  markTarget(g, target);
  // Moving is free, but it shows when dropping there wouldn't be valid.
  setBlocked(g, !getDocument().allowOverlap && overlapsAny(boxOf(g.draft), cachedOthers(g, target)), [g.node]);
  paintDraft(g.node, g.draft, sheetBoxes().get(target));
  preview([g.draft]);
}

function updateGroupMove(g: GroupMoveGesture, px: number, dy: number) {
  let target: number | null = null;
  let offsetY = 0;
  g.delta = { x: px, y: dy };
  if (g.oneSheet !== null) {
    // The sheet with the center of the group's box.
    const start = toLayer(g.oneSheet, g.box)!;
    if (followNewSheet(g, { x: start.left + start.width / 2 + px, y: start.top + start.height / 2 + dy })) {
      // Over a placeholder: the group follows the pointer, as it is, until it is dropped.
      g.drag = null;
      for (const item of g.items) {
        const draft = { ...g.drafts.get(item.id)!, x: item.x + pxToMm(px), y: item.y + pxToMm(dy), sheet: item.sheet };
        g.drafts.set(item.id, draft);
        paintDraft(pieceNode(item.id), draft, sheetBoxes().get(item.sheet));
      }
      preview([...g.drafts.values()]);
      return;
    }
    target = sheetAtLayerY(start.top + start.height / 2 + dy);
    offsetY = pxToMm(sheetBoxes().get(g.oneSheet)!.top - sheetBoxes().get(target)!.top);
    markTarget(g, target);
  }
  g.drag = planDrag(g.all, new Set(g.items.map((item) => item.id)), pxToMm(px), pxToMm(dy), { ...groupOptions(), target, offsetY });
  g.dropTarget = target;
  const { plan } = g.drag;
  for (const item of g.items) {
    const r = plan.rects.get(item.id)!;
    const draft = { ...g.drafts.get(item.id)!, ...fromBox(r.x, r.y), sheet: target ?? item.sheet };
    g.drafts.set(item.id, draft);
    paintDraft(pieceNode(item.id), draft, sheetBoxes().get(draft.sheet));
  }
  setBlocked(
    g,
    !plan.ok,
    g.items.map((item) => pieceNode(item.id))
  );
  preview([...g.drafts.values()]);
}

function updateGroupResize(g: GroupResizeGesture, px: number, dy: number) {
  const { w, h } = g.frame;
  const wanted = ((w + pxToMm(px)) * w + (h + pxToMm(dy)) * h) / (w * w + h * h);
  const k = g.range.min <= g.range.max ? Math.min(Math.max(wanted, g.range.min), g.range.max) : 1;
  g.k = k;
  // Each part from its box's top left corner, on its sheet.
  const bySheet = new Map<number, Piece[]>();
  for (const item of g.items) {
    if (!bySheet.has(item.sheet)) bySheet.set(item.sheet, []);
    bySheet.get(item.sheet)!.push(item);
  }
  for (const list of bySheet.values()) {
    const scaled = scaleGroup(
      list.map((item) => ({ id: item.id, ...rectOf(item) })),
      k,
      'top-left'
    ).rects;
    list.forEach((item, i) => {
      const draft = { ...g.drafts.get(item.id)!, scale: item.scale * k, x: scaled[i].x, y: scaled[i].y };
      g.drafts.set(item.id, draft);
      paintDraft(pieceNode(item.id), draft);
    });
  }
  preview([...g.drafts.values()]);
}

function updateMarquee(g: MarqueeGesture, first: boolean) {
  const marquee = document.querySelector<HTMLElement>('#sheets > .marquee')!;
  if (first) {
    marquee.hidden = false;
    startAutoScroll();
  }
  const now = clientToLayer(g.lastX, g.lastY);
  const area = { x: Math.min(g.origin.x, now.x), y: Math.min(g.origin.y, now.y), w: Math.abs(now.x - g.origin.x), h: Math.abs(now.y - g.origin.y) };
  Object.assign(marquee.style, { left: `${area.x}px`, top: `${area.y}px`, width: `${area.w}px`, height: `${area.h}px` });
  const placed = getDocument().items.flatMap((item) => {
    const r = toLayer(item.sheet, rectOf(item));
    return r ? [{ id: item.id, x: r.left, y: r.top, w: r.width, h: r.height }] : [];
  });
  g.touched = touchedBy(area, placed);
  const touched = new Set(g.touched);
  for (const node of document.querySelectorAll<HTMLElement>('#sheets .piece')) node.classList.toggle('is-marked', touched.has(Number(node.dataset.id)));
}

const pageOf = (id: number) => document.querySelector<HTMLElement>(`#sheets .page[data-sheet="${id}"]`);

function markTarget(g: MoveGesture | GroupMoveGesture, target: number) {
  if (target !== g.target) {
    pageOf(g.target)?.classList.remove('is-drop-target');
    g.target = target;
  }
  const origin = g.kind === 'group-move' ? g.oneSheet : g.item.sheet;
  pageOf(target)?.classList.toggle('is-drop-target', target !== origin);
}

function setBlocked(g: MoveGesture | GroupMoveGesture, blocked: boolean, nodes: (HTMLElement | null)[]) {
  if (blocked === g.blocked) return;
  g.blocked = blocked;
  for (const node of nodes) node?.classList.toggle('is-blocked', blocked);
  el('frame').classList.toggle('is-blocked', blocked);
  for (const frame of document.querySelectorAll('#sheets > .group-frame')) frame.classList.toggle('is-blocked', blocked);
}

/**
 * A piece or a group from one sheet whose center (#sheets px) left the sheets
 * shows where it can create a sheet; over one of those spots (true), no sheet
 * is the target and nothing is blocked.
 */
function followNewSheet(g: MoveGesture | GroupMoveGesture, center: Point) {
  const canCreate = g.kind === 'move' || g.oneSheet !== null;
  const outside = canCreate && sheetAtPoint(center) === null;
  g.spot = outside ? newSheetSpot(center, clientToLayer(g.lastX, g.lastY)) : null;
  paintNewSheetSpot(outside ? g.spot : false);
  if (!g.spot) return false;
  markTarget(g, g.kind === 'move' ? g.item.sheet : g.oneSheet!);
  setBlocked(
    g,
    false,
    g.kind === 'move' ? [g.node] : g.items.map((item) => pieceNode(item.id))
  );
  return true;
}

// While dragging near the top or bottom edge of the canvas, it scrolls (to take
// a piece to a sheet out of view).
function startAutoScroll() {
  cancelAnimationFrame(autoFrame);
  const tick = () => {
    const g = gesture;
    if (!g?.moved) return;
    const stage = el('stage');
    const r = stage.getBoundingClientRect();
    const zone = 48;
    const speed = (d: number) => Math.ceil(((zone - d) / zone) * 18);
    let delta = 0;
    if (g.lastY < r.top + zone) delta = -speed(Math.max(0, g.lastY - r.top));
    else if (g.lastY > r.bottom - zone) delta = speed(Math.max(0, r.bottom - g.lastY));
    // Sideways too, when zoomed in past the stage's width.
    let side = 0;
    if (stage.classList.contains('is-wide')) {
      if (g.lastX < r.left + zone) side = -speed(Math.max(0, g.lastX - r.left));
      else if (g.lastX > r.right - zone) side = speed(Math.max(0, r.right - g.lastX));
    }
    if (delta || side) {
      const before = [stage.scrollTop, stage.scrollLeft];
      stage.scrollTop += delta;
      stage.scrollLeft += side;
      if (stage.scrollTop !== before[0] || stage.scrollLeft !== before[1]) updateGesture();
    }
    autoFrame = requestAnimationFrame(tick);
  };
  autoFrame = requestAnimationFrame(tick);
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerType === 'touch' && touchUp(e)) return;
  if (pan && e.pointerId === pan.pointerId) return endPan();
  if (longPress && e.pointerId === longPress.pointerId) cancelLongPress();
  const g = gesture;
  if (!g || e.pointerId !== g.pointerId) return;
  finish(e.type === 'pointerup' ? e : null);
}

/** Esc during a drag: everything stays as it was. Returns whether there was one to cancel. */
export function cancelGesture() {
  if (!gesture?.moved) return false;
  finish(null);
  return true;
}

/** Ends the gesture: `e` is the pointerup that drops it, or null to cancel. */
function finish(e: PointerEvent | null) {
  const g = gesture!;
  gesture = null;
  unsubscribe?.();
  unsubscribe = null;
  cancelAnimationFrame(autoFrame);
  el('canvas').classList.remove('is-dragging');
  el('frame').classList.remove('is-blocked');
  for (const frame of document.querySelectorAll('#sheets > .group-frame')) frame.classList.remove('is-blocked');
  for (const node of document.querySelectorAll('#sheets .piece.is-blocked')) node.classList.remove('is-blocked');
  if (g.kind !== 'marquee' && g.kind !== 'resize' && g.kind !== 'group-resize') pageOf(g.target)?.classList.remove('is-drop-target');
  paintNewSheetSpot(false);
  const done = e !== null;
  const active = document.activeElement;
  restore();
  gestureStore.setState({ drafts: null, dragging: false });
  if (g.kind === 'marquee') return endMarquee(g, done);
  if (g.kind === 'group-move' || g.kind === 'group-resize') {
    const focused = pieceNode(getDocument().selection.at(-1));
    return endGroupGesture(g, done, !!focused && (active === focused || active === document.body));
  }
  endPieceGesture(g, done, active === g.node || active === document.body);
}

function endPieceGesture(g: MoveGesture | ResizeGesture, done: boolean, hadFocus: boolean) {
  let result: 'moved-aside' | 'reverted' | null = null;
  let sheetChanged = false;
  if (g.kind === 'move' && g.spot && g.moved && done && findItem(g.item.id) === g.item) {
    dropOnNewSheet(g.spot, [g.item], g.delta);
  } else if (g.moved && done && findItem(g.item.id) === g.item) {
    let { x, y } = g.draft;
    const sheet = g.draft.sheet ?? g.item.sheet;
    if (g.kind === 'move' && g.blocked) {
      // Dropped on another piece: like a group of one, to the nearest free spot
      // of that sheet (center inside, and on the grid with «Imán»); if there is
      // none nearby, it goes back.
      const box = { ...boxOf(g.draft), sheet };
      const drop = planDrop(
        { plan: { ok: false, reason: 'overlap', rects: new Map([[box.id, box]]), changed: true }, boxes: [...cachedOthers(g, sheet), box] },
        new Set([box.id]),
        groupOptions()
      );
      animateNext();
      const spot = drop.rects?.get(box.id);
      if (spot) {
        ({ x, y } = fromBox(spot.x, spot.y));
        result = 'moved-aside';
      } else {
        result = 'reverted';
      }
    }
    const changed = x !== g.item.x || y !== g.item.y || g.draft.scale !== g.item.scale || sheet !== g.item.sheet;
    if (result !== 'reverted' && changed) {
      commit();
      sheetChanged = sheet !== g.item.sheet;
      patchItems(new Map([[g.item.id, { x, y, scale: g.draft.scale, sheet }]]));
      if (sheetChanged) setView({ sheet });
    }
  }
  gestureDone(result, sheetChanged, g.item.id, false);
  // If the piece was re-created on another sheet, its focus comes back.
  if (hadFocus) {
    flushUi();
    const node = pieceNode(g.item.id);
    if (node && document.activeElement !== node) node.focus({ preventScroll: true });
  }
}

function endGroupGesture(g: GroupMoveGesture | GroupResizeGesture, done: boolean, hadFocus: boolean) {
  const primary = getDocument().selection.at(-1);
  let result: 'moved' | 'moved-aside' | 'reverted' | 'scaled' | null = null;
  let sheetChanged = false;
  const alive = g.items.every((item) => findItem(item.id) === item);
  if (!g.moved) {
    // A click without dragging on one of several selected: only that one stays selected.
    if (g.kind === 'group-move' && g.collapse && done) select(g.item.id);
  } else if (done && alive && g.kind === 'group-move' && g.spot) {
    dropOnNewSheet(g.spot, g.items, g.delta);
  } else if (done && alive && g.kind === 'group-move' && g.drag) {
    const before = g.item.sheet;
    if (!g.drag.plan.ok) animateNext();
    result = dropGroup(g.drag, g.dropTarget);
    sheetChanged = result !== 'reverted' && result !== null && findItem(g.item.id)!.sheet !== before;
  } else if (done && alive && g.kind === 'group-resize' && Math.abs(g.k - 1) > 1e-9) {
    result = applyGroupScale(g.k) ? 'scaled' : null;
  }
  gestureDone(result, sheetChanged, g.kind === 'group-move' ? g.item.id : (primary ?? null), true);
  if (hadFocus && primary !== undefined) {
    flushUi();
    const node = pieceNode(getDocument().selection.at(-1));
    if (node && document.activeElement !== node) node.focus({ preventScroll: true });
  }
}

/**
 * Drops the group (`drag`: the last planDrag) in one undo step. Returns
 * 'moved', 'moved-aside', 'reverted' or null (nothing changed).
 */
function dropGroup(drag: Drag, target: number | null) {
  const ids = new Set(getDocument().selection);
  const { result, rects } = planDrop(drag, ids, groupOptions());
  if (!rects) return result;
  const at = new Map([...rects].map(([id, r]) => [id, fromBox(r.x, r.y)]));
  const changed = [...at].some(([id, p]) => {
    const item = findItem(id)!;
    return p.x !== item.x || p.y !== item.y || (target !== null && item.sheet !== target);
  });
  if (!changed) return null;
  commit();
  patchItems(new Map([...at].map(([id, p]) => [id, { ...p, ...(target !== null ? { sheet: target } : {}) }])));
  if (target !== null) setView({ sheet: target });
  return result;
}

/**
 * Drops pieces of one sheet, dragged by `delta` (px), onto a new sheet at
 * `spot`: where they were let go, on the grid with «Imán» and inside the
 * sheet, as they were arranged. One undo step.
 */
function dropOnNewSheet(spot: NewSheetSpot, items: readonly Piece[], delta: Point) {
  const pad = layoutPad();
  const frame = bounds(items.map(rectOf))!;
  const start = toLayer(items[0].sheet, frame)!;
  // Their layout box where it was let go, in mm on the new sheet.
  const box = {
    x: pxToMm(start.left + delta.x - spot.box.left) - pad,
    y: pxToMm(start.top + delta.y - spot.box.top) - pad,
    w: frame.w + 2 * pad,
    h: frame.h + 2 * pad,
  };
  const [W, H] = sheetSize();
  const { grid } = getPrefs();
  const at = placeOnNewSheet(box, W, H, { snapStep: grid.snap ? grid.size : 0, pad, margin: getDocument().margin });
  const dx = at.x + pad - frame.x;
  const dy = at.y + pad - frame.y;
  moveToNewSheetAt(spot.index, new Map(items.map((item) => [item.id, { x: tidy(item.x + dx), y: tidy(item.y + dy) }])));
}

/** Applies a factor already bounded (the handle), from each part's top left corner. */
function applyGroupScale(k: number) {
  const plan = planScale(imageBoxes(), new Set(getDocument().selection), k, 'top-left', scaleOptions());
  if (!plan.ok || !plan.changed) return false;
  commit();
  patchItems(new Map([...plan.rects].map(([id, r]) => [id, { x: r.x, y: r.y, scale: findItem(id)!.scale * k }])));
  return true;
}

function gestureDone(result: string | null, sheetChanged: boolean, id: number | null, group: boolean) {
  // The blocked look while dragging and the piece going back already show it: only screen readers hear it.
  if (result === 'reverted') announce(t(group ? 'announce.revertedGroup' : 'announce.reverted'));
  const item = findItem(id ?? undefined);
  if (sheetChanged && item) announce(t('announce.movedToSheet', { i: sheetIndex(item.sheet) + 1, total: getDocument().sheets.length }));
}

/** A click on a sheet's empty area (or its label): the current sheet, with nothing selected. */
function pickSheet(id: number) {
  setView({ sheet: id });
  if (!getDocument().selection.length) return;
  select(null);
  focusSheetNode(id);
}

function endMarquee(g: MarqueeGesture, done: boolean) {
  document.querySelector<HTMLElement>('#sheets > .marquee')!.hidden = true;
  for (const node of document.querySelectorAll('#sheets .piece.is-marked')) node.classList.remove('is-marked');
  if (!done) return;
  if (g.moved) return selectTouched(g.touched, g.additive);
  if (g.additive) return;
  // A click on an empty spot of a sheet (or around them).
  if (g.sheetId !== null) return pickSheet(g.sheetId);
  if (!getDocument().selection.length) return;
  select(null);
  focusSheetNode(currentSheet());
}

// ---------- Scroll: the current sheet and the toolbar ----------

function onScroll() {
  const stage = el('stage');
  // Unless zoomed in past its width, the canvas never scrolls sideways
  // (something sticking out of the sheets, like the frame of a piece that
  // sticks out, must not shift them).
  if (stage.scrollLeft && !stage.classList.contains('is-wide')) stage.scrollLeft = 0;
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    if (gesture?.moved) return;
    const target = selectionTarget(selectedItems());
    if (!target) {
      const id = visibleSheet();
      if (id !== null && id !== getView().sheet && sheetIndex(id) >= 0) setView({ sheet: id });
    } else placePiecebar(target);
  });
}

// ---------- Zoom and pan ----------

/** The stage scrolls by hand: Space + drag, the middle button. */
let pan: { pointerId: number; x: number; y: number; left: number; top: number } | null = null;
let pointerOnCanvas = false;
const space = { held: false, used: false };

/** Is the pointer over the canvas (Ctrl/⌘ + / − and the wheel zoom it instead of the page)? */
export const isPointerOnCanvas = () => pointerOnCanvas;

/** Space held over the canvas: dragging pans. Returns whether it took the key. */
export function holdSpace() {
  if (!pointerOnCanvas || space.held) return space.held;
  space.held = true;
  space.used = false;
  el('canvas').classList.add('is-pan-ready');
  return true;
}

/** Is Space held for panning? */
export const isSpaceHeld = () => space.held;

/** Space released: whether it panned (then it does nothing else). */
export function releaseSpace() {
  const used = space.used;
  space.held = false;
  space.used = false;
  el('canvas').classList.remove('is-pan-ready');
  return used;
}

function startPan(e: PointerEvent) {
  e.preventDefault();
  const stage = el('stage');
  pan = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop };
  space.used ||= space.held;
  try {
    stage.setPointerCapture(e.pointerId);
  } catch {
    // a synthetic pointer: it pans without capture
  }
  el('canvas').classList.add('is-panning');
}

function movePan(e: PointerEvent) {
  const stage = el('stage');
  stage.scrollLeft = pan!.left - (e.clientX - pan!.x);
  stage.scrollTop = pan!.top - (e.clientY - pan!.y);
}

function endPan() {
  pan = null;
  el('canvas').classList.remove('is-panning');
}

// Ctrl/⌘ + wheel and a trackpad pinch: zoom around the pointer, at most once a frame.
let pendingZoom: { factor: number; at: { x: number; y: number } } | null = null;
let zoomFrame = 0;

function onWheel(e: WheelEvent) {
  stopGlide();
  if (!(e.ctrlKey || e.metaKey)) return;
  // Never the browser's page zoom over the canvas.
  e.preventDefault();
  pendingZoom = { factor: (pendingZoom?.factor ?? 1) * wheelFactor(e.deltaY, e.deltaMode), at: { x: e.clientX, y: e.clientY } };
  if (zoomFrame) return;
  zoomFrame = requestAnimationFrame(() => {
    zoomFrame = 0;
    const next = pendingZoom;
    pendingZoom = null;
    if (next && !gesture) zoomBy(next.factor, next.at);
  });
}

// ---------- Two fingers: pinch to zoom, move together to pan ----------

/** The touch pointers down on the stage (window px). */
const touches = new Map<number, Point>();

interface Pinch {
  ids: [number, number];
  /** Where the fingers were at the last step, and where they are now. */
  last: PinchPair;
  now: PinchPair;
  anchor: PinchAnchor | null;
  /** How far apart they landed: until that changes by PINCH_THRESHOLD, they only pan. */
  start: number;
  zooming: boolean;
  /** Where they were lately (their midpoint and distance), for the glide when they lift. */
  samples: GlideSample[];
}

let pinch: Pinch | null = null;
let pinchFrame = 0;
/** The selection when the first finger landed: a pinch leaves it as it was. */
let touchSelection: { selection: readonly number[]; pinned: boolean; sheet: number } | null = null;

/** A finger landed on the stage. Returns whether it belongs to a pinch (nothing else to do with it). */
function touchDown(e: PointerEvent) {
  // The first finger of a new touch: any still listed was lifted where the stage didn't hear it.
  if (e.isPrimary) touches.clear();
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch) return true;
  if (touches.size === 1) {
    touchSelection = { selection: getDocument().selection, pinned: getView().pinned, sheet: getView().sheet };
    return false;
  }
  startPinch(e.timeStamp);
  return true;
}

/**
 * The second finger: whatever the first one started is cancelled (a dragged
 * piece goes back, nothing reaches the undo history) and the selection is
 * left as it was before it.
 */
function startPinch(t: number) {
  const [[a, p], [b, q]] = touches;
  cancelLongPress();
  if (gesture) finish(null);
  const before = touchSelection;
  touchSelection = null;
  if (before && getDocument().selection !== before.selection) {
    setSelection(before.selection, { pinned: before.pinned });
    setView({ sheet: before.sheet });
  }
  pinch = { ids: [a, b], last: [p, q], now: [p, q], anchor: null, start: pinchSpan([p, q]).d, zooming: false, samples: [] };
  sample(pinch, t);
}

/** Notes where the fingers are at time `t` (ms); both fingers' moves of one frame make one sample. */
function sample(p: Pinch, t: number) {
  const { x, y, d } = pinchSpan(p.now);
  const last = p.samples.at(-1);
  if (last?.t === t) Object.assign(last, { x, y, d });
  else p.samples.push({ t, x, y, d });
  while (p.samples[0].t < t - GLIDE_WINDOW) p.samples.shift();
}

/** Returns whether the move belongs to a pinch. */
function touchMove(e: PointerEvent) {
  if (!touches.has(e.pointerId)) return false;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!pinch) return false;
  const i = pinch.ids.indexOf(e.pointerId);
  if (i >= 0) {
    const now: [Point, Point] = [...pinch.now];
    now[i] = { x: e.clientX, y: e.clientY };
    pinch.now = now;
    sample(pinch, e.timeStamp);
    // At most once a frame, like the wheel.
    pinchFrame ||= requestAnimationFrame(stepPinch);
  }
  return true;
}

/** Returns whether the finger belonged to a pinch. Lifting either of its two ends it. */
function touchUp(e: PointerEvent) {
  touches.delete(e.pointerId);
  if (!pinch) return false;
  if (pinch.ids.includes(e.pointerId)) {
    if (pinchFrame) {
      cancelAnimationFrame(pinchFrame);
      stepPinch();
    }
    const { samples } = pinch;
    pinch = null;
    // Lifted while panning, the view glides on (its scroll goes against the
    // fingers); a zoom never does, nor a finger the browser took.
    if (e.type === 'pointerup') {
      const v = releaseVelocity(samples, e.timeStamp);
      startGlide({ x: -v.x, y: -v.y });
    }
  }
  return true;
}

function stepPinch() {
  pinchFrame = 0;
  const p = pinch!;
  const before = p.last;
  let after = p.now;
  p.zooming ||= Math.abs(pinchSpan(after).d - p.start) > PINCH_THRESHOLD;
  if (!p.zooming) {
    // Only how far their midpoint moved counts: the zoom (and a fitted mode) stays.
    const from = pinchSpan(before);
    const to = pinchSpan(after);
    after = [
      { x: before[0].x + to.x - from.x, y: before[0].y + to.y - from.y },
      { x: before[1].x + to.x - from.x, y: before[1].y + to.y - from.y },
    ];
  }
  p.anchor = pinchTo(before, after, p.anchor);
  p.last = p.now;
}

// The browser's own two-finger gestures stay off the canvas: its page zoom
// (touch-action keeps it off the stage too) and its two-finger scroll, which
// would cancel the pinch's pointers.
function onTouch(e: TouchEvent) {
  const stage = e.currentTarget as HTMLElement;
  if (e.cancelable && (pinch || [...e.touches].filter((touch) => stage.contains(touch.target as Node)).length > 1)) e.preventDefault();
}

// ---------- Context menu: right click, the keyboard's (see the shortcuts) and a long press ----------

const LONG_PRESS_MS = 550;
let longPress: { timer: ReturnType<typeof setTimeout>; x: number; y: number; pointerId: number; fired: boolean } | null = null;

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  if (getView().cropping !== null) return;
  // From the keyboard (Menu key) the event has no position: next to what has the focus.
  const fromKeyboard = (e as PointerEvent).pointerType === '' || (e.clientX === 0 && e.clientY === 0);
  const active = document.activeElement;
  if (fromKeyboard && active instanceof HTMLElement && active.closest('#sheets')) return openContextMenuFromKeyboard(active);
  openContextMenuAt(e.target as Element, e.clientX, e.clientY);
}

function startLongPress(e: PointerEvent) {
  cancelLongPress();
  const target = e.target as Element;
  const timer = setTimeout(() => {
    if (!longPress) return;
    longPress.fired = true;
    // The press becomes the menu: whatever gesture it started is cancelled.
    if (gesture) finish(null);
    openContextMenuAt(target, longPress.x, longPress.y);
  }, LONG_PRESS_MS);
  longPress = { timer, x: e.clientX, y: e.clientY, pointerId: e.pointerId, fired: false };
}

function cancelLongPress() {
  if (longPress) clearTimeout(longPress.timer);
  longPress = null;
}

// A double click on a piece: crop mode. (With the pointer captured by #sheets
// the event targets it, so the piece is the one under the pointer.)
function onDoubleClick(e: MouseEvent) {
  const node = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('#sheets .piece');
  if (!node || getDocument().busy || getView().cropping !== null) return;
  startCrop(Number(node.dataset.id));
}

/** Wires the gestures and the scroll handling to #stage (the zoom: to the whole canvas). */
export function useCanvasGestures(stage: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const node = stage.current!;
    const canvas = node.parentElement!;
    node.addEventListener('dblclick', onDoubleClick);
    node.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const enter = () => (pointerOnCanvas = true);
    const leave = () => (pointerOnCanvas = false);
    // The middle button pans instead of the browser's autoscroll.
    const middle = (e: MouseEvent) => e.button === 1 && e.preventDefault();
    canvas.addEventListener('pointerenter', enter);
    canvas.addEventListener('pointerleave', leave);
    node.addEventListener('mousedown', middle);
    // A press on the stage stops a glide, before what is under it sees the press (crop mode keeps its presses from the stage).
    node.addEventListener('pointerdown', stopGlide, true);
    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', onPointerUp);
    node.addEventListener('pointercancel', onPointerUp);
    node.addEventListener('touchstart', onTouch, { passive: false });
    node.addEventListener('touchmove', onTouch, { passive: false });
    node.addEventListener('scroll', onScroll, { passive: true });
    // A key pressed (one that scrolls, a shortcut…): the person has moved on from the glide.
    document.addEventListener('keydown', stopGlide, true);
    return () => {
      stopGlide();
      document.removeEventListener('keydown', stopGlide, true);
      node.removeEventListener('dblclick', onDoubleClick);
      node.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerenter', enter);
      canvas.removeEventListener('pointerleave', leave);
      node.removeEventListener('mousedown', middle);
      node.removeEventListener('pointerdown', stopGlide, true);
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerUp);
      node.removeEventListener('touchstart', onTouch);
      node.removeEventListener('touchmove', onTouch);
      node.removeEventListener('scroll', onScroll);
    };
  }, [stage]);
}

