import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { packInto } from '../../src/core/pack.js';
import { prng, shuffled } from '../support/prng.js';
import { assertInto, randomPieces } from '../support/pack.js';

// A4 with 10 mm margins.
const W = 190;
const H = 277;

describe('packInto', () => {
  test('fuzz: never overlaps obstacles and keeps the gap', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rnd = prng(seed * 13);
      const gap = rnd() < 0.3 ? 0 : Math.round(rnd() * 8);
      const rotate = rnd() < 0.7;
      const sheets = Array.from({ length: Math.floor(rnd() * 3) }, () =>
        Array.from({ length: Math.floor(rnd() * 6) }, () => ({
          x: -20 + rnd() * W,
          y: -20 + rnd() * H,
          w: 5 + rnd() * 90,
          h: 5 + rnd() * 90,
        }))
      );
      const rects = randomPieces(rnd, 1 + Math.floor(rnd() * 25), 100);
      const opts = { gap, rotate };
      const res = packInto(rects, W, H, { ...opts, sheets });
      assertInto(rects, W, H, sheets, res, opts, `seed ${seed}`);
      assert.deepEqual(res.unplaced, [], `seed ${seed}`);
    }
  });

  test('deterministic and independent of the input order', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rnd = prng(seed * 17);
      const sheets = [[{ x: 20, y: 30, w: 80, h: 60 }], [{ x: 100, y: 0, w: 90, h: 277 }]];
      const rects = randomPieces(rnd, 5 + Math.floor(rnd() * 20), 80);
      const opts = { gap: 4, sheets };
      const res = packInto(rects, W, H, opts);
      assert.deepEqual(packInto(structuredClone(rects), W, H, structuredClone(opts)), res, `seed ${seed}`);
      assert.deepEqual(packInto(shuffled(rects, prng(seed)), W, H, opts), res, `seed ${seed} (shuffled)`);
    }
  });
});
