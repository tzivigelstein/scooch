// How far the stage scrolls by itself while something is dragged: near an
// edge it scrolls, faster the closer the pointer is, but never past what
// there is to see; and how much room dragging pieces out of the sheets adds
// below them, for the new sheet's placeholder. Pure module, px.

/** How close to an edge of the stage the pointer starts the scroll (px). */
export const EDGE_ZONE = 48;
/** The fastest step, with the pointer on the edge or past it (px per frame). */
export const EDGE_SPEED = 18;

/** At most this many frames' worth of scroll in one step (after a stall, it doesn't jump). */
export const MAX_FRAMES = 6;

/**
 * One step of scroll along one axis: `pointer` within EDGE_ZONE of `start` or
 * `end` (the stage's edges on that axis, window px) scrolls back or on, faster
 * the closer it is, at most EDGE_SPEED a frame. `frames`: the time since the
 * last step, in frames of 60 Hz (at most MAX_FRAMES), so the speed is the same
 * on a 120 Hz screen and when frames come late. The new scroll position, from
 * `scroll`, always within [0, max].
 */
export function edgeScroll(pointer, start, end, scroll, max, frames = 1) {
  const speed = (d) => Math.ceil(((EDGE_ZONE - d) / EDGE_ZONE) * EDGE_SPEED);
  let step = 0;
  if (pointer < start + EDGE_ZONE) step = -speed(Math.max(0, pointer - start));
  else if (pointer > end - EDGE_ZONE) step = speed(Math.max(0, end - pointer));
  step = Math.round(step * Math.min(Math.max(frames, 0), MAX_FRAMES));
  return Math.min(Math.max(scroll + step, 0), Math.max(0, max));
}

/**
 * How much the scrolled area must grow (px) so a placeholder whose bottom is
 * at `bottom` shows whole, with the area's bottom padding (`pad`) below it as
 * below the last sheet; `height`: the area's height without it. 0 when it
 * already fits.
 */
export function newSheetRoom({ bottom, pad, height }) {
  return Math.max(0, Math.ceil(bottom + pad - height));
}
