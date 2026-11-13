import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { EPS, overlaps, overlapsAny, overlapping, nearestFree, nextFreeInDirection, maxGrowth, nextFreeForGroup, nearestFreeOffset, groupScaleRange } from '../../src/core/collide.js';

// Exact cases of the collision helpers. The properties checked over
// generated layouts are in tests/properties/collide.test.js.

const r = (x, y, w, h, id) => ({ id, x, y, w, h });

describe('overlaps', () => {
  test('overlapping', () => {
    assert.equal(overlaps(r(0, 0, 10, 10), r(5, 5, 10, 10)), true);
    assert.equal(overlaps(r(0, 0, 10, 10), r(2, 2, 2, 2)), true, 'one inside the other');
  });
  test('touching is not overlapping', () => {
    assert.equal(overlaps(r(0, 0, 10, 10), r(10, 0, 10, 10)), false, 'side to side');
    assert.equal(overlaps(r(0, 0, 10, 10), r(10, 10, 5, 5)), false, 'corner to corner');
    assert.equal(overlaps(r(0, 0, 10, 10), r(10 - EPS / 2, 0, 10, 10)), false, 'within the tolerance');
    assert.equal(overlaps(r(0, 0, 10, 10), r(9.9, 0, 10, 10)), true, 'beyond the tolerance');
  });
  test('apart', () => {
    assert.equal(overlaps(r(0, 0, 10, 10), r(20, 0, 10, 10)), false);
    assert.equal(overlaps(r(0, 0, 10, 10), r(0, 11, 10, 10)), false);
  });
  test('overlapsAny / overlapping', () => {
    const others = [r(20, 0, 5, 5, 'a'), r(3, 3, 2, 2, 'b')];
    assert.equal(overlapsAny(r(0, 0, 10, 10), others), true);
    assert.deepEqual(overlapping(r(0, 0, 10, 10), others).map((o) => o.id), ['b']);
    assert.equal(overlapsAny(r(0, 0, 10, 10), []), false);
  });
});

describe('nearestFree', () => {
  test('stays when already free', () => {
    assert.deepEqual(nearestFree(r(0, 0, 10, 10), [r(20, 20, 5, 5)]), { x: 0, y: 0 });
  });

  test('moves to the nearest edge of the one in the way', () => {
    // Dropped almost on the right edge of A: the closest is to its right.
    const a = r(0, 0, 50, 50);
    assert.deepEqual(nearestFree(r(45, 10, 20, 20), [a]), { x: 50, y: 10 });
    // Almost on the bottom edge: below.
    assert.deepEqual(nearestFree(r(10, 45, 20, 20), [a]), { x: 10, y: 50 });
    // Almost on the left edge (it leaves the sheet, allowed without bounds).
    assert.deepEqual(nearestFree(r(-15, 10, 20, 20), [a]), { x: -20, y: 10 });
  });

  test('finds a corner between two pieces', () => {
    // A at the top left and B below A: dropped overlapping both.
    const a = r(0, 0, 30, 30);
    const b = r(0, 30, 30, 30);
    const spot = nearestFree(r(25, 25, 10, 10), [a, b]);
    assert.deepEqual(spot, { x: 30, y: 25 });
    assert.equal(overlapsAny({ ...spot, w: 10, h: 10 }, [a, b]), false);
  });

  test('respects maxDistance: null when there is no room nearby', () => {
    const blockers = [r(0, 0, 100, 100)];
    assert.equal(nearestFree(r(40, 40, 10, 10), blockers, { maxDistance: 20 }), null);
    assert.deepEqual(nearestFree(r(40, 40, 10, 10), blockers, { maxDistance: 100 }), { x: 40, y: -10 });
  });

  test('respects bounds', () => {
    const area = r(0, 0, 100, 100);
    const a = r(0, 0, 60, 100);
    // It does not fit left of A (it would leave the area): it goes to the right.
    assert.deepEqual(nearestFree(r(5, 10, 20, 20), [a], { bounds: area }), { x: 60, y: 10 });
    // No room inside: null.
    assert.equal(nearestFree(r(5, 10, 50, 20), [a], { bounds: area }), null);
  });
});

describe('nextFreeInDirection', () => {
  test('with nothing in the way, a normal step', () => {
    assert.deepEqual(nextFreeInDirection(r(0, 0, 10, 10), [r(50, 0, 10, 10)], 1, 0), { x: 1, y: 0, jumped: [] });
  });

  test('touching another one, the next step jumps to its other side', () => {
    const b = r(10, 0, 20, 10, 'b');
    const res = nextFreeInDirection(r(0, 0, 10, 10), [b], 1, 0);
    assert.equal(res.x, 30);
    assert.equal(res.y, 0);
    assert.deepEqual(res.jumped.map((o) => o.id), ['b']);
  });

  test('jumps several in a row when they touch', () => {
    const others = [r(10, 0, 10, 10, 'a'), r(20, 0, 10, 10, 'b'), r(35, 0, 10, 10, 'c')];
    const res = nextFreeInDirection(r(0, 0, 10, 10), others, 1, 0);
    assert.equal(res.x, 45, 'passes a, b and, as it does not fit between b and c (5 mm) either, c too');
    assert.deepEqual(res.jumped.map((o) => o.id), ['a', 'b', 'c']);
  });

  test('in the four directions', () => {
    const b = r(20, 20, 10, 10);
    assert.equal(nextFreeInDirection(r(30, 20, 10, 10), [b], -1, 0).x, 10);
    assert.equal(nextFreeInDirection(r(20, 10, 10, 10), [b], 0, 1).y, 30);
    assert.equal(nextFreeInDirection(r(20, 30, 10, 10), [b], 0, -10).y, 10);
  });

  test('gets out even when it already overlapped (imposed)', () => {
    const b = r(0, 0, 40, 40, 'b');
    const res = nextFreeInDirection(r(10, 10, 10, 10), [b], 1, 0);
    assert.equal(res.x, 40);
  });
});

describe('maxGrowth', () => {
  test('no neighbors, no limit', () => {
    assert.equal(maxGrowth(r(0, 0, 10, 10), []), Infinity);
  });

  test('from the center it stops on touching', () => {
    // Center at 5; the neighbor starts at x = 15: it can reach a width of 20 (k = 2).
    const k = maxGrowth(r(0, 0, 10, 10), [r(15, 0, 10, 10)], 'center');
    assert.ok(Math.abs(k - 2) < 1e-9, String(k));
  });

  test('from the center, diagonally it stops on the axis crossed last', () => {
    // A diagonal neighbor: it takes crossing in x and in y at once.
    const k = maxGrowth(r(0, 0, 10, 10), [r(20, 12, 10, 10)], 'center');
    // In x they touch at k = (2·20 − 10)/10 = 3; in y at (2·12 − 10)/10 = 1.4.
    assert.ok(Math.abs(k - 3) < 1e-9, String(k));
  });

  test('from the top left only what is to the right or below stops it', () => {
    const rect = r(10, 10, 10, 10);
    assert.equal(maxGrowth(rect, [r(0, 0, 9, 50)], 'top-left'), Infinity, 'one on the left does not stop it');
    const k = maxGrowth(rect, [r(30, 0, 10, 50)], 'top-left');
    assert.ok(Math.abs(k - 2) < 1e-9, String(k));
  });

  test('those it already overlaps do not stop it', () => {
    assert.equal(maxGrowth(r(0, 0, 10, 10), [r(5, 5, 10, 10)], 'center'), Infinity);
  });
});

describe('groups', () => {
  test('nextFreeForGroup: jumps just enough for none to overlap anything', () => {
    const rects = [r(0, 0, 10, 10, 'a'), r(20, 0, 10, 10, 'b')];
    const others = [r(32, 0, 5, 10, 'x'), r(40, 20, 5, 5, 'y')];
    // Nothing in the way: the step as is.
    assert.deepEqual(nextFreeForGroup([{ rects, others: [] }], 1, 0), { dx: 1, dy: 0, jumped: [] });
    // «b» would overlap «x»: it jumps past it (b.x = 37).
    const res = nextFreeForGroup([{ rects, others }], 3, 0);
    assert.equal(res.dx, 17);
    assert.deepEqual(res.jumped.map((o) => o.id), ['x']);
    // Jumping, «a» lands on «x»: it goes on until past it too.
    const tight = [r(0, 0, 10, 10, 'a'), r(12, 0, 10, 10, 'b')];
    const res2 = nextFreeForGroup([{ rects: tight, others: [r(24, 0, 5, 10, 'x')] }], 3, 0);
    assert.equal(res2.dx, 29);
    // Upwards and on several sheets at once.
    const up = nextFreeForGroup(
      [
        { rects: [r(0, 20, 10, 10, 'a')], others: [r(0, 12, 10, 5, 'x')] },
        { rects: [r(0, 20, 10, 10, 'c')], others: [] },
      ],
      0,
      -4
    );
    assert.deepEqual([up.dx, up.dy], [0, -18]);
  });

  test('nearestFreeOffset: the shortest free shift, with the centers on the sheet', () => {
    const rects = [r(10, 10, 10, 10, 'a'), r(25, 10, 10, 10, 'b')];
    // Free: it does not move.
    assert.deepEqual(nearestFreeOffset([{ rects, others: [r(50, 50, 5, 5)] }]), { dx: 0, dy: 0 });
    // «b» overlaps «x» by 2 mm on the right: the shortest is to shift the group 2 mm left.
    const res = nearestFreeOffset([{ rects, others: [r(33, 10, 10, 10, 'x')] }]);
    assert.deepEqual(res, { dx: -2, dy: 0 });
    // With the sheet: the center of «a» cannot leave on the left.
    const edge = nearestFreeOffset([{ rects: [r(-4, 10, 10, 10, 'a')], others: [r(0, 10, 10, 10, 'x')], bounds: { W: 100, H: 100 } }]);
    assert.deepEqual(edge, { dx: 0, dy: -10 }, 'at equal distance, up before down');
    // Too far: null.
    assert.equal(nearestFreeOffset([{ rects, others: [r(0, 0, 100, 100)] }], { maxDistance: 5 }), null);
    // Several sheets: the same shift for all.
    const two = nearestFreeOffset([
      { rects: [r(0, 0, 10, 10, 'a')], others: [r(8, 0, 10, 10, 'x')] },
      { rects: [r(0, 0, 10, 10, 'c')], others: [r(0, 9, 10, 10, 'y')] },
    ], { maxDistance: 30 });
    for (const [g, o] of [[r(0, 0, 10, 10), r(8, 0, 10, 10)], [r(0, 0, 10, 10), r(0, 9, 10, 10)]]) {
      assert.equal(overlaps(r(g.x + two.dx, g.y + two.dy, 10, 10), o), false);
    }
  });

  test('nearestFreeOffset with a step: only multiples of the step', () => {
    const rects = [r(10, 10, 10, 10, 'a')];
    const others = [r(17.3, 10, 10, 10, 'x')];
    // Without a step: 2.7 mm to the left; with a 1 mm step, 3 mm.
    const free = nearestFreeOffset([{ rects, others }]);
    assert.ok(Math.abs(free.dx + 2.7) < 1e-9 && free.dy === 0, JSON.stringify(free));
    const res = nearestFreeOffset([{ rects, others }], { step: 1 });
    assert.ok(Math.abs(res.dx + 3) < 1e-9 && res.dy === 0, JSON.stringify(res));
  });

  test('groupScaleRange: the exact factor at which it touches another, growing and shrinking', () => {
    const rects = [r(0, 0, 10, 10, 'a'), r(20, 0, 10, 10, 'b')];
    // From the corner (0, 0): «b» touches «x» (x = 45) when 30k = 45.
    const grow = groupScaleRange(rects, [r(45, 0, 10, 10, 'x')], { x: 0, y: 0 });
    assert.ok(Math.abs(grow.max - (45 + EPS) / 30) < 1e-12, String(grow.max));
    assert.equal(grow.min, 0);
    // A piece between the two: shrinking, «b» reaches it.
    const shrink = groupScaleRange(rects, [r(12, 0, 4, 10, 'x')], { x: 0, y: 0 });
    assert.ok(Math.abs(shrink.min - (16 - EPS) / 20) < 1e-12, String(shrink.min));
    // …and growing, «a» reaches it from the other side.
    assert.ok(Math.abs(shrink.max - (12 + EPS) / 10) < 1e-12, String(shrink.max));
    // Those already overlapping do not stop it.
    assert.deepEqual(groupScaleRange([rects[0]], [r(5, 5, 10, 10)], { x: 0, y: 0 }), { min: 0, max: Infinity });
  });
});
