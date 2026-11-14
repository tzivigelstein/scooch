// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';
import { addAsset } from '../../src/state/assets.ts';
import { getDocument, setDocument, type Piece } from '../../src/state/document.ts';
import { historyDepth, resetHistory } from '../../src/state/history.ts';
import { setGrid } from '../../src/state/prefs.ts';
import { getView, setView } from '../../src/state/view.ts';
import { nudge, rotate } from '../../src/state/actions/pieces.ts';

// 40 × 20 mm at 100 %.
const key = addAsset({
  kind: 'image',
  name: 'foto.png',
  src: 1,
  px: [480, 240],
  w: 40,
  h: 20,
  bytes: new Uint8Array(),
  preview: new Blob(),
  url: 'blob:test',
  format: 'png',
  dpi: 300,
  derived: false,
});

const piece = (id: number, x: number, y: number): Piece => ({ id, asset: key, sheet: 1, x, y, scale: 100, r: 0, crop: null });
const item = (id: number) => getDocument().items.find((i) => i.id === id)!;

beforeEach(() => {
  setDocument({ allowOverlap: false });
  setGrid({ snap: true, size: 1 });
  setView({ flash: null });
  resetHistory();
});

describe('a single piece is a group of one', () => {
  test('rotating doesn’t apply when it would overlap a neighbor, and explains why', () => {
    // Rotated around its center, piece 1 (40 × 20 at 50, 50) would take 60..80 × 40..80: piece 2 sits at 62, 75.
    setDocument({ sheets: [{ id: 1 }], items: [piece(1, 50, 50), piece(2, 62, 75)], selection: [1] });
    rotate(1);
    expect(item(1).r).toBe(0);
    expect(historyDepth().undo).toBe(0);
    expect(getView().flash?.text).toMatch(/No se puede rotar/);
    getView().flash?.action?.run(); // «Permitir superposición»
    expect(item(1).r).toBe(90);
    expect(item(1)).toMatchObject({ x: 60, y: 40 });
  });

  test('rotating keeps the center, in one undo step', () => {
    setDocument({ sheets: [{ id: 1 }], items: [piece(1, 50, 50)], selection: [1] });
    rotate(-1);
    expect(item(1)).toMatchObject({ r: 270, x: 60, y: 40 });
    expect(historyDepth().undo).toBe(1);
  });

  test('arrows jump over a neighbor in the way, like a group', () => {
    setDocument({ sheets: [{ id: 1 }], items: [piece(1, 50, 50), piece(2, 90.5, 50)], selection: [1] });
    nudge(1, 0);
    expect(item(1).x).toBe(130.5);
  });
});
