import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { EPS, overlaps, overlapsAny, nearestFree, maxGrowth, nextFreeForGroup, nearestFreeOffset, groupScaleRange } from '../../src/core/collide.js';
import { prng } from '../support/prng.js';

const r = (x, y, w, h, id) => ({ id, x, y, w, h });

describe('nearestFree', () => {
  test('the result never overlaps and is the closest among a dense test grid (fuzz)', () => {
    const rnd = prng(7);
    for (let n = 0; n < 150; n++) {
      const others = Array.from({ length: 1 + Math.floor(rnd() * 8) }, (_, i) =>
        r(Math.round(rnd() * 80), Math.round(rnd() * 80), 5 + Math.round(rnd() * 30), 5 + Math.round(rnd() * 30), i)
      );
      const rect = r(Math.round(rnd() * 80), Math.round(rnd() * 80), 5 + Math.round(rnd() * 20), 5 + Math.round(rnd() * 20));
      const spot = nearestFree(rect, others);
      assert.ok(spot, 'without bounds there is always room');
      assert.equal(overlapsAny({ ...spot, w: rect.w, h: rect.h }, others), false, `overlaps in case ${n}`);
      // No free whole position is closer (with a margin for the discretization).
      const best = Math.hypot(spot.x - rect.x, spot.y - rect.y);
      for (let x = -40; x <= 140; x++) {
        for (let y = -40; y <= 140; y++) {
          const d = Math.hypot(x - rect.x, y - rect.y);
          if (d >= best - 1e-9) continue;
          assert.equal(
            overlapsAny({ x, y, w: rect.w, h: rect.h }, others),
            true,
            `case ${n}: (${x}, ${y}) is free and closer than ${JSON.stringify(spot)}`
          );
        }
      }
    }
  });
});

describe('maxGrowth', () => {
  test('growing up to the limit never overlaps (fuzz)', () => {
    const rnd = prng(3);
    for (let n = 0; n < 300; n++) {
      const anchor = n % 2 ? 'center' : 'top-left';
      const rect = r(20 + rnd() * 50, 20 + rnd() * 50, 2 + rnd() * 20, 2 + rnd() * 20);
      const others = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () =>
        r(rnd() * 120, rnd() * 120, 2 + rnd() * 25, 2 + rnd() * 25)
      ).filter((o) => !overlaps(rect, o));
      const k = maxGrowth(rect, others, anchor);
      if (!Number.isFinite(k)) continue;
      const grow = (f) =>
        anchor === 'center'
          ? r(rect.x + (rect.w * (1 - f)) / 2, rect.y + (rect.h * (1 - f)) / 2, rect.w * f, rect.h * f)
          : r(rect.x, rect.y, rect.w * f, rect.h * f);
      assert.equal(overlapsAny(grow(k), others), false, `case ${n}: at the limit it does not overlap`);
      assert.equal(overlapsAny(grow(k * 1.01 + 0.01), others), true, `case ${n}: past the limit it overlaps`);
    }
  });
});

describe('groups', () => {
  test('nextFreeForGroup: never leaves pieces overlapping (fuzz)', () => {
    const rnd = prng(5);
    for (let n = 0; n < 200; n++) {
      const rects = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, i) => r(rnd() * 100, rnd() * 100, 2 + rnd() * 20, 2 + rnd() * 20, `g${i}`));
      const others = Array.from({ length: Math.floor(rnd() * 8) }, (_, i) => r(rnd() * 150, rnd() * 150, 2 + rnd() * 20, 2 + rnd() * 20, `o${i}`));
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][n % 4];
      const res = nextFreeForGroup([{ rects, others }], dx, dy);
      for (const g of rects) assert.equal(overlapsAny(r(g.x + res.dx, g.y + res.dy, g.w, g.h), others), false, `case ${n}`);
      assert.ok(dx ? Math.sign(res.dx) === dx && res.dy === 0 : Math.sign(res.dy) === dy && res.dx === 0, `case ${n}`);
    }
  });

  test('nearestFreeOffset with a step: always a multiple of the step, and free (fuzz)', () => {
    const rnd = prng(23);
    for (let n = 0; n < 100; n++) {
      const group = [r(rnd() * 100, rnd() * 100, 5 + rnd() * 20, 5 + rnd() * 20, 'g')];
      const obstacles = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => r(rnd() * 120, rnd() * 120, 5 + rnd() * 20, 5 + rnd() * 20, `o${i}`));
      const step = [1, 3.175, 5][n % 3];
      const off = nearestFreeOffset([{ rects: group, others: obstacles }], { step });
      if (!off) continue;
      for (const v of [off.dx, off.dy]) assert.ok(Math.abs(v / step - Math.round(v / step)) < 1e-6, `case ${n}: ${v}`);
      assert.equal(overlapsAny(r(group[0].x + off.dx, group[0].y + off.dy, group[0].w, group[0].h), obstacles), false, `case ${n}`);
    }
  });

  test('groupScaleRange: nothing overlaps within the range (fuzz)', () => {
    const rnd = prng(17);
    for (let n = 0; n < 200; n++) {
      const rects = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => r(rnd() * 100, rnd() * 100, 2 + rnd() * 20, 2 + rnd() * 20));
      const others = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => r(rnd() * 150, rnd() * 150, 2 + rnd() * 20, 2 + rnd() * 20)).filter((o) => !overlapsAny(o, rects));
      const anchor = { x: rnd() * 100, y: rnd() * 100 };
      const { min, max } = groupScaleRange(rects, others, anchor);
      const at = (k) => rects.map((g) => r(anchor.x + (g.x - anchor.x) * k, anchor.y + (g.y - anchor.y) * k, g.w * k, g.h * k));
      for (const k of [min, (min + 1) / 2, 1, Math.min(max, 5), (1 + Math.min(max, 5)) / 2].filter((k) => k > 0 && Number.isFinite(k))) {
        for (const g of at(k)) assert.equal(overlapsAny(g, others, EPS + 1e-7), false, `case ${n}, k ${k}`);
      }
      if (Number.isFinite(max)) assert.ok(at(max * (1 + 1e-7)).some((g) => overlapsAny(g, others)), `case ${n}: past the maximum it overlaps`);
    }
  });
});
