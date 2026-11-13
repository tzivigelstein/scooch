// @vitest-environment jsdom
// Align and distribute on the real stores: exact positions against the
// selection's box and against the printable area, a single piece (always
// against the printable area, inward with the grid), the refusal that offers
// «Permitir superposición», one undo step per operation and what is announced.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AlignMode } from '../../src/core/align.js';
import { getDocument, setDocument } from '../../src/state/document.ts';
import { historyDepth, undo } from '../../src/state/history.ts';
import { setGrid } from '../../src/state/prefs.ts';
import { getView, setView } from '../../src/state/view.ts';
import { alignSelection, distributeSelection } from '../../src/state/actions/pieces.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

// The old suite's tiles: 531 × 591 px at 300 ppi.
const W = (531 / 300) * 25.4; // 44.958 mm
const H = (591 / 300) * 25.4; // 50.038 mm
// A4 portrait with a 10 mm margin: the printable area is 10..200 × 10..287.

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
  document.body.innerHTML = '<div id="live-polite"></div><div id="live-assertive"></div>';
});

/** What the polite live region says once the pending announcements went out. */
function heard() {
  vi.advanceTimersByTime(1000);
  return (document.getElementById('live-polite')!.textContent ?? '').replace(/ /g, ' ').trim();
}

const xs = () => getDocument().items.map((item) => item.x);
const ys = () => getDocument().items.map((item) => item.y);
const closeAll = (got: number[], want: number[]) => {
  expect(got).toHaveLength(want.length);
  got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 6));
};

/** Three pieces at known places, all selected, without the grid (exact values). */
function three(positions: [number, number][] = [[20, 20], [90, 80], [150, 150]], selection = [1, 2, 3]) {
  const key = fakeImage({ px: [531, 591] });
  setDocument({ items: positions.map(([x, y], i) => piece(i + 1, key, x, y)), selection });
  return getDocument().items;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetState();
  setGrid({ snap: false });
});

afterEach(() => {
  vi.runAllTimers(); // nothing announced leaks into the next test
  vi.useRealTimers();
  for (const id of ['live-polite', 'live-assertive']) document.getElementById(id)!.textContent = '';
});

describe('alignSelection', () => {
  describe('against the selection', () => {
    const cases: [AlignMode, 'x' | 'y', number, string][] = [
      ['left', 'x', 20, 'a la izquierda'],
      ['centerX', 'x', 85, 'al centro en horizontal'],
      ['right', 'x', 150, 'a la derecha'],
      ['top', 'y', 20, 'arriba'],
      ['centerY', 'y', 85, 'al centro en vertical'],
      ['bottom', 'y', 150, 'abajo'],
    ];
    test.each(cases)('%s: every piece at %s = %d, in one undo step, announced', (mode, axis, value, how) => {
      const before = three();
      alignSelection(mode);
      closeAll(axis === 'x' ? xs() : ys(), [value, value, value]);
      // The other axis doesn't move.
      expect(axis === 'x' ? ys() : xs()).toEqual(axis === 'x' ? [20, 80, 150] : [20, 90, 150]);
      expect(getView().flash).toBeNull();
      expect(historyDepth().undo).toBe(1);
      expect(heard()).toBe(`Se alinearon 3 piezas ${how}.`);
      undo();
      expect(getDocument().items).toEqual(before);
      expect(getDocument().selection).toEqual([1, 2, 3]);
    });

    test('aligning what already is aligned adds no undo step and says so', () => {
      three();
      alignSelection('left');
      alignSelection('left');
      expect(historyDepth().undo).toBe(1);
      expect(heard()).toContain('Las piezas ya estaban alineadas.');
    });
  });

  describe('against the printable area («Alinear a: hoja»)', () => {
    const cases: [AlignMode, 'x' | 'y', number, string][] = [
      ['left', 'x', 10, 'a la izquierda'],
      ['centerX', 'x', (210 - W) / 2, 'al centro en horizontal'],
      ['right', 'x', 200 - W, 'a la derecha'],
      ['top', 'y', 10, 'arriba'],
      ['centerY', 'y', (297 - H) / 2, 'al centro en vertical'],
      ['bottom', 'y', 287 - H, 'abajo'],
    ];
    test.each(cases)('%s: every piece at %s = %d, in one undo step, announced', (mode, axis, value, how) => {
      const before = three();
      setView({ alignTo: 'sheet' });
      alignSelection(mode);
      closeAll(axis === 'x' ? xs() : ys(), [value, value, value]);
      expect(axis === 'x' ? ys() : xs()).toEqual(axis === 'x' ? [20, 80, 150] : [20, 90, 150]);
      expect(historyDepth().undo).toBe(1);
      expect(heard()).toBe(`Se alinearon 3 piezas ${how} del área útil.`);
      undo();
      expect(getDocument().items).toEqual(before);
    });
  });

  describe('a single piece: always against the printable area', () => {
    // The middle piece (90, 80) alone; the other two stay where they are and are never in the way.
    describe('without the grid', () => {
      const cases: [AlignMode, 'x' | 'y', number, string][] = [
        ['left', 'x', 10, 'a la izquierda'],
        ['right', 'x', 200 - W, 'a la derecha'],
        ['centerX', 'x', (210 - W) / 2, 'al centro en horizontal'],
        ['top', 'y', 10, 'arriba'],
        ['bottom', 'y', 287 - H, 'abajo'],
        ['centerY', 'y', (297 - H) / 2, 'al centro en vertical'],
      ];
      test.each(cases)('%s: the piece at %s = %d (applied, never refused), in one undo step, announced', (mode, axis, value, how) => {
        // «Alinear a» says «selection», but one piece goes against the printable area anyway.
        const before = three(undefined, [2]);
        alignSelection(mode);
        expect(getView().flash).toBeNull();
        const moved = getDocument().items[1];
        expect(moved[axis]).toBeCloseTo(value, 6);
        expect(moved[axis === 'x' ? 'y' : 'x']).toBe(axis === 'x' ? 80 : 90);
        expect(getDocument().items.filter((item) => item.id !== 2)).toEqual(before.filter((item) => item.id !== 2));
        expect(historyDepth().undo).toBe(1);
        expect(heard()).toBe(`Se alineó 1 pieza ${how} del área útil.`);
        undo();
        expect(getDocument().items).toEqual(before);
      });
    });

    describe('with the grid: rounded inward of the margin', () => {
      test.each([
        ['bottom', 'y', 236],
        ['right', 'x', 155],
      ] as const)('%s: %s = %d', (mode, axis, value) => {
        three(undefined, [2]);
        setGrid({ snap: true, size: 1 });
        alignSelection(mode);
        expect(getDocument().items[1][axis]).toBeCloseTo(value, 6);
      });
    });
  });

  test('when it would overlap, nothing changes and the notice offers «Permitir superposición», which aligns in one undo step', () => {
    // Aligned left, the second piece (80, 40) would land on the first (20, 20).
    const before = three([
      [20, 20],
      [80, 40],
      [150, 150],
    ]);
    alignSelection('left');
    const flash = getView().flash;
    expect(flash).toMatchObject({ text: 'No se puede alinear: las piezas se superpondrían', warn: true });
    expect(flash?.action?.label).toBe('Permitir superposición');
    expect(getDocument().items).toEqual(before);
    expect(historyDepth().undo).toBe(0);

    flash!.action!.run();
    expect(getDocument().allowOverlap).toBe(true);
    expect(xs()).toEqual([20, 20, 20]);
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(getDocument().items).toEqual(before);
  });
});

describe('distributeSelection', () => {
  describe('with the gap or evenly', () => {
    const cases: ['gap' | 'even', 'x' | 'y', number[], string][] = [
      // With the gap (5 mm): the first stays, each next one 5 mm after the previous.
      ['gap', 'x', [20, 25 + W, 30 + 2 * W], 'Se distribuyeron 3 piezas en horizontal, a 5 mm una de otra.'],
      ['gap', 'y', [20, 25 + H, 30 + 2 * H], 'Se distribuyeron 3 piezas en vertical, a 5 mm una de otra.'],
      // Evenly: the first and the last stay, the middle one in between.
      ['even', 'x', [20, 85, 150], 'Se repartieron 3 piezas parejo en horizontal.'],
      ['even', 'y', [20, 85, 150], 'Se repartieron 3 piezas parejo en vertical.'],
    ];
    test.each(cases)('%s along %s: %j, in one undo step, announced', (mode, axis, expected, text) => {
      const before = three();
      setView({ distribute: mode });
      distributeSelection(axis);
      closeAll(axis === 'x' ? xs() : ys(), expected);
      expect(axis === 'x' ? ys() : xs()).toEqual(axis === 'x' ? [20, 80, 150] : [20, 90, 150]);
      expect(historyDepth().undo).toBe(1);
      expect(heard()).toBe(text);
      undo();
      expect(getDocument().items).toEqual(before);
    });
  });

  test('evenly needs three on one sheet: with two nothing moves and the reason is announced', () => {
    const before = three(undefined, [1, 2]);
    setView({ distribute: 'even' });
    distributeSelection('x');
    expect(getDocument().items).toEqual(before);
    expect(historyDepth().undo).toBe(0);
    expect(heard()).toBe('Selecciona 3 piezas o más de una misma hoja para repartir parejo.');
  });

  test('a single piece has nothing to distribute: it says two are needed', () => {
    const before = three(undefined, [2]);
    distributeSelection('x');
    expect(getDocument().items).toEqual(before);
    expect(heard()).toBe('Selecciona 2 piezas o más de una misma hoja para distribuir.');
  });
});
