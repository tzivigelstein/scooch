import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { GLIDE_FRICTION, GLIDE_STALE, GLIDE_STOP, GLIDE_WINDOW, glideAt, glideDistance, glideDuration, releaseVelocity } from '../../src/core/glide.js';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

/** Two fingers 100 px apart whose midpoint moves at (vx, vy) px per ms, sampled every `every` ms until `until`. */
const panSamples = (vx, vy, { every = 16, until = 160, d = () => 100 } = {}) =>
  Array.from({ length: Math.floor(until / every) + 1 }, (_, i) => ({ t: 1000 + i * every, x: 200 + vx * i * every, y: 400 + vy * i * every, d: d(i * every) }));

describe('releaseVelocity', () => {
  test('fingers moving at a steady speed lift at that speed', () => {
    const samples = panSamples(0.5, -1.25);
    const v = releaseVelocity(samples, samples.at(-1).t + 8);
    assert.ok(near(v.x, 0.5) && near(v.y, -1.25), JSON.stringify(v));
  });

  test('only the last GLIDE_WINDOW ms count: a slow start doesn’t hold back a fast end', () => {
    const slow = panSamples(0.1, 0, { until: 400 });
    const last = slow.at(-1);
    const fast = Array.from({ length: 7 }, (_, i) => ({ t: last.t + (i + 1) * 16, x: last.x + (i + 1) * 32, y: last.y, d: 100 }));
    const samples = [...slow, ...fast];
    assert.ok(fast.at(-1).t - fast[0].t <= GLIDE_WINDOW);
    const v = releaseVelocity(samples, samples.at(-1).t);
    assert.ok(near(v.x, 2), `${v.x}`);
  });

  test('two samples at the same moment (both fingers of one frame) count as they are', () => {
    const samples = [
      { t: 0, x: 0, y: 0, d: 100 },
      { t: 16, x: 8, y: 0, d: 100 },
      { t: 16, x: 16, y: 0, d: 100 },
      { t: 32, x: 24, y: 0, d: 100 },
      { t: 32, x: 32, y: 0, d: 100 },
    ];
    const v = releaseVelocity(samples, 40);
    assert.ok(v.x > 0.8 && v.x < 1.2, `${v.x}`);
  });

  test('fingers that held still for more than GLIDE_STALE ms before lifting were not flung', () => {
    const samples = panSamples(2, 0);
    const last = samples.at(-1).t;
    assert.ok(releaseVelocity(samples, last + GLIDE_STALE).x > 0, 'just in time');
    assert.deepEqual(releaseVelocity(samples, last + GLIDE_STALE + 1), { x: 0, y: 0 });
  });

  test('fewer than two recent samples, or none, give no speed', () => {
    assert.deepEqual(releaseVelocity([], 0), { x: 0, y: 0 });
    assert.deepEqual(releaseVelocity([{ t: 0, x: 0, y: 0, d: 100 }], 0), { x: 0, y: 0 });
    const old = [{ t: 0, x: 0, y: 0, d: 100 }, { t: 200, x: 400, y: 0, d: 100 }];
    assert.deepEqual(releaseVelocity(old, 200), { x: 0, y: 0 }, 'the first one is out of the window');
    assert.deepEqual(releaseVelocity([{ t: 5, x: 0, y: 0 }, { t: 5, x: 30, y: 0 }], 5), { x: 0, y: 0 }, 'no time between them');
  });

  test('fingers spreading or closing faster than their midpoint moves were zooming: no glide', () => {
    // One finger still, the other moving away from it at 2 px per ms: the midpoint moves at 1, the distance at 2.
    const zoom = panSamples(1, 0, { d: (t) => 100 + 2 * t });
    assert.deepEqual(releaseVelocity(zoom, zoom.at(-1).t), { x: 0, y: 0 });
    const closing = panSamples(-1, 0, { d: (t) => 400 - 2 * t });
    assert.deepEqual(releaseVelocity(closing, closing.at(-1).t), { x: 0, y: 0 });
  });

  test('a pan whose fingers drift a little apart still glides', () => {
    const samples = panSamples(0, 1.5, { d: (t) => 100 + 0.1 * t });
    assert.ok(near(releaseVelocity(samples, samples.at(-1).t).y, 1.5));
  });

  test('without the distance between the fingers, only the midpoint counts', () => {
    const samples = panSamples(1, 0).map(({ t, x, y }) => ({ t, x, y }));
    assert.ok(near(releaseVelocity(samples, samples.at(-1).t).x, 1));
  });
});

describe('glideAt', () => {
  const open = { min: { x: 0, y: 0 }, max: { x: 1e6, y: 1e6 } };
  const TAU = -1 / Math.log(GLIDE_FRICTION);

  test('starts where it was, at the release speed', () => {
    const g = { from: { x: 500, y: 600 }, velocity: { x: 1, y: -2 }, ...open };
    const at0 = glideAt(g, 0);
    assert.deepEqual(at0, { x: 500, y: 600, done: false });
    const at1 = glideAt(g, 0.001);
    assert.ok(near((at1.x - 500) / 0.001, 1, 1e-4) && near((at1.y - 600) / 0.001, -2, 1e-4));
  });

  test('slows down by GLIDE_FRICTION every ms', () => {
    const g = { from: { x: 0, y: 0 }, velocity: { x: 0, y: 1 }, ...open };
    const speedAt = (t) => (glideAt(g, t + 0.0005).y - glideAt(g, t - 0.0005).y) / 0.001;
    assert.ok(near(speedAt(100), GLIDE_FRICTION ** 100, 1e-6));
    assert.ok(near(speedAt(400) / speedAt(300), GLIDE_FRICTION ** 100, 1e-6));
  });

  test('ends when its speed falls to GLIDE_STOP, after glideDistance and glideDuration, and stays there', () => {
    const g = { from: { x: 0, y: 1000 }, velocity: { x: 0, y: 1.5 }, ...open };
    const T = glideDuration(1.5);
    assert.ok(near(GLIDE_FRICTION ** T * 1.5, GLIDE_STOP, 1e-9));
    assert.equal(glideAt(g, T - 1).done, false);
    const end = glideAt(g, T);
    assert.equal(end.done, true);
    assert.ok(near(end.y - 1000, glideDistance(1.5), 1e-9));
    assert.ok(near(glideDistance(1.5), TAU * (1.5 - GLIDE_STOP), 1e-9));
    assert.deepEqual(glideAt(g, T + 5000), end);
  });

  test('goes in a straight line: both axes slow down together and stop at the same time', () => {
    const g = { from: { x: 100, y: 100 }, velocity: { x: 0.3, y: -0.9 }, min: { x: -1e6, y: -1e6 }, max: { x: 1e6, y: 1e6 } };
    for (const t of [10, 200, 900, 5000]) {
      const p = glideAt(g, t);
      assert.ok(near((p.x - 100) * -3, p.y - 100, 1e-9), `at ${t} ms`);
    }
  });

  test('a release at or below GLIDE_STOP doesn’t move at all', () => {
    assert.deepEqual(glideAt({ from: { x: 3, y: 4 }, velocity: { x: 0, y: GLIDE_STOP }, ...open }, 50), { x: 3, y: 4, done: true });
    assert.deepEqual(glideAt({ from: { x: 3, y: 4 }, velocity: { x: 0, y: 0 }, ...open }, 0), { x: 3, y: 4, done: true });
    assert.equal(glideDistance(GLIDE_STOP), 0);
    assert.equal(glideDuration(0), 0);
  });

  test('stops at the end of the scroll and stays there, without bouncing back', () => {
    const g = { from: { x: 0, y: 150 }, velocity: { x: 0, y: -2 }, min: { x: 0, y: 0 }, max: { x: 0, y: 5000 } };
    let hit = -1;
    let last = 150;
    for (let t = 0; t <= 3000; t += 7) {
      const p = glideAt(g, t);
      assert.ok(p.y <= last, `at ${t} ms it went back to ${p.y}`);
      last = p.y;
      if (p.y === 0 && hit < 0) {
        hit = t;
        assert.equal(p.done, true, 'over as soon as it reached the end');
      }
    }
    assert.ok(hit > 0 && hit < glideDuration(2));
  });

  test('an axis that reaches its end stops while the other goes on', () => {
    const g = { from: { x: 40, y: 1000 }, velocity: { x: -1, y: 1 }, min: { x: 0, y: 0 }, max: { x: 300, y: 1e6 } };
    const p = glideAt(g, 400);
    assert.equal(p.x, 0);
    assert.ok(p.y > 1000 + 40 && !p.done);
  });

  test('sideways, where the stage can’t scroll, it stays put', () => {
    const p = glideAt({ from: { x: 0, y: 0 }, velocity: { x: 1, y: 1 }, min: { x: 0, y: 0 }, max: { x: 0, y: 1e6 } }, 300);
    assert.equal(p.x, 0);
    assert.ok(p.y > 0);
  });

  test('a time before the start counts as the start', () => {
    const g = { from: { x: 0, y: 7 }, velocity: { x: 0, y: 1 }, ...open };
    assert.deepEqual(glideAt(g, -20), glideAt(g, 0));
  });
});
