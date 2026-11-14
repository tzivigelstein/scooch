// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { addAsset, assetEntries, getAsset, replaceAssets } from '../../src/state/assets.ts';
import { getDocument, resetIds, setDocument, type Piece } from '../../src/state/document.ts';
import { historyDepth, redo, resetHistory, undo } from '../../src/state/history.ts';

import { getView, setView } from '../../src/state/view.ts';
import { copySelection, cutSelection, hasClip, pastePieces } from '../../src/state/actions/clipboard.ts';
import { duplicate } from '../../src/state/actions/pieces.ts';

beforeAll(() => {
  URL.createObjectURL ??= () => 'blob:pasted';
  URL.revokeObjectURL ??= () => {};
});

const image = (src = 1) =>
  addAsset({ kind: 'image', name: `foto${src}.png`, src, px: [600, 400], w: 60, h: 40, bytes: new Uint8Array(), preview: new Blob(), url: 'blob:test', format: 'png', dpi: 254, derived: false });

const piece = (id: number, asset: string, x: number, y: number, props: Partial<Piece> = {}): Piece => ({ id, asset, sheet: 1, x, y, scale: 100, r: 0, crop: null, ...props });

let key = '';

beforeEach(() => {
  key = image();
  setDocument({ allowOverlap: false });
  setView({ flash: null, sheet: 1 });
  setDocument({ sheets: [{ id: 1 }], paper: 'A4', landscape: false, margin: 10, gap: 5, busy: false, selection: [] });
  resetHistory();
});

describe('clipboard', () => {
  test('copy + paste: copies with the same size, rotation and crop, selected, in free spots, one undo step', () => {
    const crop = { x: 0.1, y: 0.2, w: 0.5, h: 0.5 };
    const items = [piece(1, key, 10, 10, { r: 90, crop }), piece(2, key, 100, 10, { scale: 50 })];
    setDocument({ items, selection: [1, 2] });
    expect(copySelection()).toBe(2);
    expect(hasClip()).toBe(true);
    expect(pastePieces()).toBe(true);
    const doc = getDocument();
    expect(doc.items.length).toBe(4);
    const [a, b] = doc.items.slice(2);
    expect(a).toMatchObject({ r: 90, crop, scale: 100, asset: key });
    expect(b).toMatchObject({ r: 0, crop: null, scale: 50, asset: key });
    expect(doc.selection).toEqual([a.id, b.id]);
    expect(historyDepth().undo).toBe(1);
    // Pasting again keeps working.
    pastePieces();
    expect(getDocument().items.length).toBe(6);
    undo();
    undo();
    expect(getDocument().items).toEqual(items);
  });

  test('cut removes in one step; paste brings copies back', () => {
    const items = [piece(1, key, 10, 10), piece(2, key, 100, 10)];
    setDocument({ items, selection: [2] });
    expect(cutSelection()).toBe(1);
    expect(getDocument().items.map((item) => item.id)).toEqual([1]);
    expect(historyDepth().undo).toBe(1);
    pastePieces();
    expect(getDocument().items.length).toBe(2);
    undo();
    undo();
    expect(getDocument().items).toEqual(items);
  });

  test('into another project: the asset is added with a new source id', () => {
    setDocument({ items: [piece(1, key, 10, 10)], selection: [1] });
    copySelection();
    // Another project opens: its own assets, one with the same source id.
    const other = new Map([['a1', { ...getAsset(key), name: 'otra.png', src: 1 }]]);
    replaceAssets(other, 2);
    setDocument({ items: [piece(1, 'a1', 10, 10)], selection: [] });
    resetHistory();
    pastePieces();
    const pasted = getDocument().items.at(-1)!;
    expect(pasted.asset).not.toBe('a1');
    expect(getAsset(pasted.asset).name).toBe('foto1.png');
    expect(getAsset(pasted.asset).src).not.toBe(1);
    // A second paste reuses the asset it added.
    pastePieces();
    expect(getDocument().items.at(-1)!.asset).toBe(pasted.asset);
    expect(assetEntries().length).toBe(2);
  });

  test('at the 200-piece cap, pasting says no more pieces fit (not «0 piezas más») and adds nothing', () => {
    setDocument({ items: [piece(1, key, 10, 10)], selection: [1] });
    copySelection();
    setDocument({ items: Array.from({ length: 200 }, (_, i) => piece(i + 1, key, 10, 10)), selection: [] });
    expect(pastePieces()).toBe(false);
    expect(getView().flash).toMatchObject({ text: 'Ya hay 200 piezas, el máximo. Quita alguna para pegar.', warn: true });
    expect(getDocument().items).toHaveLength(200);
  });
});

// The old e2e matrix: «Permitir superposición» off and on × four kinds of
// selection × copy + paste, cut + paste and duplicate (Ctrl+D). Each pastes or
// duplicates into free gaps (no overlaps when they are not allowed), selects
// what it added and is exactly one undo step; redo brings it back.
describe('copy, cut and duplicate with every kind of selection', () => {
  // Business-card images (card00.png: 661 × 945 px at 300 ppp, 56 × 80 mm):
  // 4 on sheet 1 and 2 on sheet 2.
  const setup = () => {
    const card = addAsset({ kind: 'image', name: 'card.png', src: 9, px: [661, 945], w: 55.97, h: 80.01, bytes: new Uint8Array(), preview: new Blob(), url: 'blob:test', format: 'png', dpi: 300, derived: false });
    const items = [
      piece(1, card, 10, 10),
      piece(2, card, 71, 10),
      piece(3, card, 132, 10),
      piece(4, card, 10, 95),
      piece(5, card, 10, 10, { sheet: 2 }),
      piece(6, card, 71, 10, { sheet: 2 }),
    ];
    setDocument({ sheets: [{ id: 1 }, { id: 2 }], items, selection: [] });
    resetIds({ item: 7, sheet: 3 });
    resetHistory();
  };
  const SELECTIONS: Record<string, number[]> = {
    'one piece, one sheet': [1],
    'one piece on sheet 2': [5],
    'several on one sheet': [2, 3],
    'several on two sheets': [4, 6],
  };
  const ACTIONS = ['copy + paste', 'cut + paste', 'duplicate'] as const;

  const state = () => ({ sheets: getDocument().sheets, items: getDocument().items });
  const overlapping = () => {
    const boxes = getDocument().items.map((item) => ({ item, w: item.r % 180 ? 80.01 : 55.97, h: item.r % 180 ? 55.97 : 80.01 }));
    return boxes.flatMap((a, i) =>
      boxes
        .slice(i + 1)
        .filter((b) => a.item.sheet === b.item.sheet && a.item.x < b.item.x + b.w - 0.011 && b.item.x < a.item.x + a.w - 0.011 && a.item.y < b.item.y + b.h - 0.011 && b.item.y < a.item.y + a.h - 0.011)
        .map((b) => [a.item.id, b.item.id])
    );
  };

  function run(allowOverlap: boolean, name: string, action: (typeof ACTIONS)[number]) {
    const selection = SELECTIONS[name];
    setup();
    setDocument({ allowOverlap: allowOverlap });
    setDocument({ selection });
    const n = selection.length;
    const base = state();
    if (action === 'copy + paste') {
      expect(copySelection()).toBe(n);
      expect(state()).toEqual(base); // copying changes nothing
      expect(pastePieces()).toBe(true);
    } else if (action === 'cut + paste') {
      expect(cutSelection()).toBe(n);
      expect(getDocument().items).toHaveLength(6 - n);
      undo();
      expect(state()).toEqual(base);
      redo();
      expect(pastePieces()).toBe(true);
    } else {
      duplicate(1);
    }
    const after = state();
    const added = after.items.filter((item) => !base.items.some((b) => b.id === item.id));
    expect(after.items).toHaveLength(action === 'cut + paste' ? 6 : 6 + n);
    expect(added).toHaveLength(n);
    expect([...getDocument().selection].sort()).toEqual(added.map((item) => item.id).sort());
    if (!allowOverlap) expect(overlapping()).toEqual([]);
    undo();
    expect(state()).toEqual(action === 'cut + paste' ? { ...base, items: base.items.filter((item) => !selection.includes(item.id)) } : base);
    redo();
    expect(state()).toEqual(after);
    undo();
    if (action === 'cut + paste') undo();
    expect(state()).toEqual(base);
  }

  test('overlap off, one piece, one sheet: copy + paste', () => run(false, 'one piece, one sheet', 'copy + paste'));
  test('overlap off, one piece, one sheet: cut + paste', () => run(false, 'one piece, one sheet', 'cut + paste'));
  test('overlap off, one piece, one sheet: duplicate', () => run(false, 'one piece, one sheet', 'duplicate'));
  test('overlap off, one piece on sheet 2: copy + paste', () => run(false, 'one piece on sheet 2', 'copy + paste'));
  test('overlap off, one piece on sheet 2: cut + paste', () => run(false, 'one piece on sheet 2', 'cut + paste'));
  test('overlap off, one piece on sheet 2: duplicate', () => run(false, 'one piece on sheet 2', 'duplicate'));
  test('overlap off, several on one sheet: copy + paste', () => run(false, 'several on one sheet', 'copy + paste'));
  test('overlap off, several on one sheet: cut + paste', () => run(false, 'several on one sheet', 'cut + paste'));
  test('overlap off, several on one sheet: duplicate', () => run(false, 'several on one sheet', 'duplicate'));
  test('overlap off, several on two sheets: copy + paste', () => run(false, 'several on two sheets', 'copy + paste'));
  test('overlap off, several on two sheets: cut + paste', () => run(false, 'several on two sheets', 'cut + paste'));
  test('overlap off, several on two sheets: duplicate', () => run(false, 'several on two sheets', 'duplicate'));
  test('overlap on, one piece, one sheet: copy + paste', () => run(true, 'one piece, one sheet', 'copy + paste'));
  test('overlap on, one piece, one sheet: cut + paste', () => run(true, 'one piece, one sheet', 'cut + paste'));
  test('overlap on, one piece, one sheet: duplicate', () => run(true, 'one piece, one sheet', 'duplicate'));
  test('overlap on, one piece on sheet 2: copy + paste', () => run(true, 'one piece on sheet 2', 'copy + paste'));
  test('overlap on, one piece on sheet 2: cut + paste', () => run(true, 'one piece on sheet 2', 'cut + paste'));
  test('overlap on, one piece on sheet 2: duplicate', () => run(true, 'one piece on sheet 2', 'duplicate'));
  test('overlap on, several on one sheet: copy + paste', () => run(true, 'several on one sheet', 'copy + paste'));
  test('overlap on, several on one sheet: cut + paste', () => run(true, 'several on one sheet', 'cut + paste'));
  test('overlap on, several on one sheet: duplicate', () => run(true, 'several on one sheet', 'duplicate'));
  test('overlap on, several on two sheets: copy + paste', () => run(true, 'several on two sheets', 'copy + paste'));
  test('overlap on, several on two sheets: cut + paste', () => run(true, 'several on two sheets', 'cut + paste'));
  test('overlap on, several on two sheets: duplicate', () => run(true, 'several on two sheets', 'duplicate'));
});
