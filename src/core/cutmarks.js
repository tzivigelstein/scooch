// Cut lines: marks at each piece's corners, or its outline, as segments in mm
// (origin at the sheet's top left).

// Two coordinates closer than this (mm) are the same line; a stretch shorter
// than this isn't drawn.
const TOL = 1e-6;

const finite = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** The modes of `cutLines`. ('contour', since document version 6: see contour.js.) */
export const CUT_MODES = Object.freeze(['none', 'corners', 'outline', 'contour']);

// ---------- Style ----------

/** Stroke weights, in PDF points. */
export const CUT_WEIGHTS = Object.freeze({ thin: 0.25, medium: 0.5, thick: 1 });
/** Preset colors (#rrggbb); any other #rrggbb is a custom color. */
export const CUT_COLORS = Object.freeze({ black: '#000000', gray: '#808080' });
export const CUT_DASHES = Object.freeze(['solid', 'dotted']);

export const isHexColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

// ---------- Cut margin ----------

/**
 * A piece's cut box: its image box grown by `margin` mm on every side
 * (positive: a white border around the image; negative: the cut goes inside
 * the image). It never inverts: at most it shrinks to a line.
 */
export function cutBox(rect, margin = 0) {
  const m = Math.max(finite(margin, 0), -Math.min(rect.w, rect.h) / 2);
  return { x: rect.x - m, y: rect.y - m, w: rect.w + 2 * m, h: rect.h + 2 * m };
}

/**
 * How much bigger than its image a piece is for the layout (arranging, gaps,
 * overlaps, the sheet's edges): the cut margin while cut lines are on and the
 * margin is positive, otherwise 0 (the image box, as always).
 */
export const footprintPad = (cuts) => (cuts && cuts.mode !== 'none' && finite(cuts.margin, 0) > 0 ? cuts.margin : 0);

/** A dotted line's dash pattern (on, off) in points for a stroke of `width` pt: short dashes that stay visible. */
export const dotPattern = (width) => [Math.max(0.5, width * 1.5), Math.max(1.5, width * 3)];

/**
 * How the lines are drawn, the same on screen and in the PDF: `width` and
 * `dash` (null when solid) in points, `color` as #rrggbb and as rgb 0–1.
 */
export function cutStyle({ weight = 'thin', color = CUT_COLORS.black, dash = 'solid' } = {}) {
  const width = CUT_WEIGHTS[weight] ?? CUT_WEIGHTS.thin;
  const hex = isHexColor(color) ? color.toLowerCase() : CUT_COLORS.black;
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return { width, hex, rgb, dash: dash === 'dotted' ? dotPattern(width) : null };
}

// Inside, each segment is {dir, c, a, b}: horizontal ('h') on y = c from
// x = a to x = b, or vertical ('v') on x = c from y = a to y = b; a < b.

// The piece's edges parallel to `dir`: [from, to] along the segment and
// [lo, hi] on the perpendicular coordinate.
const span = (q, dir) => (dir === 'h' ? [q.x, q.x + q.w, q.y, q.y + q.h] : [q.y, q.y + q.h, q.x, q.x + q.w]);

// A piece's 8 marks: at each corner, a horizontal one on the line of the top
// or bottom edge and a vertical one on the line of the left or right edge,
// pointing out, starting `offset` from the corner.
function cornerMarks(q, length, offset) {
  const x0 = q.x;
  const x1 = q.x + q.w;
  const y0 = q.y;
  const y1 = q.y + q.h;
  const before = (v) => [v - offset - length, v - offset];
  const after = (v) => [v + offset, v + offset + length];
  const marks = [];
  for (const [y, xs] of [
    [y0, [before(x0), after(x1)]],
    [y1, [before(x0), after(x1)]],
  ]) {
    for (const [a, b] of xs) marks.push({ dir: 'h', c: y, a, b });
  }
  for (const [x, ys] of [
    [x0, [before(y0), after(y1)]],
    [x1, [before(y0), after(y1)]],
  ]) {
    for (const [a, b] of ys) marks.push({ dir: 'v', c: x, a, b });
  }
  return marks;
}

function outline(q) {
  return [
    { dir: 'h', c: q.y, a: q.x, b: q.x + q.w },
    { dir: 'h', c: q.y + q.h, a: q.x, b: q.x + q.w },
    { dir: 'v', c: q.x, a: q.y, b: q.y + q.h },
    { dir: 'v', c: q.x + q.w, a: q.y, b: q.y + q.h },
  ];
}

// Test-only work counter (see tests/performance): while `countWork` has set a
// counter, each box a segment is compared against adds 1 to its `checks`, so a
// test can bound the work instead of the time. Null in the app: one null check
// per comparison.
let work = null;
export function countWork(counter) {
  work = counter;
}

// Removes what of an outline segment runs strictly inside one of `above`
// (pieces stacked over it): it would print over their image. A segment on an
// edge of theirs stays (it is a shared cut).
function notUnder(seg, above) {
  let parts = [[seg.a, seg.b]];
  for (const q of above) {
    if (work) work.checks++;
    const [from, to, lo, hi] = span(q, seg.dir);
    if (seg.c <= lo + TOL || seg.c >= hi - TOL) continue;
    parts = parts.flatMap(([a, b]) => {
      if (to <= a + TOL || from >= b - TOL) return [[a, b]];
      const kept = [];
      if (from > a) kept.push([a, from]);
      if (to < b) kept.push([to, b]);
      return kept;
    });
    if (!parts.length) break;
  }
  return parts.filter(([a, b]) => b - a > TOL).map(([a, b]) => ({ dir: seg.dir, c: seg.c, a, b }));
}

// Removes what of the segment falls on some piece, edge included: a mark
// running along another piece's edge would print over its image.
function outsidePieces(seg, pieces) {
  let parts = [[seg.a, seg.b]];
  for (const q of pieces) {
    if (work) work.checks++;
    const [from, to, lo, hi] = span(q, seg.dir);
    if (seg.c < lo - TOL || seg.c > hi + TOL) continue;
    parts = parts.flatMap(([a, b]) => {
      if (to <= a || from >= b) return [[a, b]];
      const kept = [];
      if (from > a) kept.push([a, from]);
      if (to < b) kept.push([to, b]);
      return kept;
    });
    if (!parts.length) break;
  }
  return parts.filter(([a, b]) => b - a > TOL).map(([a, b]) => ({ dir: seg.dir, c: seg.c, a, b }));
}

// Joins the collinear segments that overlap or touch. Gives the horizontal
// ones first (by y, then x), then the vertical ones (by x, then y).
function merge(segments) {
  const out = [];
  for (const dir of ['h', 'v']) {
    const list = segments.filter((s) => s.dir === dir).sort((p, q) => p.c - q.c || p.a - q.a);
    for (let i = 0; i < list.length; ) {
      const c = list[i].c;
      let j = i;
      while (j < list.length && list[j].c - c <= TOL) j++;
      const line = list.slice(i, j).sort((p, q) => p.a - q.a);
      let current = { dir, c, a: line[0].a, b: line[0].b };
      for (const s of line.slice(1)) {
        if (s.a <= current.b + TOL) current.b = Math.max(current.b, s.b);
        else {
          out.push(current);
          current = { dir, c, a: s.a, b: s.b };
        }
      }
      out.push(current);
      i = j;
    }
  }
  return out;
}

// Clips to the area `bounds`. What runs right on its edge is dropped: there
// is already a cut there (the sheet's edge) and it wouldn't print.
function clip(seg, bounds) {
  const [from, to, lo, hi] = span(bounds, seg.dir);
  if (seg.c <= lo + TOL || seg.c >= hi - TOL) return [];
  const a = Math.max(seg.a, from);
  const b = Math.min(seg.b, to);
  return b - a > TOL ? [{ ...seg, a, b }] : [];
}

/**
 * Cut lines for the pieces `rects` ({x, y, w, h} in mm, rotated), as
 * horizontal or vertical segments [{x1, y1, x2, y2}] (x1 ≤ x2, y1 ≤ y2): the
 * horizontal ones first (by y, then x), then the vertical ones (by x, then
 * y).
 *
 * Modes:
 * - 'corners': L marks pointing out at each corner of each piece: a stroke on
 *   the line of the horizontal edge and another on the line of the vertical
 *   one, starting `offset` mm from the corner and `length` mm long. What would
 *   fall on another piece (inside or right on its edge) is cut away, and
 *   collinear marks that overlap or touch are joined: pieces side by side or
 *   aligned share a mark, and between pieces closer than `offset + length`
 *   the mark crosses the space between them from one to the other.
 * - 'outline': each piece's outline; shared edges (or edges that continue on
 *   the same line) become a single segment. With overlapping pieces (`rects`
 *   in stacking order, the last on top), what of an outline runs inside a
 *   piece above it is left out.
 * - 'contour': like 'outline', except for the rects in `shaped` (the same
 *   objects): those get the contour of their shape instead (contour.js), and
 *   still hide what runs under them.
 * - 'none': [].
 *
 * With `margin` (mm) the lines go on each piece's cut box (see cutBox) instead
 * of its image; nothing runs inside another piece's image or cut box.
 *
 * With `bounds` ({x, y, w, h}, the sheet) everything is clipped to that area,
 * and what falls right on its edge is dropped. Pieces with sizes that aren't
 * positive and finite are ignored; a negative `offset` counts as 0 and
 * `length` ≤ 0 draws no marks.
 */
export function cutLines(rects, { mode = 'corners', length = 4, offset = 1.5, margin = 0, bounds = null, shaped = null } = {}) {
  if (!CUT_MODES.includes(mode)) throw new RangeError(`unknown cut mode: ${mode}`);
  if (mode === 'none') return [];
  const pieces = rects.filter(
    (q) => [q.x, q.y, q.w, q.h].every((v) => typeof v === 'number' && Number.isFinite(v)) && q.w > 0 && q.h > 0
  );
  // The lines go on the cut boxes; neither image boxes nor cut boxes get lines over them.
  const boxes = pieces.map((q) => cutBox(q, margin));
  const solid = (q) => q.w > TOL && q.h > TOL;
  let segments;
  if (mode === 'outline' || mode === 'contour') {
    const drawn = (i) => solid(boxes[i]) && !(mode === 'contour' && shaped?.has(pieces[i]));
    segments = boxes.flatMap((q, i) => (drawn(i) ? outline(q).flatMap((s) => notUnder(s, [...pieces.slice(i + 1), ...boxes.slice(i + 1)])) : []));
  } else {
    const len = finite(length, 0);
    if (len <= 0) return [];
    const off = Math.max(0, finite(offset, 0));
    const obstacles = [...pieces, ...boxes.filter(solid)];
    segments = boxes
      .filter(solid)
      .flatMap((q) => cornerMarks(q, len, off))
      .flatMap((s) => outsidePieces(s, obstacles));
  }
  let merged = merge(segments);
  if (bounds) merged = merged.flatMap((s) => clip(s, bounds));
  return merged.map(({ dir, c, a, b }) =>
    dir === 'h' ? { x1: a, y1: c, x2: b, y2: c } : { x1: c, y1: a, x2: c, y2: b }
  );
}
