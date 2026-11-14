// The glide after a two-finger pan: how fast the fingers were moving when
// they lifted, and where the view is while it keeps going after them, slowing
// down like a phone's own scrolling until it stops. Pure module: px, ms and
// px per ms.

/** The release speed is fitted to the samples of the last 100 ms before the last one (ms). */
export const GLIDE_WINDOW = 100;
/** Fingers that held still this long before lifting were not flung (ms). */
export const GLIDE_STALE = 40;
/** What the speed keeps of itself every ms: the normal deceleration of iOS scroll views. */
export const GLIDE_FRICTION = 0.998;
/** The glide stops when its speed falls below this (px per ms: 20 px a second, a third of a pixel a frame). */
export const GLIDE_STOP = 0.02;

/** The friction's time constant (ms): the speed falls by a factor of e every TAU ms. */
const TAU = -1 / Math.log(GLIDE_FRICTION);

const STILL = Object.freeze({ x: 0, y: 0 });

// The slope of `key` over time by least squares (px per ms); 0 when every sample has the same time.
function slope(samples, key) {
  const n = samples.length;
  let t = 0;
  let v = 0;
  for (const s of samples) {
    t += s.t;
    v += s[key];
  }
  t /= n;
  v /= n;
  let num = 0;
  let den = 0;
  for (const s of samples) {
    num += (s.t - t) * (s[key] - v);
    den += (s.t - t) ** 2;
  }
  return den > 0 ? num / den : 0;
}

/**
 * How fast the fingers' midpoint was moving when they lifted at `now` (px per
 * ms), from `samples` (oldest first: t in ms, the midpoint x, y and the
 * distance d between the fingers, in px): the least-squares line through the
 * samples of the last GLIDE_WINDOW ms, so uneven frames don't matter. Still
 * when the fingers held still for GLIDE_STALE ms before lifting, when fewer
 * than two samples are that recent, or when the fingers were spreading or
 * closing at least as fast as their midpoint moved (a zoom, which never glides).
 */
export function releaseVelocity(samples, now) {
  const last = samples.at(-1);
  if (!last || now - last.t > GLIDE_STALE) return STILL;
  const recent = samples.filter((s) => s.t >= last.t - GLIDE_WINDOW);
  if (recent.length < 2) return STILL;
  const v = { x: slope(recent, 'x'), y: slope(recent, 'y') };
  const speed = Math.hypot(v.x, v.y);
  const spread = recent.every((s) => Number.isFinite(s.d)) ? Math.abs(slope(recent, 'd')) : 0;
  return speed > 0 && spread < speed ? v : STILL;
}

/** How long a glide that starts at `speed` (px per ms) lasts (ms), if nothing stops it first. */
export const glideDuration = (speed) => (speed > GLIDE_STOP ? TAU * Math.log(speed / GLIDE_STOP) : 0);

/** How far a glide that starts at `speed` (px per ms) goes (px), if nothing stops it first. */
export const glideDistance = (speed) => (speed > GLIDE_STOP ? TAU * (speed - GLIDE_STOP) : 0);

/**
 * Where a glide is `t` ms after it left `from` at `velocity` (px per ms),
 * slowing down by GLIDE_FRICTION every ms along a straight line until its
 * speed falls below GLIDE_STOP. It comes from the time alone, so it goes the
 * same way and ends in the same place at any frame rate. Each axis stops at
 * `min` or `max` (it stays there, no bounce) while the other goes on; `done`
 * once the glide is over or both axes have stopped.
 */
export function glideAt({ from, velocity, min, max }, t) {
  const duration = glideDuration(Math.hypot(velocity.x, velocity.y));
  const s = Math.min(Math.max(t, 0), duration);
  // How far a speed of 1 px per ms has gone by then.
  const k = TAU * (1 - Math.exp(-s / TAU));
  const axis = (p, v, lo, hi) => {
    const at = Math.min(hi, Math.max(lo, p + v * k));
    return { at, stopped: v === 0 || (v > 0 ? at >= hi : at <= lo) };
  };
  const x = axis(from.x, velocity.x, min.x, max.x);
  const y = axis(from.y, velocity.y, min.y, max.y);
  return { x: x.at, y: y.at, done: s >= duration || (x.stopped && y.stopped) };
}
