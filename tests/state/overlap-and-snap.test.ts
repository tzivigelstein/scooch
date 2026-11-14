// @vitest-environment jsdom
// «Permitir superposición», «Imán» and the grid with the keyboard's actions:
// arrows jump over a neighbor (or not, with overlaps allowed), + stops at a
// neighbor and − doesn't, rotating next to a neighbor, typed positions,
// «Permitir superposición» (the project's, in its undo history) and the grid
// (a preference of this browser, outside the document and its undo history).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GRID_STORAGE, PIECES_STORAGE } from '../../src/config.ts';
import { setDocument, getDocument } from '../../src/state/document.ts';
import { endEdit, historyDepth, undo } from '../../src/state/history.ts';
import { getPrefs, setGrid } from '../../src/state/prefs.ts';
import { nudge, rotate, scaleBy, setLengthField } from '../../src/state/actions/pieces.ts';
import { setAllowOverlap } from '../../src/state/actions/sheets.ts';
import { dims, sheetProblems } from '../../src/state/selectors.ts';
import { getView } from '../../src/state/view.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

// small.jpg (67.7 × 50.8 mm) and square.webp (84.7 mm), as in the old e2e walk.
let A = '';
let B = '';

const item = (id: number) => getDocument().items.find((i) => i.id === id)!;
const rect = (id: number) => {
  const it = item(id);
  const [w, h] = dims(it);
  return { x: it.x, y: it.y, w, h };
};
const overlap = (p: ReturnType<typeof rect>, q: ReturnType<typeof rect>, eps = 0.011) => p.x < q.x + q.w - eps && q.x < p.x + p.w - eps && p.y < q.y + q.h - eps && q.y < p.y + p.h - eps;

/**
 * What the live regions say `ms` later (an announcement goes out 60 ms after
 * it is made; the position after a burst of arrows, 600 ms later, replaces it).
 */
function heard(ms = 100) {
  vi.advanceTimersByTime(ms);
  return `${document.getElementById('live-polite')!.textContent} ${document.getElementById('live-assertive')!.textContent}`.replace(/ /g, ' ');
}

/** The preferences as a new start reads them from localStorage (the module loads again). */
async function prefsOnStart() {
  vi.resetModules();
  return (await import('../../src/state/prefs.ts')).getPrefs();
}

/** A key press: the action, then its keyup ends the continuous edit (see useGlobalShortcuts). */
const press = (action: () => void) => {
  action();
  endEdit();
};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="live-polite"></div><div id="live-assertive"></div>';
  A = fakeImage({ name: 'small.jpg', src: 1, px: [800, 600] });
  B = fakeImage({ name: 'square.webp', src: 2, px: [1000, 1000] });
  resetState();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A at (20, 40) and B `gapMm` to its right, A selected. */
function sideBySide(gapMm: number) {
  const aw = dims(piece(1, A, 0, 0))[0];
  resetState({ items: [piece(1, A, 20, 40), piece(2, B, 20 + aw + gapMm, 40)], selection: [1] });
  heard(1000); // nothing pending from the setup
}

describe('arrows', () => {
  test('toward a neighbor: jumps right past it and says so, the next step is 1 mm, and each press undoes on its own', () => {
    sideBySide(0.5);
    const a0 = rect(1);
    const b0 = rect(2);
    press(() => nudge(1, 0));
    const a1 = rect(1);
    expect(a1.x).toBeCloseTo(b0.x + b0.w, 6);
    expect(overlap(a1, b0)).toBe(false);
    expect(heard()).toMatch(/Saltó sobre square\.webp/);
    press(() => nudge(1, 0));
    expect(rect(1).x).toBeCloseTo(a1.x + 1, 6);
    expect(historyDepth().undo).toBe(2);
    undo();
    expect(rect(1).x).toBeCloseTo(a1.x, 6);
    undo();
    expect(rect(1).x).toBeCloseTo(a0.x, 6);
  });

  test('presses of a held arrow share one undo step', () => {
    sideBySide(10);
    const a0 = rect(1);
    nudge(1, 0);
    nudge(1, 0);
    nudge(1, 0);
    endEdit();
    expect(rect(1).x).toBeCloseTo(a0.x + 3, 6);
    expect(historyDepth().undo).toBe(1);
  });

  test('with overlaps allowed they move 1 mm without jumping, onto the neighbor or out of it', () => {
    sideBySide(0.5);
    setDocument({ allowOverlap: true });
    const a0 = rect(1);
    press(() => nudge(1, 0));
    expect(rect(1).x).toBeCloseTo(a0.x + 1, 6);
    expect(overlap(rect(1), rect(2))).toBe(true);
    expect(heard()).not.toMatch(/Saltó/);
    press(() => nudge(-1, 0));
    expect(rect(1).x).toBeCloseTo(a0.x, 6);
  });
});

describe('+ and −', () => {
  test('+ grows until it touches the neighbor, never over it, then says there is no more room; − shrinks without brakes', () => {
    sideBySide(4);
    const a0 = rect(1);
    for (let i = 0; i < 8; i++) press(() => scaleBy(10));
    const a1 = rect(1);
    const b1 = rect(2);
    expect(a1.w).toBeGreaterThan(a0.w);
    expect(overlap(a1, b1)).toBe(false);
    const left = b1.x - (a1.x + a1.w);
    expect(left).toBeGreaterThanOrEqual(-0.02);
    expect(left).toBeLessThan(0.5);
    expect(heard()).toMatch(/No hay más espacio para agrandarla/);
    // The refused presses took no undo step.
    const depth = historyDepth().undo;
    press(() => scaleBy(10));
    expect(historyDepth().undo).toBe(depth);
    expect(rect(1)).toEqual(a1);
    press(() => scaleBy(-10));
    press(() => scaleBy(-10));
    expect(rect(1).w).toBeLessThan(a1.w);
  });

  test('with overlaps allowed + grows over the neighbor', () => {
    sideBySide(4);
    setDocument({ allowOverlap: true });
    for (let i = 0; i < 8; i++) press(() => scaleBy(10));
    expect(overlap(rect(1), rect(2))).toBe(true);
  });
});

describe('rotating next to a neighbor', () => {
  // A at (100, 100); B touches the square A would take if it turned around its center.
  const aSize = () => dims(piece(1, A, 0, 0));

  test('with room it turns right (+90°, width and height swapped, center kept) and left back, one undo step each', () => {
    resetState({ items: [piece(1, A, 100, 100), piece(2, B, 10, 10)], selection: [1] });
    const before = rect(1);
    rotate(1);
    const after = rect(1);
    expect(item(1).r).toBe(90);
    expect(after.w).toBeCloseTo(before.h, 6);
    expect(after.h).toBeCloseTo(before.w, 6);
    expect(after.x + after.w / 2).toBeCloseTo(before.x + before.w / 2, 3);
    expect(after.y + after.h / 2).toBeCloseTo(before.y + before.h / 2, 3);
    rotate(-1);
    expect(item(1).r).toBe(0);
    expect(rect(1)).toEqual(before);
    expect(historyDepth().undo).toBe(2);
  });

  test('hemmed in, it doesn’t turn: the notice says why and «Permitir superposición» allows it in this project only and turns it', () => {
    const [w, h] = aSize();
    // Turned around its center A would reach (w - h) / 2 mm higher: B sits right there.
    resetState({ items: [piece(1, A, 100, 100), piece(2, B, 100 + w / 2 - 5, 100 - (w - h) / 2 - dims(piece(2, B, 0, 0))[1] + 2)], selection: [1] });
    const items = getDocument().items;
    const before = rect(1);
    rotate(1);
    expect(getDocument().items).toBe(items);
    expect(historyDepth().undo).toBe(0);
    const flash = getView().flash!;
    expect(flash).toMatchObject({ text: 'No se puede rotar: las piezas se superpondrían', warn: true });
    expect(flash.action?.label).toBe('Permitir superposición');
    flash.action!.run();
    expect(getDocument().allowOverlap).toBe(true);
    expect(localStorage.getItem(PIECES_STORAGE), 'no preference of this browser changes').toBeNull();
    expect(item(1).r).toBe(90);
    const after = rect(1);
    expect(after.x + after.w / 2).toBeCloseTo(before.x + before.w / 2, 3);
    expect(after.y + after.h / 2).toBeCloseTo(before.y + before.h / 2, 3);
    // One step: undo turns it back and doesn't allow overlaps any more.
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(item(1).r).toBe(0);
    expect(getDocument().allowOverlap).toBe(false);
  });
});

describe('typed positions', () => {
  test('a typed position may leave a piece over another (an explicit order), and that is a problem', () => {
    resetState({ items: [piece(1, A, 20, 20), piece(2, B, 120, 20)], selection: [2] });
    setLengthField('x', 22, { final: true });
    setLengthField('y', 22, { final: true });
    expect(item(2)).toMatchObject({ x: 22, y: 22 });
    expect(overlap(rect(1), rect(2))).toBe(true);
    expect(sheetProblems().overlap.count).toBe(2);
  });
});

describe('settings', () => {
  test('«Permitir superposición» is the project’s: one undo step of its own, and no preference of this browser', () => {
    sideBySide(10);
    setAllowOverlap(true);
    expect(getDocument().allowOverlap).toBe(true);
    expect(historyDepth().undo).toBe(1);
    expect(localStorage.getItem(PIECES_STORAGE)).toBeNull();
    setAllowOverlap(true);
    expect(historyDepth().undo, 'setting it again adds no step').toBe(1);
    undo();
    expect(getDocument().allowOverlap).toBe(false);
  });

  test('undo doesn’t touch the grid (a preference of this browser)', () => {
    sideBySide(10);
    setGrid({ show: true, size: 2.5, snap: false });
    press(() => nudge(1, 0));
    undo();
    expect(getPrefs().grid).toEqual({ show: true, size: 2.5, snap: false });
  });

  test('by default the grid is hidden, 1 mm, with «Imán» on', async () => {
    localStorage.removeItem(GRID_STORAGE);
    expect((await prefsOnStart()).grid).toEqual({ show: false, size: 1, snap: true });
  });

  test('each grid change is saved in this browser and read back on the next start', async () => {
    setGrid({ show: true });
    setGrid({ size: 2.5 });
    setGrid({ snap: false });
    expect(JSON.parse(localStorage.getItem(GRID_STORAGE)!)).toEqual({ show: true, size: 2.5, snap: false });
    resetState(); // the stores forget; the browser doesn't
    expect((await prefsOnStart()).grid).toEqual({ show: true, size: 2.5, snap: false });
  });
});
