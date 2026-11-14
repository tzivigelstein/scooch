import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { ZOOM_MAX, ZOOM_MIN, fromPercent, pinchSpan, pinchView, toPercent } from '../../src/core/zoom.js';
import { prng } from '../support/prng.js';

// Two fingers anywhere on a phone or a tablet, a step that spreads them up to
// ×4 or closes them to ×¼ (and sometimes not at all), a zoom inside the range
// or a fitted one outside it, and any scroll.
const rnd = prng(390);
const point = () => ({ x: rnd() * 1200, y: rnd() * 900 });
const cases = Array.from({ length: 600 }, () => {
  const before = [point(), point()];
  const mid = pinchSpan(before);
  const k = rnd() < 0.15 ? 1 : 4 ** (rnd() * 2 - 1);
  const shift = { x: rnd() * 300 - 150, y: rnd() * 300 - 150 };
  const turn = rnd() * Math.PI;
  // The fingers turned and scaled around their midpoint, which moved by `shift`.
  const after = before.map((p) => {
    const dx = (p.x - mid.x) * k;
    const dy = (p.y - mid.y) * k;
    return { x: mid.x + shift.x + dx * Math.cos(turn) - dy * Math.sin(turn), y: mid.y + shift.y + dx * Math.sin(turn) + dy * Math.cos(turn) };
  });
  const pct = rnd() < 0.1 ? 2 + rnd() * 8 : ZOOM_MIN + rnd() * (ZOOM_MAX - ZOOM_MIN);
  return { before, after, view: { zoom: fromPercent(pct), scroll: { x: rnd() * 4000 - 500, y: rnd() * 20000 - 500 } } };
});

/** The content (mm from its origin) under window point p. */
const under = (view, p) => ({ x: (view.scroll.x + p.x) / view.zoom, y: (view.scroll.y + p.y) / view.zoom });
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

describe('a pinch step', () => {
  test('keeps the content under the fingers’ midpoint under their midpoint, at whatever zoom it ends', () => {
    for (const [i, { before, after, view }] of cases.entries()) {
      const next = pinchView(before, after, view);
      const was = under(view, pinchSpan(before));
      const is = under(next, pinchSpan(after));
      assert.ok(close(was.x, is.x) && close(was.y, is.y), `case ${i}: ${JSON.stringify(was)} → ${JSON.stringify(is)}`);
    }
  });

  test('zooms as much as the fingers spread or close, unless that leaves the range', () => {
    for (const [i, { before, after, view }] of cases.entries()) {
      const next = pinchView(before, after, view);
      const wanted = toPercent(view.zoom) * (pinchSpan(after).d / pinchSpan(before).d);
      if (wanted >= ZOOM_MIN && wanted <= ZOOM_MAX) assert.ok(close(toPercent(next.zoom), wanted), `case ${i}: ${toPercent(next.zoom)} % instead of ${wanted} %`);
    }
  });

  test('never leaves the range, nor goes further out of it than the zoom it starts from', () => {
    for (const [i, { before, after, view }] of cases.entries()) {
      const pct = toPercent(view.zoom);
      const next = toPercent(pinchView(before, after, view).zoom);
      assert.ok(next >= Math.min(ZOOM_MIN, pct) - 1e-9 && next <= Math.max(ZOOM_MAX, pct) + 1e-9, `case ${i}: ${pct} % → ${next} %`);
    }
  });

  test('spreading never zooms out and closing never zooms in', () => {
    for (const [i, { before, after, view }] of cases.entries()) {
      const next = pinchView(before, after, view).zoom;
      const spread = pinchSpan(after).d - pinchSpan(before).d;
      if (spread > 0) assert.ok(next >= view.zoom, `case ${i}: spreading went from ${view.zoom} to ${next}`);
      if (spread < 0) assert.ok(next <= view.zoom, `case ${i}: closing went from ${view.zoom} to ${next}`);
    }
  });

  test('two steps end where one step to the same fingers would, inside the range', () => {
    for (const [i, { before, after, view }] of cases.entries()) {
      const middle = [
        { x: (before[0].x + after[0].x) / 2 + 13, y: (before[0].y + after[0].y) / 2 - 7 },
        { x: (before[1].x + after[1].x) / 2 - 5, y: (before[1].y + after[1].y) / 2 + 11 },
      ];
      const once = pinchView(before, after, view);
      const half = pinchView(before, middle, view);
      const twice = pinchView(middle, after, half);
      const inRange = [half, once].every((v) => toPercent(v.zoom) > ZOOM_MIN && toPercent(v.zoom) < ZOOM_MAX);
      if (!inRange) continue;
      assert.ok(close(once.zoom, twice.zoom), `case ${i}: zoom ${once.zoom} vs ${twice.zoom}`);
      assert.ok(close(once.scroll.x, twice.scroll.x) && close(once.scroll.y, twice.scroll.y), `case ${i}: scroll ${JSON.stringify(once.scroll)} vs ${JSON.stringify(twice.scroll)}`);
    }
  });

  test('fingers that only move together pan: the same zoom, bit for bit, and the scroll moves against them', () => {
    for (const [i, { before, view }] of cases.entries()) {
      const shift = { x: (i % 7) * 23.3 - 70.1, y: (i % 5) * 31.7 - 60.9 };
      const after = before.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y }));
      const next = pinchView(before, after, view);
      assert.equal(next.zoom, view.zoom, `case ${i}`);
      assert.ok(close(next.scroll.x, view.scroll.x - shift.x) && close(next.scroll.y, view.scroll.y - shift.y), `case ${i}: ${JSON.stringify(next.scroll)}`);
    }
  });
});
