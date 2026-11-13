// @vitest-environment jsdom
// What the side panels show, on the real stores: the pieces panel (its empty
// state, one row per piece with its name and size, the total) and the count on
// the narrow screens' «Piezas» button; the Hoja tab's collapsible sections and
// the selected piece's name. (Where the panels go at each width, the drawer and
// the bottom sheet, and a collapsed section kept across a reload are in
// e2e/specs/panels-and-tabs.spec.ts; the list as a listbox in PieceList.test.)
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { Dock } from '../../src/components/canvas/Dock.tsx';
import { PiecesPanel } from '../../src/components/pieces-panel/PiecesPanel.tsx';
import { PropertiesPanel } from '../../src/components/properties-panel/PropertiesPanel.tsx';
import { setDocument } from '../../src/state/document.ts';
import { showPropsTab } from '../../src/state/actions/panels.ts';
import { setSelection } from '../../src/state/actions/selection.ts';
import { fakeImage, fakeImageMm, piece, resetState } from '../support/state.ts';

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
  // The wide layout: the panels are columns, not drawers.
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s/g, ' ').trim();

function threePieces() {
  const small = fakeImageMm(40, 30, { name: 'small.jpg', src: 1 });
  const square = fakeImageMm(50, 50, { name: 'square.webp', src: 2 });
  const tall = fakeImage({ name: 'tall.png', src: 3, px: [300, 900] });
  return [piece(1, small, 10, 10), piece(2, square, 60, 10), piece(3, tall, 120, 10)];
}

describe('the pieces panel', () => {
  test('empty: the help text and the add zone, «0 piezas» and no rows', () => {
    resetState();
    render(<PiecesPanel />);
    const empty = document.getElementById('list-empty')!;
    expect(empty.hidden).toBe(false);
    expect(text(empty)).not.toBe('');
    expect(document.getElementById('addzone')!.tagName).toBe('BUTTON');
    expect(document.querySelectorAll('#piece-list [role="option"]')).toHaveLength(0);
    expect(text(document.getElementById('piece-total'))).toBe('0 piezas');
  });

  test('one row per piece, with its name and its size in mm; the total says «3 piezas»', () => {
    resetState({ items: threePieces() });
    render(<PiecesPanel />);
    const rows = [...document.querySelectorAll('#piece-list [role="option"]')];
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => text(row.querySelector('.row-name')))).toEqual(['small.jpg', 'square.webp', 'tall.png']);
    expect(text(rows[0].querySelector('.row-dims'))).toBe('40 × 30 mm');
    expect(text(rows[2].querySelector('.row-dims'))).toBe('25,4 × 76,2 mm');
    expect(document.getElementById('list-empty')!.hidden).toBe(true);
    expect(text(document.getElementById('piece-total'))).toBe('3 piezas');
    act(() => setDocument({ items: threePieces().slice(0, 1) }));
    expect(document.getElementById('list-empty')!.hidden).toBe(true);
    expect(text(document.getElementById('piece-total'))).toBe('1 pieza');
    act(() => setDocument({ items: [] }));
    expect(document.getElementById('list-empty')!.hidden).toBe(false);
    expect(text(document.getElementById('piece-total'))).toBe('0 piezas');
  });

  test('the «Piezas» button of narrow screens counts the pieces (nothing when there are none)', () => {
    resetState();
    render(<Dock />);
    expect(text(document.getElementById('dock-count'))).toBe('');
    act(() => setDocument({ items: threePieces().slice(0, 2) }));
    expect(text(document.getElementById('dock-count'))).toBe('2');
  });
});

describe('the Hoja tab’s sections', () => {
  beforeEach(() => {
    resetState({ items: threePieces() });
    render(<PropertiesPanel />);
  });

  const toggle = (name: string) => document.querySelector(`[aria-controls="section-${name}"]`)!;

  test('Papel, Distribución and Grilla are open by default', () => {
    for (const name of ['sheet', 'arrange', 'grid']) {
      expect(toggle(name).getAttribute('aria-expanded')).toBe('true');
      expect(document.getElementById(`section-${name}`)!.hidden).toBe(false);
    }
    expect(text(toggle('sheet'))).toBe('Papel');
    expect(text(toggle('arrange'))).toBe('Distribución');
    expect(text(toggle('grid'))).toBe('Grilla');
  });

  test('collapsing «Distribución» hides its content (the gap) and says so; opening it shows it again', () => {
    fireEvent.click(toggle('arrange'));
    expect(toggle('arrange').getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('gap')!.closest('[hidden]')).not.toBeNull();
    fireEvent.click(toggle('arrange'));
    expect(toggle('arrange').getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('gap')!.closest('[hidden]')).toBeNull();
  });

  test('Pieza names the selected piece', () => {
    act(() => {
      setSelection([3]);
      showPropsTab('piece');
    });
    expect(text(document.getElementById('piece-name'))).toBe('tall.png');
  });
});
