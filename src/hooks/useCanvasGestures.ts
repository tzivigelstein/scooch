// Pointer gestures on the sheets. On a piece: selects it and drags it (if it
// was already among several selected, drags the group; a click without moving
// leaves only that one selected). With Shift or Ctrl/Cmd, adds or removes it.
// On a handle: scales the piece or the group. On an empty spot: a marquee to
// select (a click without dragging clears the selection).
//
// Performance: nothing re-renders while the pointer moves. The dragged pieces
// travel in the drag layer (no clipping, so they can cross sheets) and are
// painted directly, like the frames; the live values go to gestureStore for
// the parts that preview them. The document changes once, on drop.

import { useEffect, type RefObject } from 'react';
import { DRAG_THRESHOLD } from '../config.ts';
import { bounds, scaleGroup } from '../core/align.js';
import { maxGrowth, overlapsAny } from '../core/collide.js';
import { planDrag, planDrop, planScale, scaleBounds, touchedBy, type Drag } from '../core/group.js';
import { keepCenterInside, sheetAt } from '../core/sheets.js';
import type { Box, Rect } from '../core/types.ts';
import { clamp, round1, tidy } from '../core/util.ts';
import { t } from '../copy/index.ts';
import { announce } from '../components/feedback/announcer.ts';
import { paintPiece, pieceView } from '../components/canvas/pieceView.ts';
import { groupBoxes, paintSelection, placePiecebar, selectionTarget } from '../components/canvas/selection.ts';
import { measureBoxes, sheetBoxes, visibleSheet, type BoxOffset } from '../components/canvas/viewport.ts';
import { getAsset } from '../state/assets.ts';
import { getDocument, patchItems, useDocument, type Piece } from '../state/document.ts';
import { flushUi } from '../state/flush.ts';
import { gestureStore } from '../state/gesture.ts';
import { commit } from '../state/history.ts';
import { getPrefs } from '../state/prefs.ts';
import { boxes, currentSheet, dims, findItem, groupOptions, othersOnSheet, selectedItems, sheetIndex, sheetSize } from '../state/selectors.ts';
import { animateNext, getView, setView } from '../state/view.ts';
import { focusSheetNode, pieceNode } from '../state/actions/focus.ts';
import { say } from '../state/actions/notify.ts';
import { makePrimary, select, selectTouched, toggleInSelection } from '../state/actions/selection.ts';
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

// Moves a node keeping its focus where the browser can (moveBefore).
function place(container: Node, node: Node, before: Node | null) {
  if (node.parentNode === container && node.nextSibling === before) return;
  const move = (container as Node & { moveBefore?: (node: Node, child: Node | null) => void }).moveBefore;
  if (move && node.isConnected) {
    try {
      move.call(container, node, before);
      return;
    } catch {
      // falls back to insertBefore
    }
  }
  container.insertBefore(node, before);
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
  const zoom = getView().zoom;
  const marked = selection.length > 1 || getView().pinned;
  for (const item of items) {
    const node = pieceNode(item.id);
    if (node) paintPiece(node, pieceView(item, getAsset(item.asset), zoom, marked && selection.includes(item.id)));
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
  if (getDocument().busy || e.button !== 0 || gesture) return;
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
      range: scaleBounds(boxes(), new Set(selection), items.map((item) => item.scale), 'top-left', groupOptions()),
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
    growth: !getPrefs().allowOverlap ? maxGrowth(rectOf(item), othersOnSheet(item.sheet, item.id), 'top-left') : Infinity,
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
  });
}

function startMarquee(e: PointerEvent, additive: boolean) {
  const page = (e.target as Element).closest<HTMLElement>('.page');
  capture(e);
  measureBoxes();
  const origin = toSheets(e.clientX, e.clientY);
  begin({ kind: 'marquee', ...pointer(e), origin, additive, sheetId: page ? Number(page.dataset.sheet) : null, touched: [] });
}

// From window coordinates to #sheets' (the frames' and the drag layer's).
function toSheets(clientX: number, clientY: number) {
  const r = el('sheets').getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

function cachedOthers(g: MoveGesture, sheetId: number) {
  if (!g.others.has(sheetId)) g.others.set(sheetId, othersOnSheet(sheetId, g.item.id));
  return g.others.get(sheetId)!;
}

function onPointerMove(e: PointerEvent) {
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
  const dy = py + (el('stage').scrollTop - g.scroll0);
  if (g.kind === 'resize') updateResize(g, px, dy);
  else if (g.kind === 'move') updateMove(g, px, dy);
  else if (g.kind === 'group-resize') updateGroupResize(g, px, dy);
  else updateGroupMove(g, px, dy);
}

const marked = () => getDocument().selection.length > 1 || getView().pinned;

function paintDraft(node: HTMLElement | null, draft: Piece, offset: BoxOffset | null = null) {
  if (node) paintPiece(node, pieceView(draft, getAsset(draft.asset), getView().zoom, marked(), offset));
}

function preview(drafts: readonly Piece[]) {
  paintSelection(drafts, { place: false });
  gestureStore.setState({ drafts });
}

function updateResize(g: ResizeGesture, px: number, dy: number) {
  // The drag projected on the diagonal: proportional scale.
  const zoom = getView().zoom;
  const [w, h] = g.size;
  const factor = ((w + px / zoom) * w + (h + dy / zoom) * h) / (w * w + h * h);
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
  const zoom = getView().zoom;
  const [W, H] = sheetSize();
  const start = sheetBoxes().get(g.item.sheet)!;
  const ax = start.left + g.item.x * zoom + px;
  const ay = start.top + g.item.y * zoom + dy;
  const [w, h] = g.size;
  const target = sheetUnder(ay + (h * zoom) / 2);
  const box = sheetBoxes().get(target)!;
  // Snapping: to the nearest multiple of the grid, which starts at the sheet's
  // corner. It may stick out of the sheet, but not more than half (the center stays in).
  const { grid } = getPrefs();
  const step = grid.size;
  const snap = grid.snap ? (v: number) => tidy(Math.round(v / step) * step) : (v: number) => v;
  const spot = keepCenterInside({ x: snap((ax - box.left) / zoom), y: snap((ay - box.top) / zoom), w, h }, W, H);
  g.draft = { ...g.draft, x: spot.x, y: spot.y, sheet: target };
  markTarget(g, target);
  // Moving is free, but it shows when dropping there wouldn't be valid.
  setBlocked(g, !getPrefs().allowOverlap && overlapsAny({ x: g.draft.x, y: g.draft.y, w, h }, cachedOthers(g, target)), [g.node]);
  paintDraft(g.node, g.draft, box);
  preview([g.draft]);
}

function updateGroupMove(g: GroupMoveGesture, px: number, dy: number) {
  const zoom = getView().zoom;
  let target: number | null = null;
  let offsetY = 0;
  if (g.oneSheet !== null) {
    // The sheet with the center of the group's box.
    const start = sheetBoxes().get(g.oneSheet)!;
    target = sheetUnder(start.top + (g.box.y + g.box.h / 2) * zoom + dy);
    offsetY = (start.top - sheetBoxes().get(target)!.top) / zoom;
    markTarget(g, target);
  }
  g.drag = planDrag(g.all, new Set(g.items.map((item) => item.id)), px / zoom, dy / zoom, { ...groupOptions(), target, offsetY });
  g.dropTarget = target;
  const { plan } = g.drag;
  for (const item of g.items) {
    const r = plan.rects.get(item.id)!;
    const draft = { ...g.drafts.get(item.id)!, x: r.x, y: r.y, sheet: target ?? item.sheet };
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
  const zoom = getView().zoom;
  const { w, h } = g.frame;
  const wanted = ((w + px / zoom) * w + (h + dy / zoom) * h) / (w * w + h * h);
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
  const zoom = getView().zoom;
  const now = toSheets(g.lastX, g.lastY);
  const area = { x: Math.min(g.origin.x, now.x), y: Math.min(g.origin.y, now.y), w: Math.abs(now.x - g.origin.x), h: Math.abs(now.y - g.origin.y) };
  Object.assign(marquee.style, { left: `${area.x}px`, top: `${area.y}px`, width: `${area.w}px`, height: `${area.h}px` });
  const placed = getDocument()
    .items.filter((item) => sheetBoxes().has(item.sheet))
    .map((item) => {
      const r = rectOf(item);
      const box = sheetBoxes().get(item.sheet)!;
      return { id: item.id, x: box.left + r.x * zoom, y: box.top + r.y * zoom, w: r.w * zoom, h: r.h * zoom };
    });
  g.touched = touchedBy(area, placed);
  const touched = new Set(g.touched);
  for (const node of document.querySelectorAll<HTMLElement>('#sheets .piece')) node.classList.toggle('is-marked', touched.has(Number(node.dataset.id)));
}

// The sheet that contains height `y` (in #sheets) or the nearest one.
function sheetUnder(y: number) {
  const [, H] = sheetSize();
  const { sheets } = getDocument();
  const tops = sheets.map((s) => sheetBoxes().get(s.id)!.top);
  return sheets[sheetAt(y, tops, H * getView().zoom)].id;
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
    if (delta) {
      const before = stage.scrollTop;
      stage.scrollTop += delta;
      if (stage.scrollTop !== before) updateGesture();
    }
    autoFrame = requestAnimationFrame(tick);
  };
  autoFrame = requestAnimationFrame(tick);
}

function onPointerUp(e: PointerEvent) {
  if (longPress && e.pointerId === longPress.pointerId) cancelLongPress();
  const g = gesture;
  if (!g || e.pointerId !== g.pointerId) return;
  finish(e.type === 'pointerup' ? e : null);
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
  if (g.moved && done && findItem(g.item.id) === g.item) {
    let { x, y } = g.draft;
    const sheet = g.draft.sheet ?? g.item.sheet;
    if (g.kind === 'move' && g.blocked) {
      // Dropped on another piece: like a group of one, to the nearest free spot
      // of that sheet (center inside, and on the grid with «Imán»); if there is
      // none nearby, it goes back.
      const box = { id: g.item.id, sheet, ...rectOf(g.draft) };
      const drop = planDrop(
        { plan: { ok: false, reason: 'overlap', rects: new Map([[box.id, box]]), changed: true }, boxes: [...cachedOthers(g, sheet), box] },
        new Set([box.id]),
        groupOptions()
      );
      animateNext();
      const spot = drop.rects?.get(box.id);
      if (spot) {
        x = spot.x;
        y = spot.y;
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
  const changed = [...rects].some(([id, r]) => {
    const item = findItem(id)!;
    return r.x !== item.x || r.y !== item.y || (target !== null && item.sheet !== target);
  });
  if (!changed) return null;
  commit();
  patchItems(new Map([...rects].map(([id, r]) => [id, { x: r.x, y: r.y, ...(target !== null ? { sheet: target } : {}) }])));
  if (target !== null) setView({ sheet: target });
  return result;
}

/** Applies a factor already bounded (the handle), from each part's top left corner. */
function applyGroupScale(k: number) {
  const plan = planScale(boxes(), new Set(getDocument().selection), k, 'top-left', groupOptions());
  if (!plan.ok || !plan.changed) return false;
  commit();
  patchItems(new Map([...plan.rects].map(([id, r]) => [id, { x: r.x, y: r.y, scale: findItem(id)!.scale * k }])));
  return true;
}

function gestureDone(result: string | null, sheetChanged: boolean, id: number | null, group: boolean) {
  if (result === 'reverted') say(t(group ? 'notices.revertedGroup' : 'notices.reverted'));
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
  // The canvas never scrolls sideways (something sticking out of the sheets,
  // like the frame of a piece that sticks out, must not shift them).
  if (stage.scrollLeft) stage.scrollLeft = 0;
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

/** Wires the gestures and the scroll handling to #stage. */
export function useCanvasGestures(stage: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const node = stage.current!;
    node.addEventListener('dblclick', onDoubleClick);
    node.addEventListener('contextmenu', onContextMenu);
    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', onPointerUp);
    node.addEventListener('pointercancel', onPointerUp);
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      node.removeEventListener('dblclick', onDoubleClick);
      node.removeEventListener('contextmenu', onContextMenu);
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerUp);
      node.removeEventListener('scroll', onScroll);
    };
  }, [stage]);
}

