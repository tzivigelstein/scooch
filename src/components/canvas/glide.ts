// The view gliding on after a two-finger pan, slowing down until it stops
// (core/glide.js). One animation frame loop that only writes the stage's
// scroll: the bounds are read once, when it starts. A press on the stage, the
// wheel, a key, a reveal or a zoom stops it at once.

import { GLIDE_STOP, glideAt, type Glide } from '../../core/glide.js';
import type { Point } from '../../core/types.ts';

let frame = 0;

/** Stops the glide where it is (nothing if there is none). */
export function stopGlide() {
  if (!frame) return;
  cancelAnimationFrame(frame);
  frame = 0;
}

/**
 * The stage goes on scrolling at `velocity` (px per ms, the scroll's own
 * direction: against the fingers) and slows down until it stops, unless the
 * person asked for reduced motion.
 */
export function startGlide(velocity: Point) {
  stopGlide();
  const stage = document.getElementById('stage');
  if (!stage || Math.hypot(velocity.x, velocity.y) <= GLIDE_STOP) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Unless zoomed in past its width, the stage never scrolls sideways.
  const wide = stage.classList.contains('is-wide');
  const glide: Glide = {
    from: { x: stage.scrollLeft, y: stage.scrollTop },
    velocity: { x: wide ? velocity.x : 0, y: velocity.y },
    min: { x: 0, y: 0 },
    max: { x: wide ? Math.max(0, stage.scrollWidth - stage.clientWidth) : 0, y: Math.max(0, stage.scrollHeight - stage.clientHeight) },
  };
  const start = performance.now();
  let written = glide.from;
  const tick = (now: number) => {
    const at = glideAt(glide, now - start);
    if (at.x !== written.x) stage.scrollLeft = at.x;
    if (at.y !== written.y) stage.scrollTop = at.y;
    written = at;
    frame = at.done ? 0 : requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}
