import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { packSheets, packInto } from '../../src/core/pack.js';
import { areaBound, assertInto, assertSheets, copies, sortedUnique } from '../support/pack.js';

// Exact cases of packSheets and packInto. The properties checked over
// generated cases are in tests/properties/pack-sheets.test.js and
// pack-into.test.js; the work and time budgets, in
// tests/performance/pack-sheets.test.js.

// A4 with 10 mm margins.
const W = 190;
const H = 277;

describe('packSheets: exact cases', () => {
  test('no pieces', () => {
    assert.deepEqual(packSheets([], W, H), { sheets: [], unplaced: [] });
    assert.deepEqual(packSheets([], W, H, { gap: 5, rotate: false }), { sheets: [], unplaced: [] });
  });

  test('20 pieces 60×89 in 190×277 with gap 5 → 3 sheets of 9 + 9 + 2', () => {
    const rects = copies(20, 60, 89);
    for (const rotate of [true, false]) {
      const opts = { gap: 5, rotate };
      const res = packSheets(rects, W, H, opts);
      assertSheets(rects, W, H, res, opts, `rotate:${rotate}`);
      assert.deepEqual(res.unplaced, []);
      assert.deepEqual(res.sheets.map((s) => s.length), [9, 9, 2]);
      // The two full ones are the unrotated 3×3 grid.
      for (const sheet of res.sheets.slice(0, 2)) {
        assert.ok(sheet.every((p) => !p.rotated));
        assert.deepEqual(sortedUnique(sheet.map((p) => p.x)), [0, 65, 130]);
        assert.deepEqual(sortedUnique(sheet.map((p) => p.y)), [0, 94, 188]);
      }
      assert.equal(areaBound(rects, W, H, 5), 3);
    }
  });

  test('exact counts: 9 → 1 sheet, 10 → 9 + 1, 18 → 9 + 9, 27 → 3 full ones', () => {
    for (const [n, expected] of [
      [1, [1]],
      [9, [9]],
      [10, [9, 1]],
      [18, [9, 9]],
      [27, [9, 9, 9]],
    ]) {
      const rects = copies(n, 60, 89);
      const res = packSheets(rects, W, H, { gap: 5 });
      assertSheets(rects, W, H, res, { gap: 5 }, `${n} pieces`);
      assert.deepEqual(res.sheets.map((s) => s.length), expected, `${n} pieces`);
    }
  });

  test('two sizes that fill two sheets exactly: each size on its own sheet', () => {
    // 9 of 60×89 (3×3 grid) and 4 of 90×135 (2×2): the area bound gives 2.
    const rects = [...copies(9, 60, 89, 'c'), ...copies(4, 90, 135, 'g')];
    const res = packSheets(rects, W, H, { gap: 5 });
    assertSheets(rects, W, H, res, { gap: 5 });
    assert.equal(areaBound(rects, W, H, 5), 2);
    assert.equal(res.sheets.length, 2);
    const kinds = res.sheets.map((s) => [...new Set(s.map((p) => p.id[0]))].join(''));
    assert.deepEqual(kinds.sort(), ['c', 'g']);
  });

  test('equal pieces go together when it costs no sheets', () => {
    // Three almost equal sizes; 4 fit per sheet (2×2). Filling the first sheet
    // to the brim would leave 2a + 2b with b split; together: 2a + 2c | 3b.
    const rects = [...copies(2, 90, 135, 'a'), ...copies(3, 90, 134, 'b'), ...copies(2, 90, 133, 'c')];
    const res = packSheets(rects, W, H, { gap: 5 });
    assertSheets(rects, W, H, res, { gap: 5 });
    assert.deepEqual(
      res.sheets.map((s) => s.map((p) => p.id).sort()),
      [
        ['a0', 'a1', 'c0', 'c1'],
        ['b0', 'b1', 'b2'],
      ]
    );

    // 5 + 5 of two sizes, 9 fit per sheet: 5 | 5 instead of 9 | 1.
    const pairs = [...copies(5, 60, 89, 'a'), ...copies(5, 60, 88, 'b')];
    const res2 = packSheets(pairs, W, H, { gap: 5 });
    assertSheets(pairs, W, H, res2, { gap: 5 });
    assert.deepEqual(
      res2.sheets.map((s) => [...new Set(s.map((p) => p.id[0]))]),
      [['a'], ['b']],
      'each size on a single sheet, the largest first'
    );
  });

  test('when keeping equal pieces together would cost one more sheet, a group is split', () => {
    // 5 + 5 + 5 with room for 9 per sheet: without splitting it would take 3 sheets.
    const rects = [...copies(5, 60, 89, 'a'), ...copies(5, 60, 88, 'b'), ...copies(5, 60, 87, 'c')];
    const res = packSheets(rects, W, H, { gap: 5 });
    assertSheets(rects, W, H, res, { gap: 5 });
    assert.deepEqual(res.sheets.map((s) => s.length), [9, 6]);
    // A single size ends up spread over both sheets.
    const split = ['a', 'b', 'c'].filter((k) => res.sheets.every((s) => s.some((p) => p.id[0] === k)));
    assert.equal(split.length, 1, `split: ${split}`);
  });

  test('those that do not fit even alone go to unplaced', () => {
    const rects = [
      { id: 'ok', w: 50, h: 50 },
      { id: 'big', w: 300, h: 300 },
      { id: 'long', w: 250, h: 100 }, // fits only rotated
      { id: 'exact', w: 190, h: 277 },
    ];
    const res = packSheets(rects, W, H, { gap: 10 });
    assertSheets(rects, W, H, res, { gap: 10 });
    assert.deepEqual(res.unplaced, ['big']);
    assert.equal(res.sheets.length, 2, 'the exact one takes a whole sheet; there is no gap against the edge');
    const long = res.sheets.flat().find((p) => p.id === 'long');
    assert.equal(long.rotated, true);

    const fixed = packSheets(rects, W, H, { gap: 10, rotate: false });
    assertSheets(rects, W, H, fixed, { gap: 10, rotate: false });
    assert.deepEqual(fixed.unplaced, ['long', 'big'], 'in canonical order: longer side, shorter side');
  });

  test('an empty or negative printable area: nothing fits', () => {
    const rects = copies(3, 10, 10);
    for (const [w, h] of [
      [0, 100],
      [100, -5],
    ]) {
      const res = packSheets(rects, w, h);
      assert.deepEqual(res.sheets, []);
      assert.deepEqual(res.unplaced.sort(), ['p0', 'p1', 'p2']);
    }
  });

  test('does not modify its input', () => {
    const rects = [...copies(4, 30, 10), { id: 'x', w: 10, h: 30 }];
    const snapshot = JSON.stringify(rects);
    packSheets(rects, 60, 60, { gap: 2 });
    packInto(rects, 60, 60, { gap: 2, sheets: [[{ x: 0, y: 0, w: 20, h: 20 }]] });
    assert.equal(JSON.stringify(rects), snapshot);
  });
});

describe('packInto', () => {
  test('no new pieces', () => {
    assert.deepEqual(packInto([], W, H, { sheets: [[]] }), { placements: [], unplaced: [] });
  });

  test('«Duplicar ×12»: completes the sheet’s grid and goes on in a new one', () => {
    // One 60×89 piece at the top left; 8 more fit on its sheet.
    const sheets = [[{ x: 0, y: 0, w: 60, h: 89 }]];
    const rects = copies(12, 60, 89, 'd');
    const res = packInto(rects, W, H, { gap: 5, sheets });
    const bySheet = assertInto(rects, W, H, sheets, res, { gap: 5 });
    assert.deepEqual(res.unplaced, []);
    assert.equal(bySheet.get(0).length, 8);
    assert.equal(bySheet.get(1).length, 4);
    assert.deepEqual([...bySheet.keys()], [0, 1]);
    const first = bySheet.get(0);
    assert.deepEqual(sortedUnique(first.map((p) => p.x)), [0, 65, 130]);
    assert.deepEqual(sortedUnique(first.map((p) => p.y)), [0, 94, 188]);
  });

  test('fills the existing sheets in order and skips the full ones', () => {
    const full = [{ x: 0, y: 0, w: W, h: H }];
    const half = [{ x: 0, y: 0, w: W, h: 140 }];
    const sheets = [full, half, []];
    const rects = copies(5, 60, 60);
    const res = packInto(rects, W, H, { gap: 5, sheets });
    const bySheet = assertInto(rects, W, H, sheets, res, { gap: 5 });
    assert.deepEqual([...bySheet.keys()], [1], 'all in the hole of sheet 1');
    assert.ok(res.placements.every((p) => p.y >= 145 - 1e-9), 'below the obstacle, with the gap');
  });

  test('`from`: starts at that sheet', () => {
    const sheets = [[], [], []];
    const rects = copies(3, 50, 50);
    const res = packInto(rects, W, H, { gap: 5, sheets, from: 2 });
    assertInto(rects, W, H, sheets, res, { gap: 5 });
    assert.ok(res.placements.every((p) => p.sheet === 2));
    // When not everything fits, it goes on with the next ones (wrapping around) and then new ones.
    const many = copies(30, 60, 89);
    const res2 = packInto(many, W, H, { gap: 5, sheets: [[], []], from: 1 });
    const bySheet = assertInto(many, W, H, [[], []], res2, { gap: 5 });
    assert.deepEqual([...bySheet.keys()], [0, 1, 2, 3]);
    assert.equal(bySheet.get(1).length, 9);
    assert.equal(bySheet.get(0).length, 9);
    assert.equal(bySheet.get(2).length + bySheet.get(3).length, 12);
    // `from` out of range is clamped.
    assertInto(rects, W, H, sheets, packInto(rects, W, H, { sheets, from: 99 }));
  });

  test('without existing sheets it is like packSheets', () => {
    const rects = [...copies(7, 60, 89, 'a'), ...copies(6, 80, 50, 'b')];
    const opts = { gap: 5 };
    const into = packInto(rects, W, H, { ...opts, sheets: [] });
    const sheets = packSheets(rects, W, H, opts);
    const flat = sheets.sheets.flatMap((sheet, i) => sheet.map((p) => ({ id: p.id, sheet: i, x: p.x, y: p.y, rotated: p.rotated })));
    assert.deepEqual(into, { placements: flat, unplaced: sheets.unplaced });
  });

  test('those that do not fit even on an empty sheet go to unplaced', () => {
    const rects = [{ id: 'big', w: 500, h: 10 }, ...copies(2, 20, 20)];
    const sheets = [[{ x: 0, y: 0, w: W, h: H }]];
    const res = packInto(rects, W, H, { gap: 1, sheets });
    assertInto(rects, W, H, sheets, res, { gap: 1 });
    assert.deepEqual(res.unplaced, ['big']);
    assert.ok(res.placements.every((p) => p.sheet === 1), 'the existing sheet is full');
  });
});
