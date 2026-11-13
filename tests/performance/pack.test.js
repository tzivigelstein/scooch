import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { pack, fitScale, countWork } from '../../src/core/pack.js';
import { prng } from '../support/prng.js';
import { assertValid, scaled } from '../support/pack.js';

// Work budgets: the search counts its placement passes (`attempts`) and the
// free spaces it examines (`spots`, what its time grows with) through the
// test-only `countWork` seam. The counts are deterministic, so a slower search
// fails here whatever the machine's load; each budget is about 1.25 × the
// current count, so doubling the work fails while small tuning passes. One
// generous wall-clock guard (3 × the old budget) catches what the counters
// can't see.

function counted(run) {
  const work = { attempts: 0, spots: 0 };
  countWork(work);
  try {
    return { result: run(), work };
  } finally {
    countWork(null);
  }
}

function assertWithin(work, budget, label) {
  assert.ok(work.attempts <= budget.attempts, `${label}: ${work.attempts} attempts > ${budget.attempts}`);
  assert.ok(work.spots <= budget.spots, `${label}: ${work.spots} spots > ${budget.spots}`);
}

const sixty = () => {
  const rnd = prng(60);
  const rects = Array.from({ length: 60 }, (_, i) => ({ id: i, w: 5 + rnd() * 25, h: 5 + rnd() * 25 }));
  return { rects, opts: { gap: 3, obstacles: [{ x: 40, y: 60, w: 60, h: 40 }] } };
};

const twoHundred = () => {
  const rnd = prng(42);
  const rects = Array.from({ length: 200 }, (_, i) => ({ id: i, w: 5 + rnd() * 40, h: 5 + rnd() * 40 }));
  return { rects, opts: { gap: 3, obstacles: [{ x: 100, y: 100, w: 200, h: 150 }] } };
};

describe('pack work', () => {
  test('pack with 60 pieces on an A4 stays within its work budget', async (t) => {
    const { rects, opts } = sixty();
    // Now 480 attempts (80 fixed combinations + 400 perturbed orders) and 1 167 804 spots.
    const { result, work } = counted(() => pack(rects, 190, 277, opts));
    await t.annotate(`pack 60 pieces: ${work.attempts} attempts, ${work.spots} spots`);
    assertValid(rects, 190, 277, result, opts);
    assertWithin(work, { attempts: 600, spots: 1_500_000 }, 'pack 60 pieces');
  });

  test('pack with 200 pieces stays within its work budget', async (t) => {
    const { rects, opts } = twoHundred();
    // Now 180 attempts (80 fixed + 100 perturbed: fewer with more pieces) and 4 580 548 spots.
    const { result, work } = counted(() => pack(rects, 1000, 700, opts));
    await t.annotate(`pack 200 pieces: ${work.attempts} attempts, ${work.spots} spots`);
    assertValid(rects, 1000, 700, result, opts);
    assertWithin(work, { attempts: 225, spots: 5_800_000 }, 'pack 200 pieces');
  });

  test('fitScale with 100 pieces stays within its work budget', async (t) => {
    const rnd = prng(7);
    const rects = Array.from({ length: 100 }, (_, i) => ({ id: i, w: 20 + rnd() * 60, h: 20 + rnd() * 60 }));
    const opts = { gap: 3, obstacles: [{ x: 50, y: 50, w: 100, h: 80 }] };
    // Now 697 attempts (17 fits over up to 80 fixed combinations each) and 2 842 251 spots.
    const { result: k, work } = counted(() => fitScale(rects, 320, 450, opts));
    await t.annotate(`fitScale 100 pieces: ${work.attempts} attempts, ${work.spots} spots (k=${k.toFixed(4)})`);
    assert.ok(k > 0 && k < 1);
    const s = scaled(rects, k);
    assertValid(s, 320, 450, pack(s, 320, 450, opts), opts);
    assertWithin(work, { attempts: 880, spots: 3_600_000 }, 'fitScale 100 pieces');
  });
});

describe('pack time', () => {
  test('pack with 200 pieces in under 4.5 s', async (t) => {
    const { rects, opts } = twoHundred();
    const t0 = performance.now();
    const res = pack(rects, 1000, 700, opts);
    const ms = performance.now() - t0;
    await t.annotate(`pack 200 pieces: ${ms.toFixed(0)} ms`);
    assertValid(rects, 1000, 700, res, opts);
    assert.ok(ms < 4500, `took ${ms.toFixed(0)} ms`);
  });
});
