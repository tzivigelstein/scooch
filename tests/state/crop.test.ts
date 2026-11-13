// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';
import { addAsset } from '../../src/state/assets.ts';
import { getDocument, setDocument, type Piece } from '../../src/state/document.ts';
import { historyDepth, resetHistory, undo } from '../../src/state/history.ts';
import { setAllowOverlap } from '../../src/state/prefs.ts';
import { dims } from '../../src/state/selectors.ts';
import { setView } from '../../src/state/view.ts';
import { applyPhotoSize, photoSizeOf, selectionPhotoSize } from '../../src/state/actions/crop.ts';

const image = (w: number, h: number) =>
  addAsset({ kind: 'image', name: `${w}x${h}.png`, src: 1, px: [w * 10, h * 10], w, h, bytes: new Uint8Array(), preview: new Blob(), url: 'blob:test', format: 'png', dpi: 254, derived: false });

// Re-added for each test: an undo step releases the assets no piece uses.
let wide = '';
let tall = '';

const piece = (id: number, asset: string, x: number, y: number, props: Partial<Piece> = {}): Piece => ({ id, asset, sheet: 1, x, y, scale: 100, r: 0, crop: null, ...props });
const item = (id: number) => getDocument().items.find((i) => i.id === id)!;
const size = (id: number) => dims(item(id)).map((v) => Math.round(v * 1000) / 1000);
const center = (p: Piece) => {
  const [w, h] = dims(p);
  return [p.x + w / 2, p.y + h / 2].map((v) => Math.round(v * 1000) / 1000);
};

beforeEach(() => {
  wide = image(160, 100);
  tall = image(80, 120);
  setAllowOverlap(false);
  setView({ flash: null });
  setDocument({ sheets: [{ id: 1 }], paper: 'A4', landscape: false, margin: 10, gap: 5, busy: false });
  resetHistory();
});

describe('standard photo sizes', () => {
  test('a piece becomes exactly the size, turned to the image’s orientation, keeping its center', () => {
    setDocument({ items: [piece(1, wide, 20, 20), piece(2, tall, 20, 150)], selection: [1] });
    const before = center(item(1));
    applyPhotoSize('10x15');
    expect(size(1)).toEqual([152.4, 101.6]);
    expect(item(1).crop).not.toBeNull();
    expect(center(item(1))).toEqual(before);
    expect(photoSizeOf(item(1))).toBe('10x15');
    expect(historyDepth().undo).toBe(1);
  });

  test('honors the rotation and works on every selected piece', () => {
    setDocument({ items: [piece(1, wide, 20, 20, { r: 90 }), piece(2, tall, 20, 160)], selection: [1, 2] });
    applyPhotoSize('passport-35x45');
    expect(size(1)).toEqual([35, 45]); // shown standing (rotated wide image)
    expect(size(2)).toEqual([35, 45]);
    expect(selectionPhotoSize([item(1), item(2)])).toBe('passport-35x45');
  });

  test('«Original» removes the crop', () => {
    setDocument({ items: [piece(1, wide, 20, 20, { crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } })], selection: [1] });
    expect(photoSizeOf(item(1))).toBe('custom');
    applyPhotoSize('original');
    expect(item(1).crop).toBeNull();
    expect(photoSizeOf(item(1))).toBe('original');
  });

  test('a piece that would overlap moves to the closest free spot; with overlaps allowed it stays', () => {
    const items = [piece(1, tall, 10, 10, { scale: 50 }), piece(2, tall, 60, 10, { scale: 50 })];
    setDocument({ items, selection: [1] });
    applyPhotoSize('13x18'); // 127 × 177.8: grows over piece 2
    const [w, h] = dims(item(1));
    const other = item(2);
    const [ow, oh] = dims(other);
    const apart = item(1).x >= other.x + ow - 0.01 || other.x >= item(1).x + w - 0.01 || item(1).y >= other.y + oh - 0.01 || other.y >= item(1).y + h - 0.01;
    expect(apart || item(1).sheet !== other.sheet).toBe(true);
    undo();
    expect(getDocument().items).toEqual(items);
    setAllowOverlap(true);
    applyPhotoSize('13x18');
    expect(item(1).sheet).toBe(1);
  });

  test('without room on its sheet it goes to a new sheet, in the same undo step', () => {
    const items = [piece(1, wide, 10, 10, { scale: 30 }), piece(2, wide, 10, 50, { scale: 125 })];
    setDocument({ items, selection: [1] });
    applyPhotoSize('13x18'); // 177.8 × 127 doesn't fit beside piece 2
    expect(getDocument().sheets.length).toBe(2);
    expect(item(1).sheet).toBe(getDocument().sheets[1].id);
    expect(size(1)).toEqual([177.8, 127]);
    undo();
    expect(getDocument().sheets.length).toBe(1);
    expect(getDocument().items).toEqual(items);
  });

  test('refuses (with a notice) a size whose scale would leave 1 %–1000 %', () => {
    const tiny = image(2, 3);
    setDocument({ items: [piece(1, tiny, 10, 10)], selection: [1] });
    applyPhotoSize('20x30');
    expect(item(1).crop).toBeNull();
    expect(historyDepth().undo).toBe(0);
  });
});
