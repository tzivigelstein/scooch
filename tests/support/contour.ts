// Masks drawn by hand for the contour tests (unit, properties and performance):
// one alpha byte per pixel, opaque where a predicate holds at the pixel's centre.
import type { AlphaMask, Loop } from '../../src/core/contour.js';

type Inside = (x: number, y: number) => boolean;

/** A `width` × `height` mask: `alpha` where `inside(x, y)` holds at the pixel's centre, else 0. */
export function maskOf(width: number, height: number, inside: Inside, alpha = 255): AlphaMask & { alpha: Uint8Array } {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (inside(x + 0.5, y + 0.5)) out[y * width + x] = alpha;
  return { width, height, alpha: out };
}

export const disc =
  (cx: number, cy: number, r: number): Inside =>
  (x, y) =>
    (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** An ellipse centred at (cx, cy) with semi-axes a, b, turned `angle` radians. */
export const ellipse = (cx: number, cy: number, a: number, b: number, angle = 0): Inside => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (x: number, y: number) => {
    const u = (x - cx) * cos + (y - cy) * sin;
    const v = -(x - cx) * sin + (y - cy) * cos;
    return (u / a) ** 2 + (v / b) ** 2 <= 1;
  };
};

/** A five-pointed star with a round hole in the middle and two separate blobs: a shape with all the hard parts. */
export const starWithHole = (width: number, height: number): Inside => {
  const cx = width / 2;
  const cy = height / 2;
  const r = width * 0.38;
  return (x: number, y: number) => {
    const d = Math.hypot(x - cx, y - cy);
    const star = r * (0.65 + 0.35 * Math.cos(5 * Math.atan2(y - cy, x - cx)));
    return (d <= star && d >= r * 0.15) || Math.hypot(x - width * 0.1, y - height * 0.1) < width * 0.05 || Math.hypot(x - width * 0.9, y - height * 0.85) < width * 0.04;
  };
};

/** Distances from (x, y) to the centre of each loop's points: [min, max] over all loops' points. */
export function radii(loops: readonly Loop[], cx: number, cy: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i += 2) {
      const d = Math.hypot(loop[i] - cx, loop[i + 1] - cy);
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
  }
  return [min, max];
}

/** Distance from (x, y) to the nearest segment of the closed flat polylines. */
export function distanceToLoops(loops: readonly Loop[], x: number, y: number) {
  let best = Infinity;
  for (const loop of loops) {
    const n = loop.length;
    for (let i = 0; i < n; i += 2) {
      const ax = loop[i];
      const ay = loop[i + 1];
      const bx = loop[(i + 2) % n];
      const by = loop[(i + 3) % n];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y));
    }
  }
  return best;
}
