// Group operations (several selected pieces, on one or more sheets): each
// subgroup (the selected pieces of one sheet) is transformed within its
// sheet, snapped to the grid as a block, kept so each piece's center stays on
// its sheet, and checked for overlaps. Takes boxes {id, sheet, x, y, w, h} in
// mm (rotated and cropped) and returns new ones, changing nothing.

import { bounds, snapGroup, validate, align, distribute, grown, moveBy, rotateGroup, scaleGroup } from './align.js';
import { nextFreeForGroup, nearestFreeOffset, groupScaleRange } from './collide.js';

/**
 * The selected boxes (`ids`, a Set) by sheet, in the order of `boxes`: Map
 * sheet → {rects: the selected ones, others: the rest of that sheet}. Only
 * the sheets with something selected.
 */
export function subgroups(boxes, ids) {
  const out = new Map();
  for (const b of boxes) {
    if (!ids.has(b.id)) continue;
    if (!out.has(b.sheet)) out.set(b.sheet, { rects: [], others: [] });
    out.get(b.sheet).rects.push(b);
  }
  for (const b of boxes) if (!ids.has(b.id) && out.has(b.sheet)) out.get(b.sheet).others.push(b);
  return out;
}

const plain = ({ id, x, y, w, h }) => ({ id, x, y, w, h });

// The offsets [lo, hi] on one axis that keep every center in [0, total].
// lo > hi: there are none.
function centerRange(rects, pos, size, total) {
  let lo = -Infinity;
  let hi = Infinity;
  for (const r of rects) {
    const c = r[pos] + r[size] / 2;
    lo = Math.max(lo, -c);
    hi = Math.min(hi, total - c);
  }
  return [lo, hi];
}

// The smallest offset into [lo, hi]; with snap, rounded away from zero to a
// multiple of the step when that fits too (so the block stays on the grid).
function containShift(lo, hi, step) {
  const shift = Math.min(Math.max(0, lo), hi);
  if (!shift || !step) return shift;
  const k = shift > 0 ? Math.ceil(shift / step - 1e-9) : Math.floor(shift / step + 1e-9);
  const snapped = k * step;
  return snapped >= lo - 1e-9 && snapped <= hi + 1e-9 ? snapped : shift;
}

/**
 * The plan of a group operation.
 *
 * `boxes`: every piece of the document; `ids`: a Set of the selected ones.
 * `transform(rects, sheet)`: gives the new rectangles of that sheet's
 * subgroup (same order and ids).
 *
 * Options:
 * - `W`, `H`: the sheet's size.
 * - `snap`: null or {step, axes ('x' | 'y' | 'xy'), round} for snapGroup: the
 *   subgroup snaps to the grid as a block, keeping its distances.
 * - `contain`: 'clamp' (default: when some center leaves the sheet, the whole
 *   subgroup moves just enough for all of them to be on it) or 'reject' (not
 *   applied: `reason` 'outside').
 * - `allowOverlap`: when false (default), a piece overlapping another of its
 *   sheet (selected or not) makes the operation invalid: `reason` 'overlap'.
 * - `rigid`: the group only moves; selected pieces that already overlapped
 *   each other don't count (moving doesn't change that).
 * - `round(v)`: rounding of the positions (to 0.0001 mm, for instance).
 *
 * Gives {ok, reason, sheet, rects, changed}: `rects`, Map id → {id, x, y, w,
 * h} (also when an overlap makes it invalid, to show it); `sheet`, the sheet
 * with the problem; `changed`, whether anything moved or changed size.
 */
export function planGroup(boxes, ids, transform, options = {}) {
  const { W, H, snap = null, contain = 'clamp', allowOverlap = false, rigid = false, round = (v) => v, pad = 0 } = options;
  // With `pad`, `boxes` are images and each one takes `pad` more on every side (the cut margin).
  const padded = (list) => (pad > 0 ? list.map((r) => grown(r, pad)) : list);
  const rects = new Map();
  let failure = null;
  let changed = false;
  for (const [sheet, { rects: group, others }] of subgroups(boxes, ids)) {
    let next = transform(group.map(plain), sheet).map(plain);
    if (snap?.step > 0) next = snapGroup(next, snap.step, { axes: snap.axes ?? 'xy', round: snap.round ?? 'nearest' });
    const [xlo, xhi] = centerRange(next, 'x', 'w', W);
    const [ylo, yhi] = centerRange(next, 'y', 'h', H);
    if (xlo > xhi + 1e-9 || ylo > yhi + 1e-9) {
      failure ??= { reason: 'outside', sheet };
    } else {
      const step = snap?.step > 0 ? snap.step : 0;
      const dx = containShift(xlo, xhi, (snap?.axes ?? 'xy').includes('x') ? step : 0);
      const dy = containShift(ylo, yhi, (snap?.axes ?? 'xy').includes('y') ? step : 0);
      if (dx || dy) {
        if (contain === 'reject') failure ??= { reason: 'outside', sheet };
        else next = next.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
      }
    }
    next = next.map((r) => ({ ...r, x: round(r.x), y: round(r.y) }));
    if (!failure && !validate(padded(next), padded(others), { allowOverlap, internal: !rigid })) failure = { reason: 'overlap', sheet };
    next.forEach((r, i) => {
      const before = group[i];
      if (r.x !== before.x || r.y !== before.y || Math.abs(r.w - before.w) > 1e-9 || Math.abs(r.h - before.h) > 1e-9) changed = true;
      rects.set(r.id, r);
    });
  }
  return failure ? { ok: false, ...failure, rects, changed } : { ok: true, reason: null, sheet: null, rects, changed };
}

/**
 * The factors k to scale `rects` by from `anchor` ({x, y}, as in
 * align.scaleGroup) with no center leaving the W × H sheet. Gives {min, max}
 * (min > max: no factor works).
 */
export function containScaleRange(rects, anchor, W, H) {
  let min = 0;
  let max = Infinity;
  for (const r of rects) {
    for (const [c, a, total] of [
      [r.x + r.w / 2, anchor.x, W],
      [r.y + r.h / 2, anchor.y, H],
    ]) {
      // The center ends at a + d·k, which has to be in [0, total].
      const d = c - a;
      if (d > 0) {
        max = Math.min(max, (total - a) / d);
        min = Math.max(min, -a / d);
      } else if (d < 0) {
        max = Math.min(max, a / -d);
        min = Math.max(min, (a - total) / -d);
      } else if (a < 0 || a > total) {
        return { min: 1, max: 0 };
      }
    }
  }
  return { min, max };
}

/** Each subgroup's box: Map sheet → {x, y, w, h}. */
export function groupBounds(boxes, ids) {
  const out = new Map();
  for (const [sheet, { rects }] of subgroups(boxes, ids)) out.set(sheet, bounds(rects));
  return out;
}

/**
 * The value several pieces share (within a tolerance), or null when they
 * differ (shown as mixed). `values`: numbers.
 */
export function common(values, tolerance = 1e-6) {
  if (!values.length) return null;
  const first = values[0];
  return values.every((v) => Math.abs(v - first) <= tolerance) ? first : null;
}

/**
 * Which pieces are «the same»: those from the same source file as one of
 * `ids`. `items`: [{id, src}] (src: the asset's original file; the pages of
 * one PDF share it, and crop, scale, rotation and page don't change it; for
 * a QR code, what it is drawn from).
 * Gives the ids, in the order of `items`.
 */
export function sameSource(items, ids) {
  const sources = new Set(items.filter((item) => ids.has(item.id)).map((item) => item.src));
  return items.filter((item) => sources.has(item.src)).map((item) => item.id);
}

/**
 * Marquee selection: the ids of the boxes (in shared coordinates, the
 * canvas's px for instance) that the marquee `area` ({x, y, w, h}) touches
 * (touching along an edge doesn't count). `boxes`: [{id, x, y, w, h}].
 */
export function touchedBy(area, boxes) {
  const x1 = area.x + area.w;
  const y1 = area.y + area.h;
  return boxes.filter((b) => b.x < x1 && area.x < b.x + b.w && b.y < y1 && area.y < b.y + b.h).map((b) => b.id);
}

/**
 * The run of a list between two ids (both included), for Shift+click and
 * Shift+arrows: `order`, every id in order. When `from` isn't there, just
 * `to`.
 */
export function rangeBetween(order, from, to) {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (b < 0) return [];
  if (a < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

// ---------- Each operation's plan (the UI only applies and announces it) ----------
//
// Shared options (`opts`): {W, H, allowOverlap, round, snapStep}. `snapStep`:
// the grid's step while snapping is on (otherwise 0 or null). `boxes`: every
// piece {id, sheet, x, y, w, h}; `ids`: a Set of the selected ones.

/** Each piece's scale, in %. */
export const SCALE_RANGE = Object.freeze({ min: 1, max: 1000 });

const base = ({ W, H, allowOverlap = false, round = (v) => v, pad = 0 }) => ({ W, H, allowOverlap, round, pad });

// Two lengths closer than this (mm) are the same (more than the positions' rounding).
const SAME_LENGTH = 1e-3;

/** The factors that keep each piece's scale (`scales`, in %) in SCALE_RANGE. */
export function scaleLimits(scales) {
  let min = 0;
  let max = Infinity;
  for (const s of scales) {
    min = Math.max(min, SCALE_RANGE.min / s);
    max = Math.min(max, SCALE_RANGE.max / s);
  }
  return { min, max };
}

// Each subgroup's anchor: a point of its box (fractions of the width and the height).
const ANCHORS = { center: [0.5, 0.5], 'top-left': [0, 0] };
const anchorOf = (box, anchor) => ({ x: box.x + box.w * ANCHORS[anchor][0], y: box.y + box.h * ANCHORS[anchor][1] });

/**
 * Arrow keys: moves the group by (dx, dy). Without overlaps, when it would
 * collide it jumps over what is in the way (as a single piece does); then it
 * is kept on the sheet. Gives {plan, jumped} (plan.ok false or !plan.changed:
 * it doesn't move).
 */
export function planNudge(boxes, ids, dx, dy, opts) {
  let ox = dx;
  let oy = dy;
  let jumped = [];
  if (!opts.allowOverlap) ({ dx: ox, dy: oy, jumped } = nextFreeForGroup([...subgroups(boxes, ids).values()], dx, dy));
  return { plan: planGroup(boxes, ids, (rects) => moveBy(rects, ox, oy), { ...base(opts), rigid: true }), jumped };
}

/**
 * The X and Y fields: the group's box on sheet `sheet` goes to `mm` on `axis`
 * ('x' | 'y'); the other parts move by the same. null when it is already
 * there.
 */
export function planMoveTo(boxes, ids, sheet, axis, mm, opts) {
  const box = groupBounds(boxes, ids).get(sheet);
  const delta = mm - box[axis];
  // Positions are stored rounded to 0.0001 mm: less than 0.001 mm away is
  // already there (the «change» that comes when leaving the field, say).
  if (Math.abs(delta) < SAME_LENGTH) return null;
  return planGroup(boxes, ids, (rects) => moveBy(rects, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0), { ...base(opts), rigid: true, contain: 'reject' });
}

/**
 * The factors the whole group can be scaled by from `anchor` ('center' or
 * 'top-left' of each part's box): each piece's scale (`scales`), the centers
 * on the sheet and, without overlaps, not overlapping the rest.
 */
export function scaleBounds(boxes, ids, scales, anchor, opts) {
  let { min, max } = scaleLimits(scales);
  for (const { rects, others } of subgroups(boxes, ids).values()) {
    const point = anchorOf(bounds(rects), anchor);
    const inside = containScaleRange(rects, point, opts.W, opts.H);
    min = Math.max(min, inside.min);
    max = Math.min(max, inside.max);
    if (!opts.allowOverlap) {
      // Two images `pad` apart on each side don't overlap when one doesn't reach the other grown by 2 · pad.
      const pad = opts.pad ?? 0;
      const near = pad > 0 ? others.map((o) => grown(o, 2 * pad)) : others;
      const free = groupScaleRange(rects, near, point);
      min = Math.max(min, free.min);
      max = Math.min(max, free.max);
    }
  }
  return { min, max };
}

/** Scales the group by `k` from `anchor` in each part (the plan checks it). */
export function planScale(boxes, ids, k, anchor, opts) {
  return planGroup(boxes, ids, (rects) => scaleGroup(rects, k, anchorOf(bounds(rects), anchor)).rects, base(opts));
}

/**
 * + and −: `delta` in points of the primary piece's scale (`primaryScale`; +1
 * from 50 % is 51 %), all in the same proportion, from the box's center. It
 * stops on touching another or reaching a limit. Gives {plan, k}, or null
 * when it can't change that way.
 */
export function planScaleBy(boxes, ids, scales, primaryScale, delta, opts) {
  const wanted = Math.max(SCALE_RANGE.min, primaryScale + delta) / primaryScale;
  const { min, max } = scaleBounds(boxes, ids, scales, 'center', opts);
  if (min > max) return null;
  const k = Math.min(Math.max(wanted, min), max);
  if (Math.abs(k - 1) < 1e-9 || (delta > 0 ? k <= 1 : k >= 1)) return null;
  const plan = planScale(boxes, ids, k, 'center', opts);
  return plan.ok ? { plan, k } : null;
}

/**
 * The width and height fields: the group's box on sheet `sheet` becomes `mm`
 * on `axis` ('w' | 'h'), in proportion, from its top left corner (the other
 * parts alike). null when it already measures that; {ok: false, reason:
 * 'limit'} when some scale would leave 1–1000 %. Gives {plan, k}.
 */
export function planResizeTo(boxes, ids, sheet, axis, mm, scales, opts) {
  const box = groupBounds(boxes, ids).get(sheet);
  const size = axis === 'w' ? box.w : box.h;
  if (!(mm > 0) || Math.abs(mm - size) < SAME_LENGTH) return null;
  const k = mm / size;
  const limits = scaleLimits(scales);
  if (k < limits.min - 1e-9 || k > limits.max + 1e-9) return { plan: { ok: false, reason: 'limit', rects: new Map(), changed: false }, k };
  return { plan: planGroup(boxes, ids, (rects) => scaleGroup(rects, k, 'top-left').rects, { ...base(opts), contain: 'reject' }), k };
}

/**
 * A shared scale: all go to `value` % (kept in 1–1000), each from its center.
 * `scales`: Map id → current scale. Gives {plan, scale}.
 */
export function planCommonScale(boxes, ids, scales, value, opts) {
  const scale = Math.min(Math.max(value, SCALE_RANGE.min), SCALE_RANGE.max);
  const plan = planGroup(
    boxes,
    ids,
    (rects) =>
      rects.map((r) => {
        const k = scale / scales.get(r.id);
        return { ...r, x: r.x + (r.w - r.w * k) / 2, y: r.y + (r.h - r.h * k) / 2, w: r.w * k, h: r.h * k };
      }),
    base(opts)
  );
  return { plan, scale };
}

/** Rotates the group 90° around its box's center (`dir` > 0: clockwise). {plan, dr} */
export function planRotate(boxes, ids, dir, opts) {
  const direction = dir > 0 ? 'cw' : 'ccw';
  return { plan: planGroup(boxes, ids, (rects) => rotateGroup(rects, direction).rects, base(opts)), dr: dir > 0 ? 90 : 270 };
}

const ALIGN_AXIS = { left: 'x', centerX: 'x', right: 'x', top: 'y', centerY: 'y', bottom: 'y' };
// Against the printable area, snapping takes the corner inside the margin.
const INWARD = { left: 'up', centerX: 'nearest', right: 'down', top: 'up', centerY: 'nearest', bottom: 'down' };

/**
 * Align: against each part's box or, with `area` ({x, y, w, h}: the printable
 * area), against that. With snap, the block lands on the grid on the axis
 * that changes (against the printable area, inward). When some piece would
 * leave the sheet, it is invalid.
 */
export function planAlign(boxes, ids, mode, { area = null, ...opts }) {
  const axis = ALIGN_AXIS[mode];
  if (!axis) throw new RangeError(`unknown align mode: ${mode}`);
  const snap = opts.snapStep > 0 ? { step: opts.snapStep, axes: axis, round: area ? INWARD[mode] : 'nearest' } : null;
  return planGroup(boxes, ids, (rects) => align(rects, mode, area ?? bounds(rects)), { ...base(opts), snap, contain: 'reject' });
}

/** How many pieces one sheet needs to distribute: 2 with the gap, 3 evenly. */
export const distributeNeeds = (mode) => (mode === 'even' ? 3 : 2);

/** Does some sheet have enough selected pieces to distribute with `mode`? */
export const canDistribute = (boxes, ids, mode) => [...subgroups(boxes, ids).values()].some(({ rects }) => rects.length >= distributeNeeds(mode));

/**
 * Distribute along `axis`: `gap` mm between consecutive ones (the first
 * stays) or evenly between the first and the last (`mode` 'even'). Sheets
 * with fewer pieces than needed don't change. With snap, the block lands on
 * the grid on that axis. When some piece would leave the sheet, it is
 * invalid.
 */
export function planDistribute(boxes, ids, axis, { mode = 'gap', gap = 0, ...opts }) {
  const need = distributeNeeds(mode);
  const snap = opts.snapStep > 0 ? { step: opts.snapStep, axes: axis } : null;
  return planGroup(
    boxes,
    ids,
    (rects) => (rects.length < need ? rects : distribute(rects, axis, mode === 'even' ? { within: bounds(rects) } : { gap })),
    { ...base(opts), snap, contain: 'reject' }
  );
}

/**
 * Drag: where the group would end moved by (dx, dy) mm. With `target` (the
 * group is on one sheet and goes to another), the selected pieces move to
 * that sheet with y shifted by `offsetY` mm. With snap, the block lands on
 * the grid. Gives {plan, boxes} (the boxes with the new sheet, for the drop).
 */
export function planDrag(boxes, ids, dx, dy, { target = null, offsetY = 0, ...opts }) {
  const all = target === null ? boxes : boxes.map((b) => (ids.has(b.id) ? { ...b, sheet: target, y: b.y + offsetY } : b));
  const snap = opts.snapStep > 0 ? { step: opts.snapStep, axes: 'xy' } : null;
  return { plan: planGroup(all, ids, (rects) => moveBy(rects, dx, dy), { ...base(opts), snap, rigid: true }), boxes: all };
}

/**
 * Dropping the drag (`drag`: the last planDrag). When it would overlap others
 * there, the block goes to the nearest free place (with snap, moved in grid
 * steps); when there is none nearby, it goes back. Gives {result, rects}:
 * result 'moved', 'moved-aside' or 'reverted'.
 */
export function planDrop({ plan, boxes }, ids, opts) {
  if (plan.ok) return { result: 'moved', rects: plan.rects };
  if (plan.reason !== 'overlap') return { result: 'reverted', rects: null };
  const moved = boxes.map((b) => (plan.rects.has(b.id) ? { ...b, ...plan.rects.get(b.id) } : b));
  const layers = [...subgroups(moved, ids).values()].map(({ rects, others }) => ({ rects, others, bounds: { W: opts.W, H: opts.H } }));
  const box = bounds(layers.flatMap((layer) => layer.rects));
  const offset = nearestFreeOffset(layers, { maxDistance: Math.max(box.w, box.h, 15), step: opts.snapStep || 0 });
  if (!offset) return { result: 'reverted', rects: null };
  const round = opts.round ?? ((v) => v);
  const rects = new Map([...plan.rects].map(([id, r]) => [id, { ...r, x: round(r.x + offset.dx), y: round(r.y + offset.dy) }]));
  return { result: 'moved-aside', rects };
}

// ---------- Selection ----------

/** The list with `primary` last (the primary piece), without repeats. */
export const withPrimaryLast = (list, primary) => (list.includes(primary) ? [...list.filter((id) => id !== primary), primary] : [...list]);

/** Adds `id` to the selection or removes it. Gives {selection, on}. */
export function toggled(selection, id) {
  const on = !selection.includes(id);
  return { selection: on ? [...selection, id] : selection.filter((other) => other !== id), on };
}

/** Marquee: those it touched (added to the earlier ones with `additive`), the touched ones last. */
export const touchedSelection = (selection, touched, additive) => [...(additive ? selection.filter((id) => !touched.includes(id)) : []), ...touched];

/**
 * Ctrl+A: those of the current sheet (`onSheet`, ids); when exactly those
 * were already selected, all of them (`all`). The primary piece stays primary
 * when it remains. {selection, everything}
 */
export function selectAllTarget(selection, onSheet, all) {
  const everything = onSheet.length > 0 && selection.length === onSheet.length && onSheet.every((id) => selection.includes(id));
  return { selection: withPrimaryLast(everything ? all : onSheet, selection.at(-1)), everything };
}

/**
 * Who stays selected after removing `removed` (a Set): the next one on the
 * primary piece's sheet (`sameSheet`, ids in order), or the previous one, or
 * none.
 */
export function neighborAfterRemoval(sameSheet, primary, removed) {
  const index = sameSheet.indexOf(primary);
  const after = sameSheet.slice(index + 1).find((id) => !removed.has(id));
  const before = sameSheet.slice(0, Math.max(0, index)).reverse().find((id) => !removed.has(id));
  return after ?? before ?? null;
}

/** How many copies of each selected piece fit without passing `max` pieces in all. */
export const copiesAllowed = (total, selected, max) => Math.max(0, Math.floor((max - total) / Math.max(1, selected)));
