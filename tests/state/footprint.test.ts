// @vitest-environment jsdom
// With cut lines on and a positive cut margin, a piece takes its cut box for the layout.
import { beforeEach, describe, expect, test } from 'vitest';
import { addAsset } from '../../src/state/assets.ts';
import { DEFAULT_CUTS } from '../../src/core/projectdoc.js';
import type { Cuts } from '../../src/core/types.ts';
import { getDocument, setDocument, type Piece } from '../../src/state/document.ts';
import { resetHistory } from '../../src/state/history.ts';
import { setGrid } from '../../src/state/prefs.ts';
import { boxes, problemsById } from '../../src/state/selectors.ts';
import { setView } from '../../src/state/view.ts';
import { arrange, fillPlan } from '../../src/state/actions/layout.ts';
import { scaleBy } from '../../src/state/actions/pieces.ts';
import { setCuts } from '../../src/state/actions/sheets.ts';

const image = (w: number, h: number) =>
  addAsset({ kind: 'image', name: `${w}x${h}.png`, src: 1, px: [w * 10, h * 10], w, h, bytes: new Uint8Array(), preview: new Blob(), url: 'blob:test', format: 'png', dpi: 254, derived: false });

const piece = (id: number, asset: string, x: number, y: number): Piece => ({ id, asset, sheet: 1, x, y, scale: 100, r: 0, crop: null });
const cuts = (changes: Partial<Cuts>) => setDocument({ cuts: { ...DEFAULT_CUTS, ...changes } });

let key = '';

beforeEach(() => {
  key = image(50, 30);
  setDocument({ allowOverlap: false });
  setGrid({ snap: false });
  setView({ flash: null });
  setDocument({ sheets: [{ id: 1 }], paper: 'A4', landscape: false, margin: 10, gap: 5, rotate: true, busy: false, selection: [], cuts: { ...DEFAULT_CUTS } });
  resetHistory();
});

describe('the cut box as the layout box', () => {
  test('fill with copies counts cut boxes (exact cases)', () => {
    setDocument({ items: [piece(1, key, 10, 10)] });
    // 50 × 30 in 190 × 277 with a 5 mm gap: 25 turned (5 × 5).
    expect(fillPlan(getDocument().items[0]).count).toBe(25);
    // With a 2 mm margin each copy takes 54 × 34: 3 × 7 = 21 (turned: 5 × 4 = 20).
    cuts({ mode: 'corners', margin: 2 });
    expect(fillPlan(getDocument().items[0])).toMatchObject({ count: 21, cols: 3, rows: 7, rotated: false });
    // Without cut lines, or with a negative margin, the image box as always.
    cuts({ mode: 'none', margin: 2 });
    expect(fillPlan(getDocument().items[0]).count).toBe(25);
    cuts({ mode: 'outline', margin: -1 });
    expect(fillPlan(getDocument().items[0]).count).toBe(25);
  });

  test('arranging keeps the cut boxes a gap apart and inside the printable area', () => {
    cuts({ mode: 'corners', margin: 3 });
    setDocument({ items: Array.from({ length: 8 }, (_, i) => piece(i + 1, key, 10 + i, 10 + i)) });
    arrange();
    const list = boxes();
    for (const a of list) {
      expect(a.x).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(a.y).toBeGreaterThanOrEqual(10 - 1e-6);
      for (const b of list) {
        if (a === b || a.sheet !== b.sheet) continue;
        const apart = a.x + a.w + 5 <= b.x + 0.011 || b.x + b.w + 5 <= a.x + 0.011 || a.y + a.h + 5 <= b.y + 0.011 || b.y + b.h + 5 <= a.y + 0.011;
        expect(apart, JSON.stringify([a, b])).toBe(true);
      }
    }
    // The images sit 3 mm inside their boxes.
    const item = getDocument().items[0];
    const box = list.find((b) => b.id === item.id)!;
    expect(item.x - box.x).toBeCloseTo(3, 9);
  });

  test('changing the margin or the mode never moves pieces; the problems follow the cut box', () => {
    const items = [piece(1, key, 1, 50)];
    setDocument({ items });
    expect(problemsById().get(1)).toMatchObject({ cut: false, pastMargin: true });
    setCuts({ mode: 'corners' });
    setCuts({ margin: 2 });
    expect(getDocument().items).toEqual(items);
    // The cut box starts at x = −1: it goes off the sheet.
    expect(problemsById().get(1)).toMatchObject({ cut: true });
  });

  test('growing stops where the cut boxes would touch', () => {
    cuts({ mode: 'corners', margin: 2 });
    // Images 10 mm apart: cut boxes 6 mm apart.
    setDocument({ items: [piece(1, key, 20, 20), piece(2, key, 80, 20)], selection: [1] });
    for (let i = 0; i < 40; i++) scaleBy(1);
    const [a, b] = boxes();
    expect(a.x + a.w).toBeLessThanOrEqual(b.x + 0.011);
  });
});
