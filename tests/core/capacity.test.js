import { describe, expect, test } from 'vitest';
import { gridCapacity, sheetCapacity } from '../../src/core/capacity.js';

const A4 = { w: 210, h: 297 };
const LETTER = { w: 215.9, h: 279.4 };
const area = ({ w, h }, margin) => ({ aw: w - 2 * margin, ah: h - 2 * margin });
// The app's standard photo sizes (src/core/crop.js): 10 × 15 is 4 × 6 in.
const PHOTO_10X15 = { w: 101.6, h: 152.4 };
const ID_4X4 = { w: 40, h: 40 };
const PASSPORT = { w: 35, h: 45 };

/** Every rectangle inside the area and at least `gap` away from the others. */
function assertValid(placements, { aw, ah }, gap) {
  const tol = 1e-6;
  for (const r of placements) {
    expect(r.x).toBeGreaterThanOrEqual(-tol);
    expect(r.y).toBeGreaterThanOrEqual(-tol);
    expect(r.x + r.w).toBeLessThanOrEqual(aw + tol);
    expect(r.y + r.h).toBeLessThanOrEqual(ah + tol);
  }
  for (let i = 0; i < placements.length; i++)
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      const apart = a.x + a.w + gap <= b.x + tol || b.x + b.w + gap <= a.x + tol || a.y + a.h + gap <= b.y + tol || b.y + b.h + gap <= a.y + tol;
      expect(apart, `copies ${i} and ${j} are closer than the gap`).toBe(true);
    }
}

describe('«Rellenar con copias»: the grid', () => {
  test('copies in rows and columns, turned when that fits more', () => {
    expect(gridCapacity(PHOTO_10X15, area(A4, 0))).toEqual({ count: 2, cols: 2, rows: 1, rotated: false });
    expect(gridCapacity(PASSPORT, area(LETTER, 5))).toEqual({ count: 28, cols: 4, rows: 7, rotated: true });
    expect(gridCapacity(PASSPORT, area(LETTER, 5), { rotate: false })).toEqual({ count: 25, cols: 5, rows: 5, rotated: false });
  });

  test('the gap goes between copies, not against the edges', () => {
    // 5 copies of 40 mm with 4 gaps of 2 mm take exactly 208 mm.
    expect(gridCapacity(ID_4X4, { aw: 208, ah: 40 }, { gap: 2 }).count).toBe(5);
    expect(gridCapacity(ID_4X4, { aw: 207.9, ah: 40 }, { gap: 2 }).count).toBe(4);
  });
});

describe('«Acomodar»: the most copies on one sheet', () => {
  test.each([
    // 10 × 15 on A4: two upright and one turned below, only with a margin of 3,4 mm or less.
    ['10 × 15 on A4, no margin', PHOTO_10X15, area(A4, 0), 0, 3, 2],
    ['10 × 15 on A4, 3 mm margin', PHOTO_10X15, area(A4, 3), 0, 3, 2],
    ['10 × 15 on A4, 3 mm margin and 2 mm gap', PHOTO_10X15, area(A4, 3), 2, 2, 2],
    ['10 × 15 on A4, 5 mm margin', PHOTO_10X15, area(A4, 5), 0, 2, 2],
    ['10 × 15 on Carta, 5 mm margin and 2 mm gap', PHOTO_10X15, area(LETTER, 5), 2, 3, 2],
    ['4 × 4 on A4, 5 mm margin and 2 mm gap', ID_4X4, area(A4, 5), 2, 24, 24],
    ['3,5 × 4,5 on A4, 5 mm margin and 2 mm gap', PASSPORT, area(A4, 5), 2, 30, 30],
    ['3,5 × 4,5 on Carta, 5 mm margin', PASSPORT, area(LETTER, 5), 0, 32, 28],
  ])('%s: %i copies (the grid: %i)', (_, piece, space, gap, count, grid) => {
    const result = sheetCapacity(piece, space, { gap });
    expect(result.count).toBe(count);
    expect(result.grid.count).toBe(grid);
    expect(result.placements).toHaveLength(count);
    expect(result.capped).toBe(false);
    assertValid(result.placements, space, gap);
  });

  test('without «Rotación automática» no copy is turned', () => {
    const result = sheetCapacity(PHOTO_10X15, area(A4, 0), { rotate: false });
    expect(result.count).toBe(2);
    expect(result.placements.every((r) => r.w === PHOTO_10X15.w && r.h === PHOTO_10X15.h)).toBe(true);
  });

  test('turned copies come with their sides swapped', () => {
    const { placements } = sheetCapacity(PHOTO_10X15, area(A4, 0));
    expect(placements.filter((r) => r.w > r.h)).toHaveLength(1);
    expect(placements.filter((r) => r.w < r.h)).toHaveLength(2);
  });

  test('more copies than the limit: the limit, and it says so', () => {
    const space = area({ w: 297, h: 420 }, 0);
    const result = sheetCapacity({ w: 20, h: 25 }, space, { limit: 200 });
    expect(result.count).toBe(200);
    expect(result.capped).toBe(true);
    expect(result.placements).toHaveLength(200);
    assertValid(result.placements, space, 0);
    expect(sheetCapacity({ w: 20, h: 25 }, area(A4, 5), { gap: 2, limit: 50 })).toMatchObject({ count: 50, capped: true });
  });

  test.each([
    ['a piece larger than the area', { w: 300, h: 300 }, area(A4, 0)],
    ['no printable area', ID_4X4, { aw: 0, ah: 100 }],
    ['a piece with no size', { w: 0, h: 40 }, area(A4, 0)],
  ])('%s: none', (_, piece, space) => {
    expect(sheetCapacity(piece, space)).toMatchObject({ count: 0, placements: [], capped: false });
  });
});
