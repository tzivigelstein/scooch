import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { packSheets, packInto, countWork } from '../../src/core/pack.js';
import { prng } from '../support/prng.js';
import { assertInto, assertSheets, randomPieces } from '../support/pack.js';

// Work budgets: the search counts its placement passes (`attempts`: greedy
// fills and `pack` passes) and the free spaces it examines (`spots`, what its
// time grows with) through the test-only `countWork` seam. The counts are
// deterministic, so a slower search fails here whatever the machine's load;
// each budget is about 1.25 × the current count, so doubling the work fails
// while small tuning passes. One generous wall-clock guard (3 × the old
// budget) catches what the counters can't see.

// A4 with 10 mm margins.
const W = 190;
const H = 277;

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

describe('packSheets work', () => {
  test('packSheets with 60 pieces stays within its work budget', async (t) => {
    const rects = randomPieces(prng(60), 60, 70);
    // Now 2400 attempts and 937 599 spots.
    const { result: res, work } = counted(() => packSheets(rects, W, H, { gap: 3 }));
    await t.annotate(`packSheets 60 pieces: ${work.attempts} attempts, ${work.spots} spots, ${res.sheets.length} sheets`);
    assertSheets(rects, W, H, res, { gap: 3 });
    assertWithin(work, { attempts: 3000, spots: 1_200_000 }, 'packSheets 60 pieces');
  });

  test('packSheets with 200 pieces stays within its work budget', async (t) => {
    // Now 1556 attempts and 12 723 378 spots with small pieces, 7200 and 9 726 609 with larger ones.
    const budgets = {
      25: { attempts: 2000, spots: 16_000_000 },
      80: { attempts: 9000, spots: 12_500_000 },
    };
    for (const maxSide of [25, 80]) {
      const rects = randomPieces(prng(200 + maxSide), 200, maxSide);
      const { result: res, work } = counted(() => packSheets(rects, W, H, { gap: 3 }));
      const label = `packSheets 200 pieces (up to ${maxSide + 5} mm)`;
      await t.annotate(`${label}: ${work.attempts} attempts, ${work.spots} spots, ${res.sheets.length} sheets`);
      assertSheets(rects, W, H, res, { gap: 3 });
      assertWithin(work, budgets[maxSide], label);
    }
  });

  test('packInto with 60 new pieces on 3 occupied sheets stays within its work budget', async (t) => {
    const rnd = prng(61);
    const sheets = Array.from({ length: 3 }, () =>
      Array.from({ length: 6 }, () => ({ x: rnd() * 150, y: rnd() * 230, w: 10 + rnd() * 40, h: 10 + rnd() * 40 }))
    );
    const rects = randomPieces(rnd, 60, 50);
    // Now 1600 attempts and 1 928 744 spots.
    const { result: res, work } = counted(() => packInto(rects, W, H, { gap: 3, sheets }));
    await t.annotate(`packInto 60 pieces: ${work.attempts} attempts, ${work.spots} spots`);
    assertInto(rects, W, H, sheets, res, { gap: 3 });
    assertWithin(work, { attempts: 2000, spots: 2_500_000 }, 'packInto 60 pieces');
  });
});

describe('packSheets time', () => {
  test('packSheets with 200 pieces in under 6 s', async (t) => {
    for (const maxSide of [25, 80]) {
      const rects = randomPieces(prng(200 + maxSide), 200, maxSide);
      const t0 = performance.now();
      const res = packSheets(rects, W, H, { gap: 3 });
      const ms = performance.now() - t0;
      await t.annotate(`packSheets 200 pieces (up to ${maxSide + 5} mm): ${ms.toFixed(0)} ms, ${res.sheets.length} sheets`);
      assertSheets(rects, W, H, res, { gap: 3 });
      assert.ok(ms < 6000, `took ${ms.toFixed(0)} ms`);
    }
  });
});
