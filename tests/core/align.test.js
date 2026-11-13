import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { ALIGN_MODES, bounds, align, distribute, moveBy, scaleGroup, rotateGroup, snapGroup, validate } from '../../src/core/align.js';

// Exact cases of the alignment and group transformations. The properties
// checked over generated groups are in tests/properties/align.test.js.

const r = (id, x, y, w, h) => ({ id, x, y, w, h });

// Three scattered pieces: box {x: 10, y: 5, w: 90, h: 75}.
const group = [r('a', 10, 20, 30, 10), r('b', 50, 5, 20, 40), r('c', 80, 60, 20, 20)];

describe('bounds', () => {
  test('cases', () => {
    assert.equal(bounds([]), null);
    assert.deepEqual(bounds([r('a', 3, 4, 5, 6)]), { x: 3, y: 4, w: 5, h: 6 });
    assert.deepEqual(bounds(group), { x: 10, y: 5, w: 90, h: 75 });
    assert.deepEqual(bounds([r('a', -10, -5, 5, 5), r('b', 0, 0, 10, 10)]), { x: -10, y: -5, w: 20, h: 15 });
  });
});

describe('align', () => {
  test('each mode against the box of the selection', () => {
    const expected = {
      left: [10, 10, 10],
      centerX: [40, 45, 45],
      right: [70, 80, 80],
    };
    for (const [mode, xs] of Object.entries(expected)) {
      const res = align(group, mode);
      assert.deepEqual(res.map((p) => p.x), xs, mode);
      assert.deepEqual(res.map((p) => p.y), group.map((p) => p.y), `${mode}: y does not change`);
    }
    const vertical = {
      top: [5, 5, 5],
      centerY: [37.5, 22.5, 32.5],
      bottom: [70, 40, 60],
    };
    for (const [mode, ys] of Object.entries(vertical)) {
      const res = align(group, mode);
      assert.deepEqual(res.map((p) => p.y), ys, mode);
      assert.deepEqual(res.map((p) => p.x), group.map((p) => p.x), `${mode}: x does not change`);
    }
    assert.deepEqual(ALIGN_MODES, ['left', 'centerX', 'right', 'top', 'centerY', 'bottom']);
  });

  test('against the printable area of the sheet', () => {
    const area = { x: 10, y: 10, w: 190, h: 277 };
    const res = align(group, 'right', area);
    assert.deepEqual(res.map((p) => p.x + p.w), [200, 200, 200]);
    assert.deepEqual(align(group, 'centerY', area).map((p) => p.y), [143.5, 128.5, 138.5]);
    // A single piece, centered on the sheet.
    const [one] = align(align([r('x', 0, 0, 50, 70)], 'centerX', area), 'centerY', area);
    assert.deepEqual(one, r('x', 80, 113.5, 50, 70));
  });

  test('returns copies with the same shape and order; does not touch the input', () => {
    const snapshot = JSON.stringify(group);
    const res = align(group, 'left');
    assert.equal(JSON.stringify(group), snapshot);
    assert.deepEqual(res.map((p) => p.id), ['a', 'b', 'c']);
    assert.deepEqual(Object.keys(res[0]).sort(), ['h', 'id', 'w', 'x', 'y']);
    assert.notEqual(res[0], group[0]);
    assert.deepEqual(align([], 'left'), []);
  });

  test('an unknown mode → RangeError', () => {
    assert.throws(() => align(group, 'middle'), RangeError);
    assert.throws(() => align(group, 'toString'), RangeError);
  });
});

describe('distribute', () => {
  // Out of order on purpose: the order is by position, not by array.
  const row = [r('c', 100, 0, 20, 10), r('a', 0, 5, 10, 10), r('b', 30, 9, 30, 10), r('d', 150, 0, 5, 10)];

  test('{gap}: exact spacing, anchored on the first one', () => {
    const res = distribute(row, 'x', { gap: 4 });
    assert.deepEqual(res.map((p) => p.id), ['c', 'a', 'b', 'd'], 'same order as the input');
    const byId = Object.fromEntries(res.map((p) => [p.id, p]));
    assert.equal(byId.a.x, 0, 'the first one does not move');
    assert.equal(byId.b.x, 14);
    assert.equal(byId.c.x, 48);
    assert.equal(byId.d.x, 72);
    assert.deepEqual(res.map((p) => p.y), row.map((p) => p.y), 'y does not change');
    // gap 0: touching.
    const tight = distribute(row, 'x', { gap: 0 });
    assert.deepEqual(tight.map((p) => p.x), [40, 0, 10, 60]);
  });

  test('{gap} along y, and with 2 pieces', () => {
    const col = [r('top', 0, 0, 10, 20), r('bottom', 5, 100, 10, 30)];
    assert.deepEqual(distribute(col, 'y', { gap: 5 }).map((p) => p.y), [0, 25]);
    assert.deepEqual(distribute([col[1], col[0]], 'y', { gap: 5 }).map((p) => p.y), [25, 0]);
  });

  test('{within}: the space is shared equally between the ends', () => {
    const box = { x: 0, y: 0, w: 200, h: 50 };
    const res = distribute(row, 'x', { within: box });
    const byId = Object.fromEntries(res.map((p) => [p.id, p]));
    // They add up to 65 mm: 135 are left, in 3 spaces of 45.
    assert.equal(byId.a.x, 0);
    assert.equal(byId.b.x, 55);
    assert.equal(byId.c.x, 130);
    assert.equal(byId.d.x, 195);
    assert.equal(byId.d.x + byId.d.w, 200, 'the last one ends at the edge');
    // Within the selection’s own box the ends stay where they were.
    const own = distribute(row, 'x', { within: bounds(row) });
    const ownById = Object.fromEntries(own.map((p) => [p.id, p]));
    assert.equal(ownById.a.x, 0);
    assert.equal(ownById.d.x, 150);
    assert.equal(ownById.b.x, 40); // (155 − 65) / 3 = 30 of space
    assert.equal(ownById.c.x, 100);
  });

  test('{within} with 2 pieces: against the ends; with 1 or 0: unchanged', () => {
    const two = [r('a', 40, 0, 10, 10), r('b', 60, 0, 20, 10)];
    const box = { x: 0, y: 0, w: 190, h: 10 };
    assert.deepEqual(distribute(two, 'x', { within: box }).map((p) => p.x), [0, 170]);
    assert.deepEqual(distribute([two[0]], 'x', { within: box }), [two[0]]);
    assert.deepEqual(distribute([], 'x', { within: box }), []);
    assert.deepEqual(distribute([two[0]], 'y', { gap: 3 }), [two[0]]);
  });

  test('{within} smaller than the pieces: negative spaces (validate rejects it)', () => {
    const three = [r('a', 0, 0, 10, 10), r('b', 20, 0, 10, 10), r('c', 40, 0, 10, 10)];
    const res = distribute(three, 'x', { within: { x: 0, y: 0, w: 20, h: 10 } });
    assert.deepEqual(res.map((p) => p.x), [0, 5, 10]);
    assert.equal(validate(res, []), false);
  });

  test('usage errors', () => {
    assert.throws(() => distribute(row, 'z', { gap: 1 }), RangeError);
    assert.throws(() => distribute(row, 'x', {}), TypeError);
    assert.throws(() => distribute(row, 'x', { gap: NaN }), TypeError);
  });
});

describe('group transformations', () => {
  test('moveBy', () => {
    assert.deepEqual(moveBy(group, 5, -5), [r('a', 15, 15, 30, 10), r('b', 55, 0, 20, 40), r('c', 85, 55, 20, 20)]);
    assert.deepEqual(moveBy([], 1, 1), []);
  });

  test('scaleGroup: anchors', () => {
    const two = [r('a', 0, 0, 10, 10), r('b', 20, 0, 10, 10)]; // box 30×10
    const center = scaleGroup(two, 2);
    assert.equal(center.factor, 2);
    assert.deepEqual(center.rects, [r('a', -15, -5, 20, 20), r('b', 25, -5, 20, 20)]);
    assert.deepEqual(scaleGroup(two, 2, 'top-left').rects, [r('a', 0, 0, 20, 20), r('b', 40, 0, 20, 20)]);
    assert.deepEqual(scaleGroup(two, 0.5, 'bottom-right').rects, [r('a', 15, 5, 5, 5), r('b', 25, 5, 5, 5)]);
    assert.deepEqual(scaleGroup(two, 3, { x: 0, y: 0 }).rects, [r('a', 0, 0, 30, 30), r('b', 60, 0, 30, 30)]);
    // The box scales alike: same proportions and distances × k.
    const b = bounds(scaleGroup(group, 1.5, 'top').rects);
    assert.deepEqual(b, { x: -12.5, y: 5, w: 135, h: 112.5 });
    assert.deepEqual(scaleGroup([], 2), { rects: [], factor: 2 });
  });

  test('scaleGroup: errors', () => {
    for (const k of [0, -1, NaN, Infinity, '2']) assert.throws(() => scaleGroup(group, k), RangeError, String(k));
    assert.throws(() => scaleGroup(group, 2, 'middle'), RangeError);
  });

  test('rotateGroup: one piece turns around its center', () => {
    const res = rotateGroup([r('a', 10, 20, 40, 10)], 'cw');
    assert.equal(res.dr, 90);
    assert.deepEqual(res.rects, [r('a', 25, 5, 10, 40)]);
    assert.equal(rotateGroup([r('a', 10, 20, 40, 10)], 'ccw').dr, 270);
    assert.deepEqual(rotateGroup([]), { rects: [], dr: 90 });
  });

  test('rotateGroup: exact cases in both directions', () => {
    // Box {0, 0, 40, 20}, center (20, 10). «a» on the left, «b» on the right.
    const two = [r('a', 0, 0, 10, 20), r('b', 20, 5, 20, 10)];
    // Clockwise: what is on the left goes up, what is on the right goes down.
    assert.deepEqual(rotateGroup(two, 'cw').rects, [r('a', 10, -10, 20, 10), r('b', 15, 10, 10, 20)]);
    // Counterclockwise: what is on the left goes down.
    assert.deepEqual(rotateGroup(two, 'ccw').rects, [r('a', 10, 20, 20, 10), r('b', 15, -10, 10, 20)]);
    // The box keeps its center and its sides swap.
    assert.deepEqual(bounds(rotateGroup(two, 'cw').rects), { x: 10, y: -10, w: 20, h: 40 });
  });

  test('rotateGroup: an unknown direction → RangeError', () => {
    assert.throws(() => rotateGroup(group, 90), RangeError);
  });

  test('snapGroup: the corner of the box lands on the grid', () => {
    const res = snapGroup(group, 5);
    // Box at (10, 5): already on the grid of 5.
    assert.deepEqual(res, group);
    const moved = snapGroup(moveBy(group, 1.2, 3.4), 5);
    assert.deepEqual(bounds(moved), { x: 10, y: 10, w: 90, h: 75 });
  });

  test('snapGroup: its own origin and invalid steps', () => {
    const one = [r('a', 12, 12, 5, 5)];
    assert.deepEqual(snapGroup(one, 5, { origin: { x: 1, y: 3 } }), [r('a', 11, 13, 5, 5)]);
    for (const step of [0, -5, NaN, Infinity, undefined]) assert.deepEqual(snapGroup(one, step), one, String(step));
    assert.deepEqual(snapGroup([], 5), []);
  });
});

describe('validate', () => {
  test('overlap within the group and with the others', () => {
    const others = [r('x', 200, 200, 10, 10)];
    assert.equal(validate(group, others), true);
    assert.equal(validate([r('a', 0, 0, 10, 10), r('b', 5, 5, 10, 10)], []), false, 'they overlap each other');
    assert.equal(validate([r('a', 195, 195, 10, 10)], others), false, 'it overlaps an unselected one');
    assert.equal(validate([r('a', 190, 200, 10, 10)], others), true, 'touching is fine');
    assert.equal(validate([r('a', 190.005, 200, 10, 10)], others), true, 'within the tolerance');
    assert.equal(validate([], others), true);
  });

  test('allowOverlap: always true', () => {
    const piled = [r('a', 0, 0, 10, 10), r('b', 5, 5, 10, 10)];
    assert.equal(validate(piled, [r('c', 0, 0, 50, 50)], { allowOverlap: true }), true);
  });

  test('the whole sheet can be passed as `others`', () => {
    const sheet = [r('a', 0, 0, 10, 10), r('b', 50, 0, 10, 10)];
    const moved = moveBy([sheet[0]], 3, 0); // «a» overlaps its old version, which does not count
    assert.equal(validate(moved, sheet), true);
    assert.equal(validate(moveBy([sheet[0]], 45, 0), sheet), false);
    // Without ids nothing is left out.
    assert.equal(validate([{ x: 0, y: 0, w: 5, h: 5 }], [{ x: 1, y: 1, w: 5, h: 5 }]), false);
  });

  test('aligning pieces that would end up on top of each other: the UI rejects it', () => {
    const column = [r('a', 0, 0, 10, 10), r('b', 30, 0, 10, 10)];
    assert.equal(validate(align(column, 'left'), []), false);
    assert.equal(validate(align(column, 'top'), []), true);
  });
});

describe('snapGroup along one axis and towards one side', () => {
  test('only the requested axis; the other is untouched', () => {
    const one = [r('a', 12.3, 7.6, 5, 5)];
    assert.deepEqual(snapGroup(one, 5, { axes: 'x' }), [r('a', 10, 7.6, 5, 5)]);
    assert.deepEqual(snapGroup(one, 5, { axes: 'y' }), [r('a', 12.3, 10, 5, 5)]);
    assert.deepEqual(snapGroup(one, 5, { axes: 'xy' }), [r('a', 10, 10, 5, 5)]);
  });

  test('up, down and per axis', () => {
    const one = [r('a', 11, 14, 5, 5)];
    assert.deepEqual(snapGroup(one, 5, { round: 'up' }), [r('a', 15, 15, 5, 5)]);
    assert.deepEqual(snapGroup(one, 5, { round: 'down' }), [r('a', 10, 10, 5, 5)]);
    assert.deepEqual(snapGroup(one, 5, { round: { x: 'up', y: 'down' } }), [r('a', 15, 10, 5, 5)]);
    // What is already on the grid does not jump a step (not even with floating-point error).
    const on = [r('a', 0.1 + 0.2, 6.35, 5, 5)];
    assert.ok(Math.abs(snapGroup(on, 0.3, { round: 'up', axes: 'x' })[0].x - 0.3) < 1e-12);
    assert.equal(snapGroup([r('a', 3.175 * 3, 0, 1, 1)], 3.175, { round: 'down' })[0].x, 3.175 * 3);
  });
});

describe('validate without comparing the group with itself', () => {
  test('internal: false', () => {
    const piled = [r('a', 0, 0, 10, 10), r('b', 5, 5, 10, 10)];
    assert.equal(validate(piled, []), false);
    assert.equal(validate(piled, [], { internal: false }), true);
    assert.equal(validate(piled, [r('c', 12, 12, 5, 5)], { internal: false }), false, 'with the others it does');
  });
});
