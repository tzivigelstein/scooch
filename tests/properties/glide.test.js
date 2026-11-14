import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { GLIDE_FRICTION, GLIDE_STALE, GLIDE_STOP, glideAt, glideDistance, glideDuration, releaseVelocity } from '../../src/core/glide.js';
import { prng } from '../support/prng.js';

// Two fingers panning together at any speed and direction on a phone or a
// tablet that sends a move every 4 to 50 ms (120 Hz, 60 Hz, dropped frames),
// sometimes one move per finger at the same moment; then the glide from
// anywhere in a scroll of any size.
const rnd = prng(998);
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

const pans = Array.from({ length: 400 }, () => {
  const v = { x: (rnd() * 2 - 1) * 4, y: (rnd() * 2 - 1) * 4 };
  const start = { x: rnd() * 1200, y: rnd() * 900, t: rnd() * 1e6 };
  const paired = rnd() < 0.5;
  const samples = [];
  let t = 0;
  while (t < 300) {
    const at = (dt) => ({ t: start.t + dt, x: start.x + v.x * dt, y: start.y + v.y * dt, d: 120 });
    // Both fingers' moves of one frame share its time: the midpoint moves half, then the rest.
    if (paired && samples.length) {
      const prev = samples.at(-1);
      const next = at(t);
      samples.push({ ...next, x: (prev.x + next.x) / 2, y: (prev.y + next.y) / 2 });
    }
    samples.push(at(t));
    t += 4 + rnd() * 46;
  }
  return { v, samples, lift: samples.at(-1).t + rnd() * GLIDE_STALE, paired };
});

const glides = Array.from({ length: 400 }, () => {
  const max = { x: rnd() < 0.5 ? 0 : rnd() * 3000, y: rnd() * 30000 };
  return {
    from: { x: rnd() * max.x, y: rnd() * max.y },
    velocity: { x: (rnd() * 2 - 1) * 5, y: (rnd() * 2 - 1) * 5 },
    min: { x: 0, y: 0 },
    max,
  };
});

describe('the release speed', () => {
  test('of fingers moving steadily is their speed, whatever the frame rate', () => {
    for (const [i, { v, samples, lift, paired }] of pans.entries()) {
      if (paired) continue;
      const got = releaseVelocity(samples, lift);
      assert.ok(close(got.x, v.x) && close(got.y, v.y), `case ${i}: ${JSON.stringify(got)} instead of ${JSON.stringify(v)}`);
    }
  });

  test('with one move per finger in a frame, is within a quarter of their speed', () => {
    for (const [i, { v, samples, lift, paired }] of pans.entries()) {
      if (!paired) continue;
      const got = releaseVelocity(samples, lift);
      const err = Math.hypot(got.x - v.x, got.y - v.y);
      assert.ok(err <= 0.25 * Math.hypot(v.x, v.y) + 1e-9, `case ${i}: ${JSON.stringify(got)} instead of ${JSON.stringify(v)}`);
    }
  });

  test('doesn’t depend on where on the screen or when the fingers moved', () => {
    for (const [i, { samples, lift }] of pans.entries()) {
      const moved = samples.map((s) => ({ ...s, t: s.t + 5000, x: s.x - 300, y: s.y + 77 }));
      const a = releaseVelocity(samples, lift);
      const b = releaseVelocity(moved, lift + 5000);
      assert.ok(close(a.x, b.x) && close(a.y, b.y), `case ${i}`);
    }
  });

  test('is none after any pause longer than GLIDE_STALE before lifting', () => {
    for (const [i, { samples }] of pans.entries()) {
      const pause = GLIDE_STALE + 0.001 + rnd() * 500;
      assert.deepEqual(releaseVelocity(samples, samples.at(-1).t + pause), { x: 0, y: 0 }, `case ${i}`);
    }
  });
});

describe('a glide', () => {
  test('is where stepping its friction a hundred times a millisecond puts it', () => {
    for (const [i, g] of glides.slice(0, 40).entries()) {
      const until = Math.min(glideDuration(Math.hypot(g.velocity.x, g.velocity.y)), 600);
      const open = { ...g, min: { x: -1e9, y: -1e9 }, max: { x: 1e9, y: 1e9 } };
      const dt = 0.01;
      const steps = Math.round(until / dt);
      const k = GLIDE_FRICTION ** dt;
      let p = { ...g.from };
      let v = { ...g.velocity };
      for (let n = 0; n < steps; n++) {
        p = { x: p.x + v.x * dt, y: p.y + v.y * dt };
        v = { x: v.x * k, y: v.y * k };
      }
      const at = glideAt(open, steps * dt);
      assert.ok(Math.abs(at.x - p.x) < 0.05 && Math.abs(at.y - p.y) < 0.05, `case ${i}: ${JSON.stringify(at)} vs ${JSON.stringify(p)}`);
    }
  });

  test('ends in the same place at 30, 60 or 120 frames a second, or with uneven frames', () => {
    for (const [i, g] of glides.entries()) {
      const ends = [1000 / 30, 1000 / 60, 1000 / 120, null].map((every) => {
        let t = 0;
        let p = glideAt(g, 0);
        while (!p.done && t < 60000) {
          t += every ?? 4 + rnd() * 60;
          p = glideAt(g, t);
        }
        return p;
      });
      for (const p of ends) assert.ok(close(p.x, ends[0].x, 1e-9) && close(p.y, ends[0].y, 1e-9) && p.done, `case ${i}: ${JSON.stringify(ends)}`);
    }
  });

  test('stays inside the scroll, never turns back and only slows down', () => {
    for (const [i, g] of glides.entries()) {
      let prev = glideAt(g, 0);
      let step = Infinity;
      for (let t = 10; t <= 4000; t += 10) {
        const p = glideAt(g, t);
        assert.ok(p.x >= g.min.x && p.x <= g.max.x && p.y >= g.min.y && p.y <= g.max.y, `case ${i} at ${t} ms: out of the scroll`);
        assert.ok((p.x - prev.x) * g.velocity.x >= 0 && (p.y - prev.y) * g.velocity.y >= 0, `case ${i} at ${t} ms: turned back`);
        const moved = Math.hypot(p.x - prev.x, p.y - prev.y);
        assert.ok(moved <= step + 1e-9, `case ${i} at ${t} ms: sped up`);
        step = moved;
        prev = p;
      }
    }
  });

  test('is over by glideDuration, after no more than glideDistance', () => {
    for (const [i, g] of glides.entries()) {
      const speed = Math.hypot(g.velocity.x, g.velocity.y);
      const end = glideAt(g, glideDuration(speed));
      assert.ok(end.done, `case ${i}`);
      assert.ok(Math.hypot(end.x - g.from.x, end.y - g.from.y) <= glideDistance(speed) + 1e-6, `case ${i}`);
      assert.deepEqual(glideAt(g, glideDuration(speed) + 1 + rnd() * 1e5), end, `case ${i}: moved after it ended`);
    }
  });

  test('that nothing stops goes glideDistance in the direction it was flung, and its last speed is GLIDE_STOP', () => {
    for (const [i, g] of glides.entries()) {
      const speed = Math.hypot(g.velocity.x, g.velocity.y);
      if (speed <= GLIDE_STOP) continue;
      const open = { ...g, min: { x: -1e9, y: -1e9 }, max: { x: 1e9, y: 1e9 } };
      const T = glideDuration(speed);
      const end = glideAt(open, T);
      const ux = g.velocity.x / speed;
      const uy = g.velocity.y / speed;
      const d = glideDistance(speed);
      assert.ok(close(end.x, g.from.x + ux * d, 1e-9) && close(end.y, g.from.y + uy * d, 1e-9), `case ${i}`);
      const h = 0.001;
      const last = Math.hypot(glideAt(open, T - h).x - glideAt(open, T - 2 * h).x, glideAt(open, T - h).y - glideAt(open, T - 2 * h).y) / h;
      assert.ok(Math.abs(last - GLIDE_STOP) < 1e-4, `case ${i}: ${last}`);
    }
  });
});
