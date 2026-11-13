// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { addAsset, assetEntries, getAsset, replaceAssets } from '../../src/state/assets.ts';
import { getDocument, setDocument, type Piece } from '../../src/state/document.ts';
import { historyDepth, resetHistory, undo } from '../../src/state/history.ts';
import { setAllowOverlap } from '../../src/state/prefs.ts';
import { setView } from '../../src/state/view.ts';
import { copySelection, cutSelection, hasClip, pastePieces } from '../../src/state/actions/clipboard.ts';

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
  setAllowOverlap(false);
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
});
