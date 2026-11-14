// @vitest-environment jsdom
// A selection spread over several sheets, on the real stores. There is no one
// box to measure, so X, Y, width and height are off: no value, no range,
// nothing applies, nothing shows on the canvas.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { getDocument } from '../../src/state/document.ts';
import { historyDepth } from '../../src/state/history.ts';
import { setGrid } from '../../src/state/prefs.ts';
import { getView } from '../../src/state/view.ts';
import { overlayFor } from '../../src/state/preview.ts';
import { lengthFieldRange, lengthFieldsOff, lengthFieldValue, setLengthField, type LengthField } from '../../src/state/actions/pieces.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

// The old suite's tiles: 531 × 591 px at 300 ppi.
const W = (531 / 300) * 25.4; // 44.958 mm
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
