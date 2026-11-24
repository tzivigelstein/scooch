// Contour cut lines («Silueta»): for an image with transparency, the cut line
// follows the outline of its opaque shape, the cut margin away from it,
// instead of its rectangle. Pure module (no DOM): from an alpha mask to
// closed polylines in mm, and those placed on the sheet.
//
// How traceShape works:
//   1. The visible part of the image (its crop) is sampled onto a grid of
//      square cells, at most GRID_MAX along the longer side (margin included)
//      and never finer than the mask's own pixels. A cell is opaque when any
//      pixel under it reaches ALPHA_THRESHOLD: a thin stroke never falls
//      between cells, so the line doesn't cut it off.
//   2. Specks (blobs under MIN_BLOB of the visible area, left over by a
//      background eraser) are dropped and inner holes are filled: the line
//      goes around the shape, never inside it.
//   3. A distance transform gives every cell its distance to the shape (or,
//      for a negative margin, to the background); the line is that field's
//      level line at the margin (marching squares, interpolated between cell
//      centres, on the field blurred a little so the line doesn't follow the
//      cells' staircase). The offset is round, like the margin of a rectangle
//      grown by a disc, and exact to a fraction of a cell.
//   4. Each loop is smoothed (Taubin, which keeps its size) and simplified
//      (Ramer–Douglas–Peucker, within SIMPLIFY cells). Along a nearly level
//      edge a ripple of under a cell is left (the pixels' long steps).
//
// Separate blobs get one loop each: a hull would cut white paper into the
// piece wherever the shape is concave, and blobs closer than twice the margin
// already merge into one loop. A loop nested inside another (a blob inside a
// hole the margin closed) is dropped, like the holes themselves.
//
// What packs and collides stays the rectangle (cutmarks.footprintPad); the
// contour always lies inside the piece's cut box.

import { cutBox, cutLines } from './cutmarks.js';

/** Alpha (0–255) from which a pixel counts as opaque: 25 %, so a soft edge stays inside the line. */
export const ALPHA_THRESHOLD = 64;
/** Cells along the field's longer side, at most. */
export const GRID_MAX = 640;
/** Blobs smaller than this share of the visible area are specks (unless nothing bigger is left). */
const MIN_BLOB = 1e-4;
/** Transparent cells kept around the shape beyond the margin, so every loop closes. */
const BORDER = 2;
/** How far (cells) the simplified line may stray from the smoothed one. */
const SIMPLIFY = 0.4;
/** Taubin smoothing: passes and the two factors (shrink, then inflate back). */
const SMOOTH_PASSES = 6;
const LAMBDA = 0.5;
const MU = -0.53;

const TOL = 1e-6;
const INF = 1e20;

// Test-only work counter (see tests/performance): while `countWork` has set a
// counter, traceShape adds the mask pixels it samples (`pixels`) and the grid
// cells it visits in each pass (`cells`). Null in the app.
let work = null;
export function countWork(counter) {
  work = counter;
}

// ---------- 1. Sampling ----------

// The grid over the visible part: cell size `s` (in the caller's unit), the
// visible part's cells `nx` × `ny` and `pad` cells of background around them.
function gridFor(mask, crop, w, h, margin) {
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const pxW = c.w * mask.width;
  const pxH = c.h * mask.height;
  const out = Math.max(0, margin);
  const pixel = Math.max(w / pxW, h / pxH);
  const s = Math.max(pixel, (Math.max(w, h) + 2 * out) / (GRID_MAX - 2 * BORDER - 2));
  const nx = Math.max(1, Math.ceil(w / s - 1e-9));
  const ny = Math.max(1, Math.ceil(h / s - 1e-9));
  const pad = Math.ceil(out / s - 1e-9) + BORDER;
  return { c, s, nx, ny, pad, gw: nx + 2 * pad, gh: ny + 2 * pad };
}

// Opaque cells of the visible part (1) on the padded grid; the rest is 0.
// Each cell takes the most opaque mask pixel it touches.
function sample(mask, g, w, h) {
  const { c, s, nx, ny, pad, gw } = g;
  const { width, height, alpha } = mask;
  const x0 = c.x * width;
  const y0 = c.y * height;
  const kx = (c.w * width) / w;
  const ky = (c.h * height) / h;
  // The mask pixels (first, last) under cell i along one axis.
  const span = (i, k, origin, size, limit) => {
    const a = origin + i * s * k;
    const b = origin + Math.min((i + 1) * s, size) * k;
    const lo = Math.min(limit - 1, Math.max(0, Math.floor(a + 1e-9)));
    const hi = Math.min(limit - 1, Math.max(lo, Math.ceil(b - 1e-9) - 1));
    return [lo, hi];
  };
  const cols = Array.from({ length: nx }, (_, i) => span(i, kx, x0, w, width));
  const grid = new Uint8Array(gw * g.gh);
  let opaque = 0;
  for (let j = 0; j < ny; j++) {
    const [ya, yb] = span(j, ky, y0, h, height);
    const row = (j + pad) * gw + pad;
    for (let i = 0; i < nx; i++) {
      const [xa, xb] = cols[i];
      let hit = 0;
      for (let y = ya; y <= yb && !hit; y++) {
        const base = y * width;
        let x = xa;
        while (x <= xb && alpha[base + x] < ALPHA_THRESHOLD) x++;
        if (work) work.pixels += Math.min(x, xb) - xa + 1;
        if (x <= xb) hit = 1;
      }
      grid[row + i] = hit;
      opaque += hit;
    }
  }
  return { grid, opaque };
}

// ---------- 2. Specks and holes ----------

// Clears the 8-connected blobs smaller than `least` cells, unless none is bigger.
function dropSpecks(grid, gw, gh, least) {
  const label = new Int32Array(grid.length);
  const sizes = [0];
  const stack = new Int32Array(grid.length);
  for (let start = 0; start < grid.length; start++) {
    if (!grid[start] || label[start]) continue;
    const id = sizes.length;
    let top = 0;
    let size = 0;
    stack[top++] = start;
    label[start] = id;
    while (top) {
      const p = stack[--top];
      size++;
      const x = p % gw;
      const y = (p - x) / gw;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= gh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= gw) continue;
          const q = yy * gw + xx;
          if (grid[q] && !label[q]) {
            label[q] = id;
            stack[top++] = q;
          }
        }
      }
    }
    sizes.push(size);
  }
  if (work) work.cells += grid.length;
  if (!sizes.some((size) => size >= least)) return;
  for (let p = 0; p < grid.length; p++) if (label[p] && sizes[label[p]] < least) grid[p] = 0;
}

// Fills the background cells the grid's border can't reach (4-connected): holes.
function fillHoles(grid, gw, gh) {
  const outside = new Uint8Array(grid.length);
  const stack = new Int32Array(grid.length);
  let top = 0;
  const push = (p) => {
    if (!grid[p] && !outside[p]) {
      outside[p] = 1;
      stack[top++] = p;
    }
  };
  for (let x = 0; x < gw; x++) {
    push(x);
    push((gh - 1) * gw + x);
  }
  for (let y = 0; y < gh; y++) {
    push(y * gw);
    push(y * gw + gw - 1);
  }
  while (top) {
    const p = stack[--top];
    const x = p % gw;
    if (x > 0) push(p - 1);
    if (x < gw - 1) push(p + 1);
    if (p >= gw) push(p - gw);
    if (p < grid.length - gw) push(p + gw);
  }
  for (let p = 0; p < grid.length; p++) if (!outside[p]) grid[p] = 1;
  if (work) work.cells += grid.length;
}

// ---------- 3. Distance field and level line ----------

// Squared distance from every cell to the nearest cell where `feature` is
// `on` (Felzenszwalb & Huttenlocher: one pass per axis, linear time).
function squaredDistance(grid, gw, gh, on) {
  const n = Math.max(gw, gh);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const out = new Float64Array(grid.length);
  // The lower envelope of the parabolas rooted at each sample (v: their
  // roots, z: where each one takes over), then its value at every q.
  const pass = (len) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      d[q] = (q - p) * (q - p) + f[p];
    }
  };
  for (let x = 0; x < gw; x++) {
    for (let y = 0; y < gh; y++) f[y] = grid[y * gw + x] === on ? 0 : INF;
    pass(gh);
    for (let y = 0; y < gh; y++) out[y * gw + x] = d[y];
  }
  for (let y = 0; y < gh; y++) {
    const row = y * gw;
    for (let x = 0; x < gw; x++) f[x] = out[row + x];
    pass(gw);
    for (let x = 0; x < gw; x++) out[row + x] = d[x];
  }
  if (work) work.cells += 2 * grid.length;
  return out;
}

// Signed distance to the shape's edge at every cell centre, in cells
// (negative inside). Only the side the level line lies on needs real
// distances: the other side is ±0.5, which is all marching squares reads.
function field(grid, gw, gh, level) {
  const out = new Float32Array(grid.length);
  if (level > 0) {
    const d = squaredDistance(grid, gw, gh, 1);
    for (let p = 0; p < grid.length; p++) out[p] = grid[p] ? -0.5 : Math.sqrt(d[p]) - 0.5;
  } else if (level < 0) {
    const d = squaredDistance(grid, gw, gh, 0);
    for (let p = 0; p < grid.length; p++) out[p] = grid[p] ? 0.5 - Math.sqrt(d[p]) : 0.5;
  } else {
    for (let p = 0; p < grid.length; p++) out[p] = grid[p] ? -0.5 : 0.5;
  }
  const soft = Float32Array.from(out);
  blur(soft, gw, gh);
  for (let p = 0; p < out.length; p++) if (soft[p] < out[p]) out[p] = soft[p];
  return out;
}

// Two passes of [1, 2, 1] / 4 along each axis (a 5-tap binomial blur): the
// field's steps between cells become slopes, so its level line runs along a
// slanted edge instead of down its staircase. Where the field is a distance
// (a straight slope) the blur leaves it as it was. field keeps the lower of
// the two values: the line may only move out, so a stroke one cell wide,
// which the blur alone would wash out, stays inside it.
function blur(f, gw, gh) {
  const line = new Float32Array(Math.max(gw, gh));
  const run = (start, step, n) => {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) line[i] = f[start + i * step];
      for (let i = 0; i < n; i++) {
        const before = line[i > 0 ? i - 1 : 0];
        const after = line[i < n - 1 ? i + 1 : n - 1];
        f[start + i * step] = (before + 2 * line[i] + after) / 4;
      }
    }
  };
  for (let y = 0; y < gh; y++) run(y * gw, 1, gw);
  for (let x = 0; x < gw; x++) run(x, gw, gh);
  if (work) work.cells += 4 * f.length;
}

// Marching squares. A cell's corners, clockwise on screen from the top left,
// are a, b, c, d (inside bits 1, 2, 4, 8); its edges are 0 top (a–b),
// 1 right (b–c), 2 bottom (d–c) and 3 left (a–d). Every segment runs with
// the inside on the same side (clockwise around the shape on screen), so
// outer loops have a positive area and holes a negative one.
const CORNER = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const EDGE_CORNERS = [
  [0, 1],
  [1, 2],
  [3, 2],
  [0, 3],
];
const MIDDLE = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
];

// The segment between edges e1 and e2, turned so that corner q (inside) is on its right on screen.
function oriented(e1, e2, q) {
  const [ax, ay] = MIDDLE[e1];
  const [bx, by] = MIDDLE[e2];
  const [qx, qy] = CORNER[q];
  return (bx - ax) * (qy - ay) - (by - ay) * (qx - ax) > 0 ? [e1, e2] : [e2, e1];
}

// SEGMENTS[case] (and SADDLE[case][joined] for the two ambiguous cases): [from, to, from, to…].
const SEGMENTS = Array.from({ length: 16 }, (_, bits) => {
  if (bits === 0 || bits === 15 || bits === 5 || bits === 10) return [];
  const inside = (corner) => (bits >> corner) & 1;
  const edges = [0, 1, 2, 3].filter((e) => inside(EDGE_CORNERS[e][0]) !== inside(EDGE_CORNERS[e][1]));
  const q = [0, 1, 2, 3].find(inside);
  return oriented(edges[0], edges[1], q);
});
const SADDLE = {
  // a and c inside: joined through the centre (b and d cut off) or apart.
  5: { joined: [...oriented(0, 1, 0), ...oriented(2, 3, 0)], apart: [...oriented(0, 3, 0), ...oriented(1, 2, 2)] },
  // b and d inside.
  10: { joined: [...oriented(0, 3, 1), ...oriented(1, 2, 1)], apart: [...oriented(0, 1, 1), ...oriented(2, 3, 3)] },
};

// Closed loops of the level line f = level, in grid coordinates (cell centres
// at integers), as flat [x0, y0, x1, y1, …].
function levelLoops(f, gw, gh, level) {
  const n = gw * gh;
  const next = new Int32Array(2 * n).fill(-1);
  const starts = [];
  // Global ids: the horizontal edge from point (i, j) is j·gw + i; the vertical one is n + j·gw + i.
  for (let j = 0; j < gh - 1; j++) {
    for (let i = 0; i < gw - 1; i++) {
      const p = j * gw + i;
      const fa = f[p];
      const fb = f[p + 1];
      const fc = f[p + gw + 1];
      const fd = f[p + gw];
      const bits = (fa < level ? 1 : 0) | (fb < level ? 2 : 0) | (fc < level ? 4 : 0) | (fd < level ? 8 : 0);
      if (bits === 0 || bits === 15) continue;
      const segs = bits === 5 || bits === 10 ? SADDLE[bits][(fa + fb + fc + fd) / 4 < level ? 'joined' : 'apart'] : SEGMENTS[bits];
      for (let s = 0; s < segs.length; s += 2) {
        const from = edgeId(segs[s], p, gw, n);
        next[from] = edgeId(segs[s + 1], p, gw, n);
        starts.push(from);
      }
    }
  }
  if (work) work.cells += n;
  const seen = new Uint8Array(2 * n);
  const loops = [];
  for (const start of starts) {
    if (seen[start]) continue;
    const points = [];
    let e = start;
    while (e !== -1 && !seen[e]) {
      seen[e] = 1;
      crossing(e, f, gw, n, level, points);
      e = next[e];
    }
    if (e === start && points.length >= 6) loops.push(points);
  }
  return loops;
}

function edgeId(edge, p, gw, n) {
  switch (edge) {
    case 0:
      return p;
    case 1:
      return n + p + 1;
    case 2:
      return p + gw;
    default:
      return n + p;
  }
}

// Where the level line crosses edge `e` (interpolated), pushed onto `out`.
function crossing(e, f, gw, n, level, out) {
  const vertical = e >= n;
  const p = vertical ? e - n : e;
  const q = vertical ? p + gw : p + 1;
  const t = (level - f[p]) / (f[q] - f[p]);
  const x = p % gw;
  const y = (p - x) / gw;
  out.push(vertical ? x : x + t, vertical ? y + t : y);
}

// ---------- Loops ----------

/** Area of a closed flat polyline (positive when clockwise on screen, y down). */
export function loopArea(points) {
  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    sum += points[i] * points[j + 1] - points[j] * points[i + 1];
  }
  return sum / 2;
}

/** Is (x, y) inside the closed flat polyline? (even–odd) */
export function insideLoop(points, x, y) {
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const yi = points[i + 1];
    const yj = points[j + 1];
    if (yi > y !== yj > y && x < ((points[j] - points[i]) * (y - yi)) / (yj - yi) + points[i]) inside = !inside;
  }
  return inside;
}

function bboxOf(points) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    x0 = Math.min(x0, points[i]);
    x1 = Math.max(x1, points[i]);
    y0 = Math.min(y0, points[i + 1]);
    y1 = Math.max(y1, points[i + 1]);
  }
  return { x0, y0, x1, y1 };
}

// Taubin smoothing of a closed loop, in place: each pass pulls every point
// towards its neighbours' midpoint and then pushes it back a little more, so
// the staircase of the cells goes and the loop keeps its size.
function smooth(points) {
  const n = points.length / 2;
  if (n < 4) return;
  const tmp = new Float64Array(points.length);
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    for (const k of [LAMBDA, MU]) {
      for (let i = 0; i < n; i++) {
        const a = ((i + n - 1) % n) * 2;
        const b = ((i + 1) % n) * 2;
        const p = i * 2;
        tmp[p] = points[p] + k * ((points[a] + points[b]) / 2 - points[p]);
        tmp[p + 1] = points[p + 1] + k * ((points[a + 1] + points[b + 1]) / 2 - points[p + 1]);
      }
      for (let i = 0; i < points.length; i++) points[i] = tmp[i];
    }
  }
}

// Ramer–Douglas–Peucker on a closed loop: the points to keep, within `eps`.
function simplify(points, eps) {
  const n = points.length / 2;
  if (n <= 4) return points;
  const keep = new Uint8Array(n);
  // Split the loop at its first point and the point farthest from it.
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const d = (points[2 * i] - points[0]) ** 2 + (points[2 * i + 1] - points[1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  keep[0] = 1;
  keep[far] = 1;
  const stack = [
    [0, far],
    [far, n],
  ];
  const eps2 = eps * eps;
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const ax = points[2 * a];
    const ay = points[2 * a + 1];
    const bx = points[2 * (b % n)];
    const by = points[2 * (b % n) + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const px = points[2 * i] - ax;
      const py = points[2 * i + 1] - ay;
      const d = len2 > 0 ? (px * dy - py * dx) ** 2 / len2 : px * px + py * py;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > eps2) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[2 * i], points[2 * i + 1]);
  return out;
}

// The outer loops of the level line: holes (negative area) and loops nested
// inside another loop are dropped.
function outerLoops(loops) {
  const outer = loops.map((points) => ({ points, area: loopArea(points), box: bboxOf(points) })).filter((l) => l.area > 0);
  outer.sort((p, q) => q.area - p.area);
  return outer.filter((l, i) =>
    outer.slice(0, i).every((o) => l.box.x0 < o.box.x0 || l.box.x1 > o.box.x1 || l.box.y0 < o.box.y0 || l.box.y1 > o.box.y1 || !insideLoop(o.points, l.points[0], l.points[1]))
  );
}

/**
 * The contour of the opaque shape of an image's visible part, `margin` away
 * from it (negative: inside it).
 *
 * `mask`: {width, height, alpha} of the whole, uncropped image, one alpha byte
 * (0–255) per pixel. `crop`: the normalized crop (crop.js) or null. `w`, `h`:
 * the visible part's size, unrotated, in any unit; `margin` in the same unit.
 *
 * Returns null when the rectangle applies (nothing opaque in view, or nothing
 * transparent in view), or the outer loops as flat arrays [x0, y0, x1, y1, …]
 * (closed: the last point joins the first; clockwise on screen) in that unit,
 * from the visible part's top left corner. An empty list when a negative
 * margin leaves nothing.
 */
export function traceShape(mask, { crop = null, w, h, margin = 0 }) {
  if (!(w > 0 && h > 0) || !mask || !(mask.width > 0 && mask.height > 0)) return null;
  const m = Number.isFinite(margin) ? margin : 0;
  const g = gridFor(mask, crop, w, h, m);
  const { grid, opaque } = sample(mask, g, w, h);
  const cells = g.nx * g.ny;
  if (opaque === 0 || opaque === cells) return null;
  dropSpecks(grid, g.gw, g.gh, Math.max(2, MIN_BLOB * cells));
  fillHoles(grid, g.gw, g.gh);
  const level = m / g.s;
  const f = field(grid, g.gw, g.gh, level);
  const loops = outerLoops(levelLoops(f, g.gw, g.gh, level));
  return loops.map(({ points }) => {
    const smoothed = Float64Array.from(points);
    smooth(smoothed);
    const kept = simplify(smoothed, SIMPLIFY);
    const out = new Float64Array(kept.length);
    for (let i = 0; i < kept.length; i += 2) {
      out[i] = (kept[i] - g.pad + 0.5) * g.s;
      out[i + 1] = (kept[i + 1] - g.pad + 0.5) * g.s;
    }
    return out;
  });
}

/**
 * Whether nothing in an image's visible part is transparent, sampled as
 * traceShape samples it with the same options: the image has no transparent
 * background, which is why traceShape gives it the rectangle. False when
 * something is (also when nothing is opaque: that rectangle has another
 * cause) or there is nothing to sample.
 */
export function opaqueInView(mask, { crop = null, w, h, margin = 0 }) {
  if (!(w > 0 && h > 0) || !mask || !(mask.width > 0 && mask.height > 0)) return false;
  const g = gridFor(mask, crop, w, h, Number.isFinite(margin) ? margin : 0);
  return sample(mask, g, w, h).opaque === g.nx * g.ny;
}

// ---------- On the sheet ----------

/**
 * Loops of traceShape placed on the sheet: multiplied by `k` (to mm), turned
 * `r` degrees clockwise with the piece and moved to its box at (x, y). `uw`,
 * `uh`: the visible part's size in mm, unrotated (crop.pieceSize).
 */
export function placeLoops(loops, { x, y, r = 0, uw, uh, k = 1 }) {
  const turn = ((((Math.round(r / 90) * 90) % 360) + 360) % 360);
  return loops.map((loop) => {
    const out = new Float64Array(loop.length);
    for (let i = 0; i < loop.length; i += 2) {
      const u = loop[i] * k;
      const v = loop[i + 1] * k;
      const [px, py] = turn === 90 ? [uh - v, u] : turn === 180 ? [uw - u, uh - v] : turn === 270 ? [v, uw - u] : [u, v];
      out[i] = x + px;
      out[i + 1] = y + py;
    }
    return out;
  });
}

// The stretch [t0, t1] of segment a→b inside rectangle q (Liang–Barsky), or
// null; a stretch that only runs along q's edge doesn't count.
function inside(ax, ay, bx, by, q) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const edges = [
    [-dx, ax - q.x],
    [dx, q.x + q.w - ax],
    [-dy, ay - q.y],
    [dy, q.y + q.h - ay],
  ];
  for (const [p, d] of edges) {
    if (p === 0) {
      if (d < 0) return null;
      continue;
    }
    const t = d / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 >= t1) return null;
  }
  const mx = ax + dx * ((t0 + t1) / 2);
  const my = ay + dy * ((t0 + t1) / 2);
  if (mx <= q.x + TOL || mx >= q.x + q.w - TOL || my <= q.y + TOL || my >= q.y + q.h - TOL) return null;
  return [t0, t1];
}

/**
 * What of a closed loop (sheet mm) is drawn: what runs strictly inside a
 * `hide` rectangle (the pieces above) or outside `bounds` (the sheet) is left
 * out. Returns runs {points, closed}: the whole loop (closed) or the open
 * stretches left.
 */
export function clipLoop(loop, { hide = [], bounds = null } = {}) {
  const box = bboxOf(loop);
  const overlaps = (q) => box.x0 < q.x + q.w && box.x1 > q.x && box.y0 < q.y + q.h && box.y1 > q.y;
  const rects = hide.filter((q) => q.w > TOL && q.h > TOL && overlaps(q));
  const within = !bounds || (box.x0 > bounds.x + TOL && box.y0 > bounds.y + TOL && box.x1 < bounds.x + bounds.w - TOL && box.y1 < bounds.y + bounds.h - TOL);
  if (!rects.length && within) return [{ points: Array.from(loop), closed: true }];
  if (bounds && (box.x1 <= bounds.x || box.x0 >= bounds.x + bounds.w || box.y1 <= bounds.y || box.y0 >= bounds.y + bounds.h)) return [];
  const n = loop.length / 2;
  // The point at t along segment i (its ends exactly).
  const point = (i, t) => {
    const j = (i + 1) % n;
    if (t <= 0) return [loop[2 * i], loop[2 * i + 1]];
    if (t >= 1) return [loop[2 * j], loop[2 * j + 1]];
    return [loop[2 * i] + (loop[2 * j] - loop[2 * i]) * t, loop[2 * i + 1] + (loop[2 * j + 1] - loop[2 * i + 1]) * t];
  };
  const runs = [];
  let run = null; // the run being drawn, which reaches the current segment's start
  let whole = true;
  let startsAtFirst = false; // the first run starts at the loop's first point
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [ax, ay, bx, by] = [loop[2 * i], loop[2 * i + 1], loop[2 * j], loop[2 * j + 1]];
    // The hidden stretches of this segment, then what is left between them.
    const hidden = [];
    if (bounds) {
      const kept = inside(ax, ay, bx, by, bounds);
      if (!kept) hidden.push([0, 1]);
      else {
        if (kept[0] > 0) hidden.push([0, kept[0]]);
        if (kept[1] < 1) hidden.push([kept[1], 1]);
      }
    }
    for (const q of rects) {
      const under = inside(ax, ay, bx, by, q);
      if (under) hidden.push(under);
    }
    hidden.sort((p, q) => p[0] - q[0]);
    let t = 0;
    const shown = [];
    for (const [h0, h1] of hidden) {
      if (h0 > t + 1e-9) shown.push([t, h0]);
      t = Math.max(t, h1);
    }
    if (t < 1 - 1e-9) shown.push([t, 1]);
    if (shown.length !== 1 || shown[0][0] !== 0 || shown[0][1] !== 1) whole = false;
    if (!shown.length && run) {
      runs.push(run);
      run = null;
    }
    for (const [s0, s1] of shown) {
      if (!run || s0 > 0) {
        if (run) runs.push(run);
        run = { points: point(i, s0), closed: false };
        if (i === 0 && s0 === 0) startsAtFirst = true;
      }
      run.points.push(...point(i, s1));
      if (s1 < 1) {
        runs.push(run);
        run = null;
      }
    }
  }
  if (whole) return [{ points: Array.from(loop), closed: true }];
  if (run) {
    // It reaches the loop's first point: it continues into the first run.
    if (startsAtFirst && runs.length) runs[0] = { points: [...run.points, ...runs[0].points.slice(2)], closed: false };
    else runs.push(run);
  }
  return runs.filter((r) => r.points.length >= 4);
}

/**
 * The cut lines of a sheet in contour mode. `pieces`, in stacking order (the
 * last on top): {box, shape}, `box` the piece's image box on the sheet (as
 * cutLines takes it) and `shape` its placed loops (placeLoops), null for the
 * rectangle (an image without transparency, a PDF page) or undefined while
 * it isn't known yet (nothing is drawn for it).
 *
 * Rectangles get the outline (cutLines 'outline': shared edges are one line);
 * shapes get their loops, without what runs inside a piece above (its image
 * box or its cut box, as for the outline) or off the sheet (`bounds`).
 * Returns {lines, paths}: cutLines' segments and the runs of the loops.
 */
export function contourCuts(pieces, { margin = 0, bounds = null } = {}) {
  const valid = (q) => [q.x, q.y, q.w, q.h].every((v) => typeof v === 'number' && Number.isFinite(v)) && q.w > 0 && q.h > 0;
  const kept = pieces.filter((p) => p && valid(p.box));
  const boxes = kept.map((p) => p.box);
  const shaped = new Set(kept.filter((p) => p.shape !== null).map((p) => p.box));
  const lines = cutLines(boxes, { mode: 'contour', margin, bounds, shaped });
  const paths = [];
  kept.forEach((piece, i) => {
    if (!piece.shape) return;
    const above = boxes.slice(i + 1);
    const hide = [...above, ...above.map((q) => cutBox(q, margin))];
    for (const loop of piece.shape) paths.push(...clipLoop(loop, { hide, bounds }));
  });
  return { lines, paths };
}

const num = (v) => String(Math.round(v * 1000) / 1000);

/** SVG path data of runs (mm): M x y L x y … and Z for closed ones, to 0.001. */
export function pathData(paths) {
  return paths
    .map(({ points, closed }) => {
      let d = `M${num(points[0])} ${num(points[1])}`;
      for (let i = 2; i < points.length; i += 2) d += `L${num(points[i])} ${num(points[i + 1])}`;
      return closed ? `${d}Z` : d;
    })
    .join('');
}
