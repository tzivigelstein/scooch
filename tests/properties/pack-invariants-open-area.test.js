import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { pack } from '../../src/core/pack.js';
import { prng } from '../support/prng.js';
import { assertValid, randomCase } from '../support/pack.js';

// Seeds 1–800 of randomCase are split by whether the case has obstacles, so
// the two halves run in parallel: the cases without obstacles here, the others
// in pack-invariants-obstacles.test.js.
const SEEDS = 800;

describe('pack invariants', () => {
  test('in an open area: whenever there is a result, every invariant holds', () => {
    let cases = 0;
    let packed = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { W, H, rects, opts } = randomCase(prng(seed));
      if (opts.obstacles.length) continue;
      cases++;
      const res = pack(rects, W, H, opts);
      if (res === null) continue;
      packed++;
      assertValid(rects, W, H, res, opts, `seed ${seed}`);
    }
    // The fuzz must not be trivial: a good share has to fit.
    assert.ok(packed > cases * 0.3, `only ${packed} of ${cases} packed`);
  });
});
