// The gaps between neighboring pieces of a sheet: what «Separación» measures,
// for the canvas to show it. Pure module: boxes {x, y, w, h} in mm.

const EPS = 1e-6;

/** Do two rectangles share some interior? */
const crosses = (a, b) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;

/**
 * The gaps between facing neighbors: from each box to each box on its right
 * (and below) whose span overlaps it on the other axis, at most `max` mm away
 * and with no other box in between. Each gap is the rectangle between the two
 * facing edges, over the span they share ({x, y, w, h}; w or h is 0 when they
 * touch), once per pair. Boxes that overlap have no gap.
 */
export function neighborGaps(rects, max) {
  const gaps = [];
  // Nothing fits between two boxes that touch.
  const clear = (gap, a, b) => gap.w <= EPS || gap.h <= EPS || !rects.some((c) => c !== a && c !== b && crosses(gap, c));
  for (const a of rects) {
    for (const b of rects) {
      if (a === b) continue;
      const top = Math.max(a.y, b.y);
      const bottom = Math.min(a.y + a.h, b.y + b.h);
      const right = b.x - (a.x + a.w);
      if (bottom - top > EPS && right >= -EPS && right <= max + EPS) {
        const gap = { x: a.x + a.w, y: top, w: Math.max(0, right), h: bottom - top };
        if (clear(gap, a, b)) gaps.push(gap);
      }
      const left = Math.max(a.x, b.x);
      const end = Math.min(a.x + a.w, b.x + b.w);
      const below = b.y - (a.y + a.h);
      if (end - left > EPS && below >= -EPS && below <= max + EPS) {
        const gap = { x: left, y: a.y + a.h, w: end - left, h: Math.max(0, below) };
        if (clear(gap, a, b)) gaps.push(gap);
      }
    }
  }
  return gaps;
}
