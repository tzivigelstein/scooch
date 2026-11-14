// How many pieces of one size fit on one sheet. Two answers, the ones the
// editor gives: «Acomodar» with that many copies (packSheets in pack.js, which
// may mix upright and turned pieces) and «Rellenar con copias» (a grid with
// every copy turned the same way, like fillPlan in state/actions/layout.ts).
// Lengths in mm; `aw` × `ah` is the printable area. Pure.

import { packSheets } from './pack.js';

/**
 * «Rellenar con copias»: the grid of `w` × `h` copies with `gap` between them
 * that fits in `aw` × `ah`, turned when that fits more (and `rotate` allows
 * it). Returns {count, cols, rows, rotated}.
 */
export function gridCapacity({ w, h }, { aw, ah }, { gap = 0, rotate = true } = {}) {
  const grid = (cw, ch, rotated) => {
    const cols = cw > 0 ? Math.max(0, Math.floor((aw + gap + 1e-6) / (cw + gap))) : 0;
    const rows = ch > 0 ? Math.max(0, Math.floor((ah + gap + 1e-6) / (ch + gap))) : 0;
    return { count: cols * rows, cols, rows, rotated };
  };
  const plan = grid(w, h, false);
  if (rotate && Math.abs(w - h) > 1e-6) {
    const turned = grid(h, w, true);
    if (turned.count > plan.count) return turned;
  }
  return plan;
}

/**
 * The most copies of a `w` × `h` piece that «Acomodar» puts on one sheet with
 * `gap` between them (never fewer than the grid), at most `limit` (the
 * pieces a project takes). Returns {count, placements, capped, grid}:
 * `placements` are the copies' rectangles in the printable area ({x, y, w,
 * h}, turned ones already swapped), `capped` says more than `limit` would
 * fit, and `grid` is gridCapacity's answer.
 */
export function sheetCapacity({ w, h }, { aw, ah }, { gap = 0, rotate = true, limit = 200 } = {}) {
  const grid = gridCapacity({ w, h }, { aw, ah }, { gap, rotate });
  if (!(w > 0 && h > 0 && aw > 0 && ah > 0)) return { count: 0, placements: [], capped: false, grid };
  // No more than this many fit by area alone (each copy takes its size plus a gap).
  const bound = Math.floor(((aw + gap) * (ah + gap)) / ((w + gap) * (h + gap)) + 1e-9);
  // One copy more than can fit: what lands on the first sheet is the answer.
  const copies = Array.from({ length: Math.min(bound, limit) + 1 }, (_, id) => ({ id, w, h }));
  const first = packSheets(copies, aw, ah, { gap, rotate }).sheets[0] ?? [];
  const packed = first.map((p) => ({ x: p.x, y: p.y, w: p.rotated ? h : w, h: p.rotated ? w : h }));
  const best = grid.count > packed.length ? gridPlacements({ w, h }, grid, gap) : packed;
  return { count: Math.min(best.length, limit), placements: best.slice(0, limit), capped: best.length > limit, grid };
}

// The rectangles of a grid, from the top left corner of the area.
function gridPlacements({ w, h }, { cols, rows, rotated }, gap) {
  const [cw, ch] = rotated ? [h, w] : [w, h];
  const out = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) out.push({ x: col * (cw + gap), y: row * (ch + gap), w: cw, h: ch });
  return out;
}
