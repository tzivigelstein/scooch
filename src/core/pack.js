// Rectangle packing (MaxRects) to arrange pieces on the sheet. Everything in
// the same unit (mm), origin at the printable area's top left.

const EPS = 1e-6;

const intersects = (a, b) =>
  a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;

const contains = (a, b) =>
  b.x >= a.x - EPS && b.y >= a.y - EPS && b.x + b.w <= a.x + a.w + EPS && b.y + b.h <= a.y + a.h + EPS;

// Takes `used` out of the list of free spaces, splitting those it touches.
function occupy(free, used) {
  const kept = [];
  const parts = [];
  for (const f of free) {
    if (!intersects(f, used)) {
      kept.push(f);
      continue;
    }
    if (used.x > f.x + EPS) parts.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
    if (used.x + used.w < f.x + f.w - EPS)
      parts.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - used.x - used.w, h: f.h });
    if (used.y > f.y + EPS) parts.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
    if (used.y + used.h < f.y + f.h - EPS)
      parts.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - used.y - used.h });
  }
  // The untouched spaces were already maximal among themselves and none can
  // fit in a new part (which comes from a space that didn't contain them): it
  // is enough to drop the new parts contained in another space.
  const fresh = parts.filter(
    (r, i) =>
      !kept.some((o) => contains(o, r)) &&
      !parts.some((o, j) => j !== i && contains(o, r) && (j < i || !contains(r, o)))
  );
  return kept.concat(fresh);
}

// Where to put each piece: lower is better; compared as tuples.
const HEURISTICS = [
  (f, w, h) => [f.y + h, f.x], // bottom-left
  (f, w, h) => [Math.min(f.w - w, f.h - h), Math.max(f.w - w, f.h - h)], // short side fit
  (f, w, h) => [Math.max(f.w - w, f.h - h), Math.min(f.w - w, f.h - h)], // long side fit
  (f, w, h) => [f.w * f.h - w * h, Math.min(f.w - w, f.h - h)], // area left over
];

// The orders to place them in (largest first by each criterion).
const ORDERS = [
  (a, b) => b.w * b.h - a.w * a.h,
  (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
  (a, b) => b.w + b.h - (a.w + a.h),
  (a, b) => b.h - a.h || b.w - a.w,
  (a, b) => b.w - a.w || b.h - a.h,
];

const better = (a, b) => a[0] < b[0] - EPS || (Math.abs(a[0] - b[0]) <= EPS && a[1] < b[1] - EPS);

// Pieces with a fixed orientation: `shouldFlip(r)` decides which are turned.
const fixedOrientation = (rects, shouldFlip) =>
  rects.map((r, i) => {
    const flip = shouldFlip(r, i);
    return { id: r.id, w: flip ? r.h : r.w, h: flip ? r.w : r.h, flip, free: false };
  });

const isSquare = (r) => Math.abs(r.w - r.h) <= EPS;

// Ways to orient the pieces before packing. Each piece carries `flip` (it
// comes turned from the original) and `free` (the heuristic may turn it).
// Turning freely, the heuristic decides piece by piece and sometimes gets it
// wrong: in a tight grid it turns the first one because it "leaves more
// room" and then not all of them fit. So all as they came, all landscape and
// all portrait are tried too.
function orientations(rects, rotate) {
  const asIs = fixedOrientation(rects, () => false);
  if (!rotate) return [asIs];

  const variants = [asIs];
  const landscape = fixedOrientation(rects, (r) => r.h > r.w + EPS);
  const portrait = fixedOrientation(rects, (r) => r.w > r.h + EPS);
  // When no piece turns, it is the same as "as they came".
  if (landscape.some((p) => p.flip)) variants.push(landscape);
  if (portrait.some((p) => p.flip)) variants.push(portrait);
  const free = rects.map((r) => ({ id: r.id, w: r.w, h: r.h, flip: false, free: !isSquare(r) }));
  if (free.some((p) => p.free)) variants.push(free);
  return variants;
}

// Test-only work counter (see tests/performance): while `countWork` has set a
// counter, each placement pass over an ordering of the pieces adds 1 to its
// `attempts` and each free space examined for a piece adds 1 to its `spots`,
// so a test can bound the work instead of the time. Null in the app: one null
// check per pass and per piece placed.
let work = null;
export function countWork(counter) {
  work = counter;
}

// The best space for the piece by the heuristic (with its gap), or null when it doesn't fit.
function bestSpot(p, free, gap, heuristic) {
  let best = null;
  for (const turn of p.free ? [false, true] : [false]) {
    if (work) work.spots += free.length;
    const w = (turn ? p.h : p.w) + gap;
    const h = (turn ? p.w : p.h) + gap;
    for (const f of free) {
      if (w > f.w + EPS || h > f.h + EPS) continue;
      const s = heuristic(f, w, h);
      if (!best || better(s, best.s)) best = { s, x: f.x, y: f.y, w, h, turn };
    }
  }
  return best;
}

// Places the pieces in the given order; null when one doesn't fit.
function packOnce(pieces, start, gap, heuristic) {
  if (work) work.attempts++;
  let free = start;
  const placements = [];
  for (const p of pieces) {
    const best = bestSpot(p, free, gap, heuristic);
    if (!best) return null;
    free = occupy(free, best);
    placements.push({ id: p.id, x: best.x, y: best.y, rotated: best.turn !== p.flip });
  }
  return placements;
}

// The initial free spaces. Each piece (and each obstacle) reserves `gap` on
// its right and below; the area grows by as much so the last row or column
// doesn't lose that space.
function startFree(W, H, gap, obstacles) {
  let free = [{ x: 0, y: 0, w: W + gap, h: H + gap }];
  for (const o of obstacles) free = occupy(free, { x: o.x, y: o.y, w: o.w + gap, h: o.h + gap });
  return free;
}

// The input's canonical order (long side, short side, then id), so the result
// doesn't depend on the array's order: the sorts' ties are stable. It ignores
// orientation, so a piece turned beforehand breaks ties as if it weren't.
const compareIds = (a, b) => {
  if (typeof a !== typeof b) return typeof a < typeof b ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};
const canonical = (rects) =>
  [...rects].sort(
    (a, b) =>
      Math.max(a.w, a.h) - Math.max(b.w, b.h) || Math.min(a.w, a.h) - Math.min(b.w, b.h) || compareIds(a.id, b.id)
  );

// Tries the fixed combinations orientation × order × heuristic (up to 80),
// always in the same order, and calls `visit(placements, orientation)` with
// each one that fits. When `visit` returns true, it stops there.
function eachFixed(oriented, start, gap, visit) {
  for (const pieces of oriented) {
    for (const order of ORDERS) {
      const sorted = [...pieces].sort(order);
      for (const heuristic of HEURISTICS) {
        const placements = packOnce(sorted, start, gap, heuristic);
        if (placements && visit(placements, pieces)) return;
      }
    }
  }
}

// --- Score -----------------------------------------------------------------
// Lower is better. Everything is measured in "fractions of the height": 0.01
// is the free strip at the bottom being 1 % of the height smaller. A small
// height difference (≲ 2–3 %) can lose to not turning or to a tidier sheet;
// a large one can't: turning them all costs at most 5 %, and untidiness
// rarely sets two candidates more than 2 % apart.

// a. How far down the pieces reach, over the height (0–1).
const W_BOTTOM = 1;
// b. Turning pieces from how the person placed them: turning even one costs
//    about 2 % of the height, and turning all of them 3 % more (in proportion
//    to the share turned). So it turns only when that frees more than ~2–5 %
//    of the height.
const W_ROTATE_ANY = 0.02;
const W_ROTATE_SHARE = 0.03;
// c. Untidiness (each measure goes from 0 to 1):
//    - edges: how many distinct x and y coordinates the pieces' edges have
//      (each one is one more cut; even rows and columns share them),
//    - scatter: how spread out the pieces of the same size end up,
//    - mixed: equal pieces in different orientations.
//    A tidy and an untidy sheet are usually ~1 % of the height apart: that
//    beats small height differences, but not turning (b) nor ~3 % of height.
const W_EDGES = 0.03;
const W_SCATTER = 0.02;
const W_MIXED = 0.02;
// d. How far right they reach, over the width: only breaks ties.
const W_RIGHT = 0.005;

// Two edges closer than this (mm) count as aligned.
const ALIGN_TOL = 0.1;
function distinctCount(values) {
  values = Float64Array.from(values).sort();
  let count = 0;
  let last = -Infinity;
  for (const v of values) {
    if (v - last > ALIGN_TOL) count++;
    last = v;
  }
  return count;
}

// Pieces of the same size (to 0.1 mm), whatever orientation they came in.
const sizeKey = (r) => `${Math.round(Math.max(r.w, r.h) * 10)}x${Math.round(Math.min(r.w, r.h) * 10)}`;

// id → {w, h, group}: `group` numbers the distinct sizes (equal pieces, the
// same number). Built once, it serves to score every candidate.
function pieceInfo(rects) {
  const groups = new Map();
  const info = new Map();
  for (const r of rects) {
    const key = sizeKey(r);
    if (!groups.has(key)) groups.set(key, groups.size);
    info.set(r.id, { w: r.w, h: r.h, group: groups.get(key) });
  }
  return info;
}

// The score's breakdown (for tuning and tests); `info` comes from pieceInfo.
function scoreParts(placements, info, W, H) {
  const n = placements.length;
  if (!n) return { bottom: 0, rotated: 0, edges: 0, scatter: 0, mixed: 0, right: 0 };
  let bottom = 0;
  let right = 0;
  let rotated = 0;
  const xs = [];
  const ys = [];
  const groups = [];
  for (const p of placements) {
    const r = info.get(p.id);
    const w = p.rotated ? r.h : r.w;
    const h = p.rotated ? r.w : r.h;
    bottom = Math.max(bottom, p.y + h);
    right = Math.max(right, p.x + w);
    if (p.rotated) rotated++;
    xs.push(p.x, p.x + w);
    ys.push(p.y, p.y + h);
    // The orientation it ended in on the sheet (square ones don't count).
    const lying = w > h + EPS ? 1 : 0;
    const standing = h > w + EPS ? 1 : 0;
    const g = groups[r.group];
    if (g) {
      g.count++;
      g.lying += lying;
      g.standing += standing;
      g.area += w * h;
      g.x0 = Math.min(g.x0, p.x);
      g.y0 = Math.min(g.y0, p.y);
      g.x1 = Math.max(g.x1, p.x + w);
      g.y1 = Math.max(g.y1, p.y + h);
    } else groups[r.group] = { count: 1, lying, standing, area: w * h, x0: p.x, y0: p.y, x1: p.x + w, y1: p.y + h };
  }
  // Edges: between 4 (all aligned in a single box) and 4n (none shared).
  const edges = n > 1 ? (distinctCount(xs) + distinctCount(ys) - 4) / (4 * n - 4) : 0;
  // For each group of equal pieces: scatter = how much of the box around them
  // isn't the group's pieces (0 = together, near 1 = spread out); mixed = how
  // many ended in the group's minority orientation.
  let scattered = 0;
  let minority = 0;
  let grouped = 0;
  for (const g of groups) {
    if (!g || g.count < 2) continue;
    scattered += g.count * (1 - g.area / ((g.x1 - g.x0) * (g.y1 - g.y0)));
    minority += Math.min(g.lying, g.standing);
    grouped += g.count;
  }
  return {
    bottom: bottom / H,
    rotated: rotated / n,
    edges,
    scatter: grouped ? scattered / grouped : 0,
    mixed: grouped ? (2 * minority) / grouped : 0,
    right: right / W,
  };
}

function combine(s) {
  return (
    W_BOTTOM * s.bottom +
    (s.rotated > 0 ? W_ROTATE_ANY + W_ROTATE_SHARE * s.rotated : 0) +
    W_EDGES * s.edges +
    W_SCATTER * s.scatter +
    W_MIXED * s.mixed +
    W_RIGHT * s.right
  );
}

/**
 * The score of a layout from `pack` ({id, x, y, rotated}) of the pieces
 * `rects` in a W×H area. Lower is better; the W_* weights above say how.
 */
export function score(placements, rects, W, H) {
  return combine(scoreParts(placements, pieceInfo(rects), W, H));
}

// --- Search ----------------------------------------------------------------

// A seeded PRNG (mulberry32): the same input, the same result.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The criteria for the perturbed orders (those of ORDERS, without tie breaks).
const KEYS = [(p) => p.w * p.h, (p) => Math.max(p.w, p.h), (p) => p.w + p.h, (p) => p.h, (p) => p.w];
const SEED = 0x5eed;
// How many perturbed orders to try besides the fixed ones. A fixed count (not
// a time) so the result is deterministic. Each attempt costs ~n² (n pieces ×
// free spaces), so it drops with n: 400 up to 100 pieces (~70 ms with 60),
// 100 with 200 pieces (~180 ms). Returns diminish: twice the attempts improve
// the mean score by ~0.1 % of the height and double the time.
const extraAttempts = (n) => Math.max(40, Math.min(400, Math.round(4e6 / (n * n || 1))));

/**
 * Places `rects` ({id, w, h}) in a W×H area without overlapping them. Gives
 * [{id, x, y, rotated}], or null when not all of them fit; `rotated` means
 * the piece takes h×w. There is at least `gap` between pieces, and between
 * pieces and obstacles (not against the area's edge). `obstacles` ({x, y, w,
 * h}) are areas already taken, to avoid.
 *
 * Generates many valid layouts (fixed combinations of orientation, order and
 * heuristic, and perturbed orders with a fixed seed) and returns the one with
 * the lowest `score`. Deterministic, and independent of the order of `rects`.
 */
export function pack(rects, W, H, { gap = 0, rotate = true, obstacles = [] } = {}) {
  const pieces = canonical(rects);
  const info = pieceInfo(pieces);
  const start = startFree(W, H, gap, obstacles);
  const oriented = orientations(pieces, rotate);

  let best = null;
  let bestScore = Infinity;
  const consider = (placements) => {
    const s = combine(scoreParts(placements, info, W, H));
    // On a tie (or nearly), the first one found stays.
    if (s < bestScore - 1e-9) {
      best = placements;
      bestScore = s;
    }
  };

  const working = new Set(); // orientations with at least one solution
  eachFixed(oriented, start, gap, (placements, o) => {
    working.add(o);
    consider(placements);
  });
  // The perturbed orders only look for something better: when no fixed
  // combination fits, it doesn't fit (so `fitScale` can stop at the first
  // that does).
  if (!best) return null;

  // Perturbed orders: a criterion of ORDERS with each key multiplied by
  // (1 ± amp). Sometimes the noise is one per group of equal pieces (they
  // stay together, tidier) and sometimes one per piece. Repeated attempts
  // (same orientation, order and heuristic) are skipped.
  const group = pieces.map((r) => info.get(r.id).group);
  const groupCount = Math.max(0, ...group) + 1;
  const pool = oriented.filter((o) => working.has(o));
  const canFlip = rotate && pieces.some((r) => !isSquare(r));
  const rnd = prng(SEED);
  const tried = new Set();
  const attempts = extraAttempts(pieces.length);
  for (let i = 0; i < attempts; i++) {
    let base;
    let baseKey;
    if (canFlip && rnd() < 0.25) {
      // Each group of equal pieces all alike: as it came, landscape or portrait.
      const mode = Array.from({ length: groupCount }, () => Math.floor(rnd() * 3));
      base = fixedOrientation(pieces, (r, j) => {
        const m = mode[group[j]];
        return m === 1 ? r.h > r.w + EPS : m === 2 ? r.w > r.h + EPS : false;
      });
      baseKey = mode.join('');
    } else {
      const k = Math.floor(rnd() * pool.length);
      base = pool[k];
      baseKey = `o${k}`;
    }
    const key = KEYS[Math.floor(rnd() * KEYS.length)];
    const h = Math.floor(rnd() * HEURISTICS.length);
    const amp = 0.05 + 0.6 * rnd();
    const noise = rnd() < 0.5 ? Array.from({ length: groupCount }, () => 1 + amp * (2 * rnd() - 1)) : null;
    const order = base
      .map((p, j) => ({ j, k: key(p) * (noise ? noise[group[j]] : 1 + amp * (2 * rnd() - 1)) }))
      .sort((a, b) => b.k - a.k)
      .map((e) => e.j);
    const signature = `${h}:${baseKey}:${order.join(',')}`;
    if (tried.has(signature)) continue;
    tried.add(signature);
    const placements = packOnce(order.map((j) => base[j]), start, gap, HEURISTICS[h]);
    if (placements) consider(placements);
  }
  return best;
}

// Does it fit with one of the fixed combinations? The same as `pack` !== null,
// but it stops at the first that fits and doesn't score.
function fits(rects, W, H, { gap = 0, rotate = true, obstacles = [] } = {}) {
  let ok = false;
  eachFixed(orientations(canonical(rects), rotate), startFree(W, H, gap, obstacles), gap, () => (ok = true));
  return ok;
}

/**
 * The layouts of the fixed combinations that fit (those `pack` compares
 * before the perturbed orders). Exported for tests.
 */
export function fixedCandidates(rects, W, H, { gap = 0, rotate = true, obstacles = [] } = {}) {
  const out = [];
  eachFixed(orientations(canonical(rects), rotate), startFree(W, H, gap, obstacles), gap, (p) => {
    out.push(p);
  });
  return out;
}

/**
 * The largest factor (0–1] all pieces have to be scaled by to fit (the gap
 * and the obstacles don't scale). 0 when not even the smallest works (or it
 * would take less than 0.01). Guarantee: `pack` with w·k × h·k pieces and the
 * same options fits. A slightly smaller factor nearly always does too, but
 * that isn't assured.
 */
export function fitScale(rects, W, H, options = {}) {
  const scaled = (k) => rects.map((r) => ({ id: r.id, w: r.w * k, h: r.h * k }));
  if (fits(rects, W, H, options)) return 1;
  // Binary search: `lo` is always a factor that packed. Packing is heuristic
  // and not strictly monotonic, so it may not be the exact largest, but it
  // is one that works.
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 16; n++) {
    const mid = (lo + hi) / 2;
    if (fits(scaled(mid), W, H, options)) lo = mid;
    else hi = mid;
  }
  return lo < 0.01 ? 0 : lo;
}

// --- Several sheets --------------------------------------------------------
// Sharing out over equal sheets: sheet by sheet, which of the remaining
// pieces go there is chosen with greedy fills that skip what doesn't fit,
// and then each sheet is packed again with `pack` to tidy it. So the first
// sheets come out full and the last is the emptiest.

// Does it fit alone in the spaces `start`? (On an empty sheet the gap doesn't matter.)
function fitsAlone(r, start, gap, rotate) {
  return bestSpot({ w: r.w, h: r.h, free: rotate && !isSquare(r) }, start, gap, HEURISTICS[0]) !== null;
}

// packOnce, but skipping the pieces that don't fit.
function fillOnce(pieces, start, gap, heuristic) {
  if (work) work.attempts++;
  let free = start;
  const placements = [];
  for (const p of pieces) {
    const best = bestSpot(p, free, gap, heuristic);
    if (!best) continue;
    free = occupy(free, best);
    placements.push({ id: p.id, x: best.x, y: best.y, rotated: best.turn !== p.flip });
  }
  return placements;
}

// First each group of equal pieces whole (when not all fit, none go), then,
// with `topUp`, fills in with those left out. Groups go in the order of
// their first piece.
function fillGroups(pieces, start, gap, heuristic, info, topUp) {
  if (work) work.attempts++;
  const blocks = new Map();
  for (const p of pieces) {
    const g = info.get(p.id).group;
    if (!blocks.has(g)) blocks.set(g, []);
    blocks.get(g).push(p);
  }
  let free = start;
  const placements = [];
  const placed = new Set();
  for (const block of blocks.values()) {
    let trial = free;
    const mine = [];
    for (const p of block) {
      const best = bestSpot(p, trial, gap, heuristic);
      if (!best) break;
      trial = occupy(trial, best);
      mine.push({ id: p.id, x: best.x, y: best.y, rotated: best.turn !== p.flip });
    }
    if (mine.length < block.length) continue;
    free = trial;
    for (const m of mine) {
      placements.push(m);
      placed.add(m.id);
    }
  }
  if (!topUp) return placements;
  const rest = pieces.filter((p) => !placed.has(p.id));
  return placements.concat(fillOnce(rest, free, gap, heuristic));
}

// Distinct sets of pieces that can go on one sheet, with a valid placement of
// each: every fixed combination orientation × order × heuristic, filling in
// three ways (piece by piece, whole groups, and whole groups topped up).
// `index`: id → canonical position.
const FILL_MODES = [null, 'groups', 'groups+'];

function sheetCandidates(remaining, start, gap, rotate, info, index) {
  const byId = new Map(remaining.map((r) => [r.id, r]));
  const seen = new Set();
  const out = [];
  for (const pieces of orientations(remaining, rotate)) {
    for (const order of ORDERS) {
      const sorted = [...pieces].sort(order);
      for (const heuristic of HEURISTICS) {
        for (const mode of FILL_MODES) {
          const placements = mode
            ? fillGroups(sorted, start, gap, heuristic, info, mode === 'groups+')
            : fillOnce(sorted, start, gap, heuristic);
          if (!placements.length) continue;
          const key = placements
            .map((p) => index.get(p.id))
            .sort((a, b) => a - b)
            .join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          let area = 0;
          for (const p of placements) area += byId.get(p.id).w * byId.get(p.id).h;
          out.push({ placements, area, splits: null });
        }
      }
    }
  }
  return out;
}

// How many groups of equal pieces the candidate splits: it has some of the
// group but not all that remain.
function countSplits(candidate, remaining, info) {
  const left = new Map();
  for (const r of remaining) {
    const g = info.get(r.id).group;
    left.set(g, (left.get(g) ?? 0) + 1);
  }
  const taken = new Map();
  for (const p of candidate.placements) {
    const g = info.get(p.id).group;
    taken.set(g, (taken.get(g) ?? 0) + 1);
  }
  let splits = 0;
  for (const [g, n] of taken) if (n < left.get(g)) splits++;
  return splits;
}

// How much of a sheet's fill (a fraction of the best candidate's) may be
// given up so as not to split groups of equal pieces. Each value is tried on
// its own and the share-out with the fewest sheets wins; with as many, the
// one that splits fewer groups; then the one that fills the first sheets
// most.
const COHESION = [0, 0.15, 1];

function choose(candidates, tolerance, remaining, info) {
  let maxArea = 0;
  for (const c of candidates) maxArea = Math.max(maxArea, c.area);
  const tiny = maxArea * 1e-9;
  const floor = maxArea * (1 - tolerance) - tiny;
  let best = null;
  for (const c of candidates) {
    if (c.area < floor) continue;
    c.splits ??= countSplits(c, remaining, info);
    if (!best || c.splits < best.splits || (c.splits === best.splits && c.area > best.area + tiny)) best = c;
  }
  return best;
}

// Shares out `pieces` (canonical order, each fits alone on an empty sheet)
// sheet by sheet: first the existing ones (`existing`: obstacles per sheet),
// then new sheets. `memo` shares candidates between tolerances: the same
// remaining pieces on the same sheet give the same ones.
function assign(pieces, W, H, gap, rotate, existing, tolerance, info, index, memo) {
  const sheets = [];
  let remaining = pieces;
  for (let s = 0; remaining.length; s++) {
    const isNew = s >= existing.length;
    const key = `${isNew ? 'n' : s}|${remaining.map((p) => index.get(p.id)).join(',')}`;
    let candidates = memo.get(key);
    if (!candidates) {
      candidates = sheetCandidates(remaining, startFree(W, H, gap, isNew ? [] : existing[s]), gap, rotate, info, index);
      memo.set(key, candidates);
    }
    const pick = choose(candidates, tolerance, remaining, info);
    if (!pick) {
      if (isNew) break; // can't happen: at least one always fits on an empty sheet
      sheets.push(null);
      continue;
    }
    sheets.push(pick);
    const used = new Set(pick.placements.map((p) => p.id));
    remaining = remaining.filter((p) => !used.has(p.id));
  }
  // The new sheets, fullest first.
  const fresh = sheets.slice(existing.length).sort((a, b) => b.area - a.area);
  const all = sheets.slice(0, existing.length).concat(fresh);
  // Splits in all: for each group, on how many sheets it ended, minus one.
  const where = new Map();
  all.forEach((sheet, s) => {
    for (const p of sheet?.placements ?? []) {
      const g = info.get(p.id).group;
      if (!where.has(g)) where.set(g, new Set());
      where.get(g).add(s);
    }
  });
  let splits = 0;
  for (const set of where.values()) splits += set.size - 1;
  return { sheets: all, fresh: fresh.length, splits, rest: remaining };
}

function betterAssignment(a, b) {
  if (a.rest.length !== b.rest.length) return a.rest.length < b.rest.length;
  if (a.fresh !== b.fresh) return a.fresh < b.fresh;
  if (a.splits !== b.splits) return a.splits < b.splits;
  for (let s = 0; s < a.sheets.length; s++) {
    const da = a.sheets[s]?.area ?? 0;
    const db = b.sheets[s]?.area ?? 0;
    if (Math.abs(da - db) > 1e-9 * Math.max(da, db)) return da > db;
  }
  return false;
}

// Sets apart those that don't fit even alone on an empty sheet. Gives those
// that do (canonical order), those that don't (ids, canonical order) and the
// shared data.
function prepare(rects, W, H, gap, rotate) {
  const pieces = canonical(rects);
  const empty = startFree(W, H, gap, []);
  const fit = [];
  const unplaced = [];
  for (const r of pieces) {
    if (r.w > 0 && r.h > 0 && W > 0 && H > 0 && fitsAlone(r, empty, gap, rotate)) fit.push(r);
    else unplaced.push(r.id);
  }
  return { fit, unplaced, info: pieceInfo(fit), index: new Map(fit.map((r, i) => [r.id, i])) };
}

// The best share-out among the tolerances of COHESION.
function bestAssignment(fit, W, H, gap, rotate, existing, info, index) {
  const memo = new Map();
  let best = null;
  for (const tolerance of COHESION) {
    const a = assign(fit, W, H, gap, rotate, existing, tolerance, info, index, memo);
    if (!best || betterAssignment(a, best)) best = a;
  }
  return best;
}

// A sheet's final layout: the better of `pack` with those pieces and the
// placement they were chosen with (valid even when `pack` doesn't find it).
function finalLayout(sheet, byId, W, H, gap, rotate, obstacles) {
  const rects = sheet.placements.map((p) => byId.get(p.id));
  const packed = pack(rects, W, H, { gap, rotate, obstacles });
  if (packed && score(packed, rects, W, H) <= score(sheet.placements, rects, W, H) + 1e-12) return packed;
  return sheet.placements;
}

/**
 * Shares out `rects` ({id, w, h}) over equal W×H sheets (the printable area),
 * using few sheets. Gives `{sheets, unplaced}`: `sheets[i]` are the
 * placements ({id, x, y, rotated}, like those of `pack`) of sheet i;
 * `unplaced`, the ids of the pieces that don't fit even alone on an empty
 * sheet. Each id appears once, on a sheet or in `unplaced`.
 *
 * Criteria, in order: fewer sheets; not splitting groups of equal-size pieces
 * between sheets; filling the first sheets well (the last is the emptiest:
 * sheets go from most to least area taken). Each sheet gets the best layout
 * `pack` finds for its pieces.
 *
 * It is heuristic (the exact problem is intractable): in easy cases it
 * reaches the bound by area or one sheet more. Deterministic and independent
 * of the order of `rects`; `unplaced` is in canonical order (long side, short
 * side, id).
 */
export function packSheets(rects, W, H, { gap = 0, rotate = true } = {}) {
  const { fit, unplaced, info, index } = prepare(rects, W, H, gap, rotate);
  if (!fit.length) return { sheets: [], unplaced };
  const best = bestAssignment(fit, W, H, gap, rotate, [], info, index);
  const byId = new Map(fit.map((r) => [r.id, r]));
  return {
    sheets: best.sheets.map((sheet) => finalLayout(sheet, byId, W, H, gap, rotate, [])),
    unplaced: unplaced.concat(best.rest.map((r) => r.id)),
  };
}

/**
 * Places NEW pieces (`rects`: {id, w, h}) without moving those already there.
 * `sheets`: for each existing sheet, its obstacles ({x, y, w, h}, in
 * printable area coordinates: what is taken). Fills the existing sheets'
 * spaces in order (from sheet `from`, when given, then the following ones,
 * then the earlier ones) and what doesn't fit goes to new sheets, with
 * indices from `sheets.length` (fullest first).
 *
 * Gives `{placements, unplaced}`: `placements` are {id, sheet, x, y,
 * rotated}; `unplaced`, the ids of those that don't fit even alone on an
 * empty sheet. Keeps `gap` between new pieces and between pieces and
 * obstacles. The same criteria and guarantees as `packSheets`.
 */
export function packInto(rects, W, H, { gap = 0, rotate = true, sheets = [], from = 0 } = {}) {
  const { fit, unplaced, info, index } = prepare(rects, W, H, gap, rotate);
  if (!fit.length) return { placements: [], unplaced };
  const n = sheets.length;
  const first = n ? Math.min(n - 1, Math.max(0, Math.floor(from) || 0)) : 0;
  const order = [...Array(n).keys()].map((i) => (first + i) % n);
  const existing = order.map((i) => sheets[i] ?? []);
  const best = bestAssignment(fit, W, H, gap, rotate, existing, info, index);
  const byId = new Map(fit.map((r) => [r.id, r]));
  const placements = [];
  best.sheets.forEach((sheet, k) => {
    if (!sheet) return;
    const isNew = k >= n;
    const target = isNew ? k : order[k];
    const obstacles = isNew ? [] : existing[k];
    for (const p of finalLayout(sheet, byId, W, H, gap, rotate, obstacles)) {
      placements.push({ id: p.id, sheet: target, x: p.x, y: p.y, rotated: p.rotated });
    }
  });
  placements.sort((a, b) => a.sheet - b.sheet);
  return { placements, unplaced: unplaced.concat(best.rest.map((r) => r.id)) };
}

/**
 * A piece's rotation after packing. `rotated` (a placement's, relative to the
 * footprint the packer was given) turns the footprint a quarter turn: the
 * piece switches to the other rotation of its pair, 0 ↔ 90 or 180 ↔ 270.
 * Packing only needs the two orientations of the footprint; adding 90 each
 * time would leave a photo upside down after a few arranges. A piece turned
 * to 180 by hand keeps its pair.
 */
export function packedRotation(r, rotated) {
  if (!rotated) return r;
  return r % 180 === 0 ? r + 90 : r - 90;
}
