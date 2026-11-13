import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { pack, fitScale, score, fixedCandidates } from '../../src/core/pack.js';
import { prng, shuffled } from '../support/prng.js';
import { assertValid, randomCase } from '../support/pack.js';

// The three tests walk the same first seeds of randomCase: each case and its
// `pack` result are computed once (pack is deterministic and doesn't touch its
// input, which the tests below and tests/core/pack.test.js check).
const cases = new Map();
function packedCase(seed) {
  if (!cases.has(seed)) {
    const c = randomCase(prng(seed));
    cases.set(seed, { ...c, res: pack(c.rects, c.W, c.H, c.opts) });
  }
  return cases.get(seed);
}

describe('pack: picks the best layout', () => {
  test('scores as well as or better than every fixed combination', () => {
    let compared = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const { W, H, rects, opts, res } = packedCase(seed);
      const candidates = fixedCandidates(rects, W, H, opts);
      assert.equal(res === null, candidates.length === 0, `seed ${seed}`);
      if (!res) continue;
      const best = score(res, rects, W, H);
      for (const c of candidates) {
        assertValid(rects, W, H, c, opts, `candidate, seed ${seed}`);
        assert.ok(best <= score(c, rects, W, H) + 1e-9, `seed ${seed}`);
        compared++;
      }
    }
    assert.ok(compared > 2000, `only ${compared} comparisons`);
  });

  test('deterministic and independent of the input order', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { W, H, rects, opts, res } = packedCase(seed);
      const again = pack(structuredClone(rects), W, H, structuredClone(opts));
      const reordered = pack(shuffled(rects, prng(seed + 1)), W, H, opts);
      assert.deepEqual(again, res, `seed ${seed}`);
      assert.deepEqual(reordered, res, `seed ${seed} (shuffled)`);
    }
  });

  test('fitScale gives exactly 1 when pack fits', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { W, H, rects, opts, res } = packedCase(seed);
      const fits = res !== null;
      const k = fitScale(rects, W, H, opts);
      assert.equal(k === 1, fits, `seed ${seed}: k=${k}`);
    }
  });
});
