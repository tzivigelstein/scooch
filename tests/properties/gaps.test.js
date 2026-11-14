import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { neighborGaps } from '../../src/core/gaps.js';
import { prng } from '../support/prng.js';

// The gaps between neighbors over generated layouts of boxes that don't
// overlap (like the pieces of a sheet). Exact cases: tests/core/gaps.test.js.

const EPS = 1e-6;
const crosses = (a, b) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;

/** Up to `n` boxes on a 210 × 297 sheet, none overlapping another (some touch: they are on a 5 mm grid). */
function layout(rnd, n) {
  const boxes = [];
  for (let tries = 0; boxes.length < n && tries < n * 20; tries++) {
    const box = { x: Math.round(rnd() * 40) * 5, y: Math.round(rnd() * 56) * 5, w: 5 + Math.round(rnd() * 8) * 5, h: 5 + Math.round(rnd() * 8) * 5 };
    if (!boxes.some((other) => crosses(box, other))) boxes.push(box);
  }
  return boxes;
}

describe('neighborGaps over generated layouts', () => {
  test('every gap lies between two facing boxes, is no wider than `max` and crosses no box', () => {
    const rnd = prng(41);
    for (let n = 0; n < 300; n++) {
      const boxes = layout(rnd, 2 + Math.floor(rnd() * 14));
      const max = Math.round(rnd() * 20);
      for (const gap of neighborGaps(boxes, max)) {
        const label = `case ${n}: ${JSON.stringify(gap)}`;
        assert.ok(Math.min(gap.w, gap.h) <= max + EPS, `${label} no wider than ${max}`);
        assert.ok(Math.max(gap.w, gap.h) > EPS, `${label} has a length`);
        assert.ok(!boxes.some((box) => crosses(gap, box)), `${label} crosses no box`);
        const sideways = gap.h > EPS && boxes.some((a) => Math.abs(a.x + a.w - gap.x) < EPS) && boxes.some((b) => Math.abs(b.x - (gap.x + gap.w)) < EPS);
        const stacked = gap.w > EPS && boxes.some((a) => Math.abs(a.y + a.h - gap.y) < EPS) && boxes.some((b) => Math.abs(b.y - (gap.y + gap.h)) < EPS);
        assert.ok(sideways || stacked, `${label} starts at one box's edge and ends at another's`);
      }
    }
  });

  test('a neighbor within `max` on the right, facing the box with nothing between: that exact gap', () => {
    const rnd = prng(42);
    for (let n = 0; n < 300; n++) {
      const a = { x: 20 + rnd() * 50, y: 20 + rnd() * 50, w: 10 + rnd() * 30, h: 10 + rnd() * 30 };
      const d = rnd() * 10;
      const h = 10 + rnd() * 30;
      // Spans that share at least 1 mm.
      const b = { x: a.x + a.w + d, y: a.y - h + 1 + rnd() * (a.h + h - 2), w: 10 + rnd() * 30, h };
      const gaps = neighborGaps([a, b], 10);
      assert.equal(gaps.length, 1, `case ${n}`);
      assert.ok(Math.abs(gaps[0].w - d) < 1e-9 && Math.abs(gaps[0].x - (a.x + a.w)) < 1e-9, `case ${n}: the gap is ${d} mm wide`);
    }
  });
});
