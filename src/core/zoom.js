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

/** The midpoint of two pointers and the distance between them (px). */
export function pinchSpan([a, b]) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(b.x - a.x, b.y - a.y) };
}

/**
 * One step of a two-finger pinch over a view drawn at `zoom` px per mm and
 * scrolled by `scroll` px, so that the content under point p lies
 * (scroll + p) / zoom mm from the content's origin: the fingers went from
 * `before` to `after` (two points each, in the same px as p). The zoom grows
 * or shrinks as the distance between them, kept in the range like any zoom
 * the person picks (clampPercent from the current one); the scroll keeps the
 * content that was under their midpoint under their midpoint now. Fingers on
 * one spot leave the zoom as it is.
 */
export function pinchView(before, after, { zoom, scroll }) {
  const from = pinchSpan(before);
  const to = pinchSpan(after);
  const pct = toPercent(zoom);
  const ratio = from.d > 0 && to.d > 0 ? to.d / from.d : 1;
  // A distance that changed only by rounding is no zoom: an unchanged zoom stays
  // bit for bit what it was (moving both fingers together is a pan, not a zoom of the person's).
  const nextPct = Math.abs(ratio - 1) < 1e-9 ? pct : clampPercent(pct * ratio, pct);
  const next = nextPct === pct ? zoom : fromPercent(nextPct);
  const k = next / zoom;
  return { zoom: next, scroll: { x: (scroll.x + from.x) * k - to.x, y: (scroll.y + from.y) * k - to.y } };
}
