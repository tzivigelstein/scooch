// @vitest-environment jsdom
// What the canvas shows while a control is hovered or focused (state/preview.ts),
// on the real stores: what each control highlights, the ghosts of what each
// action would leave (exactly where activating puts the pieces), that showing
// it changes nothing, and how what shows follows the control and the document.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Item } from '../../src/core/types.ts';
import { getDocument, newItemId, resetIds, setDocument } from '../../src/state/document.ts';
import { historyDepth } from '../../src/state/history.ts';
import { setGrid, setUnit } from '../../src/state/prefs.ts';
import { dims } from '../../src/state/selectors.ts';
import { setView } from '../../src/state/view.ts';
import { COPIES_BUDGET, overlayFor, showPreview, usePreview, type Ghost, type Overlay, type SheetPreview } from '../../src/state/preview.ts';
import { fillWithCopies } from '../../src/state/actions/layout.ts';
import { alignSelection, distributeSelection, duplicate } from '../../src/state/actions/pieces.ts';
import { fakeImage, fakeImageMm, piece, resetState } from '../support/state.ts';

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
  document.body.innerHTML = '<div id="live-polite"></div><div id="live-assertive"></div>';
});

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  showPreview(null);
  vi.runAllTimers();
  vi.useRealTimers();
});

// The old suite's tiles: 531 × 591 px at 300 ppi.
const TW = (531 / 300) * 25.4;
const TH = (591 / 300) * 25.4;

/** Three tiles at known places on one sheet, `selection` selected, without the grid. */
function three(selection = [1, 2, 3], positions: [number, number][] = [[20, 20], [90, 80], [150, 150]]) {
  const key = fakeImage({ px: [531, 591] });
  resetState({ items: positions.map(([x, y], i) => piece(i + 1, key, x, y)), selection });
  setGrid({ snap: false });
}

const part = (overlay: Overlay | null, sheet = 1): SheetPreview => overlay!.sheets.get(sheet)!;
const nb = (text: string) => text.replace(/\xa0/g, ' ');
const where = (ghosts: readonly Ghost[] = []) => ghosts.map(({ item }) => ({ id: item.id, sheet: item.sheet, x: item.x, y: item.y }));
const placed = (items: readonly Item[]) => items.map(({ id, sheet, x, y }) => ({ id, sheet, x, y }));
/** The pieces' places, ids aside. */
const spots = (items: readonly Pick<Item, 'sheet' | 'x' | 'y' | 'r' | 'scale' | 'asset'>[]) => items.map(({ sheet, x, y, r, scale, asset }) => ({ sheet, x, y, r, scale, asset }));

describe('highlights', () => {
  test('«Margen»: the band of every sheet, as wide as the margin; none without a margin', () => {
    three();
    expect(overlayFor({ kind: 'margin' })).toEqual({ margin: 10, sheets: new Map() });
    setDocument({ margin: 0 });
    expect(overlayFor({ kind: 'margin' })).toBeNull();
  });

  test('«Separación»: the gaps between neighbors on each sheet, measured between the boxes the layout keeps apart (with the cut margin)', () => {
    const key = fakeImageMm(40, 30, { dpi: 254 });
    resetState({ items: [piece(1, key, 20, 20), piece(2, key, 65, 20), piece(3, key, 20, 200), piece(4, key, 20, 20, { sheet: 2 }), piece(5, key, 60, 20, { sheet: 2 })], sheets: [{ id: 1 }, { id: 2 }] });
    const gaps = (overlay: Overlay | null) => [...overlay!.sheets].map(([sheet, p]) => [sheet, p.gaps!.map((g) => [g.x, g.y, g.w, g.h])]);
    // Sheet 1: 5 mm between the first two (the third is far below); sheet 2: they touch.
    expect(gaps(overlayFor({ kind: 'gap' }))).toEqual([
      [1, [[60, 20, 5, 30]]],
      [2, [[60, 20, 0, 30]]],
    ]);
    setDocument({ cuts: { ...getDocument().cuts, mode: 'outline', margin: 1 } });
    expect(gaps(overlayFor({ kind: 'gap' }))[0]).toEqual([1, [[61, 19, 3, 32]]]);
  });

  test.each([
    ['x', '20 mm'],
    ['y', '80 mm'],
    ['width', '45 mm'],
    ['height', '50 mm'],
  ] as const)('«%s» of one piece: its value on its box', (field, text) => {
    three([2], [[20, 20], [20, 80]]);
    const { dimension } = part(overlayFor({ kind: field }));
    expect({ ...dimension, text: nb(dimension!.text) }).toEqual({ field, box: { x: 20, y: 80, w: TW, h: TH }, text });
  });

  test('the measures of several: the box of those on the primary’s sheet, in the chosen unit', () => {
    three([3, 1]);
    setUnit('cm');
    const dimension = part(overlayFor({ kind: 'width' })).dimension!;
    expect(dimension.box).toEqual({ x: 20, y: 20, w: 150 - 20 + TW, h: 150 - 20 + TH });
    expect(nb(dimension.text)).toBe('17,5 cm');
  });

  test('the measures without a selection: nothing', () => {
    three([]);
    expect(overlayFor({ kind: 'x' })).toBeNull();
  });

  test('the cut lines: emphasized while they are on; nothing to emphasize without them', () => {
    three();
    expect(overlayFor({ kind: 'cuts' })).toBeNull();
    setDocument({ cuts: { ...getDocument().cuts, mode: 'corners' } });
    expect(overlayFor({ kind: 'cuts' })).toEqual({ cuts: true, sheets: new Map() });
  });

  test('the grid: shown', () => {
    three();
    expect(overlayFor({ kind: 'grid' })).toEqual({ grid: true, sheets: new Map() });
  });

  test('a row of the list: its piece outlined on its sheet, nothing else (the selection stays)', () => {
    three([1]);
    const overlay = overlayFor({ kind: 'piece', arg: '2' })!;
    expect(overlay.tone).toBe('locate');
    expect(part(overlay)).toEqual({ outlines: [{ x: 90, y: 80, w: TW, h: TH }] });
    expect(getDocument().selection).toEqual([1]);
    expect(overlayFor({ kind: 'piece', arg: '99' })).toBeNull();
  });

  test('the notice of a problem: the pieces with that problem outlined', () => {
    // 3 sticks out of the sheet; 1 and 2 overlap.
    three([], [[20, 20], [40, 30], [190, 150]]);
    const cut = overlayFor({ kind: 'problems', arg: 'cut' })!;
    expect(cut.tone).toBe('problem');
    expect(part(cut).outlines).toEqual([{ x: 190, y: 150, w: TW, h: TH }]);
    expect(part(overlayFor({ kind: 'problems', arg: 'overlap' })).outlines!.map((r) => r.x)).toEqual([20, 40]);
    expect(overlayFor({ kind: 'problems', arg: 'other' })).toBeNull();
  });
});

describe('previews of actions: the ghosts are where activating puts the pieces', () => {
  for (const alignTo of ['selection', 'sheet'] as const) {
    test(`align against the ${alignTo}, each mode`, () => {
      for (const mode of ['left', 'centerX', 'right', 'top', 'centerY', 'bottom'] as const) {
        three([1, 2], [[20, 20], [90, 80], [150, 150]]);
        setView({ alignTo });
        const ghosts = part(overlayFor({ kind: 'align', arg: mode })).ghosts;
        alignSelection(mode);
        const moved = getDocument().items.filter((item) => ghosts?.some((g) => g.item.id === item.id));
        expect(where(ghosts), mode).toEqual(placed(moved));
        expect(ghosts!.every((g) => !g.blocked)).toBe(true);
      }
    });
  }

  test('align: what it goes against (the printable area or the selection’s box) and the line the pieces go to', () => {
    three([1, 2]);
    setView({ alignTo: 'sheet' });
    expect(part(overlayFor({ kind: 'align', arg: 'right' })).reference).toEqual({ box: { x: 10, y: 10, w: 190, h: 277 }, line: { x1: 200, y1: 10, x2: 200, y2: 287 } });
    setView({ alignTo: 'selection' });
    const { box, line } = part(overlayFor({ kind: 'align', arg: 'centerY' })).reference!;
    expect(box).toEqual({ x: 20, y: 20, w: 90 + TW - 20, h: 80 + TH - 20 });
    expect(line).toEqual({ x1: 20, y1: 20 + box.h / 2, x2: 20 + box.w, y2: 20 + box.h / 2 });
  });

  test('align: a piece already there has no ghost; nothing to move, only what it goes against', () => {
    three([1, 2], [[20, 20], [20, 80]]);
    expect(part(overlayFor({ kind: 'align', arg: 'left' }))).toEqual({ reference: expect.anything() });
    expect(where(part(overlayFor({ kind: 'align', arg: 'right' })).ghosts)).toEqual([]);
  });

  test('align onto another piece (overlaps not allowed): the ghosts show it wouldn’t apply, and aligning changes nothing', () => {
    three([1, 2], [[20, 20], [21, 80]]);
    setDocument({ items: [...getDocument().items, piece(4, getDocument().items[0].asset, 21, 140)] });
    setDocument({ selection: [1, 4] });
    const ghosts = part(overlayFor({ kind: 'align', arg: 'top' })).ghosts!;
    expect(ghosts.map((g) => g.blocked)).toEqual([true]);
    const before = getDocument().items;
    alignSelection('top');
    expect(getDocument().items).toBe(before);
  });

  for (const mode of ['gap', 'even'] as const) {
    test(`distribute (${mode}), both axes`, () => {
      for (const axis of ['x', 'y'] as const) {
        three([1, 2, 3], [[20, 20], [60, 60], [150, 150]]);
        setView({ distribute: mode });
        const ghosts = part(overlayFor({ kind: 'distribute', arg: axis })).ghosts;
        distributeSelection(axis);
        const moved = getDocument().items.filter((item) => ghosts?.some((g) => g.item.id === item.id));
        expect(where(ghosts), axis).toEqual(placed(moved));
        expect(moved.length).toBeGreaterThan(0);
      }
    });
  }

  test('distribute with too few: nothing', () => {
    three([1, 2]);
    setView({ distribute: 'even' });
    expect(overlayFor({ kind: 'distribute', arg: 'x' })).toBeNull();
  });

  test('«Rellenar con copias»: the copies as ghosts and the pieces it replaces dimmed, then exactly those copies', () => {
    const key = fakeImageMm(40, 30, { dpi: 254 });
    resetState({ items: [piece(1, key, 20, 20), piece(2, key, 120, 200), piece(3, key, 20, 20, { sheet: 2 })], sheets: [{ id: 1 }, { id: 2 }], selection: [1] });
    const overlay = overlayFor({ kind: 'fill' })!;
    expect([...overlay.sheets.keys()]).toEqual([1]);
    const [w, h] = dims(getDocument().items[0]);
    expect(part(overlay).dimmed).toEqual([{ x: 20, y: 20, w, h }, { x: 120, y: 200, w, h }]);
    const ghosts = part(overlay).ghosts!.map((g) => g.item);
    fillWithCopies();
    expect(spots(getDocument().items.filter((item) => item.sheet === 1))).toEqual(spots(ghosts));
  });

  test('«Duplicar ×4»: ghosts on the sheets that exist, a count of those that go to other sheets, then exactly those copies', () => {
    const key = fakeImageMm(60, 60);
    const full = Array.from({ length: 9 }, (_, i) => piece(i + 1, key, 10 + (i % 3) * 65, 10 + Math.floor(i / 3) * 65));
    resetState({ items: full, selection: [1, 2] });
    const overlay = overlayFor({ kind: 'duplicate', arg: '4' })!;
    const ghosts = part(overlay).ghosts!.map((g) => g.item);
    // The sheet has room for a few more; the rest go to a sheet still to add.
    expect(ghosts.length).toBeGreaterThan(0);
    expect(part(overlay).more).toBe(8 - ghosts.length);
    duplicate(4);
    const added = getDocument().items.slice(9);
    expect(spots(added.filter((item) => item.sheet === 1))).toEqual(spots(ghosts));
    expect(added.filter((item) => item.sheet !== 1)).toHaveLength(8 - ghosts.length);
  });

  test('«Duplicar» past the work budget of a hover: nothing (the action still works)', () => {
    const key = fakeImageMm(20, 20);
    resetState({ items: Array.from({ length: 100 }, (_, i) => piece(i + 1, key, 10 + (i % 9) * 21, 10 + Math.floor(i / 9) * 21, { sheet: 1 + Math.floor(i / 99) })), sheets: [{ id: 1 }, { id: 2 }], selection: [1] });
    const fits = Math.floor((-100 + Math.sqrt(100 * 100 + 4 * COPIES_BUDGET)) / 2);
    expect(overlayFor({ kind: 'duplicate', arg: String(fits) })).not.toBeNull();
    expect(overlayFor({ kind: 'duplicate', arg: String(fits + 1) })).toBeNull();
  });

  test('while something loads, no action shows what it would do (it wouldn’t run); highlights still show', () => {
    three([1, 2]);
    setDocument({ busy: true });
    for (const kind of ['align', 'distribute', 'fill', 'duplicate'] as const) expect(overlayFor({ kind, arg: kind === 'align' ? 'left' : kind === 'distribute' ? 'x' : '1' }), kind).toBeNull();
    expect(overlayFor({ kind: 'margin' })).not.toBeNull();
  });

  test('showing any of them changes nothing: the document, the ids handed out, the undo history', () => {
    three([1, 2]);
    const { items, sheets, selection } = getDocument();
    const next = newItemId();
    resetIds({ item: next, sheet: 50 });
    const history = historyDepth();
    for (const kind of ['margin', 'gap', 'x', 'cuts', 'grid', 'piece', 'problems', 'fill', 'duplicate'] as const) overlayFor({ kind, arg: kind === 'piece' ? '1' : kind === 'problems' ? 'cut' : '3' });
    overlayFor({ kind: 'align', arg: 'left' });
    overlayFor({ kind: 'distribute', arg: 'x' });
    expect(getDocument()).toMatchObject({ items, sheets, selection });
    expect(newItemId()).toBe(next);
    expect(historyDepth()).toEqual(history);
  });
});

describe('what shows now', () => {
  const frame = () => vi.advanceTimersByTime(20);

  test('a control shows its overlay in the next frame; passing over several, the last one', () => {
    three([1, 2]);
    showPreview({ kind: 'align', arg: 'left' });
    showPreview({ kind: 'align', arg: 'right' });
    expect(usePreview.getState().overlay).toBeNull();
    frame();
    expect(usePreview.getState().overlay).toEqual(overlayFor({ kind: 'align', arg: 'right' }));
  });

  test('leaving clears it at once (before an action runs)', () => {
    three([1, 2]);
    showPreview({ kind: 'margin' });
    frame();
    expect(usePreview.getState().overlay).not.toBeNull();
    showPreview(null);
    expect(usePreview.getState().overlay).toBeNull();
  });

  test('while it shows, it follows the document (a margin being typed)', () => {
    three();
    showPreview({ kind: 'margin' });
    frame();
    setDocument({ margin: 25 });
    frame();
    expect(usePreview.getState().overlay?.margin).toBe(25);
  });

  test('the same control again, with nothing changed: the same overlay, not worked out again', () => {
    three([1, 2]);
    showPreview({ kind: 'align', arg: 'left' });
    frame();
    const first = usePreview.getState().overlay;
    showPreview({ kind: 'align', arg: 'right' });
    frame();
    showPreview({ kind: 'align', arg: 'left' });
    frame();
    expect(usePreview.getState().overlay).toBe(first);
  });
});
