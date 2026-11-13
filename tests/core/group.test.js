import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  subgroups,
  planGroup,
  groupBounds,
  containScaleRange,
  common,
  sameSource,
  touchedBy,
  rangeBetween,
  planNudge,
  planMoveTo,
  scaleBounds,
  planScaleBy,
  planResizeTo,
  planCommonScale,
  planRotate,
  planAlign,
  distributeNeeds,
  canDistribute,
  planDistribute,
  planDrag,
  planDrop,
  toggled,
  touchedSelection,
  selectAllTarget,
  withPrimaryLast,
  neighborAfterRemoval,
  copiesAllowed,
  scaleLimits,
  planScale,
} from '../../src/core/group.js';
import { align, moveBy, rotateGroup, scaleGroup, bounds } from '../../src/core/align.js';

// Exact cases of the group plans and selection helpers. The properties checked
// over generated selections are in tests/properties/group.test.js.

const b = (id, sheet, x, y, w, h) => ({ id, sheet, x, y, w, h });
const A4 = { W: 210, H: 297 };

// Sheet 1: a, b, c chosen; z not. Sheet 2: d chosen; y not.
const boxes = [
  b(1, 1, 10, 10, 30, 20),
  b(2, 1, 60, 40, 20, 30),
  b(9, 1, 150, 150, 20, 20),
  b(3, 1, 100, 15, 25, 25),
  b(4, 2, 20, 20, 40, 40),
  b(8, 2, 120, 120, 30, 30),
];
const ids = new Set([1, 2, 3, 4]);

describe('subgroups', () => {
  test('per sheet, with the others on that sheet', () => {
    const groups = subgroups(boxes, ids);
    assert.deepEqual([...groups.keys()], [1, 2]);
    assert.deepEqual(groups.get(1).rects.map((r) => r.id), [1, 2, 3]);
    assert.deepEqual(groups.get(1).others.map((r) => r.id), [9]);
    assert.deepEqual(groups.get(2).rects.map((r) => r.id), [4]);
    assert.deepEqual(groups.get(2).others.map((r) => r.id), [8]);
    assert.deepEqual(groupBounds(boxes, ids).get(1), { x: 10, y: 10, w: 115, h: 60 });
  });
});

describe('planGroup', () => {
  test('each subgroup is transformed within its sheet', () => {
    const plan = planGroup(boxes, ids, (rects) => align(rects, 'left'), A4);
    assert.equal(plan.ok, false, 'on sheet 1, aligning left piles them up');
    assert.equal(plan.reason, 'overlap');
    assert.equal(plan.sheet, 1);
    const top = planGroup(boxes, ids, (rects) => align(rects, 'top'), A4);
    assert.equal(top.ok, true);
    assert.deepEqual([1, 2, 3].map((id) => top.rects.get(id).y), [10, 10, 10]);
    assert.equal(top.rects.get(4).y, 20, 'alone on its sheet: against its own box, it does not move');
    assert.equal(top.changed, true);
    assert.equal(top.rects.has(9), false, 'only the chosen ones');
  });

  test('with allowOverlap, overlapping is allowed', () => {
    const plan = planGroup(boxes, ids, (rects) => align(rects, 'left'), { ...A4, allowOverlap: true });
    assert.equal(plan.ok, true);
    assert.deepEqual([1, 2, 3].map((id) => plan.rects.get(id).x), [10, 10, 10]);
  });

  test('against the unchosen ones on the same sheet', () => {
    const near = [b(1, 1, 10, 10, 20, 20), b(2, 1, 40, 10, 20, 20)];
    const plan = planGroup(near, new Set([1]), (rects) => moveBy(rects, 15, 0), A4);
    assert.equal(plan.ok, false);
    const other = [b(1, 1, 10, 10, 20, 20), b(2, 2, 40, 10, 20, 20)];
    assert.equal(planGroup(other, new Set([1]), (rects) => moveBy(rects, 15, 0), A4).ok, true, 'those on another sheet do not collide');
  });

  test('clamps the subgroup so that the centers stay on the sheet', () => {
    const plan = planGroup(boxes, ids, (rects) => moveBy(rects, -50, 0), { ...A4, rigid: true });
    assert.equal(plan.ok, true);
    // The center of «a» (x = 10, w = 30) reaches 0: the largest shift is −25 for the whole subgroup.
    assert.deepEqual([1, 2, 3].map((id) => plan.rects.get(id).x), [-15, 35, 75]);
    assert.equal(plan.rects.get(4).x, -20, 'each subgroup is clamped on its sheet');
    const rejected = planGroup(boxes, ids, (rects) => moveBy(rects, -50, 0), { ...A4, contain: 'reject' });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, 'outside');
  });

  test('when the centers do not fit even shifted: outside', () => {
    const wide = [b(1, 1, 0, 0, 10, 10), b(2, 1, 200, 0, 10, 10)];
    const plan = planGroup(wide, new Set([1, 2]), (rects) => scaleGroup(rects, 2, 'top-left').rects, A4);
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, 'outside');
  });

  test('snap: the block lands on the grid without changing distances; clamped, it stays on the grid', () => {
    const plan = planGroup(boxes, ids, (rects) => moveBy(rects, 3.3, 7.7), { ...A4, snap: { step: 5 }, rigid: true });
    const before = [1, 2, 3].map((id) => boxes.find((x) => x.id === id));
    const after = [1, 2, 3].map((id) => plan.rects.get(id));
    const bx = bounds(after);
    assert.equal(bx.x % 5, 0);
    assert.equal(bx.y % 5, 0);
    for (let i = 1; i < 3; i++) assert.equal(after[i].x - after[0].x, before[i].x - before[0].x);
    // Outwards: clamped on the left, the shift is rounded to the step.
    const out = planGroup([b(1, 1, 3, 3, 10, 10)], new Set([1]), (rects) => moveBy(rects, -20, 0), { ...A4, snap: { step: 5 }, rigid: true });
    assert.equal(out.rects.get(1).x, -5);
    // Only the requested axis.
    const onlyX = planGroup([b(1, 1, 3, 3.3, 10, 10)], new Set([1]), (rects) => rects, { ...A4, snap: { step: 5, axes: 'x' } });
    assert.deepEqual([onlyX.rects.get(1).x, onlyX.rects.get(1).y], [5, 3.3]);
  });

  test('rigid: what already overlapped within the group does not prevent moving it', () => {
    const piled = [b(1, 1, 10, 10, 20, 20), b(2, 1, 15, 15, 20, 20)];
    const all = new Set([1, 2]);
    assert.equal(planGroup(piled, all, (rects) => moveBy(rects, 5, 0), A4).ok, false);
    assert.equal(planGroup(piled, all, (rects) => moveBy(rects, 5, 0), { ...A4, rigid: true }).ok, true);
  });

  test('rounding and changed', () => {
    const plan = planGroup(boxes, ids, (rects) => moveBy(rects, 1 / 3, 0), { ...A4, round: (v) => Math.round(v * 1e4) / 1e4 });
    assert.equal(plan.rects.get(1).x, 10.3333);
    const same = planGroup(boxes, ids, (rects) => rects, A4);
    assert.equal(same.changed, false);
  });

  test('rotating and scaling the group: box and sizes', () => {
    const turned = planGroup(boxes, new Set([1, 2]), (rects) => rotateGroup(rects, 'cw').rects, A4);
    assert.equal(turned.ok, true);
    const bx = bounds([turned.rects.get(1), turned.rects.get(2)]);
    assert.deepEqual([bx.w, bx.h], [60, 70]);
    const scaled = planGroup(boxes, new Set([1, 2]), (rects) => scaleGroup(rects, 2, 'top-left').rects, A4);
    assert.deepEqual(scaled.rects.get(2), { id: 2, x: 110, y: 70, w: 40, h: 60 });
  });
});

describe('containScaleRange', () => {
  test('the factor at which a center reaches the edge', () => {
    const rects = [b(1, 1, 100, 100, 20, 20), b(2, 1, 150, 100, 20, 20)];
    // From (100, 100): the center of «2» (160) reaches 210 at k = 110 / 60.
    const range = containScaleRange(rects, { x: 100, y: 100 }, 210, 297);
    assert.ok(Math.abs(range.max - 110 / 60) < 1e-12);
    assert.equal(range.min, 0);
    // An anchor off the sheet (on the left): shrinking takes the centers outwards.
    const left = containScaleRange([b(1, 1, -10, 0, 40, 10)], { x: -10, y: 0 }, 210, 297);
    assert.ok(Math.abs(left.min - 0.5) < 1e-12, String(left.min));
  });
});

describe('selection helpers', () => {
  test('common', () => {
    assert.equal(common([50, 50, 50]), 50);
    assert.equal(common([50, 50.0000001]), 50);
    assert.equal(common([50, 60]), null);
    assert.equal(common([]), null);
  });

  test('sameSource: the same source file (pages, crop and scale do not matter)', () => {
    const items = [
      { id: 1, src: 7 },
      { id: 2, src: 3 },
      { id: 3, src: 7 },
      { id: 4, src: 9 },
      { id: 5, src: 3 },
    ];
    assert.deepEqual(sameSource(items, new Set([3])), [1, 3]);
    assert.deepEqual(sameSource(items, new Set([2, 4])), [2, 4, 5]);
    assert.deepEqual(sameSource(items, new Set()), []);
  });

  test('touchedBy: those the marquee touches', () => {
    const list = [
      { id: 1, x: 0, y: 0, w: 10, h: 10 },
      { id: 2, x: 20, y: 0, w: 10, h: 10 },
      { id: 3, x: 0, y: 30, w: 10, h: 10 },
    ];
    assert.deepEqual(touchedBy({ x: 5, y: 5, w: 20, h: 2 }, list), [1, 2]);
    assert.deepEqual(touchedBy({ x: 10, y: 0, w: 10, h: 10 }, list), [], 'touching an edge does not count');
    assert.deepEqual(touchedBy({ x: -5, y: -5, w: 100, h: 100 }, list), [1, 2, 3]);
  });

  test('rangeBetween', () => {
    const order = [5, 3, 8, 1, 9];
    assert.deepEqual(rangeBetween(order, 3, 1), [3, 8, 1]);
    assert.deepEqual(rangeBetween(order, 9, 8), [8, 1, 9]);
    assert.deepEqual(rangeBetween(order, 4, 8), [8]);
    assert.deepEqual(rangeBetween(order, 3, 4), []);
  });
});

describe('the plan of each operation', () => {
  const opts = { W: 210, H: 297, allowOverlap: false, round: (v) => Math.round(v * 1e4) / 1e4, snapStep: 0 };
  // Two chosen ones in a row and a third one below, on sheet 1.
  const row = [b(1, 1, 20, 20, 40, 30), b(2, 1, 80, 20, 40, 30), b(3, 1, 20, 100, 40, 30)];
  const two = new Set([1, 2]);

  test('planNudge: jumps what is in the way and says which', () => {
    const { plan, jumped } = planNudge(row, new Set([1]), 0, 60, opts);
    assert.equal(plan.ok, true);
    assert.equal(plan.rects.get(1).y, 130, 'on the other side of 3');
    assert.deepEqual(jumped.map((r) => r.id), [3]);
    assert.equal(planNudge(row, new Set([1]), 0, 60, { ...opts, allowOverlap: true }).plan.rects.get(1).y, 80);
  });

  test('planMoveTo: the box on the given sheet; null when already there', () => {
    assert.equal(planMoveTo(row, two, 1, 'x', 20, opts), null);
    const plan = planMoveTo(row, two, 1, 'x', 50, opts);
    assert.deepEqual([plan.rects.get(1).x, plan.rects.get(2).x], [50, 110]);
    assert.equal(planMoveTo(row, two, 1, 'x', -500, opts).reason, 'outside', 'the fields do not clamp: they reject');
  });

  test('scaleBounds and planScaleBy: scale, sheet and overlap limits', () => {
    const near = [b(1, 1, 20, 20, 40, 30), b(2, 1, 80, 20, 40, 30), b(3, 1, 130, 20, 40, 30)];
    const range = scaleBounds(near, two, [100, 100], 'center', opts);
    assert.ok(Math.abs(range.max - (60 + 0.01) / 50) < 1e-12, String(range.max));
    const grow = planScaleBy(near, two, [100, 100], 100, 50, opts);
    assert.ok(Math.abs(grow.k - range.max) < 1e-12, 'it stops on touching 3');
    assert.equal(planScaleBy(near, two, [990, 500], 990, 50, { ...opts, allowOverlap: true }).k, 1000 / 990, 'none goes past 1000 %');
    assert.equal(planScaleBy(near, two, [1, 50], 1, -1, opts), null, 'already at 1 %: it does not shrink');
  });

  test('planResizeTo: proportional from the corner; the limit and nothing to do', () => {
    const { plan, k } = planResizeTo(row, two, 1, 'w', 50, [100, 100], opts);
    assert.equal(k, 0.5);
    assert.deepEqual(plan.rects.get(2), { id: 2, x: 50, y: 20, w: 20, h: 15 });
    assert.equal(planResizeTo(row, two, 1, 'w', 100, [100, 100], opts), null);
    assert.equal(planResizeTo(row, two, 1, 'w', 100000, [100, 100], opts).plan.reason, 'limit');
  });

  test('planCommonScale: each from its center', () => {
    const { plan, scale } = planCommonScale(row, two, new Map([[1, 100], [2, 50]]), 50, opts);
    assert.equal(scale, 50);
    assert.deepEqual(plan.rects.get(1), { id: 1, x: 30, y: 27.5, w: 20, h: 15 });
    assert.deepEqual(plan.rects.get(2), { id: 2, x: 80, y: 20, w: 40, h: 30 }, 'it was already at 50 %');
    assert.equal(planCommonScale(row, two, new Map([[1, 100], [2, 100]]), 5000, opts).scale, 1000);
  });

  test('planRotate: direction and overlap', () => {
    const { plan, dr } = planRotate(row, two, -1, opts);
    assert.equal(dr, 270);
    assert.equal(plan.ok, true);
    assert.equal(planRotate([...row, b(9, 1, 55, 0, 10, 10)], two, 1, opts).plan.ok, false);
  });

  test('planAlign: against the selection or the printable area; with snapping, inwards', () => {
    const area = { x: 10, y: 10, w: 190, h: 277 };
    assert.deepEqual([...planAlign(row, two, 'bottom', opts).rects.values()].map((r) => r.y), [20, 20]);
    const right = planAlign(row, new Set([1]), 'right', { ...opts, area, snapStep: 3 });
    assert.equal(right.rects.get(1).x, 159, 'right: 160 → inwards, 159 (a multiple of 3)');
    const left = planAlign(row, new Set([1]), 'left', { ...opts, area, snapStep: 3 });
    assert.equal(left.rects.get(1).x, 12, 'left: 10 → inwards, 12');
    const center = planAlign(row, new Set([1]), 'centerX', { ...opts, area, snapStep: 3 });
    assert.equal(center.rects.get(1).x, 84, 'center: 85 → the nearest, 84');
    assert.throws(() => planAlign(row, two, 'middle', opts), RangeError);
  });

  test('distributing: how many it takes and the result', () => {
    assert.equal(distributeNeeds('gap'), 2);
    assert.equal(distributeNeeds('even'), 3);
    assert.equal(canDistribute(row, two, 'gap'), true);
    assert.equal(canDistribute(row, two, 'even'), false);
    const plan = planDistribute(row, two, 'x', { ...opts, gap: 5 });
    assert.deepEqual([plan.rects.get(1).x, plan.rects.get(2).x], [20, 65]);
    const three = [b(1, 1, 10, 10, 10, 10), b(2, 1, 30, 10, 10, 10), b(3, 1, 100, 10, 10, 10)];
    const even = planDistribute(three, new Set([1, 2, 3]), 'x', { ...opts, mode: 'even' });
    assert.deepEqual([1, 2, 3].map((id) => even.rects.get(id).x), [10, 55, 100]);
  });

  test('planDrag and planDrop: to another sheet; onto another piece, to the free spot on the grid', () => {
    const sheets = [b(1, 1, 20, 20, 40, 30), b(2, 1, 80, 20, 40, 30), b(5, 2, 20, 20, 40, 30)];
    const moved = planDrag(sheets, two, 0, 0, { ...opts, target: 2, offsetY: 3 });
    assert.equal(moved.plan.ok, false, 'on sheet 2 it would overlap 5');
    assert.equal(moved.boxes.find((x) => x.id === 1).sheet, 2);
    const drop = planDrop(moved, two, { ...opts, snapStep: 1 });
    assert.equal(drop.result, 'moved-aside');
    for (const r of drop.rects.values()) assert.equal(Number.isInteger(r.x) && Number.isInteger(r.y - 3), true, JSON.stringify(r));
    const free = planDrag(sheets, two, 5, 0, opts);
    assert.deepEqual(planDrop(free, two, opts).result, 'moved');
  });

  test('selection: toggling, marquee, Ctrl+A, the neighbor on removal and possible copies', () => {
    assert.deepEqual(toggled([1, 2], 3), { selection: [1, 2, 3], on: true });
    assert.deepEqual(toggled([1, 2, 3], 2), { selection: [1, 3], on: false });
    assert.deepEqual(touchedSelection([1, 2], [2, 5], true), [1, 2, 5]);
    assert.deepEqual(touchedSelection([1, 2], [5], false), [5]);
    assert.deepEqual(selectAllTarget([2], [1, 2, 3], [1, 2, 3, 4]), { selection: [1, 3, 2], everything: false });
    assert.deepEqual(selectAllTarget([3, 1, 2], [1, 2, 3], [1, 2, 3, 4]), { selection: [1, 3, 4, 2], everything: true });
    assert.deepEqual(withPrimaryLast([1, 2, 3], 2), [1, 3, 2]);
    assert.equal(neighborAfterRemoval([1, 2, 3, 4], 2, new Set([2, 3])), 4);
    assert.equal(neighborAfterRemoval([1, 2, 3], 3, new Set([2, 3])), 1);
    assert.equal(neighborAfterRemoval([2], 2, new Set([2])), null);
    assert.equal(copiesAllowed(190, 3, 200), 3);
    assert.equal(copiesAllowed(200, 3, 200), 0);
    assert.deepEqual(scaleLimits([50, 200]), { min: 1 / 50, max: 5 });
  });
});

describe('scale plans with a cut margin (pad)', () => {
  // Two 20 × 20 images 10 mm apart; with a 3 mm margin their cut boxes are 4 mm apart.
  const boxes = [
    { id: 1, sheet: 1, x: 20, y: 20, w: 20, h: 20 },
    { id: 2, sheet: 1, x: 50, y: 20, w: 20, h: 20 },
  ];
  const opts = { W: 210, H: 297, allowOverlap: false, pad: 3 };

  test('scaleBounds stops where the cut boxes would touch', () => {
    const { max } = scaleBounds(boxes, new Set([1]), [100], 'top-left', opts);
    // Image 1 grows from (20, 20): its cut box reaches 50 − 3 when 20 + 20k + 3 = 47.
    assert.ok(Math.abs(max - 1.2) < 1e-3, String(max)); // touching (EPS) is not overlapping
    const without = scaleBounds(boxes, new Set([1]), [100], 'top-left', { ...opts, pad: 0 });
    assert.ok(Math.abs(without.max - 1.5) < 1e-3, String(without.max));
  });

  test('planScale refuses what would make the cut boxes overlap, and transforms the images', () => {
    assert.equal(planScale(boxes, new Set([1]), 1.3, 'top-left', opts).reason, 'overlap');
    const plan = planScale(boxes, new Set([1]), 1.15, 'top-left', opts);
    assert.ok(plan.ok);
    assert.deepEqual(plan.rects.get(1), { id: 1, x: 20, y: 20, w: 23, h: 23 });
  });
});
