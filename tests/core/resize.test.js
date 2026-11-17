import { describe, expect, test } from 'vitest';
import { pieceSize } from '../../src/core/crop.js';
import { overlaps } from '../../src/core/collide.js';
import { planPhotoSize, settleResized } from '../../src/core/resize.js';

// What a standard photo size does to the selected pieces, worked out before
// anything changes (what the canvas previews and the action applies), and
// where pieces that changed size end up. Real-store cases (notices, undo,
// the preview drawn from the same plan) are in tests/state/photo-sizes.test.ts
// and tests/state/canvas-previews.test.ts.

// A4 with a 10 mm margin and a 5 mm gap.
const SHEET = { W: 210, H: 297, margin: 10, gap: 5 };
const ASSETS = {
  wide: { w: 160, h: 100 },
  tall: { w: 100, h: 160 },
  square: { w: 50, h: 50 },
  tiny: { w: 5, h: 5 },
};
const SIZE_10X15 = { w: 101.6, h: 152.4 };
const SIZE_13X18 = { w: 127, h: 177.8 };
const SIZE_20X30 = { w: 203.2, h: 304.8 };

const piece = (id, asset, x, y, more = {}) => ({ id, asset, sheet: 1, x, y, scale: 100, r: 0, crop: null, ...more });
const assetOf = (item) => ASSETS[item.asset];
const sizeOf = (item) => pieceSize(assetOf(item), item);
const center = (item) => {
  const { w, h } = sizeOf(item);
  return { x: item.x + w / 2, y: item.y + h / 2 };
};
const box = (item, pad = 0) => {
  const { w, h } = sizeOf(item);
  return { x: item.x - pad, y: item.y - pad, w: w + 2 * pad, h: h + 2 * pad };
};

/** Sheet ids handed out from 100 on, counting how many were asked for. */
function sheetIds() {
  let next = 100;
  const counter = () => next++;
  counter.used = () => next - 100;
  return counter;
}

function plan(selected, size, items, more = {}) {
  return planPhotoSize(selected, size, { ...SHEET, assetOf, items, sheetIds: [1], newSheet: sheetIds(), ...more });
}

describe('planPhotoSize: the size each piece gets', () => {
  test('alone in the middle of the sheet: exactly the size, turned to the image, cropped centered, with its center where it was', () => {
    const item = piece(1, 'wide', 40, 100, { scale: 50 });
    const result = plan([item], SIZE_10X15, [item]);
    expect(result).toMatchObject({ refused: [], moved: [], sheets: [], problems: [] });
    const [next] = result.changed;
    expect(sizeOf(next).w).toBeCloseTo(152.4, 9);
    expect(sizeOf(next).h).toBeCloseTo(101.6, 9);
    expect(center(next).x).toBeCloseTo(center(item).x, 9);
    expect(center(next).y).toBeCloseTo(center(item).y, 9);
    expect(next.crop.x).toBeCloseTo((1 - next.crop.w) / 2, 9);
    expect(next).toMatchObject({ id: 1, sheet: 1, r: 0, asset: 'wide' });
  });

  test('a rotated piece keeps its rotation and stands as it is seen', () => {
    const item = piece(1, 'wide', 40, 60, { scale: 50, r: 90 });
    const [next] = plan([item], SIZE_10X15, [item]).changed;
    expect(next.r).toBe(90);
    expect(sizeOf(next).w).toBeCloseTo(101.6, 9);
    expect(sizeOf(next).h).toBeCloseTo(152.4, 9);
  });

  test('a size the piece already has, or «Original» on a piece without a crop: nothing changes', () => {
    const item = piece(1, 'wide', 40, 100, { scale: 50 });
    const [sized] = plan([item], SIZE_10X15, [item]).changed;
    expect(plan([sized], SIZE_10X15, [sized]).changed).toEqual([]);
    expect(plan([item], null, [item])).toEqual({ changed: [], refused: [], moved: [], sheets: [], problems: [] });
  });

  test('«Original» takes the crop away at the same scale, the center staying where it was', () => {
    const item = piece(1, 'wide', 40, 100, { scale: 50 });
    const [sized] = plan([item], SIZE_10X15, [item]).changed;
    const [back] = plan([sized], null, [sized], { allowOverlap: true }).changed;
    expect(back).toMatchObject({ crop: null, scale: sized.scale });
    expect(sizeOf(back).w).toBeCloseTo((160 * sized.scale) / 100, 9);
    expect(center(back).x).toBeCloseTo(center(sized).x, 9);
    expect(center(back).y).toBeCloseTo(center(sized).y, 9);
  });

  test('past 1000 %: refused, shown as it would be (that size, centered), and left as it is', () => {
    const item = piece(1, 'tiny', 50, 50);
    const result = plan([item], SIZE_10X15, [item]);
    expect(result.changed).toEqual([]);
    const [wouldBe] = result.refused;
    expect(wouldBe.id).toBe(1);
    expect(wouldBe.scale).toBeGreaterThan(1000);
    expect(sizeOf(wouldBe).w).toBeCloseTo(101.6, 9);
    expect(center(wouldBe).x).toBeCloseTo(center(item).x, 9);
  });

  test('several: each one in its own orientation; one refused doesn’t stop the others', () => {
    const items = [piece(1, 'wide', 20, 20, { scale: 50 }), piece(2, 'tall', 20, 150, { scale: 50 }), piece(3, 'tiny', 150, 250)];
    const result = plan(items, SIZE_10X15, items, { allowOverlap: true });
    expect(result.changed.map((item) => [item.id, Math.round(sizeOf(item).w * 10) / 10])).toEqual([
      [1, 152.4],
      [2, 101.6],
    ]);
    expect(result.refused.map((item) => item.id)).toEqual([3]);
  });

  test('nothing it gets is shared with what it was given: the pieces stay as they were', () => {
    const items = [piece(1, 'square', 20, 20), piece(2, 'square', 75, 20)];
    const copy = structuredClone(items);
    plan([items[0]], SIZE_13X18, items);
    expect(items).toEqual(copy);
  });
});

describe('planPhotoSize: where each piece ends up', () => {
  test('growing onto a neighbor (overlaps not allowed): to the closest free spot of its sheet, clear of it', () => {
    const items = [piece(1, 'square', 20, 20), piece(2, 'square', 75, 20)];
    const result = plan([items[0]], SIZE_13X18, items);
    const [next] = result.changed;
    expect(result.moved).toEqual([1]);
    expect(next.sheet).toBe(1);
    expect(overlaps(box(next), box(items[1]))).toBe(false);
    expect(result.problems).toEqual([]);
  });

  test('with overlaps allowed it stays centered where it was, on top of the neighbor, and that is no problem', () => {
    const items = [piece(1, 'square', 60, 100), piece(2, 'square', 115, 100)];
    const result = plan([items[0]], SIZE_13X18, items, { allowOverlap: true });
    const [next] = result.changed;
    expect(result.moved).toEqual([]);
    expect(center(next)).toEqual(center(items[0]));
    expect(overlaps(box(next), box(items[1]))).toBe(true);
    expect(result.problems).toEqual([]);
  });

  test('the cut margin keeps the layout boxes apart', () => {
    const items = [piece(1, 'square', 20, 20), piece(2, 'square', 75, 20)];
    const [next] = plan([items[0]], SIZE_13X18, items, { pad: 3 }).changed;
    expect(overlaps(box(next, 3), box(items[1], 3))).toBe(false);
  });

  test('no room left on its sheet: to a sheet still to add, with the id asked for then (and no other)', () => {
    const items = [piece(1, 'square', 20, 20), piece(2, 'square', 80, 120)];
    const newSheet = sheetIds();
    const result = plan([items[0]], { w: 152.4, h: 203.2 }, items, { newSheet });
    expect(result.sheets).toEqual([100]);
    expect(result.changed[0].sheet).toBe(100);
    expect(result.moved).toEqual([1]);
    expect(newSheet.used()).toBe(1);
  });

  test('another sheet with room takes it before a new one is added', () => {
    const items = [piece(1, 'square', 20, 20), piece(2, 'square', 80, 120), piece(3, 'square', 20, 20, { sheet: 2 })];
    const result = plan([items[0]], { w: 152.4, h: 203.2 }, items, { sheetIds: [1, 2] });
    expect(result.sheets).toEqual([]);
    expect(result.changed[0].sheet).toBe(2);
    expect(overlaps(box(result.changed[0]), box(items[2]))).toBe(false);
  });

  test('it never goes back to an earlier sheet, even an empty one', () => {
    const items = [piece(1, 'square', 20, 20, { sheet: 2 }), piece(2, 'square', 80, 120, { sheet: 2 })];
    const result = plan([items[0]], { w: 152.4, h: 203.2 }, items, { sheetIds: [1, 2] });
    expect(result.sheets).toEqual([100]);
    expect(result.changed[0].sheet).toBe(100);
  });

  test('alone near an edge, growing past it: its center stays on the sheet, the rest is off it, and that is a problem', () => {
    const item = piece(1, 'square', 5, 120);
    const result = plan([item], SIZE_13X18, [item]);
    const [next] = result.changed;
    expect(next.x).toBeLessThan(0);
    expect(center(next).x).toBeGreaterThanOrEqual(0);
    expect(result.problems).toEqual([1]);
  });

  test('larger than the sheet (20 × 30 on A4): it can’t go anywhere, stays centered on its neighbor and leaves the sheet', () => {
    const items = [piece(1, 'square', 80, 120), piece(2, 'square', 20, 20)];
    const result = plan([items[0]], SIZE_20X30, items);
    const [next] = result.changed;
    expect(result.moved).toEqual([]);
    expect(result.sheets).toEqual([]);
    expect(center(next).x).toBeCloseTo(center(items[0]).x, 9);
    expect(result.problems).toEqual([1]);
  });
});

describe('settleResized', () => {
  const options = (more = {}) => ({ ...SHEET, assetOf, newSheet: sheetIds(), ...more });

  test('a piece whose center would leave the sheet is brought back until its center is on it', () => {
    const grown = piece(1, 'square', -60, 280, { scale: 200 });
    const { items, moved, sheets } = settleResized([grown], [grown], [1], options());
    expect(center(items[0])).toEqual({ x: 0, y: 297 });
    expect({ moved, sheets }).toEqual({ moved: [], sheets: [] });
  });

  test('with no printable area left, one with no room on its sheet stays where it was: no sheet is added', () => {
    const items = [piece(1, 'square', 20, 20, { scale: 300 }), piece(2, 'square', 100, 100)];
    const newSheet = sheetIds();
    const result = settleResized([items[0]], items, [1], options({ margin: 105, newSheet }));
    expect(result).toEqual({ items: [items[0]], moved: [], sheets: [] });
    expect(newSheet.used()).toBe(0);
  });
});
