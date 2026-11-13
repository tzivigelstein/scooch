// The canvas zoom: a view measure in percent, where 100 % draws 1 mm as
// 96 / 25.4 CSS px (what a ruler on a standard screen would show). It never
// changes the printed size. Pure module: percentages and factors.

/** CSS px per mm at 100 %. */
export const PX_PER_MM_AT_100 = 96 / 25.4;

/** The range a person can zoom to, in percent (a fitted zoom may fall outside it). */
export const ZOOM_MIN = 10;
export const ZOOM_MAX = 800;

/** The levels the zoom buttons and Ctrl/⌘ + / − step through. */
export const ZOOM_LEVELS = Object.freeze([10, 25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400, 600, 800]);

/** The levels of the zoom menu. */
export const MENU_LEVELS = Object.freeze([50, 100, 200]);

/** px per mm → percent. */
export const toPercent = (pxPerMm) => (pxPerMm / PX_PER_MM_AT_100) * 100;

/** Percent → px per mm. */
export const fromPercent = (pct) => (pct / 100) * PX_PER_MM_AT_100;

/**
 * Keeps a zoom (percent) in the range without ever moving it the wrong way
 * from `current`: zooming in from a fitted 6 % goes to 7 %, not to 10 %.
 */
export function clampPercent(next, current = null) {
  const lo = current === null ? ZOOM_MIN : Math.min(ZOOM_MIN, current);
  const hi = current === null ? ZOOM_MAX : Math.max(ZOOM_MAX, current);
  return Math.min(hi, Math.max(lo, next));
}

/**
 * The next level from `current` (percent) in `dir` (1: in, −1: out). Past the
 * last level, it stays where it is.
 */
export function stepPercent(current, dir) {
  const eps = 0.5;
  if (dir > 0) return ZOOM_LEVELS.find((level) => level > current + eps) ?? Math.max(current, ZOOM_MAX);
  return [...ZOOM_LEVELS].reverse().find((level) => level < current - eps) ?? Math.min(current, ZOOM_MIN);
}

/** Can the zoom still go in `dir` from `current` (percent)? */
export const canStep = (current, dir) => (dir > 0 ? current < ZOOM_MAX - 0.5 : current > ZOOM_MIN + 0.5);

/**
 * The factor for a wheel turn with Ctrl/⌘ or a trackpad pinch (which comes
 * as a wheel event with ctrlKey): smooth for the small deltas of a pinch, at
 * most ×1.43 for a mouse wheel notch. `deltaMode`: 0 pixels, 1 lines, 2 pages.
 */
export function wheelFactor(deltaY, deltaMode = 0) {
  const px = deltaMode === 1 ? deltaY * 20 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-Math.max(-60, Math.min(60, px)) * 0.006);
}
