import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { pack, packSheets, score } from '../../src/core/pack.js';
import { prng, shuffled } from '../support/prng.js';
import { areaBound, assertSheets, copies, randomPieces } from '../support/pack.js';

// A4 with 10 mm margins.
const W = 190;
const H = 277;

describe('packSheets', () => {
  test('fuzz: invariants, the area bound and the quality of each sheet', () => {
    let sheets = 0;
    let bound = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = prng(seed * 31);
      const n = 1 + Math.floor(rnd() * 40);
      const maxSide = 20 + rnd() * 100;
      const gap = rnd() < 0.3 ? 0 : Math.round(rnd() * 6);
      const rotate = rnd() < 0.7;
      const rects = randomPieces(rnd, n, maxSide);
      const opts = { gap, rotate };
      const label = `seed ${seed}`;
      const res = packSheets(rects, W, H, opts);
      assertSheets(rects, W, H, res, opts, label);
      assert.deepEqual(res.unplaced, [], label);
      const lb = areaBound(rects, W, H, gap);
      // Pieces of up to ~1/2 of the sheet: at most one sheet more than the bound.
      assert.ok(res.sheets.length <= lb + 1, `${label}: ${res.sheets.length} sheets, bound ${lb}`);
      sheets += res.sheets.length;
      bound += lb;
      // Each sheet at least as good as `pack` with the same pieces.
      for (const sheet of res.sheets) {
        const mine = sheet.map((p) => rects.find((r) => r.id === p.id));
        const alone = pack(mine, W, H, opts);
        if (alone) assert.ok(score(sheet, mine, W, H) <= score(alone, mine, W, H) + 1e-9, label);
      }
    }
    assert.ok(sheets <= bound * 1.1, `${sheets} sheets in all for a bound of ${bound}`);
  });

  test('small pieces: as many sheets as the area bound', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rnd = prng(seed * 7);
      const rects = randomPieces(rnd, 40 + Math.floor(rnd() * 40), 25);
      const res = packSheets(rects, W, H, { gap: 3 });
      assertSheets(rects, W, H, res, { gap: 3 }, `seed ${seed}`);
      assert.ok(res.sheets.length <= areaBound(rects, W, H, 3), `seed ${seed}: ${res.sheets.length} sheets`);
    }
  });

  test('deterministic and independent of the input order', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const rnd = prng(seed * 101);
      const rects = [...randomPieces(rnd, 1 + Math.floor(rnd() * 30), 90), ...copies(Math.floor(rnd() * 8), 40, 60)];
      const opts = { gap: rnd() < 0.5 ? 0 : 4, rotate: rnd() < 0.7 };
      const res = packSheets(rects, W, H, opts);
      assert.deepEqual(packSheets(structuredClone(rects), W, H, opts), res, `seed ${seed}`);
      assert.deepEqual(packSheets(shuffled(rects, prng(seed)), W, H, opts), res, `seed ${seed} (shuffled)`);
    }
  });
});
