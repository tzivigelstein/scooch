// @vitest-environment jsdom
// The group operations under every combination of the document settings
// (unit and its grid × «Imán» × «Permitir superposición» × one or two sheets),
// on the real stores. Whatever each operation does, or refuses:
// - without overlaps allowed, no two pieces of a sheet overlap;
// - every piece keeps its center on its sheet;
// - with «Imán», what aligns or distributes leaves the group's box on the grid;
// - it is exactly one undo step, and undo then redo restore the document
//   exactly; what is refused leaves the document and the history untouched.
// (Dragging is a pointer gesture: e2e/specs/selection-and-group.spec.ts drags one combination.)
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AlignMode, Axis } from '../../src/core/align.js';
import { gridPresets, stepFor, type Unit } from '../../src/core/units.js';
import { setDocument, getDocument, type Piece } from '../../src/state/document.ts';
import { historyDepth, redo, resetHistory, undo } from '../../src/state/history.ts';
import { setGrid, usePrefs } from '../../src/state/prefs.ts';
import { area, dims } from '../../src/state/selectors.ts';
import { setView } from '../../src/state/view.ts';
import { placeNew } from '../../src/state/actions/layout.ts';
import { alignSelection, distributeSelection, nudge, rotate, scaleBy } from '../../src/state/actions/pieces.ts';
import { setSelection } from '../../src/state/actions/selection.ts';
import { fakeImage, resetState } from '../support/state.ts';

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
  document.body.innerHTML = '<div id="live-polite"></div><div id="live-assertive"></div>';
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
});

interface Combo {
  unit: Unit;
  snap: boolean;
  overlap: boolean;
  two: boolean;
}

const alignTo = (mode: AlignMode) => () => {
  setView({ alignTo: 'sheet' });
  alignSelection(mode);
  setView({ alignTo: 'selection' });
};
const distributeEvenly = (axis: Axis) => () => {
  setView({ distribute: 'even' });
  distributeSelection(axis);
  setView({ distribute: 'gap' });
};

/** The operations of the old matrix (keys and buttons call these, dragging aside), and the axes «Imán» puts on the grid. */
const OPS: [string, (unit: Unit) => void, '' | 'x' | 'y'][] = [
  ['arrow right', (unit) => nudge(stepFor(unit).mm, 0), ''],
  ['Shift+arrow down (coarse step)', (unit) => nudge(0, stepFor(unit, 'coarse').mm), ''],
  // Not in the old matrix: against the top edge, where only the centers-on-the-sheet rule stops it.
  ['Shift+arrow up four times (against the top edge)', (unit) => [1, 2, 3, 4].forEach(() => nudge(0, -stepFor(unit, 'coarse').mm)), ''],
  ['rotate', () => rotate(1), ''],
  ['+ (1 %)', () => scaleBy(1), ''],
  ['Shift+− (10 %)', () => scaleBy(-10), ''],
  ['align left', () => alignSelection('left'), 'x'],
  ['align to the center vertically', () => alignSelection('centerY'), 'y'],
  ['align to the bottom of the printable area', alignTo('bottom'), 'y'],
  ['distribute horizontally with the gap', () => distributeSelection('x'), 'x'],
  ['distribute evenly vertically', distributeEvenly('y'), 'y'],
];

/**
 * The old suite's document: 531 × 591 px tiles at 300 ppi placed like loaded
 * files, 4 on the first sheet (and 3 on a second one); three selected on one
 * sheet, or two on each sheet.
 */
function setup({ unit, snap, overlap, two }: Combo) {
  resetState({ sheets: two ? [{ id: 1 }, { id: 2 }] : [{ id: 1 }] });
  usePrefs.setState({ unit });
  setGrid({ snap, size: unit === 'in' ? gridPresets('in')[0].mm : 1 });
  setDocument({ allowOverlap: overlap });
  const tiles = (from: number, n: number) => Array.from({ length: n }, (_, i) => fakeImage({ name: `tile${from + i}.png`, src: from + i, px: [531, 591] }));
  placeNew(tiles(20, 4));
  if (two) {
    setSelection([]);
    setView({ sheet: 2 });
    placeNew(tiles(24, 3));
  }
  const all = getDocument().items.map((item) => item.id);
  const chosen = two ? [all[0], all[1], all[4], all[5]] : [all[0], all[1], all[2]];
  setSelection(chosen, { pinned: true });
  resetHistory();
  return chosen;
}

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

const centersOutside = (items: readonly Piece[]) => {
  const { W, H } = area();
  return items.filter((item) => {
    const [w, h] = dims(item);
    const cx = item.x + w / 2;
    const cy = item.y + h / 2;
    return cx < -1e-3 || cy < -1e-3 || cx > W + 1e-3 || cy > H + 1e-3;
  });
};

const onGrid = (v: number, step: number, tol = 2e-3) => Math.abs(v / step - Math.round(v / step)) * step <= tol;

/** Runs one operation on a fresh document with `combo` and checks the invariants. */
function check(combo: Combo, run: (unit: Unit) => void, axes: '' | 'x' | 'y') {
  const chosen = setup(combo);
  expect(overlapping(getDocument().items)).toEqual([]);
  const before = documentNow();
  run(combo.unit);
  const after = documentNow();
  const items = after.items;
  if (!combo.overlap) expect(overlapping(items)).toEqual([]);
  expect(centersOutside(items)).toEqual([]);
  if (after.items === before.items) {
    // Refused (or nothing to do): nothing changed and no undo step was added.
    expect(after).toEqual(before);
    expect(historyDepth().undo).toBe(0);
    return;
  }
  expect(historyDepth().undo).toBe(1);
  if (combo.snap && axes) {
    const step = combo.unit === 'in' ? gridPresets('in')[0].mm : 1;
    for (const sheet of new Set(items.filter((item) => chosen.includes(item.id)).map((item) => item.sheet))) {
      const mine = items.filter((item) => chosen.includes(item.id) && item.sheet === sheet);
      const corner = Math.min(...mine.map((item) => item[axes]));
      expect(onGrid(corner, step), `${axes} = ${corner} on a ${step} mm grid (sheet ${sheet})`).toBe(true);
    }
  }
  undo();
  expect(documentNow()).toEqual(before);
  redo();
  expect(documentNow()).toEqual(after);
}

describe('group operations: invariants, the grid, and exact undo/redo', () => {
  describe('mm, snap off, overlap off, one sheet', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'mm', snap: false, overlap: false, two: false }, run, axes));
  });
  describe('mm, snap off, overlap off, two sheets', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'mm', snap: false, overlap: false, two: true }, run, axes));
  });
  describe('mm, snap off, overlap on, one sheet', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'mm', snap: false, overlap: true, two: false }, run, axes));
  });
  describe('mm, snap off, overlap on, two sheets', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'mm', snap: false, overlap: true, two: true }, run, axes));
  });
  describe('mm, snap on, overlap off, one sheet', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'mm', snap: true, overlap: false, two: false }, run, axes));
  });
  describe('mm, snap on, overlap off, two sheets', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'mm', snap: true, overlap: false, two: true }, run, axes));
  });
  describe('mm, snap on, overlap on, one sheet', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'mm', snap: true, overlap: true, two: false }, run, axes));
  });
  describe('mm, snap on, overlap on, two sheets', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'mm', snap: true, overlap: true, two: true }, run, axes));
  });
  describe('in, snap off, overlap off, one sheet', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'in', snap: false, overlap: false, two: false }, run, axes));
  });
  describe('in, snap off, overlap off, two sheets', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'in', snap: false, overlap: false, two: true }, run, axes));
  });
  describe('in, snap off, overlap on, one sheet', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'in', snap: false, overlap: true, two: false }, run, axes));
  });
  describe('in, snap off, overlap on, two sheets', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'in', snap: false, overlap: true, two: true }, run, axes));
  });
  describe('in, snap on, overlap off, one sheet', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'in', snap: true, overlap: false, two: false }, run, axes));
  });
  describe('in, snap on, overlap off, two sheets', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'in', snap: true, overlap: false, two: true }, run, axes));
  });
  describe('in, snap on, overlap on, one sheet', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'in', snap: true, overlap: true, two: false }, run, axes));
  });
  describe('in, snap on, overlap on, two sheets', () => {
    test.each(OPS)('%s', (_, run, axes) => check({ unit: 'in', snap: true, overlap: true, two: true }, run, axes));
  });
});
