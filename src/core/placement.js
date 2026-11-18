// Where to put something floating (the piece toolbar) among several possible
// positions. Rectangles {x, y, w, h} in px.

const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r, b) => r.x >= b.x && r.y >= b.y && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y + b.h;

/** The intersection of two rectangles, or null when they don't touch. */
export function clip(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/**
 * Of the `candidates` (in order of preference), the one that covers the
 * fewest rectangles of `covers`; on a tie, the first. Skips those not wholly
 * inside `bounds` or over one of `blocked`. null when none is left.
 */
export function pickSpot(candidates, { bounds, covers = [], blocked = [] }) {
  let best = null;
  let fewest = Infinity;
  for (const spot of candidates) {
    if (!inside(spot, bounds) || blocked.some((b) => intersects(spot, b))) continue;
    const covered = covers.filter((r) => intersects(spot, r)).length;
    if (covered < fewest) {
      best = spot;
      fewest = covered;
    }
  }
  return best;
}

/**
 * Where something that fits beside nothing goes, over its piece: `spot` if it
 * is off every one of `blocked` (what floats over the canvas: the notice, the
 * zoom control), else lifted to `gap` above the ones it sits on, again until
 * it is off all of them. null if that leaves `bounds`.
 */
export function liftOff(spot, { bounds, blocked = [], gap = 0 }) {
  let lifted = spot;
  for (let i = 0; i <= blocked.length; i++) {
    const hits = blocked.filter((b) => intersects(lifted, b));
    if (!hits.length) return inside(lifted, bounds) ? lifted : null;
    lifted = { ...lifted, y: Math.min(...hits.map((b) => b.y)) - lifted.h - gap };
  }
  return null;
}
