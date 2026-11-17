// @vitest-environment jsdom
// Align, distribute, «Duplicar ×N», «Rellenar con copias» and «Tamaño de foto»
// can be worked out without applying them (what the canvas previews): working them out changes
// nothing (the document, the ids handed out, the undo history) and applying
// them afterwards leaves exactly what was worked out.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AlignMode } from '../../src/core/align.js';
import type { Item } from '../../src/core/types.ts';
import { getDocument, newItemId, newSheetId, resetIds, setDocument } from '../../src/state/document.ts';
import { historyDepth } from '../../src/state/history.ts';
import { setGrid } from '../../src/state/prefs.ts';
import { setView } from '../../src/state/view.ts';
import { selectedItem } from '../../src/state/selectors.ts';
import { applyPhotoSize, photoSizePlan } from '../../src/state/actions/crop.ts';
import { fillCopies, fillWithCopies } from '../../src/state/actions/layout.ts';
import { alignPlan, alignSelection, distributePlan, distributeSelection, duplicate, duplicatePlan, planPatches } from '../../src/state/actions/pieces.ts';
import { fakeImage, fakeImageMm, piece, resetState } from '../support/state.ts';

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
  document.body.innerHTML = '<div id="live-polite"></div><div id="live-assertive"></div>';
});

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
});

/** Everything working something out could change by mistake. */
const untouched = () => {
  const { items, sheets, selection } = getDocument();
  const ids = { item: newItemId(), sheet: newSheetId() };
  resetIds(ids);
  return { items, sheets, selection, ids, history: historyDepth() };
};

/** Made-up ids for what doesn't exist yet: past any real one, and increasing like the real ones. */
const FAR = 1e9;
const madeUp = () => {
  let item = FAR;
  let sheet = FAR;
  return { item: () => ++item, sheet: () => ++sheet };
};

/** The pieces' places, ids aside. */
const places = (items: readonly Item[]) => items.map(({ sheet, x, y, r, scale, asset, crop }) => ({ sheet, x, y, r, scale, asset, crop }));

function three() {
  const key = fakeImage({ px: [531, 591] });
  resetState({ items: [piece(1, key, 20, 20), piece(2, key, 90, 80), piece(3, key, 150, 150)], selection: [1, 2, 3] });
}

describe('align and distribute, worked out first', () => {
  const modes: AlignMode[] = ['left', 'centerX', 'right', 'top', 'centerY', 'bottom'];
  for (const alignTo of ['selection', 'sheet'] as const) {
    for (const snap of [false, true]) {
      test(`align against the ${alignTo}${snap ? ' with «Imán»' : ''}: the plan changes nothing and aligning leaves its positions`, () => {
        for (const mode of modes) {
          three();
          setGrid({ snap, size: 5 });
          setView({ alignTo });
          const before = untouched();
          const result = alignPlan(mode)!;
          expect(untouched()).toEqual(before);
          const patches = planPatches(result.plan.rects);
          alignSelection(mode);
          for (const item of getDocument().items) expect(item, mode).toMatchObject(patches.get(item.id)!);
        }
      });
    }
  }

  test('align against the printable area: the reference is the printable area of each sheet with selected pieces', () => {
    three();
    setView({ alignTo: 'sheet' });
    expect([...alignPlan('left')!.references]).toEqual([[1, { x: 10, y: 10, w: 190, h: 277 }]]);
  });

  test('align against the selection: the reference is the selected pieces’ box', () => {
    three();
    const ref = alignPlan('left')!.references.get(1)!;
    expect(ref.x).toBe(20);
    expect(ref.y).toBe(20);
    expect(ref.x + ref.w).toBeCloseTo(150 + (531 / 300) * 25.4, 9);
  });

  test('align with no room inside the margin: nothing to work out', () => {
    three();
    setView({ alignTo: 'sheet' });
    setDocument({ margin: 120 });
    expect(alignPlan('left')).toBeNull();
  });

  for (const mode of ['gap', 'even'] as const) {
    test(`distribute (${mode}): the plan changes nothing and distributing leaves its positions`, () => {
      for (const axis of ['x', 'y'] as const) {
        three();
        setGrid({ snap: false });
        setView({ distribute: mode });
        const before = untouched();
        const plan = distributePlan(axis)!;
        expect(untouched()).toEqual(before);
        const patches = planPatches(plan.rects);
        distributeSelection(axis);
        for (const item of getDocument().items) expect(item, axis).toMatchObject(patches.get(item.id)!);
      }
    });
  }

  test('distribute with too few on a sheet: nothing to work out', () => {
    three();
    setView({ distribute: 'even' });
    setDocument({ selection: [1, 2] });
    expect(distributePlan('x')).toBeNull();
  });
});

describe('copies, worked out first', () => {
  test('«Duplicar ×4» of two pieces on a crowded sheet: the plan changes nothing, spills onto a sheet still to add, and duplicating adds exactly its copies', () => {
    const key = fakeImageMm(60, 60);
    const full = Array.from({ length: 9 }, (_, i) => piece(i + 1, key, 10 + (i % 3) * 65, 10 + Math.floor(i / 3) * 65));
    resetState({ items: full, selection: [1, 2] });
    const before = untouched();
    const plan = duplicatePlan(4, madeUp())!;
    expect(untouched()).toEqual(before);
    expect(plan.copies).toHaveLength(8);
    expect(plan.sheets).toEqual([FAR + 1]);
    duplicate(4);
    const added = getDocument().items.slice(9);
    const newSheet = getDocument().sheets[1].id;
    expect(places(added)).toEqual(places(plan.copies).map((copy) => ({ ...copy, sheet: copy.sheet === FAR + 1 ? newSheet : copy.sheet })));
  });

  test('«Duplicar» past the piece limit: nothing to work out', () => {
    three();
    expect(duplicatePlan(66)).toBeNull();
    expect(duplicatePlan(65)).not.toBeNull();
  });

  test('«Rellenar con copias»: the copies change nothing and filling leaves exactly them on the sheet', () => {
    const key = fakeImageMm(40, 30);
    resetState({ items: [piece(1, key, 20, 20), piece(2, key, 120, 200)], selection: [1] });
    const before = untouched();
    const copies = fillCopies(selectedItem()!, madeUp().item)!;
    expect(untouched()).toEqual(before);
    expect(copies.length).toBeGreaterThan(20);
    expect(fillWithCopies()).toBe(true);
    expect(places(getDocument().items)).toEqual(places(copies));
  });

  test('«Rellenar con copias» with a piece larger than the printable area: nothing to work out', () => {
    const key = fakeImageMm(400, 30);
    resetState({ items: [piece(1, key, 0, 20)], selection: [1] });
    expect(fillCopies(selectedItem()!)).toBeNull();
  });
});

describe('photo sizes, worked out first', () => {
  test('a size with no room left on its sheet: the plan changes nothing and sends the piece to a sheet still to add; applying leaves exactly that, in one undo step', () => {
    const key = fakeImageMm(50, 50);
    resetState({ items: [piece(1, key, 20, 20), piece(2, key, 80, 120)], selection: [1] });
    const before = untouched();
    const plan = photoSizePlan('15x20', madeUp().sheet)!;
    expect(untouched()).toEqual(before);
    expect(plan).toMatchObject({ sheets: [FAR + 1], moved: [1], refused: [] });
    applyPhotoSize('15x20');
    const newSheet = getDocument().sheets[1].id;
    expect(places(getDocument().items.slice(0, 1))).toEqual(places(plan.changed).map((item) => ({ ...item, sheet: newSheet })));
    expect(historyDepth().undo).toBe(1);
  });

  test('a size that moves a piece aside on its sheet: applying leaves exactly the plan’s place', () => {
    const key = fakeImageMm(50, 50);
    resetState({ items: [piece(1, key, 20, 20), piece(2, key, 75, 20)], selection: [1] });
    const plan = photoSizePlan('13x18')!;
    expect(plan.moved).toEqual([1]);
    applyPhotoSize('13x18');
    expect(places(getDocument().items.slice(0, 1))).toEqual(places(plan.changed));
  });

  test('«Original» on pieces without a crop, an id that is no option, or no selection: nothing to apply', () => {
    three();
    expect(photoSizePlan('original')).toMatchObject({ changed: [], refused: [] });
    expect(photoSizePlan('11x17')).toBeNull();
    setDocument({ selection: [] });
    expect(photoSizePlan('10x15')).toBeNull();
  });
});
