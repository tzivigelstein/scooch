// Several selected pieces: align, distribute and transform them as a group.
// Works on rectangles {id, x, y, w, h} in mm with each piece's orientation
// already applied (origin at the top left, y down). Returns new rectangles of
// the same shape and in the same order as the input (so calls chain and go
// straight to `validate`); never changes the input.

import { overlaps } from './collide.js';
import { compareIds } from './util.js';

const copy = ({ id, x, y, w, h }) => ({ id, x, y, w, h });

/** The box {x, y, w, h} around all of them, or null when there are none. */
export function bounds(rects) {
  if (!rects.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Mode → [coordinate, length, fraction]: the piece ends at
// reference.coordinate + (reference.length − piece.length) × fraction.
const MODES = {
  left: ['x', 'w', 0],
  centerX: ['x', 'w', 0.5],
  right: ['x', 'w', 1],
  top: ['y', 'h', 0],
  centerY: ['y', 'h', 0.5],
  bottom: ['y', 'h', 1],
};

export const ALIGN_MODES = Object.keys(MODES);

/**
 * Aligns each piece against the box `reference` ({x, y, w, h}): the
 * selection's (by default, `bounds(rects)`) or the sheet's printable area (in
 * sheet coordinates: {x: margin, y: margin, w: printable width, h: printable
 * height}). Only the coordinate of the mode's axis changes. Aligning twice
 * gives the same.
 */
export function align(rects, mode, reference = bounds(rects)) {
  if (!Object.hasOwn(MODES, mode)) throw new RangeError(`unknown align mode: ${mode}`);
  const [pos, size, t] = MODES[mode];
  return rects.map((r) => {
    const out = copy(r);
    out[pos] = t === 0 ? reference[pos] : reference[pos] + (reference[size] - r[size]) * t;
    return out;
  });
}

const AXES = { x: ['x', 'w'], y: ['y', 'h'] };

/**
 * Distributes the pieces along `axis` ('x' | 'y'), in the order of their
 * position on it (at the same position, the shorter first, then by id). The
 * other coordinate doesn't change. Two modes:
 *
 * - `{gap}`: the first stays where it is and each of the next starts exactly
 *   `gap` mm after the previous one ends. With fewer than 2 pieces they stay
 *   as they are.
 * - `{within: box}`: the first starts at the box's start, the last ends at
 *   its end, and the space left over is shared evenly between each pair of
 *   consecutive ones. With 2 pieces they go against the ends; with 1 (or
 *   none), they stay as they are. When the pieces add up to more than the
 *   box, the space between them is negative (they would overlap on that
 *   axis): `validate` catches it.
 */
export function distribute(rects, axis, options = {}) {
  if (!Object.hasOwn(AXES, axis)) throw new RangeError(`unknown axis: ${axis}`);
  const [pos, size] = AXES[axis];
  const out = rects.map(copy);
  const order = out
    .map((r, i) => i)
    .sort(
      (a, b) =>
        out[a][pos] - out[b][pos] || out[a][size] - out[b][size] || compareIds(out[a].id, out[b].id) || a - b
    )
    .map((i) => out[i]);
  if (out.length < 2) return out;

  if (options.within) {
    const box = options.within;
    const total = order.reduce((s, r) => s + r[size], 0);
    const space = (box[size] - total) / (order.length - 1);
    let cursor = box[pos];
    for (const r of order) {
      r[pos] = cursor;
      cursor += r[size] + space;
    }
    // The last one exactly against the end, without the sums' accumulated error.
    const last = order[order.length - 1];
    last[pos] = box[pos] + box[size] - last[size];
    return out;
  }
  if (typeof options.gap === 'number' && Number.isFinite(options.gap)) {
    let cursor = order[0][pos] + order[0][size];
    for (const r of order.slice(1)) {
      r[pos] = cursor + options.gap;
      cursor = r[pos] + r[size];
    }
    return out;
  }
  throw new TypeError('distribute: expected {gap} or {within}');
}

export const moveBy = (rects, dx, dy) => rects.map((r) => ({ ...copy(r), x: r.x + dx, y: r.y + dy }));

// Named anchors: fractions of the width and the height of the group's box.
const ANCHORS = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
};

/** The point {x, y} of an anchor: a given point, or a name of ANCHORS on the group's box. */
function anchorPoint(rects, anchor) {
  if (anchor && typeof anchor === 'object') return anchor;
  if (!Object.hasOwn(ANCHORS, anchor)) throw new RangeError(`unknown anchor: ${anchor}`);
  const b = bounds(rects) ?? { x: 0, y: 0, w: 0, h: 0 };
  const [fx, fy] = ANCHORS[anchor];
  return { x: b.x + b.w * fx, y: b.y + b.h * fy };
}

/**
 * Scales the group by `k` (> 0) around `anchor`: a point {x, y} in mm or a
 * name of ANCHORS on the group's box. Positions scale with the sizes, so the
 * distances between pieces grow alike. Gives {rects, factor}: `factor` (= k)
 * multiplies each piece's `scale`.
 */
export function scaleGroup(rects, k, anchor = 'center') {
  if (typeof k !== 'number' || !Number.isFinite(k) || k <= 0) throw new RangeError(`invalid factor: ${k}`);
  const a = anchorPoint(rects, anchor);
  return {
    rects: rects.map((r) => ({ id: r.id, x: a.x + (r.x - a.x) * k, y: a.y + (r.y - a.y) * k, w: r.w * k, h: r.h * k })),
    factor: k,
  };
}

/**
 * Rotates the group 90° around the center of its box: `direction` 'cw'
 * (clockwise, like `r`) or 'ccw'. Each piece turns with it: its center goes
 * around the group's center and its width and height swap. Gives {rects, dr}:
 * `dr` (90 or 270) is added to each piece's `r`, modulo 360. The group's box
 * keeps its center, with width and height swapped.
 */
export function rotateGroup(rects, direction = 'cw') {
  if (direction !== 'cw' && direction !== 'ccw') throw new RangeError(`unknown direction: ${direction}`);
  const b = bounds(rects);
  if (!b) return { rects: [], dr: direction === 'cw' ? 90 : 270 };
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const cw = direction === 'cw';
  return {
    rects: rects.map((r) => {
      const dx = r.x + r.w / 2 - cx;
      const dy = r.y + r.h / 2 - cy;
      // With y down, clockwise is (dx, dy) → (−dy, dx).
      const nx = cw ? -dy : dy;
      const ny = cw ? dx : -dx;
      return { id: r.id, x: cx + nx - r.h / 2, y: cy + ny - r.w / 2, w: r.h, h: r.w };
    }),
    dr: cw ? 90 : 270,
  };
}

// Rounding to the grid: nearest, up or down (with a tolerance, so a value
// already on the grid doesn't jump a step).
const ROUNDING = {
  nearest: Math.round,
  up: (v) => Math.ceil(v - 1e-9),
  down: (v) => Math.floor(v + 1e-9),
};

/**
 * Snap for the group as a block: moves it whole (the same delta for all) so
 * the top left corner of its box falls on the nearest grid line of `step` mm,
 * from `origin` (by default the sheet's corner, as a single piece snaps). The
 * distances inside don't change. A step that isn't positive and finite moves
 * nothing. The result isn't rounded.
 *
 * `axes`: 'xy' (default), 'x' or 'y': the axes that snap (the other is left
 * alone). `round`: 'nearest' (default), 'up' or 'down', or {x, y} with one
 * per axis: where the corner goes (inside the margin, for instance).
 */
export function snapGroup(rects, step, { origin = { x: 0, y: 0 }, axes = 'xy', round = 'nearest' } = {}) {
  const b = bounds(rects);
  if (!b || typeof step !== 'number' || !Number.isFinite(step) || step <= 0) return rects.map(copy);
  const mode = (axis) => ROUNDING[typeof round === 'object' ? (round[axis] ?? 'nearest') : round] ?? ROUNDING.nearest;
  const snap = (v, o, axis) => (axes.includes(axis) ? o + mode(axis)((v - o) / step) * step : v);
  return moveBy(rects, snap(b.x, origin.x, 'x') - b.x, snap(b.y, origin.y, 'y') - b.y);
}

/**
 * Is the result of a group operation acceptable? true when the pieces of
 * `result` overlap neither each other nor `others` (the unselected ones;
 * those of `others` whose id is in `result` are skipped, so the whole sheet
 * can be passed). Touching isn't overlapping (collide.js's tolerance). With
 * `allowOverlap`, always true. The UI uses it to reject the whole operation.
 * `internal: false` doesn't compare the pieces of `result` with each other
 * (for a group moved rigidly: what already overlapped inside, moving doesn't
 * change).
 */
export function validate(result, others = [], { allowOverlap = false, internal = true } = {}) {
  if (allowOverlap) return true;
  for (let i = 0; internal && i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) if (overlaps(result[i], result[j])) return false;
  }
  const moved = new Set(result.map((r) => r.id));
  for (const o of others) {
    if (o.id !== undefined && moved.has(o.id)) continue;
    for (const r of result) if (overlaps(r, o)) return false;
  }
  return true;
}
