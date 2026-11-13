// @vitest-environment jsdom
// «Duplicar ×N» (duplicate, which places with duplicatePieces) and «Seleccionar
// iguales» (selectSame) on the real stores: where the copies go, what ends up
// selected, the notices, the 200-piece cap and one undo step each.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { MAX_ITEMS } from '../../src/config.ts';
import { getDocument, setDocument, type Piece } from '../../src/state/document.ts';
import { historyDepth, resetHistory, undo } from '../../src/state/history.ts';
import { getView } from '../../src/state/view.ts';
import { dims } from '../../src/state/selectors.ts';
import { placeNew } from '../../src/state/actions/layout.ts';
import { duplicate, maxCopies, setScaleField } from '../../src/state/actions/pieces.ts';
import { selectSame, setSelection } from '../../src/state/actions/selection.ts';
import { fakeImage, fakePdf, piece, resetState } from '../support/state.ts';

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
  document.body.innerHTML = '<div id="live-polite"></div><div id="live-assertive"></div>';
});

function heard() {
  vi.advanceTimersByTime(1000);
  return (document.getElementById('live-polite')!.textContent ?? '').replace(/ /g, ' ').trim();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  for (const id of ['live-polite', 'live-assertive']) document.getElementById(id)!.textContent = '';
});

const documentNow = () => {
  const { items, sheets, selection } = getDocument();
  return { items, sheets, selection };
};

function overlapping(items: readonly Piece[], eps = 0.011) {
  const bad: [number, number][] = [];
  items.forEach((a, i) =>
    items.slice(i + 1).forEach((b) => {
      const [aw, ah] = dims(a);
      const [bw, bh] = dims(b);
      if (a.sheet === b.sheet && a.x < b.x + bw - eps && b.x < a.x + aw - eps && a.y < b.y + bh - eps && b.y < a.y + ah - eps) bad.push([a.id, b.id]);
    })
  );
  return bad;
}

/** Three different 531 × 591 px tiles (300 ppi) placed like loaded files; `selected` of them selected. */
function tiles(selected: number[] = [0]) {
  resetState();
  placeNew([30, 31, 32].map((src) => fakeImage({ name: `tile${src}.png`, src, px: [531, 591] })));
  const ids = getDocument().items.map((item) => item.id);
  setSelection(selected.map((i) => ids[i]));
  resetHistory();
  return ids;
}

describe('duplicate ×N', () => {
  test('×5: five new copies, selected, in free gaps, identical, nothing else moved, one undo step', () => {
    const ids = tiles();
    const before = documentNow();
    const [original] = before.items;
    duplicate(5);
    const { items, selection } = getDocument();
    expect(items).toHaveLength(8);
    const copies = items.filter((item) => !ids.includes(item.id));
    expect(selection).toEqual(copies.map((copy) => copy.id));
    expect(getView().flash).toMatchObject({ text: 'Se agregaron 5 copias en la hoja 1' });
    expect(items.slice(0, 3)).toEqual(before.items);
    expect(overlapping(items)).toEqual([]);
    for (const copy of copies) expect(copy).toMatchObject({ asset: original.asset, scale: original.scale, r: original.r, crop: original.crop, sheet: 1 });
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(documentNow()).toEqual(before);
  });

  test('two selected × 3: six copies, selected, without overlaps', () => {
    tiles([0, 1]);
    duplicate(3);
    expect(getDocument().items).toHaveLength(9);
    expect(getDocument().selection).toHaveLength(6);
    expect(overlapping(getDocument().items)).toEqual([]);
    expect(getView().flash?.text).toBe('Se agregaron 6 copias en la hoja 1');
  });

  test('what does not fit on the sheet goes to new sheets, and the notice says on how many', () => {
    // 15 tiles fit on an A4 sheet (3 × 5): 3 + 13 need a second one.
    tiles();
    const before = documentNow();
    duplicate(13);
    const { items, sheets } = getDocument();
    expect(sheets).toHaveLength(2);
    expect(items.filter((item) => item.sheet === sheets[1].id)).toHaveLength(1);
    expect(items.slice(0, 3)).toEqual(before.items);
    expect(overlapping(items)).toEqual([]);
    expect(getView().flash?.text).toBe('Se agregaron 13 copias en 2 hojas');
    undo();
    expect(documentNow()).toEqual(before);
  });

  test('one copy (D) of one piece announces the new total', () => {
    tiles();
    duplicate();
    expect(getDocument().items).toHaveLength(4);
    expect(heard()).toBe('Se duplicó la pieza. Hay 4 piezas.');
  });

  test('maxCopies: how many copies of the selection still fit under the 200-piece cap', () => {
    tiles();
    expect(maxCopies()).toBe(MAX_ITEMS - 3);
    setSelection(getDocument().items.slice(0, 2).map((item) => item.id));
    expect(maxCopies()).toBe(Math.floor((MAX_ITEMS - 3) / 2));
  });

  test('199 copies of one piece: 200 pieces without overlaps, on as many sheets as needed', () => {
    resetState();
    placeNew([fakeImage({ px: [60, 40] })]);
    expect(maxCopies()).toBe(199);
    duplicate(199);
    expect(getDocument().items).toHaveLength(MAX_ITEMS);
    expect(overlapping(getDocument().items)).toEqual([]);
  });

  test('at the cap, duplicating warns and adds nothing (one copy or several)', () => {
    const key = fakeImage({ px: [60, 40] });
    resetState({ items: Array.from({ length: MAX_ITEMS }, (_, i) => piece(i + 1, key, 10 + (i % 30) * 6, 10 + Math.floor(i / 30) * 6)), selection: [1] });
    const before = documentNow();
    duplicate();
    expect(getView().flash).toMatchObject({ text: 'Se admiten hasta 200 piezas en total. Quita alguna para duplicar esta.', warn: true });
    expect(documentNow()).toEqual(before);
    duplicate(2);
    expect(getView().flash).toMatchObject({ text: 'Se admiten hasta 200 piezas en total, así que ya no entran más copias', warn: true });
    expect(documentNow()).toEqual(before);
    expect(historyDepth().undo).toBe(0);
  });
});

describe('selectSame', () => {
  /**
   * small.jpg and three copies (one on the second sheet), tall.png, and a
   * two-page PDF with a copy turned to its page 2.
   */
  function sameFiles() {
    const small = fakeImage({ name: 'small.jpg', src: 1, px: [600, 400] });
    const tall = fakeImage({ name: 'tall.png', src: 2, px: [600, 1800] });
    const page1 = fakePdf({ name: 'twopage.pdf', src: 3, w: 60, h: 80, page: 1, pages: 2 });
    const page2 = fakePdf({ name: 'twopage.pdf', src: 3, w: 60, h: 80, page: 2, pages: 2 });
    resetState({
      sheets: [{ id: 1 }, { id: 2 }],
      items: [
        piece(1, small, 10, 10),
        piece(2, small, 70, 10),
        piece(3, small, 130, 10),
        piece(4, small, 10, 10, { sheet: 2 }),
        piece(5, tall, 10, 60),
        piece(6, page1, 70, 60),
        piece(7, page2, 140, 60),
      ],
      selection: [],
    });
  }

  test('from one copy: every piece of that file, also on another sheet, announced with the sheets', () => {
    sameFiles();
    setSelection([2]);
    selectSame();
    expect([...getDocument().selection].sort()).toEqual([1, 2, 3, 4]);
    expect(getDocument().selection.at(-1)).toBe(2); // the one it started from stays the primary
    expect(getView().pinned).toBe(true);
    expect(heard()).toBe('Se seleccionaron 4 piezas del mismo archivo, en 2 hojas.');
  });

  test('the pages of one PDF are the same file', () => {
    sameFiles();
    setSelection([6]);
    selectSame();
    expect([...getDocument().selection].sort()).toEqual([6, 7]);
    expect(heard()).toBe('Se seleccionaron 2 piezas del mismo archivo.');
  });

  test('a file with one piece: it says there are no others', () => {
    sameFiles();
    setSelection([5]);
    selectSame();
    expect(getDocument().selection).toEqual([5]);
    expect(heard()).toBe('Se seleccionó 1 pieza: no hay otras del mismo archivo.');
  });

  test('then a common scale of 50 % halves the four, each from its center, the others unchanged, in one undo step', () => {
    sameFiles();
    setSelection([2]);
    selectSame();
    const before = documentNow();
    const w0 = dims(before.items[0])[0];
    setScaleField('scale', 50, { final: true });
    const { items } = getDocument();
    for (const id of [1, 2, 3, 4]) expect(dims(items[id - 1])[0]).toBeCloseTo(w0 / 2, 6);
    expect(items.slice(4)).toEqual(before.items.slice(4));
    expect(overlapping(items)).toEqual([]);
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(documentNow()).toEqual(before);
  });

  test('without a selection it asks for one', () => {
    sameFiles();
    setDocument({ selection: [] });
    selectSame();
    expect(getDocument().selection).toEqual([]);
    expect(heard()).toBe('Primero selecciona una pieza.');
  });
});
