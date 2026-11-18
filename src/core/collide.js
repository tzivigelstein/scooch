// Collisions between rectangles {x, y, w, h} (mm, origin at the top left).
// Touching isn't overlapping: there is a tolerance of EPS mm.

export const EPS = 0.01;

/** Do `a` and `b` overlap (more than touching)? */
export function overlaps(a, b, eps = EPS) {
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
}

/** Those of `others` that `rect` overlaps. */
export const overlapping = (rect, others, eps = EPS) => others.filter((o) => overlaps(rect, o, eps));

export const overlapsAny = (rect, others, eps = EPS) => others.some((o) => overlaps(rect, o, eps));

const inside = (r, b, eps = EPS) =>
  r.x >= b.x - eps && r.y >= b.y - eps && r.x + r.w <= b.x + b.w + eps && r.y + r.h <= b.y + b.h + eps;

/**
 * The free position nearest to `rect` (Euclidean distance of the corner) for
 * a rectangle of rect.w × rect.h that overlaps none of `others`.
 *
 * Candidates: its own position and those that rest it against the edges of
 * the others (x = another's left − width, x = another's right, the same in y)
 * and of `bounds`, combined with each other and with the original x/y. The
 * nearest is always among them: either it only slides along one axis to an
 * edge, or it ends in a corner made by the edges of two rectangles.
 *
 * Options: `bounds` ({x, y, w, h}) when it has to stay inside an area;
 * `maxDistance` to drop places too far away. Gives {x, y} or null.
 */
export function nearestFree(rect, others, { bounds = null, maxDistance = Infinity } = {}) {
  const { w, h } = rect;
  const xs = new Set([rect.x]);
  const ys = new Set([rect.y]);
  for (const o of others) {
    xs.add(o.x - w);
    xs.add(o.x + o.w);
    ys.add(o.y - h);
    ys.add(o.y + o.h);
  }
  if (bounds) {
    xs.add(bounds.x);
    xs.add(bounds.x + bounds.w - w);
    ys.add(bounds.y);
    ys.add(bounds.y + bounds.h - h);
  }
  const candidates = [];
  for (const x of xs) {
    for (const y of ys) {
      const d = Math.hypot(x - rect.x, y - rect.y);
      if (d > maxDistance + 1e-9) continue;
      if (bounds && !inside({ x, y, w, h }, bounds)) continue;
      candidates.push({ x, y, d });
    }
  }
  // At the same distance, the topmost, then the leftmost.
  candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  for (const c of candidates) {
    if (!overlapsAny({ x: c.x, y: c.y, w, h }, others)) return { x: c.x, y: c.y };
  }
  return null;
}

/**
 * Moves `rect` by (dx, dy) (one axis only). When it overlaps another there, it
 * jumps to the first free place in that same direction, right past what is in
 * the way, so it never gets stuck. Gives {x, y, jumped} with the rectangles
 * jumped over.
 */
export function nextFreeInDirection(rect, others, dx, dy) {
  let x = rect.x + dx;
  let y = rect.y + dy;
  const jumped = [];
  // Each round leaves at least one rectangle behind, which can't block again.
  for (let guard = 0; guard <= others.length; guard++) {
    const blockers = overlapping({ x, y, w: rect.w, h: rect.h }, others);
    if (!blockers.length || (!dx && !dy)) break;
    for (const b of blockers) if (!jumped.includes(b)) jumped.push(b);
    if (dx > 0) x = Math.max(...blockers.map((b) => b.x + b.w));
    else if (dx < 0) x = Math.min(...blockers.map((b) => b.x - rect.w));
    if (dy > 0) y = Math.max(...blockers.map((b) => b.y + b.h));
    else if (dy < 0) y = Math.min(...blockers.map((b) => b.y - rect.h));
  }
  return { x, y, jumped };
}

// ---------- Groups moved rigidly (several pieces, on one or more sheets) ----------
//
// `layers`: [{rects, others, bounds?}], one per sheet: `rects` are the group's
// pieces on that sheet and `others` the rest of that sheet. Every layer moves
// by the same offset. With `bounds` ({W, H}), each piece's center has to stay
// on the W × H sheet.

const movedBy = (r, dx, dy) => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });

function centerInside(r, bounds) {
  if (!bounds) return true;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return cx >= -1e-9 && cy >= -1e-9 && cx <= bounds.W + 1e-9 && cy <= bounds.H + 1e-9;
}

/**
 * `nextFreeInDirection` for a group: moves it by (dx, dy) (one axis only)
 * and, while some piece overlaps another of its sheet, jumps in that
 * direction just enough to leave it behind. Gives {dx, dy, jumped}: the final
 * offset and those of `others` it jumped over (each once).
 */
export function nextFreeForGroup(layers, dx, dy) {
  let ox = dx;
  let oy = dy;
  const jumped = [];
  const forward = dx > 0 || dy > 0;
  const pairs = layers.reduce((n, l) => n + l.rects.length * l.others.length, 0);
  // Each round reaches the edge of a different piece–obstacle pair, so it ends.
  for (let guard = 0; guard <= pairs && (dx || dy); guard++) {
    let next = null;
    for (const { rects, others } of layers) {
      for (const r of rects) {
        const moved = movedBy(r, ox, oy);
        for (const b of others) {
          if (!overlaps(moved, b)) continue;
          if (!jumped.includes(b)) jumped.push(b);
          const need = dx > 0 ? b.x + b.w - r.x : dx < 0 ? b.x - r.w - r.x : dy > 0 ? b.y + b.h - r.y : b.y - r.h - r.y;
          next = next === null ? need : forward ? Math.max(next, need) : Math.min(next, need);
        }
      }
    }
    if (next === null) break;
    if (dx) ox = next;
    else oy = next;
  }
  return { dx: ox, dy: oy, jumped };
}

/**
 * The shortest offset (dx, dy) (Euclidean distance) that leaves a group
 * overlapping nothing on its sheet and, with `bounds`, with the centers on
 * the sheet. Candidates: 0 and the offsets that rest a piece of the group
 * against another's edge (or its center against the sheet's edge), combined
 * in x and y (as in `nearestFree`). `maxDistance` drops the far ones. The
 * group's pieces aren't compared with each other (they move together). With
 * `step` (> 0), only offsets that are multiples of the step (the block stays
 * on the snap grid): each candidate is rounded to the multiple below and the
 * one above. Gives {dx, dy} or null.
 */
export function nearestFreeOffset(layers, { maxDistance = Infinity, step = 0 } = {}) {
  const xs = new Set([0]);
  const ys = new Set([0]);
  for (const { rects, others, bounds } of layers) {
    for (const r of rects) {
      for (const o of others) {
        xs.add(o.x - r.w - r.x);
        xs.add(o.x + o.w - r.x);
        ys.add(o.y - r.h - r.y);
        ys.add(o.y + o.h - r.y);
      }
      if (bounds) {
        xs.add(-(r.x + r.w / 2));
        xs.add(bounds.W - (r.x + r.w / 2));
        ys.add(-(r.y + r.h / 2));
        ys.add(bounds.H - (r.y + r.h / 2));
      }
    }
  }
  const onGrid = (values) => {
    if (!(step > 0)) return values;
    const out = new Set();
    for (const v of values) {
      out.add(Math.floor(v / step + 1e-9) * step);
      out.add(Math.ceil(v / step - 1e-9) * step);
    }
    return out;
  };
  const near = (values) => [...onGrid(values)].filter((v) => Math.abs(v) <= maxDistance + 1e-9);
  const candidates = [];
  for (const dx of near(xs)) {
    for (const dy of near(ys)) {
      const d = Math.hypot(dx, dy);
      if (d <= maxDistance + 1e-9) candidates.push({ dx, dy, d });
    }
  }
  // At the same distance, the topmost, then the leftmost (as in nearestFree).
  candidates.sort((a, b) => a.d - b.d || a.dy - b.dy || a.dx - b.dx);
  const fits = (dx, dy) =>
    layers.every(({ rects, others, bounds }) =>
      rects.every((r) => {
        const m = movedBy(r, dx, dy);
        return centerInside(m, bounds) && !overlapsAny(m, others);
      })
    );
  // A cap on candidates: the nearest are enough (the rest are very far away).
  for (const c of candidates.slice(0, 20000)) if (fits(c.dx, c.dy)) return { dx: c.dx, dy: c.dy };
  return null;
}

/**
 * The factors k a group can be scaled by around `anchor` ({x, y}: positions
 * and sizes are multiplied by k from that point, as in align.scaleGroup)
 * without any of `rects` overlapping any of `others`. The group's own pieces
 * never overlap each other when scaled (it is a homothety). Those that
 * already overlap at k = 1 don't stop it (as in maxGrowth). Gives {min, max}:
 * 0 and Infinity when nothing stops it; at the ends they touch without
 * overlapping.
 */
export function groupScaleRange(rects, others, anchor) {
  let min = 0;
  let max = Infinity;
  for (const r of rects) {
    for (const o of others) {
      if (overlaps(r, o)) continue;
      // They overlap for k in (lo, hi): each inequality is linear in k.
      let lo = 0;
      let hi = Infinity;
      const less = (c, d) => {
        // c·k < d
        if (c > 0) hi = Math.min(hi, d / c);
        else if (c < 0) lo = Math.max(lo, d / c);
        else if (!(d > 0)) hi = -Infinity;
      };
      const more = (c, d) => {
        // c·k > d
        if (c > 0) lo = Math.max(lo, d / c);
        else if (c < 0) hi = Math.min(hi, d / c);
        else if (!(d < 0)) hi = -Infinity;
      };
      less(r.x - anchor.x, o.x + o.w - EPS - anchor.x);
      more(r.x + r.w - anchor.x, o.x + EPS - anchor.x);
      less(r.y - anchor.y, o.y + o.h - EPS - anchor.y);
      more(r.y + r.h - anchor.y, o.y + EPS - anchor.y);
      if (!(lo < hi)) continue;
      if (hi <= 1) min = Math.max(min, hi);
      else if (lo >= 1) max = Math.min(max, lo);
    }
  }
  return { min, max };
}

/**
 * The largest factor k `rect` can grow by without overlapping `others`.
 * `anchor`: 'center' (grows from the center) or 'top-left' (grows right and
 * down, as with the handle). Those it already overlaps don't stop it.
 * Infinity when nothing stops it; it can be < 1 when it already touches
 * another.
 */
export function maxGrowth(rect, others, anchor = 'center') {
  let limit = Infinity;
  for (const b of others) {
    if (overlaps(rect, b)) continue;
    let k;
    if (anchor === 'center') {
      // They overlap when the distances between centers are smaller than the
      // sum of the half sizes on both axes at once.
      const dx = Math.abs(rect.x + rect.w / 2 - (b.x + b.w / 2));
      const dy = Math.abs(rect.y + rect.h / 2 - (b.y + b.h / 2));
      k = Math.max((2 * dx - b.w) / rect.w, (2 * dy - b.h) / rect.h);
    } else {
      // What lies to the left or above is never reached.
      if (b.x + b.w <= rect.x + EPS || b.y + b.h <= rect.y + EPS) continue;
      k = Math.max((b.x - rect.x) / rect.w, (b.y - rect.y) / rect.h);
    }
    if (k < limit) limit = k;
  }
  return limit;
}
