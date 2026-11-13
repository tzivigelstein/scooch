// What can be done with the selected pieces: rotate, duplicate, fit, center,
// bring to front, remove, move, scale, align, distribute and the measurement
// fields, each in one undo step.
//
// Group rules live in core/group.js (no DOM, with tests): this module reads
// the state, asks for the plan, applies it with one undo step and announces
// it; when it doesn't apply, the notice explains why without changing
// anything. Rules, together with «Imán» and «Permitir superposición»:
// - Each sheet's part of the selection transforms inside its sheet.
// - Incremental changes (arrows, + and −, the handle, dragging) are bounded:
//   they stop when touching another piece or a limit; arrows jump over what is
//   in the way; dropping on another piece moves the block to the nearest free
//   spot or back. What is asked at once (align, distribute, rotate a group, a
//   typed measurement) applies whole or not at all.
// - Each piece's center stays on its sheet.
// - Each piece's scale stays between 1 % and 1000 %.
// - With «Imán», align, distribute and drag leave the block on the grid.
//
// A single piece is a group of one where the rules are the same (moving with
// the arrows, duplicating, removing).

import { MAX_ITEMS } from '../../config.ts';
import { maxGrowth, overlapsAny } from '../../core/collide.js';
import {
  canDistribute as canDistributeIn,
  copiesAllowed,
  distributeNeeds as needsFor,
  groupBounds,
  neighborAfterRemoval,
  planAlign,
  planCommonScale,
  planDistribute,
  planMoveTo,
  planNudge,
  planResizeTo,
  planRotate,
  planScaleBy,
  scaleLimits,
  type Plan,
} from '../../core/group.js';
import type { AlignMode, Axis } from '../../core/align.js';
import { keepCenterInside } from '../../core/sheets.js';
import type { IdRect, Item } from '../../core/types.ts';
import { clamp, round1 } from '../../core/util.ts';
import { t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { revealPieces } from '../../components/canvas/viewport.ts';
import { flushUi } from '../flush.ts';
import { lengthText, sizeText } from '../../services/measure.ts';
import { getDocument, patchItems, setDocument, type Piece } from '../document.ts';
import { cancelEdit, commit, endEdit } from '../history.ts';
import { getPrefs, setAllowOverlap } from '../prefs.ts';
import {
  area,
  boxes,
  currentSheet,
  dims,
  findItem,
  groupOptions,
  itemsOn,
  othersOnSheet,
  pieceName,
  pieceSizeText,
  primaryItem,
  selectedItem,
  selectedItems,
  sheetIndex,
  sheetSize,
} from '../selectors.ts';
import { animateNext, getView, setView } from '../view.ts';
import { focusList, focusSheet, focusSheetNode } from './focus.ts';
import { centeredOnSheet, duplicatePieces, fittedToSheet, withCenterKept } from './layout.ts';
import { say, singleOnly } from './notify.ts';
import { setSelection } from './selection.ts';

const ids = () => new Set(getDocument().selection);
const scales = () => selectedItems().map((item) => item.scale);
const sheetNumber = (sheet: number) => sheetIndex(sheet) + 1;
const isGroup = () => getDocument().selection.length > 1;
const busy = () => getDocument().busy;

// ---------- Apply or explain ----------

/** Applies the positions of a plan and, with `patch(item)`, the rest of the changes. */
function apply(rects: ReadonlyMap<number, IdRect>, patch: ((item: Piece) => Partial<Item>) | null = null, key: string | null = null) {
  commit(key);
  const patches = new Map<number, Partial<Item>>();
  for (const [id, r] of rects) patches.set(id, { ...patch?.(findItem(id)!), x: r.x, y: r.y });
  patchItems(patches);
}

type GroupAction = 'align' | 'distribute' | 'rotate' | 'scale' | 'move' | 'size';

/** Nothing applied: the notice says why and, for overlaps, offers to allow them and retry. */
function refuse(plan: Pick<Plan, 'reason'>, action: GroupAction, retry: () => void) {
  if (plan.reason === 'limit') return say(t('notices.scaleLimit'), { warn: true });
  const what = t(`notices.groupActions.${action}`);
  if (plan.reason === 'overlap') {
    return say(t('notices.wouldOverlap', { action: what }), {
      warn: true,
      action: {
        label: t('props.overlap'),
        run: () => {
          setAllowOverlap(true);
          retry();
        },
      },
    });
  }
  say(t('notices.wouldLeave', { action: what }), { warn: true });
}

// Continuous edit of a field: what is valid applies (one undo step for the
// whole edit); if it isn't valid when confirmed, it goes back to how it was.
function editOrRefuse(plan: Plan, patch: ((item: Piece) => Partial<Item>) | null, key: string, final: boolean, action: GroupAction, retry: () => void) {
  if (plan.ok) {
    if (plan.changed) apply(plan.rects, patch, key);
    if (final) endEdit();
    return true;
  }
  if (final) {
    cancelEdit(key);
    refuse(plan, action, retry);
  }
  return false;
}

/** Applies `change` to the single selected piece as one undo step. */
function editSelected(change: (item: Piece) => Partial<Item>, { focus = false, message = null as string | ((item: Piece) => string) | null } = {}) {
  const item = selectedItem();
  if (!item || busy()) return false;
  commit();
  const patch = change(item);
  patchItems(new Map([[item.id, patch]]));
  if (focus) focusSheet();
  if (message) announce(typeof message === 'function' ? message(selectedItem() ?? item) : message);
  return true;
}

export interface FocusOption {
  focus?: boolean;
}

// ---------- Rotate ----------

/**
 * Rotates 90° (`dir` > 0: clockwise) around the selection's box: a piece
 * around its center. Like any group, it doesn't apply if it would overlap
 * another piece (unless allowed) and stays with its center on the sheet.
 */
export function rotate(dir: 1 | -1, { focus = false }: FocusOption = {}) {
  if (!getDocument().selection.length || busy()) return;
  rotateSelection(dir);
  if (focus) focusSheet();
}

function rotateSelection(dir: 1 | -1) {
  const { plan, dr } = planRotate(boxes(), ids(), dir, groupOptions());
  if (!plan.ok) return refuse(plan, 'rotate', () => rotateSelection(dir));
  apply(plan.rects, (item) => ({ r: ((item.r + dr) % 360) as Item['r'] }));
  const item = selectedItem();
  if (item) return announce(t('announce.rotated', { deg: item.r, size: pieceSizeText(item) }));
  animateNext();
  announce(t('announce.groupRotated', { n: plan.rects.size, dir: t(dir > 0 ? 'announce.toRight' : 'announce.toLeft') }));
}

// ---------- Duplicate ----------

/** How many times the selection can be duplicated without going over the piece limit. */
export const maxCopies = () => copiesAllowed(getDocument().items.length, getDocument().selection.length, MAX_ITEMS);

/**
 * `times` copies of each selected piece, in the gaps from the current sheet
 * (and on the next ones or new sheets), without moving anything. The copies
 * end up selected. D and the toolbar make 1 of each; «Duplicar ×N» in the
 * panel tells how many and on which sheets.
 */
export function duplicate(times = 1, { focus = false }: FocusOption = {}) {
  const items = selectedItems();
  if (!items.length || busy()) return;
  const single = items.length === 1 && times === 1;
  if (times > maxCopies()) {
    say(single ? t('errors.maxPieces', { max: MAX_ITEMS }) : t('errors.maxCopies', { max: MAX_ITEMS, n: maxCopies() }), { warn: true });
    return;
  }
  const from = sheetIndex(currentSheet());
  commit();
  const copies = duplicatePieces(items, times, from);
  setSelection(
    copies.map((copy) => copy.id),
    { pinned: copies.length > 1 }
  );
  setView({ sheet: copies.at(-1)!.sheet });
  flushUi();
  revealPieces(copies.map((copy) => copy.id), copies.at(-1)!.id);
  const n = copies.length;
  const sheets = new Set(copies.map((copy) => copy.sheet)).size;
  const total = getDocument().items.length;
  if (times > 1) {
    say(sheets > 1 ? t('notices.duplicatedTimesSheets', { n, sheets }) : t('notices.duplicatedTimes', { n, i: sheetNumber(copies[0].sheet) }));
    return;
  }
  if (focus) focusSheet();
  if (single) {
    const moved = copies[0].sheet !== items[0].sheet;
    announce(moved ? t('announce.duplicatedTo', { n: total, i: sheetNumber(copies[0].sheet) }) : t('announce.duplicated', { n: total }));
  } else {
    announce(
      sheets > 1 || copies[0].sheet !== currentSheet()
        ? t('announce.duplicatedManySheets', { n, sheets, total })
        : t('announce.duplicatedMany', { n, total })
    );
  }
}

// ---------- Fit, center, bring to front, actual size ----------

export function fit({ focus = false }: FocusOption = {}) {
  if (isGroup()) return singleOnly();
  editSelected(fittedToSheet, { focus, message: (item) => t('announce.fitted', { size: pieceSizeText(item) }) });
}

export function center({ focus = false }: FocusOption = {}) {
  if (isGroup()) return singleOnly();
  editSelected(centeredOnSheet, { focus, message: t('announce.centered') });
}

/** Does the piece overlap another one on its sheet? («Traer al frente» only makes sense then.) */
export const overlapsOthers = (item: Piece) => {
  const [w, h] = dims(item);
  return overlapsAny({ x: item.x, y: item.y, w, h }, othersOnSheet(item.sheet, item.id));
};

export function bringToFront({ focus = false }: FocusOption = {}) {
  if (isGroup()) return singleOnly();
  const item = selectedItem();
  if (!item) return;
  if (!overlapsOthers(item)) return announce(t('announce.frontNotNeeded'));
  if (busy()) return;
  commit();
  setDocument({ items: [...getDocument().items.filter((other) => other.id !== item.id), item] });
  if (focus) focusSheet();
  announce(t('announce.front'));
}

/** «100 %»: a piece at its actual size (from its center); with several, all of them. */
export function actualSize() {
  if (isGroup()) {
    if (busy()) return;
    if (setSelectionScale(100, { final: true, key: null })) announce(t('announce.actualSizeGroup', { n: getDocument().selection.length }));
    return;
  }
  editSelected((item) => withCenterKept(item, { scale: 100 }), { message: (item) => t('announce.actualSize', { size: pieceSizeText(item) }) });
}

// ---------- Remove ----------

/**
 * Removes the selection. From the keyboard, the selection and the focus move
 * to a neighbor on the same sheet (on the sheet, or in the list if it was
 * removed from there); with the mouse, nothing stays selected.
 */
export function remove({ focus = true, inList = false, announced = '' } = {}) {
  const items = selectedItems();
  if (!items.length || busy()) return;
  const primary = primaryItem()!;
  const removed = ids();
  const name = pieceName(primary.id);
  const neighbor = focus
    ? neighborAfterRemoval(
        itemsOn(primary.sheet).map((item) => item.id),
        primary.id,
        removed
      )
    : null;
  commit();
  setDocument({ items: getDocument().items.filter((item) => !removed.has(item.id)) });
  setSelection(neighbor !== null ? [neighbor] : []);
  setView({ sheet: primary.sheet });
  if (inList && focusList()) {
    // the focus stays in the list
  } else if (focus) focusSheet();
  else focusSheetNode(primary.sheet);
  const left = getDocument().items.length;
  if (announced) announce(announced);
  else if (items.length === 1) announce(t(left ? 'announce.removed' : 'announce.removedLast', { name }));
  else announce(t(left ? 'announce.removedMany' : 'announce.removedManyLast', { n: items.length }));
}

// ---------- Move with the arrows ----------

function announcePosition(sheet: number) {
  const box = groupBounds(boxes(), ids()).get(sheet);
  if (box) announce(t('announce.position', { x: lengthText(box.x), y: lengthText(box.y) }), { key: 'move', delay: 600 });
}

/** Arrows: moves the selection; if it would land on another piece it jumps right past it. */
export function nudge(dx: number, dy: number) {
  const primary = primaryItem();
  if (!primary || busy()) return;
  const { plan, jumped } = planNudge(boxes(), ids(), dx, dy, groupOptions());
  if (plan.ok && plan.changed) apply(plan.rects, null, `nudge:${getDocument().selection.join(',')}`);
  focusSheet();
  if (plan.ok && plan.changed && jumped.length) announce(t('announce.jumped', { names: jumped.map((box) => pieceName(box.id)).join(', ') }));
  announcePosition(primary.sheet);
}

// ---------- Scale with + and − ----------

/** + and −: a piece grows from its center, stopping at its neighbors; a group, from its box's center. */
export function scaleBy(delta: number) {
  if (busy()) return;
  if (isGroup()) {
    scaleSelectionBy(delta);
    return focusSheet();
  }
  const item = selectedItem();
  if (!item) return;
  let scale = clamp(round1(item.scale + delta), 1, 1000);
  if (delta > 0 && !getPrefs().allowOverlap) {
    // Growing stops when touching another piece (rounded down to 0.1 % so it doesn't go past it).
    const [w, h] = dims(item);
    const growth = maxGrowth({ x: item.x, y: item.y, w, h }, othersOnSheet(item.sheet, item.id), 'center');
    if (Number.isFinite(growth)) scale = Math.min(scale, Math.max(item.scale, Math.floor(item.scale * growth * 10) / 10));
    if (scale <= item.scale) {
      focusSheet();
      return announce(t('announce.noRoom'), { key: 'scale' });
    }
  }
  commit(`scale-key:${item.id}`);
  patchItems(new Map([[item.id, withCenterKept(item, { scale })]]));
  focusSheet();
  const next = findItem(item.id)!;
  announce(t('announce.scaled', { scale: next.scale, size: pieceSizeText(next) }), { key: 'scale', delay: 600 });
}

function scaleSelectionBy(delta: number) {
  const primary = primaryItem()!;
  const result = planScaleBy(boxes(), ids(), scales(), primary.scale, delta, groupOptions());
  if (!result) return announce(t(delta > 0 ? 'announce.noRoomGroup' : 'announce.noSmallerGroup'), { key: 'scale' });
  apply(result.plan.rects, (item) => ({ scale: item.scale * result.k }), `scale-key:${getDocument().selection.join(',')}`);
  const box = groupBounds(boxes(), ids()).get(primary.sheet)!;
  announce(t('announce.groupScaled', { n: getDocument().selection.length, size: sizeText(box.w, box.h) }), { key: 'scale', delay: 600 });
}

// ---------- Measurement fields ----------

export type LengthField = 'x' | 'y' | 'width' | 'height';

// The selection's box on the primary piece's sheet (or of `list`, during a gesture).
export function primaryBox(list: readonly Piece[] = selectedItems()) {
  const primaryId = getDocument().selection.at(-1);
  const primary = list.find((item) => item.id === primaryId) ?? list.at(-1)!;
  const rects = list
    .filter((item) => item.sheet === primary.sheet)
    .map((item) => {
      const [w, h] = dims(item);
      return { x: item.x, y: item.y, w, h };
    });
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  return { x: x0, y: y0, w: Math.max(...rects.map((r) => r.x + r.w)) - x0, h: Math.max(...rects.map((r) => r.y + r.h)) - y0 };
}

/** The value a length field shows, in mm (the piece's, or the group box's), or null without a selection. */
export function lengthFieldValue(field: LengthField): number | null {
  const doc = getDocument();
  if (doc.selection.length > 1) {
    const box = primaryBox();
    return { x: box.x, y: box.y, width: box.w, height: box.h }[field];
  }
  const item = selectedItem();
  if (!item) return null;
  if (field === 'x') return item.x;
  if (field === 'y') return item.y;
  return dims(item)[field === 'width' ? 0 : 1];
}

/**
 * The values a length field accepts, in mm: X and Y keep every center on its
 * sheet; width and height keep every scale between 1 % and 1000 %.
 */
export function lengthFieldRange(field: LengthField): { min: number; max: number } | null {
  const [W, H] = sheetSize();
  const list = selectedItems();
  if (!list.length) return null;
  if (field === 'x' || field === 'y') {
    const total = field === 'x' ? W : H;
    const box = primaryBox(list);
    const start = field === 'x' ? box.x : box.y;
    let lo = -Infinity;
    let hi = Infinity;
    for (const item of list) {
      const [w, h] = dims(item);
      const center = field === 'x' ? item.x + w / 2 : item.y + h / 2;
      lo = Math.max(lo, -center);
      hi = Math.min(hi, total - center);
    }
    return { min: start + lo, max: start + hi };
  }
  const box = primaryBox(list);
  const size = field === 'width' ? box.w : box.h;
  const { min, max } = scaleLimits(list.map((item) => item.scale));
  return { min: size * min, max: size * max };
}

/** The undo key a length field's edit uses (see setLengthField). */
export function lengthFieldKey(field: LengthField) {
  if (isGroup()) return field === 'x' || field === 'y' ? `group-${field}` : `group-${field === 'width' ? 'w' : 'h'}`;
  const item = selectedItem();
  return item ? `${field}:${item.id}` : null;
}

/** The undo key of the scale field and the slider. */
export const scaleFieldKey = (name: 'scale' | 'slider') => (isGroup() ? `group-${name}` : `${name}:${selectedItem()?.id}`);

// ¿Would anything change? (Confirming the same twice adds no undo steps.)
const differs = (item: Piece, changes: Partial<Item>) => (Object.keys(changes) as (keyof Item)[]).some((key) => item[key] !== changes[key]);

// X and Y: a piece may stick out of the sheet, but not more than half (its center stays on it).
function singleLengthPatch(item: Piece, field: LengthField, mm: number): Partial<Item> | null {
  const [w, h] = dims(item);
  if (field === 'x' || field === 'y') {
    const [W, H] = sheetSize();
    const spot = keepCenterInside({ x: field === 'x' ? mm : item.x, y: field === 'y' ? mm : item.y, w, h }, W, H);
    return field === 'x' ? { x: spot.x } : { y: spot.y };
  }
  if (!(mm > 0)) return null;
  const natural = dims({ ...item, scale: 100 })[field === 'width' ? 0 : 1];
  return { scale: clamp((100 * mm) / natural, 1, 1000) };
}

/** Applies a length typed or stepped in a field (`final`: confirmed). */
export function setLengthField(field: LengthField, mm: number, { final = false } = {}) {
  if (isGroup()) {
    if (field === 'x' || field === 'y') moveGroupTo(field, mm, { final });
    else resizeGroupTo(field === 'width' ? 'w' : 'h', mm, { final });
    return;
  }
  const item = selectedItem();
  const changes = item && singleLengthPatch(item, field, mm);
  if (item && changes && differs(item, changes)) {
    commit(`${field}:${item.id}`);
    patchItems(new Map([[item.id, changes]]));
  }
  if (final) endEdit();
}

/**
 * X and Y fields with several pieces: the group box on the primary's sheet
 * moves to (x, y); the other parts move the same. With `final`, if it isn't
 * valid, it goes back to before the edit and explains why.
 */
function moveGroupTo(axis: Axis, mm: number, { final = false } = {}) {
  const key = `group-${axis}`;
  const plan = planMoveTo(boxes(), ids(), primaryItem()!.sheet, axis, mm, groupOptions());
  // Already there (also the «change» that arrives when leaving the field): nothing to do.
  if (!plan) {
    if (final) endEdit();
    return;
  }
  editOrRefuse(plan, null, key, final, 'move', () => moveGroupTo(axis, mm, { final: true }));
}

/**
 * Width and height fields with several pieces: the group box (on the
 * primary's sheet) takes `mm`, in proportion, from its top left corner; the
 * other parts change the same.
 */
function resizeGroupTo(axis: 'w' | 'h', mm: number, { final = false } = {}) {
  const key = `group-${axis}`;
  const result = planResizeTo(boxes(), ids(), primaryItem()!.sheet, axis, mm, scales(), groupOptions());
  if (!result) {
    if (final) endEdit();
    return;
  }
  editOrRefuse(result.plan, (item) => ({ scale: item.scale * result.k }), key, final, 'scale', () => resizeGroupTo(axis, mm, { final: true }));
}

/**
 * Shared scale (field, slider and «100 %») with several pieces: every one
 * takes `value` %, each from its own center.
 */
export function setSelectionScale(value: number, { final = false, key = 'group-scale' as string | null } = {}) {
  const current = new Map(selectedItems().map((item) => [item.id, item.scale]));
  const { plan, scale } = planCommonScale(boxes(), ids(), current, value, groupOptions());
  return editOrRefuse(plan, () => ({ scale }), key ?? '', final, 'scale', () => setSelectionScale(value, { final: true, key }));
}

/**
 * The scale field and the slider (`name`): one piece takes `value` % (no
 * neighbor check, like typing a size); several, through setSelectionScale.
 */
export function setScaleField(name: 'scale' | 'slider', value: number, { final = false } = {}) {
  const valid = !busy() && Number.isFinite(value) && value > 0;
  if (isGroup() && valid) {
    setSelectionScale(value, { key: `group-${name}`, final });
    return;
  }
  if (final) return endEdit();
  if (busy()) return;
  const item = selectedItem();
  if (!item || !Number.isFinite(value) || !(value > 0)) return;
  commit(`${name}:${item.id}`);
  patchItems(new Map([[item.id, { scale: clamp(value, 1, 1000) }]]));
}

// ---------- Align and distribute ----------

/** Does aligning go against the printable area? (with one piece, always) */
export const alignsToSheet = () => getDocument().selection.length === 1 || getView().alignTo === 'sheet';

/**
 * Aligns: two or more against the selection's box (of each sheet) or, with
 * «Alinear a: hoja», against the printable area; one piece against the
 * printable area.
 */
export function alignSelection(mode: AlignMode) {
  const n = getDocument().selection.length;
  if (!n) return announce(t('announce.needSelection'));
  if (busy()) return;
  const toSheet = alignsToSheet();
  const { m, aw, ah } = area();
  if (toSheet && (aw <= 0 || ah <= 0)) return say(t('errors.marginTooBig'), { warn: true });
  const plan = planAlign(boxes(), ids(), mode, { ...groupOptions(), area: toSheet ? { x: m, y: m, w: aw, h: ah } : null });
  if (!plan.ok) return refuse(plan, 'align', () => alignSelection(mode));
  if (!plan.changed) return announce(t('announce.alignedAlready', { n }));
  apply(plan.rects);
  animateNext();
  announce(t(toSheet ? 'announce.alignedSheet' : 'announce.aligned', { n, how: t(`announce.alignHow.${mode}`) }));
}

/** How many are needed (on one sheet) to distribute with the current mode. */
export const distributeNeeds = () => needsFor(getView().distribute);

/** Does some sheet have enough selected pieces to distribute? */
export const canDistribute = () => canDistributeIn(boxes(), ids(), getView().distribute);

/**
 * Distributes along `axis`: with the «Separación» of Distribución between
 * consecutive pieces (the first stays) or evenly between the first and the
 * last. Each sheet on its own.
 */
export function distributeSelection(axis: Axis) {
  if (!getDocument().selection.length) return announce(t('announce.needSelection'));
  if (busy()) return;
  const mode = getView().distribute;
  if (!canDistribute()) return announce(t(needsFor(mode) === 2 ? 'props.distributeNeedTwo' : 'props.distributeNeedThree'));
  const gap = getDocument().gap;
  const plan = planDistribute(boxes(), ids(), axis, { ...groupOptions(), mode, gap });
  if (!plan.ok) return refuse(plan, 'distribute', () => distributeSelection(axis));
  const n = getDocument().selection.length;
  if (!plan.changed) return announce(t('announce.distributedAlready'));
  apply(plan.rects);
  animateNext();
  const dir = t(axis === 'x' ? 'announce.horizontally' : 'announce.vertically');
  announce(mode === 'even' ? t('announce.distributedEven', { n, dir }) : t('announce.distributedGap', { n, dir, gap: lengthText(gap) }));
}
