// @vitest-environment jsdom
// A selection spread over several sheets, on the real stores. There is no one
// box to measure, so X, Y, width and height are off (no value, no range,
// nothing applies, nothing shows on the canvas); everything else acts on every
// selected piece, each sheet's part inside its own sheet: the scale, «100 %»,
// a photo size, rotating, the arrows, duplicating, removing, selecting the
// same, copying and cutting. Aligning and distributing work per sheet (each
// sheet's selected pieces among themselves, or against that sheet's printable
// area), and their previews show exactly that on every sheet.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AlignMode } from '../../src/core/align.js';
import type { Item } from '../../src/core/types.ts';
import { getDocument } from '../../src/state/document.ts';
import { historyDepth, undo } from '../../src/state/history.ts';
import { setGrid } from '../../src/state/prefs.ts';
import { dims, selectedItems } from '../../src/state/selectors.ts';
import { getView, setView } from '../../src/state/view.ts';
import { command, type CommandId } from '../../src/state/commands.ts';
import { overlayFor, type Ghost, type Overlay } from '../../src/state/preview.ts';
import { copySelection, cutSelection } from '../../src/state/actions/clipboard.ts';
import { applyPhotoSize, selectionPhotoSize } from '../../src/state/actions/crop.ts';
import {
  actualSize,
  alignSelection,
  bringToFront,
  distributeSelection,
  duplicate,
  lengthFieldRange,
  lengthFieldsOff,
  lengthFieldValue,
  nudge,
  remove,
  rotate,
  setLengthField,
  setScaleField,
  type LengthField,
} from '../../src/state/actions/pieces.ts';
import { selectSame, setSelection } from '../../src/state/actions/selection.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

// The old suite's tiles: 531 × 591 px at 300 ppi.
const W = (531 / 300) * 25.4; // 44.958 mm
const H = (591 / 300) * 25.4; // 50.038 mm
const OFF = 'Disponible cuando las piezas están en una misma hoja';
const FIELDS: readonly LengthField[] = ['x', 'y', 'width', 'height'];

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
  document.body.innerHTML = '<div id="live-polite"></div><div id="live-assertive"></div>';
});

/**
 * Three sheets. Sheet 1: 1 and 2 selected, 3 not. Sheet 2: 4 and 5 selected,
 * 6 not. Sheet 3: 7 alone, selected. Three source files (1, 2, 4 come from
 * the first). Without the grid, so the positions are exact.
 */
function spread(selection = [1, 2, 4, 5, 7]) {
  const a = fakeImage({ px: [531, 591], src: 1, name: 'a.png' });
  const b = fakeImage({ px: [531, 591], src: 2, name: 'b.png' });
  const c = fakeImage({ px: [531, 591], src: 3, name: 'c.png' });
  resetState({
    sheets: [{ id: 1 }, { id: 2 }, { id: 3 }],
    items: [
      piece(1, a, 20, 20),
      piece(2, a, 90, 80),
      piece(3, b, 20, 200),
      piece(4, a, 30, 30, { sheet: 2 }),
      piece(5, b, 120, 150, { sheet: 2 }),
      piece(6, b, 30, 220, { sheet: 2 }),
      piece(7, c, 50, 50, { sheet: 3 }),
    ],
    selection,
  });
  setGrid({ snap: false });
  return getDocument().items;
}

const item = (id: number) => getDocument().items.find((other) => other.id === id)!;
const SELECTED = [1, 2, 4, 5, 7];
const UNSELECTED = [3, 6];
const where = (ids: readonly number[]) => ids.map((id) => ({ id, sheet: item(id).sheet, x: item(id).x, y: item(id).y }));
const ghostsOf = (overlay: Overlay | null) =>
  [...(overlay?.sheets.values() ?? [])].flatMap((part) => part.ghosts ?? []).map(({ item: ghost }: Ghost) => ({ id: ghost.id, sheet: ghost.sheet, x: ghost.x, y: ghost.y }));
const blockedOf = (overlay: Overlay | null) => [...(overlay?.sheets.values() ?? [])].flatMap((part) => part.ghosts ?? []).map((ghost) => ghost.blocked);
const placed = (items: readonly Item[]) => items.map(({ id, sheet, x, y }) => ({ id, sheet, x, y }));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runAllTimers(); // nothing announced leaks into the next test
  vi.useRealTimers();
  for (const id of ['live-polite', 'live-assertive']) document.getElementById(id)!.textContent = '';
});

describe('the measure fields with pieces on several sheets', () => {
  test('X, Y, width and height are off: no value, no range, the reason; typing in them changes nothing and adds no undo step', () => {
    const before = spread();
    expect(lengthFieldsOff()).toBe(OFF);
    for (const field of FIELDS) {
      expect(lengthFieldValue(field), field).toBeNull();
      expect(lengthFieldRange(field), field).toBeNull();
      setLengthField(field, 50, { final: false });
      setLengthField(field, 60, { final: true });
    }
    expect(getDocument().items).toBe(before);
    expect(historyDepth().undo).toBe(0);
    expect(getView().flash).toBeNull();
  });

  test('hovering them shows no measure on the canvas', () => {
    spread();
    for (const field of FIELDS) expect(overlayFor({ kind: field }), field).toBeNull();
  });

  test('back on one sheet they come back: the box of the selected pieces, its measure on the canvas, and typing applies', () => {
    spread([1, 2]);
    expect(lengthFieldsOff()).toBeNull();
    expect([lengthFieldValue('x'), lengthFieldValue('y')]).toEqual([20, 20]);
    expect(lengthFieldValue('width')).toBeCloseTo(90 + W - 20, 9);
    expect(overlayFor({ kind: 'width' })?.sheets.get(1)?.dimension?.field).toBe('width');
    setLengthField('x', 30, { final: true });
    expect([item(1).x, item(2).x]).toEqual([30, 100]);
    expect(historyDepth().undo).toBe(1);
  });
});

describe('what acts on every selected piece, on every sheet', () => {
  test('the scale field and the slider: each selected piece takes the value from its own center, in one undo step each; the others stay', () => {
    const before = spread();
    const centers = SELECTED.map((id) => item(id).x + dims(item(id))[0] / 2);
    setScaleField('scale', 80, { final: true });
    expect(SELECTED.map((id) => item(id).scale)).toEqual([80, 80, 80, 80, 80]);
    SELECTED.forEach((id, i) => expect(item(id).x + dims(item(id))[0] / 2).toBeCloseTo(centers[i], 6));
    setScaleField('slider', 60, { final: true });
    expect(SELECTED.map((id) => item(id).scale)).toEqual([60, 60, 60, 60, 60]);
    expect(UNSELECTED.map(item)).toEqual(UNSELECTED.map((id) => before.find((other) => other.id === id)));
    expect(historyDepth().undo).toBe(2);
  });

  test('«100 %»: every selected piece back at its actual size', () => {
    spread();
    setScaleField('scale', 50, { final: true });
    actualSize();
    expect(SELECTED.map((id) => item(id).scale)).toEqual([100, 100, 100, 100, 100]);
  });

  test('a photo size: every selected piece takes it, in one undo step', () => {
    spread();
    applyPhotoSize('10x15');
    expect(selectionPhotoSize(selectedItems())).toBe('10x15');
    expect(selectedItems()).toHaveLength(5);
    expect(historyDepth().undo).toBe(1);
  });

  test('rotating turns every selected piece 90°, each sheet’s part around its own box, in one undo step', () => {
    const before = spread();
    rotate(1);
    expect(SELECTED.map((id) => item(id).r)).toEqual([90, 90, 90, 90, 90]);
    expect(SELECTED.map((id) => item(id).sheet)).toEqual([1, 1, 2, 2, 3]);
    expect(UNSELECTED.map((id) => item(id).r)).toEqual([0, 0]);
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(getDocument().items).toEqual(before);
  });

  test('an arrow moves every selected piece the same distance, each on its own sheet, in one undo step', () => {
    const before = spread();
    nudge(1, 0);
    expect(where(SELECTED)).toEqual(before.filter((p) => SELECTED.includes(p.id)).map((p) => ({ id: p.id, sheet: p.sheet, x: p.x + 1, y: p.y })));
    expect(where(UNSELECTED)).toEqual(placed(before.filter((p) => UNSELECTED.includes(p.id))));
    expect(historyDepth().undo).toBe(1);
  });

  test('«Duplicar» and «Duplicar ×2»: copies of every selected piece, which end up selected', () => {
    spread();
    duplicate();
    expect(getDocument().items).toHaveLength(7 + 5);
    expect(getDocument().selection).toHaveLength(5);
    duplicate(2);
    expect(getDocument().items).toHaveLength(12 + 10);
    expect(getDocument().selection).toHaveLength(10);
    expect(historyDepth().undo).toBe(2);
  });

  test('removing takes every selected piece away in one undo step, with «Deshacer» in the notice', () => {
    const before = spread();
    remove();
    expect(getDocument().items.map((p) => p.id)).toEqual(UNSELECTED);
    expect(getView().flash).toMatchObject({ text: 'Se quitaron 5 piezas', action: { label: 'Deshacer' } });
    undo();
    expect(getDocument().items).toEqual(before);
  });

  test('«Seleccionar iguales» from pieces on two sheets: every piece of their file', () => {
    spread([2, 4]);
    selectSame();
    expect([...getDocument().selection].sort()).toEqual([1, 2, 4]);
  });

  test('copying takes every selected piece; cutting removes all of them in one undo step', () => {
    spread();
    expect(copySelection()).toBe(5);
    expect(cutSelection()).toBe(5);
    expect(getDocument().items.map((p) => p.id)).toEqual(UNSELECTED);
    expect(historyDepth().undo).toBe(1);
  });

  test('«Traer al frente» stays a one-piece action, with the same reason as on one sheet', () => {
    const before = spread();
    const reason = command('front').disabled;
    expect(reason).toBe('Disponible con una sola pieza seleccionada');
    bringToFront();
    expect(getDocument().items).toBe(before);
    setSelection([1, 2]);
    expect(command('front').disabled).toBe(reason);
  });
});

describe('align and distribute, per sheet', () => {
  const MODES: readonly AlignMode[] = ['left', 'centerX', 'right', 'top', 'centerY', 'bottom'];

  test('against the selection: each sheet’s selected pieces align among themselves (a lone one stays); the preview shows each sheet’s box and the ghosts exactly where they go', () => {
    for (const mode of MODES) {
      spread();
      const overlay = overlayFor({ kind: 'align', arg: mode })!;
      // What it aligns to on each sheet: that sheet's selected pieces' box.
      expect(overlay.sheets.get(1)?.reference?.box, mode).toEqual({ x: 20, y: 20, w: 90 + W - 20, h: 80 + H - 20 });
      expect(overlay.sheets.get(2)?.reference?.box, mode).toEqual({ x: 30, y: 30, w: 120 + W - 30, h: 150 + H - 30 });
      expect(overlay.sheets.get(3)?.reference?.box, mode).toEqual({ x: 50, y: 50, w: W, h: H });
      expect(overlay.sheets.get(3)?.ghosts, mode).toBeUndefined();
      const ghosts = ghostsOf(overlay);
      expect(command(`align${mode[0].toUpperCase()}${mode.slice(1)}` as CommandId).disabled, mode).toBeNull();
      alignSelection(mode);
      expect(ghosts, mode).toEqual(placed(getDocument().items.filter((p) => ghosts.some((g) => g.id === p.id))));
      expect(new Set(ghosts.map((g) => g.sheet)), mode).toEqual(new Set([1, 2]));
      expect(where([7]), mode).toEqual([{ id: 7, sheet: 3, x: 50, y: 50 }]);
      expect(historyDepth().undo, mode).toBe(1);
    }
  });

  test('aligning left against the selection: on sheet 1 at x 20, on sheet 2 at x 30', () => {
    spread();
    alignSelection('left');
    expect([1, 2, 4, 5, 7].map((id) => item(id).x)).toEqual([20, 20, 30, 30, 50]);
  });

  test('against the printable area: every selected piece within its own sheet; the preview shows every sheet’s printable area and the ghosts where they go, or, refused, that nothing moves on any sheet', () => {
    const refused: AlignMode[] = [];
    for (const mode of MODES) {
      const before = spread();
      setView({ alignTo: 'sheet' });
      const overlay = overlayFor({ kind: 'align', arg: mode })!;
      for (const sheet of [1, 2, 3]) expect(overlay.sheets.get(sheet)?.reference?.box, `${mode} ${sheet}`).toEqual({ x: 10, y: 10, w: 190, h: 277 });
      const ghosts = ghostsOf(overlay);
      const blocked = blockedOf(overlay);
      expect(new Set(ghosts.map((g) => g.sheet)), mode).toEqual(new Set([1, 2, 3]));
      alignSelection(mode);
      if (blocked.some(Boolean)) {
        // Applied whole or not at all: every ghost says so, and nothing moves.
        refused.push(mode);
        expect(blocked.every(Boolean), mode).toBe(true);
        expect(getDocument().items, mode).toBe(before);
      } else {
        expect(ghosts, mode).toEqual(placed(getDocument().items.filter((p) => ghosts.some((g) => g.id === p.id))));
        expect(SELECTED.map((id) => item(id).sheet), mode).toEqual([1, 1, 2, 2, 3]);
      }
    }
    // At the bottom, piece 1 would land on piece 3 (and 4 on 6).
    expect(refused).toEqual(['bottom']);
    spread();
    setView({ alignTo: 'sheet' });
    alignSelection('left');
    expect(SELECTED.map((id) => item(id).x)).toEqual([10, 10, 10, 10, 10]);
  });

  test('distributing: each sheet’s selected pieces among themselves; a sheet with too few stays; the preview matches, on every sheet that changes', () => {
    spread();
    const overlay = overlayFor({ kind: 'distribute', arg: 'x' })!;
    expect([...overlay.sheets.keys()].sort()).toEqual([1, 2]);
    const ghosts = ghostsOf(overlay);
    expect(command('distributeX').disabled).toBeNull();
    distributeSelection('x');
    expect(ghosts).toEqual(placed(getDocument().items.filter((p) => ghosts.some((g) => g.id === p.id))));
    // With the 5 mm gap: the first of each sheet stays.
    expect(item(1).x).toBe(20);
    expect(item(2).x).toBeCloseTo(20 + W + 5, 6);
    expect(item(4).x).toBe(30);
    expect(item(5).x).toBeCloseTo(30 + W + 5, 6);
    expect(where([7])).toEqual([{ id: 7, sheet: 3, x: 50, y: 50 }]);
    expect(historyDepth().undo).toBe(1);
  });

  test('distributing evenly with no sheet holding three: off, with the reason it gives on one sheet', () => {
    spread();
    setView({ distribute: 'even' });
    expect(overlayFor({ kind: 'distribute', arg: 'x' })).toBeNull();
    expect(command('distributeX').disabled).toBe('Selecciona 3 piezas o más de una misma hoja para repartir parejo');
    const before = getDocument().items;
    distributeSelection('x');
    expect(getDocument().items).toBe(before);
  });
});
