// @vitest-environment jsdom
// «Rotación automática»: arranging, placing what is added and filling a sheet
// with copies may turn a piece's footprint a quarter turn. The piece goes to
// the other rotation of its pair (0° ↔ 90°, 180° ↔ 270°) instead of adding
// 90° each time, so arranging again and again never leaves a photo upside
// down, and one turned to 180° by hand stays at 180° or 270°.
//
// The photo is 120 × 80 mm. On A4 portrait (printable area 190 × 277, gap 5)
// four fit standing and three lying; on landscape four fit lying and three
// standing: switching the orientation makes the packer turn them every time.
import { beforeEach, describe, expect, test } from 'vitest';
import { pieceSize } from '../../src/core/crop.js';
import type { Rotation } from '../../src/core/types.ts';
import { getAsset } from '../../src/state/assets.ts';
import { getDocument, type Piece } from '../../src/state/document.ts';
import { arrange, fillPlan, fillWithCopies, forgetSpill, placeNew, placementsFor } from '../../src/state/actions/layout.ts';
import { duplicate } from '../../src/state/actions/pieces.ts';
import { setSelection } from '../../src/state/actions/selection.ts';
import { setOrientation } from '../../src/state/actions/sheets.ts';
import { dims } from '../../src/state/selectors.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

const PAIR_0: Rotation[] = [0, 90];
const PAIR_180: Rotation[] = [180, 270];

const standing = (item: Piece) => {
  const [w, h] = dims(item);
  return h > w;
};
const items = () => getDocument().items;

let photo: string;

beforeEach(() => {
  resetState();
  forgetSpill();
  photo = fakeImageMm(120, 80);
});

describe('arranging', () => {
  test('six times, switching the paper orientation each time: pieces never turned by hand stay at 0° or 90°, the one turned to 180° by hand at 180° or 270°', () => {
    resetState({ items: [piece(1, photo, 10, 10), piece(2, photo, 10, 100), piece(3, photo, 10, 190), piece(4, photo, 140, 10, { r: 180 })] });
    let turned = 0;
    for (let i = 0; i < 6; i++) {
      setOrientation(i % 2 === 1);
      const before = items().map(standing);
      expect(arrange()).toBe('arranged');
      turned += items().filter((item, k) => standing(item) !== before[k]).length;
      for (const item of items()) expect(item.id === 4 ? PAIR_180 : PAIR_0, `arrange ${i + 1}, piece ${item.id} at ${item.r}°`).toContain(item.r);
    }
    // Every arrange turned all four.
    expect(turned).toBe(24);
    expect(items().map((item) => item.r)).toEqual([0, 0, 0, 180]);
  });

  test('a cropped piece the packer turns keeps its crop and its unrotated size, and turned back it is exactly as it was', () => {
    // The visible part, 120 × 80 mm, out of a 240 × 100 mm image.
    const wide = fakeImageMm(240, 100, { src: 2 });
    const crop = { x: 0.25, y: 0.1, w: 0.5, h: 0.8 };
    resetState({ items: [1, 2, 3, 4].map((id) => piece(id, wide, 10, 10 + 90 * (id - 1), { crop })) });
    const unrotated = (item: Piece) => {
      const { uw, uh } = pieceSize(getAsset(item.asset), item);
      return [uw, uh];
    };
    const start = unrotated(items()[0]);
    expect(arrange()).toBe('arranged');
    for (const item of items()) {
      expect(item.r).toBe(90);
      expect(item.crop).toEqual(crop);
      expect(unrotated(item)).toEqual(start);
    }
    setOrientation(true);
    expect(arrange()).toBe('arranged');
    for (const item of items()) expect(item).toMatchObject({ r: 0, crop, scale: 100 });
  });
});

describe('placing what is added', () => {
  test('files added one by one beside a tall piece: the two the packer turns to fit beside it show at 90°, the rest at 0°', () => {
    placeNew([fakeImageMm(100, 277, { src: 3 })]);
    for (let i = 0; i < 6; i++) placeNew([photo]);
    expect(items().map((item) => item.r)).toEqual([0, 90, 90, 0, 0, 0, 0]);
  });

  test('placementsFor: pieces at 90° the packer turns get 0°, pieces at 270° get 180°', () => {
    resetState({ landscape: true });
    const fresh = [piece(1, photo, 0, 0, { r: 90 }), piece(2, photo, 0, 0, { r: 90 }), piece(3, photo, 0, 0, { r: 270 }), piece(4, photo, 0, 0, { r: 270 })];
    const { placed, unplaced } = placementsFor(fresh, 0);
    expect(unplaced).toEqual([]);
    expect(fresh.map((item) => placed.get(item.id)!.r)).toEqual([0, 0, 180, 180]);
  });
});

describe('filling a sheet with copies', () => {
  test.each([
    ['never turned by hand', 0 as Rotation, PAIR_0],
    ['turned to 180° by hand', 180 as Rotation, PAIR_180],
  ])('six times, switching the paper orientation each time, from a piece %s: the copies stay in its pair', (_, r, pair) => {
    resetState({ items: [piece(1, photo, 10, 10, { r })], selection: [1] });
    for (let i = 0; i < 6; i++) {
      setOrientation(i % 2 === 1);
      expect(fillPlan(items()[0]).rotated, `fill ${i + 1}`).toBe(true);
      expect(fillWithCopies()).toBe(true);
      expect(items()).toHaveLength(4);
      for (const item of items()) expect(pair, `fill ${i + 1}, copy at ${item.r}°`).toContain(item.r);
    }
  });
});

describe('duplicating', () => {
  test('copies keep the rotation of their original: never turned to fit', () => {
    resetState({ items: [piece(1, photo, 10, 10, { r: 90 }), piece(2, photo, 10, 140, { r: 180 })] });
    setSelection([1, 2]);
    duplicate(3);
    const copies = items().slice(2);
    expect(copies).toHaveLength(6);
    expect(copies.map((copy) => copy.r)).toEqual([90, 180, 90, 180, 90, 180]);
  });
});
