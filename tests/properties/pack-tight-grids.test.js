import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { pack } from '../../src/core/pack.js';
import { prng } from '../support/prng.js';
import { assertValid, copies } from '../support/pack.js';

// Generated cases that surely fit: tight grids of equal pieces.
// `upright` are the pieces in the grid's orientation; `flipped`, rotated.
function gridCase(rnd) {
  const cols = 1 + Math.floor(rnd() * 5);
  const rows = 1 + Math.floor(rnd() * 6);
  const w = 20 + Math.round(rnd() * 80);
  const h = 20 + Math.round(rnd() * 80);
  const gap = rnd() < 0.5 ? 0 : 5;
  return {
    W: cols * w + (cols - 1) * gap,
    H: rows * h + (rows - 1) * gap,
    gap,
    upright: copies(cols * rows, w, h),
    flipped: copies(cols * rows, h, w),
  };
}

// Rows of pieces of equal height that add up exactly to the width, unrotated.
function shelfCase(rnd) {
  const W = 150 + Math.round(rnd() * 250);
  const gap = rnd() < 0.5 ? 0 : 5;
  const rows = 1 + Math.floor(rnd() * 5);
  const rects = [];
  let H = 0;
  for (let r = 0; r < rows; r++) {
    const h = 20 + Math.round(rnd() * 80);
    H += h + (r ? gap : 0);
    const n = 1 + Math.floor(rnd() * 4);
    let left = W - (n - 1) * gap;
    for (let i = 0; i < n && left > 0; i++) {
      const w = i === n - 1 ? left : Math.max(10, Math.round((left / (n - i)) * (0.6 + rnd() * 0.8)));
      left -= w;
      if (w > 0) rects.push({ id: rects.length, w, h });
    }
  }
  return { W, H, gap, rects };
}

describe('pack on tight layouts', () => {
  test('tight grids always fit (with and without rotation)', () => {
    // Before the fix about 1 in 3 failed: with free rotation the heuristic
    // rotated the first piece and then they did not all fit.
    for (let seed = 1; seed <= 300; seed++) {
      const { W, H, gap, upright, flipped } = gridCase(prng(seed * 7919));
      const label = `grid ${W}×${H} gap ${gap}, seed ${seed}`;
      assertValid(upright, W, H, pack(upright, W, H, { gap }), { gap }, label);
      assertValid(flipped, W, H, pack(flipped, W, H, { gap }), { gap }, `${label} (rotated)`);
      const noRotate = { gap, rotate: false };
      assertValid(upright, W, H, pack(upright, W, H, noRotate), noRotate, `${label} (no rotation)`);
    }
  });

  test('tight unrotated rows almost always fit', () => {
    // Quality regression: with free rotation about 28 % of these cases used to fail.
    let ok = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { W, H, gap, rects } = shelfCase(prng(seed * 104729));
      const res = pack(rects, W, H, { gap });
      if (res) {
        ok++;
        assertValid(rects, W, H, res, { gap }, `rows, seed ${seed}`);
      }
    }
    assert.ok(ok >= 291, `${ok} of 300 fit`);
  });
});
