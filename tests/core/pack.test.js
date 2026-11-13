import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { pack, fitScale, score } from '../../src/core/pack.js';
import { prng, shuffled } from '../support/prng.js';
import { TOL, assertValid, copies, scaled, sortedUnique } from '../support/pack.js';

// Exact cases of pack, fitScale and score. The properties checked over
// generated cases are in tests/properties/pack-*.test.js; the work and time
// budgets, in tests/performance/pack.test.js.

describe('pack: exact cases', () => {
  test('an empty list → []', () => {
    assert.deepEqual(pack([], 100, 100), []);
    assert.deepEqual(pack([], 100, 100, { rotate: false, gap: 5 }), []);
    // Even when the whole area is taken, there is nothing to place.
    assert.deepEqual(pack([], 100, 100, { obstacles: [{ x: 0, y: 0, w: 100, h: 100 }] }), []);
  });

  test('a tight 3×3 grid (190×277, 60×89 pieces, gap 5)', () => {
    const rects = copies(9, 60, 89);
    for (const rotate of [true, false]) {
      const res = pack(rects, 190, 277, { gap: 5, rotate });
      const boxes = assertValid(rects, 190, 277, res, { gap: 5, rotate }, `rotate:${rotate}`);
      assert.ok(res.every((p) => !p.rotated), 'none should be rotated');
      assert.deepEqual(sortedUnique(boxes.map((b) => b.x)), [0, 65, 130]);
      assert.deepEqual(sortedUnique(boxes.map((b) => b.y)), [0, 94, 188]);
    }
  });

  test('a tight grid that only fits with every piece rotated', () => {
    const rects = copies(9, 89, 60);
    const res = pack(rects, 190, 277, { gap: 5 });
    assertValid(rects, 190, 277, res, { gap: 5 });
    assert.ok(res.every((p) => p.rotated), 'all should be rotated');
    assert.equal(pack(rects, 190, 277, { gap: 5, rotate: false }), null);
  });

  test('one piece too many does not fit', () => {
    // 10 × (60+5)×(89+5) exceeds the enlarged area (195×282): impossible by area.
    assert.equal(pack(copies(10, 60, 89), 190, 277, { gap: 5 }), null);
  });

  test('the gap is not required against the edge', () => {
    const one = [{ id: 'a', w: 100, h: 50 }];
    assert.deepEqual(pack(one, 100, 50, { gap: 10 }), [{ id: 'a', x: 0, y: 0, rotated: false }]);

    const two = copies(2, 50, 100);
    const res = pack(two, 105, 100, { gap: 5 });
    const boxes = assertValid(two, 105, 100, res, { gap: 5 });
    assert.deepEqual(sortedUnique(boxes.map((b) => b.x)), [0, 55]);
    assert.equal(pack(two, 104.9, 100, { gap: 5 }), null);
  });

  test('without a gap, pieces that fill the area exactly', () => {
    const quads = copies(4, 50, 50);
    assertValid(quads, 100, 100, pack(quads, 100, 100));
    const mixed = [
      { id: 'top', w: 100, h: 40 },
      { id: 'left', w: 60, h: 60 },
      { id: 'right', w: 40, h: 60 },
    ];
    for (const rotate of [true, false]) {
      assertValid(mixed, 100, 100, pack(mixed, 100, 100, { rotate }), { rotate });
    }
  });

  test('a piece that only fits rotated', () => {
    const rects = [{ id: 'x', w: 150, h: 80 }];
    const res = pack(rects, 100, 200);
    assertValid(rects, 100, 200, res);
    assert.equal(res[0].rotated, true);
    assert.equal(pack(rects, 100, 200, { rotate: false }), null);
  });

  test('a piece larger than the area → null', () => {
    assert.equal(pack([{ id: 'big', w: 300, h: 300 }], 200, 250), null);
    assert.equal(pack([{ id: 'long', w: 210, h: 10 }], 200, 200), null);
    // One that does not fit spoils everything, even if the others would.
    assert.equal(pack([...copies(3, 10, 10), { id: 'big', w: 201, h: 1 }], 200, 200), null);
  });

  test('square pieces are never marked rotated', () => {
    const rects = [...copies(12, 40, 40), { id: 'r1', w: 90, h: 30 }, { id: 'r2', w: 30, h: 90 }];
    const res = pack(rects, 170, 230, { gap: 2 });
    assertValid(rects, 170, 230, res, { gap: 2 });
    for (const p of res) if (p.id.startsWith('p')) assert.equal(p.rotated, false, `square ${p.id}`);
  });

  test('does not modify its input', () => {
    const rects = [
      { id: 1, w: 30, h: 10 },
      { id: 2, w: 10, h: 30 },
      { id: 3, w: 20, h: 20 },
    ];
    const obstacles = [{ x: 0, y: 0, w: 5, h: 5 }];
    const snapshot = JSON.stringify({ rects, obstacles });
    pack(rects, 100, 100, { gap: 1, obstacles });
    fitScale(rects, 30, 30, { gap: 1, obstacles });
    assert.equal(JSON.stringify({ rects, obstacles }), snapshot);
  });
});

describe('pack: obstacles', () => {
  test('pieces avoid the obstacle keeping the gap', () => {
    const obstacles = [{ x: 0, y: 0, w: 100, h: 200 }];
    const fits = [{ id: 'a', w: 90, h: 200 }];
    const res = pack(fits, 200, 200, { gap: 10, obstacles });
    assertValid(fits, 200, 200, res, { gap: 10, obstacles });
    assert.equal(res[0].x, 110);
    assert.equal(pack([{ id: 'a', w: 91, h: 200 }], 200, 200, { gap: 10, obstacles }), null);
  });

  test('without a gap a piece may touch the obstacle', () => {
    const obstacles = [{ x: 0, y: 0, w: 50, h: 100 }];
    const rects = [{ id: 'a', w: 50, h: 100 }];
    const res = pack(rects, 100, 100, { obstacles });
    assertValid(rects, 100, 100, res, { obstacles });
    assert.equal(res[0].x, 50);
  });

  test('an obstacle outside the area but closer than the gap', () => {
    const obstacles = [{ x: 102, y: 0, w: 10, h: 50 }];
    assert.equal(pack([{ id: 'a', w: 100, h: 50 }], 100, 50, { gap: 5, obstacles }), null);
    const rects = [{ id: 'a', w: 97, h: 50 }];
    assertValid(rects, 100, 50, pack(rects, 100, 50, { gap: 5, obstacles }), { gap: 5, obstacles });
  });

  test('overlapping obstacles that stick out of the area', () => {
    const obstacles = [
      { x: -20, y: -20, w: 70, h: 60 },
      { x: 30, y: 20, w: 40, h: 40 },
      { x: 150, y: 120, w: 80, h: 80 },
      { x: 60, y: 140, w: 30, h: 30 },
    ];
    const rects = [...copies(6, 30, 20, 'h'), ...copies(3, 15, 45, 'v')];
    const res = pack(rects, 200, 180, { gap: 4, obstacles });
    assertValid(rects, 200, 180, res, { gap: 4, obstacles });
  });

  test('a fully blocked area → null', () => {
    const rects = [{ id: 'a', w: 1, h: 1 }];
    assert.equal(pack(rects, 100, 100, { obstacles: [{ x: -5, y: -5, w: 200, h: 200 }] }), null);
    // Several obstacles that cover the area between them.
    const quarters = [
      { x: 0, y: 0, w: 60, h: 60 },
      { x: 50, y: 0, w: 50, h: 60 },
      { x: 0, y: 50, w: 60, h: 50 },
      { x: 40, y: 40, w: 70, h: 70 },
    ];
    assert.equal(pack(rects, 100, 100, { obstacles: quarters }), null);
    // With a gap, an 8 mm hole between obstacles is not enough for 1 mm + 2×5 of gap.
    const strips = [
      { x: 0, y: 0, w: 46, h: 100 },
      { x: 54, y: 0, w: 46, h: 100 },
    ];
    assert.equal(pack(rects, 100, 100, { gap: 5, obstacles: strips }), null);
    assert.ok(pack(rects, 100, 100, { gap: 3, obstacles: strips }));
  });
});

describe('fitScale', () => {
  test('1 when they already fit (and for an empty list)', () => {
    assert.equal(fitScale([], 100, 100), 1);
    assert.equal(fitScale(copies(9, 60, 89), 190, 277, { gap: 5 }), 1);
    assert.equal(fitScale(copies(2, 100, 100), 205, 100, { gap: 5 }), 1);
  });

  test('k packs, and so does 0.999·k', () => {
    const cases = [
      // 3×4 grid: 4·89k + 3·5 ≤ 277 → k ≤ 0.73596; rotating gets more.
      { rects: copies(10, 60, 89), W: 190, H: 277, opts: { gap: 5 }, min: 0.8 },
      { rects: copies(10, 60, 89), W: 190, H: 277, opts: { gap: 5, rotate: false }, min: 0.735 },
      {
        rects: [...copies(7, 120, 80, 'h'), ...copies(5, 50, 150, 'v')],
        W: 210,
        H: 297,
        opts: { gap: 3, obstacles: [{ x: 0, y: 0, w: 210, h: 40 }] },
        min: 0.3,
      },
    ];
    for (const [i, { rects, W, H, opts, min }] of cases.entries()) {
      const k = fitScale(rects, W, H, opts);
      assert.ok(k > min && k < 1, `case ${i}: k=${k}`);
      for (const f of [k, 0.999 * k]) {
        const s = scaled(rects, f);
        assertValid(s, W, H, pack(s, W, H, opts), opts, `case ${i}, factor ${f}`);
      }
    }
  });

  test('k does not exceed the area bound', () => {
    const k = fitScale(copies(10, 60, 89), 190, 277, { gap: 5 });
    assert.ok(10 * 60 * k * 89 * k <= 190 * 277, `k=${k}`);
  });

  test('a piece twice as large as the area → ~0.5', () => {
    const k = fitScale([{ id: 'a', w: 400, h: 100 }], 200, 200);
    assert.ok(k <= 0.5 + TOL && k > 0.499, `k=${k}`);
  });

  test('the gap is not scaled', () => {
    // Two 100×100 side by side in 155 with gap 5: 2·100k + 5 ≤ 155 → k ≤ 0.75.
    // Scaling the gap would give 0.756.
    const k = fitScale(copies(2, 100, 100), 155, 100, { gap: 5 });
    assert.ok(k <= 0.75 + TOL && k > 0.749, `k=${k}`);
  });

  test('0 in impossible cases', () => {
    // With gap 30 in 100×100 at most 4×4 pieces fit, however small.
    const k = fitScale(copies(50, 10, 10), 100, 100, { gap: 30 });
    assert.ok(k < 0.01, `k=${k}`);
    const blocked = fitScale(copies(2, 10, 10), 100, 100, { obstacles: [{ x: 0, y: 0, w: 100, h: 100 }] });
    assert.equal(blocked, 0);
  });
});

// How far the layout reaches down and to the right.
function extent(rects, result) {
  const byId = new Map(rects.map((r) => [r.id, r]));
  let bottom = 0;
  let right = 0;
  for (const p of result) {
    const r = byId.get(p.id);
    bottom = Math.max(bottom, p.y + (p.rotated ? r.w : r.h));
    right = Math.max(right, p.x + (p.rotated ? r.h : r.w));
  }
  return { bottom, right };
}

// Rows of a layout: for each y (to 0.1 mm), the sizes of the pieces that
// start there.
function rowsOf(rects, result) {
  const byId = new Map(rects.map((r) => [r.id, r]));
  const rows = new Map();
  for (const p of result) {
    const r = byId.get(p.id);
    const y = Math.round(p.y * 10);
    if (!rows.has(y)) rows.set(y, new Set());
    rows.get(y).add(`${r.w}x${r.h}`);
  }
  return [...rows.values()];
}

const at = (id, x, y, rotated = false) => ({ id, x, y, rotated });

describe('score', () => {
  test('more free strip at the bottom is better', () => {
    const two = copies(2, 50, 50);
    const side = [at('p0', 0, 0), at('p1', 60, 0)];
    const stacked = [at('p0', 0, 0), at('p1', 0, 60)];
    assert.ok(score(side, two, 190, 277) < score(stacked, two, 190, 277));
  });

  test('rotating pays only when it frees enough height', () => {
    // 290×300 rotated lowers 1 % of the height: not worth it.
    const almost = [{ id: 't', w: 290, h: 300 }];
    assert.ok(score([at('t', 0, 0)], almost, 1000, 1000) < score([at('t', 0, 0, true)], almost, 1000, 1000));
    // 100×300 rotated frees 20 % of the height: it is.
    const tall = [{ id: 't', w: 100, h: 300 }];
    assert.ok(score([at('t', 0, 0, true)], tall, 1000, 1000) < score([at('t', 0, 0)], tall, 1000, 1000));
  });

  test('at the same height, aligned edges and equal pieces together are better', () => {
    // Same occupied box (120×105); the staggered one has two more x edges.
    const four = copies(4, 50, 50);
    const grid = [at('p0', 0, 0), at('p1', 70, 0), at('p2', 0, 55), at('p3', 70, 55)];
    const staggered = [at('p0', 0, 0), at('p1', 70, 0), at('p2', 15, 55), at('p3', 70, 55)];
    assert.ok(score(grid, four, 190, 277) < score(staggered, four, 190, 277));

    // Equal ones in the same row against interleaved ones (same height).
    const pairs = [...copies(2, 40, 40, 'a'), ...copies(2, 60, 40, 'b')];
    const byRows = [at('a0', 0, 0), at('a1', 45, 0), at('b0', 0, 45), at('b1', 65, 45)];
    const mixed = [at('a0', 0, 0), at('b0', 45, 0), at('b1', 0, 45), at('a1', 65, 45)];
    assert.ok(score(byRows, pairs, 190, 277) < score(mixed, pairs, 190, 277));
  });

  test('all else equal, further left is better', () => {
    const one = [{ id: 'a', w: 50, h: 50 }];
    assert.ok(score([at('a', 0, 0)], one, 190, 277) < score([at('a', 100, 0)], one, 190, 277));
  });

  test('does not depend on the order of the pieces or of the placements', () => {
    const rnd = prng(3);
    const rects = [...copies(3, 40, 30, 'a'), ...copies(2, 25, 60, 'b')];
    const placements = pack(rects, 190, 277, { gap: 5 });
    const s = score(placements, rects, 190, 277);
    assert.equal(score(shuffled(placements, rnd), shuffled(rects, rnd), 190, 277), s);
  });
});

describe('pack: picks the best layout', () => {
  test('9 equal 60×89 pieces in 190×277 with gap 5 → an unrotated 3×3 grid', () => {
    // (The exact coordinates are checked in «a tight 3×3 grid».)
    const rects = copies(9, 60, 89);
    const res = pack(rects, 190, 277, { gap: 5 });
    assert.ok(res.every((p) => !p.rotated));
    assert.equal(rowsOf(rects, res).length, 3);
  });

  test('equal pieces that fit unrotated are not rotated', () => {
    // 40×65: rotated they would lower only 1.8 % of the height (they used to be rotated).
    for (const [w, h] of [
      [60, 89],
      [50, 70],
      [40, 65],
      [35, 40],
    ]) {
      const rects = copies(6, w, h);
      const res = pack(rects, 190, 277, { gap: 5 });
      assertValid(rects, 190, 277, res, { gap: 5 }, `${w}×${h}`);
      assert.ok(res.every((p) => !p.rotated), `${w}×${h}: ${res.filter((p) => p.rotated).length} rotated`);
    }
  });

  test('rotates when that clearly frees more strip', () => {
    // Unrotated, 4×(100×40) stacked reach 175 mm; rotated, side by side, 100.
    const four = copies(4, 100, 40);
    const res = pack(four, 190, 277, { gap: 5 });
    assertValid(four, 190, 277, res, { gap: 5 });
    assert.ok(res.every((p) => p.rotated), 'all rotated (and all alike)');
    assert.equal(extent(four, res).bottom, 100);

    // 6×(30×60): rotated they fit in two rows of 30 instead of two of 60.
    const six = copies(6, 30, 60);
    const res6 = pack(six, 190, 277, { gap: 5 });
    assert.ok(res6.every((p) => p.rotated));
    assert.equal(extent(six, res6).bottom, 65);
  });

  test('two sizes: rows of a single size', () => {
    const rects = [...copies(3, 90, 60, 'g'), ...copies(3, 60, 40, 'c')];
    for (const rotate of [true, false]) {
      const opts = { gap: 5, rotate };
      const res = pack(rects, 190, 277, opts);
      assertValid(rects, 190, 277, res, opts, `rotate:${rotate}`);
      const rows = rowsOf(rects, res);
      assert.ok(
        rows.every((sizes) => sizes.size === 1),
        `rotate:${rotate}: rows ${JSON.stringify(rows.map((r) => [...r]))}`
      );
    }
  });
});
