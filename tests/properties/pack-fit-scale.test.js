import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { pack, fitScale } from '../../src/core/pack.js';
import { prng } from '../support/prng.js';
import { assertValid, scaled } from '../support/pack.js';

describe('fitScale', () => {
  test('k always packs and 0.999·k almost always does', async (t) => {
    let smallerFails = 0;
    let scaledCases = 0;
    const CASES = 300;
    for (let seed = 1; seed <= CASES; seed++) {
      const rnd = prng(seed * 977);
      const W = 100 + rnd() * 300;
      const H = 100 + rnd() * 300;
      const n = 1 + Math.floor(rnd() * 25);
      const gap = rnd() < 0.3 ? 0 : rnd() * 8;
      const rotate = rnd() < 0.6;
      const rects = Array.from({ length: n }, (_, i) => ({ id: i, w: 10 + rnd() * W * 0.7, h: 10 + rnd() * H * 0.7 }));
      const obstacles =
        rnd() < 0.4 ? [{ x: rnd() * W, y: rnd() * H, w: rnd() * W * 0.3, h: rnd() * H * 0.3 }] : [];
      const opts = { gap, rotate, obstacles };
      const k = fitScale(rects, W, H, opts);
      assert.ok(k >= 0 && k <= 1, `seed ${seed}: k=${k}`);
      if (k === 0) continue;
      scaledCases++;
      const s = scaled(rects, k);
      assertValid(s, W, H, pack(s, W, H, opts), opts, `fitScale seed ${seed}, k=${k}`);
      if (!pack(scaled(rects, 0.999 * k), W, H, opts)) smallerFails++;
    }
    // The heuristic is not monotonic: in very tight layouts, shrinking a little
    // changes the decisions and sometimes it stops fitting (it did before the
    // changes too). It must be rare; what is guaranteed is the exact k.
    await t.annotate(`0.999·k did not fit in ${smallerFails} of ${scaledCases} cases`);
    assert.ok(smallerFails <= scaledCases * 0.05, `0.999·k failed ${smallerFails} of ${scaledCases}`);
  });
});
