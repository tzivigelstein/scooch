// @vitest-environment jsdom
// Every standard photo size on a landscape, a portrait and a square image in the
// 4 rotations: the piece becomes exactly that size, turned to the image as it is
// seen, keeps its rotation, and the «Tamaño» select (photoSizeOf) names it.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PHOTO_SIZES } from '../../src/core/crop.js';
import { getDocument } from '../../src/state/document.ts';
import { getView } from '../../src/state/view.ts';
import { historyDepth, undo } from '../../src/state/history.ts';
import { dims } from '../../src/state/selectors.ts';
import { applyPhotoSize, photoSizeOf, selectionPhotoSize } from '../../src/state/actions/crop.ts';
import { fakeImageMm, heard, listen, piece, resetState } from '../support/state.ts';

const SHAPES = {
  landscape: [160, 100],
  portrait: [100, 160],
  square: [120, 120],
} as const;
type Shape = keyof typeof SHAPES;

const item = (id: number) => getDocument().items.find((i) => i.id === id)!;

/** The size a piece should get: the image as seen (rotated) decides the orientation; a square image keeps the size as listed. */
function expected(shape: Shape, r: number, size: { w: number; h: number }) {
  const lying = shape === 'square' ? false : (shape === 'landscape') === (r % 180 === 0);
  return lying ? [Math.max(size.w, size.h), Math.min(size.w, size.h)] : [size.w, size.h];
}

const cases = PHOTO_SIZES.flatMap((size) =>
  (Object.keys(SHAPES) as Shape[]).flatMap((shape) => ([0, 90, 180, 270] as const).map((r) => ({ id: size.id, shape, r, size })))
);

beforeEach(() => resetState());
afterEach(() => {
  vi.useRealTimers();
});

const plain = (text: string | undefined) => text?.replace(/\u00a0/g, ' ');

describe('standard photo sizes on every image shape and rotation', () => {
  test.each(cases)('$id on a $shape image at $r°: exactly the size, same rotation, the select names it', ({ id, shape, r, size }) => {
    const [w, h] = SHAPES[shape];
    resetState({ items: [piece(1, fakeImageMm(w, h), 20, 20, { r })], selection: [1] });
    applyPhotoSize(id);
    const [gotW, gotH] = dims(item(1));
    const [wantW, wantH] = expected(shape, r, size);
    expect(gotW).toBeCloseTo(wantW, 6);
    expect(gotH).toBeCloseTo(wantH, 6);
    expect(item(1).r).toBe(r);
    expect(photoSizeOf(item(1))).toBe(id);
    expect(selectionPhotoSize([item(1)])).toBe(id);
    expect(historyDepth().undo).toBe(1);
  });

  test('with 2 selected, each one becomes 10 × 15 in its own orientation, in one undo step', () => {
    const items = [piece(1, fakeImageMm(160, 100), 20, 20), piece(2, fakeImageMm(100, 160, { src: 2 }), 20, 150)];
    resetState({ items, selection: [1, 2] });
    applyPhotoSize('10x15');
    expect(dims(item(1)).map((v) => Math.round(v * 1000) / 1000)).toEqual([152.4, 101.6]);
    expect(dims(item(2)).map((v) => Math.round(v * 1000) / 1000)).toEqual([101.6, 152.4]);
    expect(selectionPhotoSize([item(1), item(2)])).toBe('10x15');
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(getDocument().items).toEqual(items);
  });
});

describe('what applying a photo size says', () => {
  test('a size the piece already has changes nothing and is only announced', () => {
    resetState({ items: [piece(1, fakeImageMm(50, 50), 20, 20)], selection: [1] });
    listen();
    applyPhotoSize('10x15');
    heard();
    applyPhotoSize('10x15');
    expect(historyDepth().undo).toBe(1);
    expect(getView().flash).toBeNull();
    expect(heard()).toBe('La pieza ya tiene ese tamaño.');
  });

  test('a piece that grows onto its neighbor moves to a free spot of its sheet: announced, the canvas shows it', () => {
    resetState({ items: [piece(1, fakeImageMm(50, 50), 20, 20), piece(2, fakeImageMm(50, 50), 75, 20)], selection: [1] });
    listen();
    applyPhotoSize('13x18');
    expect(item(1).sheet).toBe(item(2).sheet);
    expect(getView().flash).toBeNull();
    expect(plain(heard())).toBe('Se recortó a 13 × 18: 127 × 177,8 mm. 1 pieza se movió a un lugar libre para no superponerse.');
  });

  test('a piece with no room left on its sheet goes to the next one: a notice, not a success, names that sheet', () => {
    resetState({ items: [piece(1, fakeImageMm(50, 50), 20, 20), piece(2, fakeImageMm(50, 50), 80, 120)], selection: [1] });
    applyPhotoSize('15x20');
    expect(getDocument().sheets).toHaveLength(2);
    expect(item(1).sheet).toBe(getDocument().sheets[1].id);
    const flash = getView().flash!;
    expect(plain(flash.text)).toBe('Se recortó a 15 × 20: 152,4 × 203,2 mm. 1 pieza pasó a la hoja 2 para no superponerse.');
    expect(flash).toMatchObject({ info: true });
    expect(flash.warn).toBeFalsy();
  });

  test('a size that would take a piece past 1000 % is refused for it, with a warning', () => {
    resetState({ items: [piece(1, fakeImageMm(5, 5, { name: 'tiny.png' }), 20, 20)], selection: [1] });
    applyPhotoSize('20x30');
    expect(historyDepth().undo).toBe(0);
    expect(getView().flash).toMatchObject({ warn: true });
    expect(plain(getView().flash!.text)).toBe('tiny.png no se puede llevar a ese tamaño: su escala pasaría de 1 % a 1000 %');
  });
});
