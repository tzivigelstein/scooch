// @vitest-environment jsdom
// The «Pieza» panel (PieceSection) with several pieces selected: its heading,
// where they are, and the scale field (a common scale, or «Mixta»).
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { PieceSection } from '../../src/components/properties-panel/PieceSection.tsx';
import { getDocument, setDocument } from '../../src/state/document.ts';
import { setSelection } from '../../src/state/actions/selection.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

beforeEach(() => {
  const key = fakeImage({ px: [531, 591] });
  resetState({
    sheets: [{ id: 1 }, { id: 2 }],
    items: [piece(1, key, 20, 20), piece(2, key, 90, 20), piece(3, key, 20, 100), piece(4, key, 20, 20, { sheet: 2 })],
  });
  render(<PieceSection />);
});

afterEach(cleanup);

const text = (id: string) => (document.getElementById(id)!.textContent ?? '').replace(/ /g, ' ');
const scale = () => document.getElementById('scale') as HTMLInputElement;

describe('group measures', () => {
  test('the heading says how many and on which sheet; on two sheets, «En 2 hojas» and whose measures', () => {
    act(() => setSelection([1, 2, 3]));
    expect(document.getElementById('piece-title')!.hidden).toBe(false);
    expect(text('piece-title')).toBe('3 piezas');
    expect(text('piece-name')).toBe('En la hoja 1');
    act(() => setSelection([1, 2, 4]));
    expect(text('piece-name')).toBe('En 2 hojas. Medidas de la hoja 2.');
  });

  test('the scale field shows the common scale, or «Mixta» (empty) when the scales differ', () => {
    act(() => setSelection([1, 2]));
    expect(scale().value).toBe('100');
    expect(scale().placeholder).toBe('');
    act(() => setDocument({ items: getDocument().items.map((item) => (item.id === 1 ? { ...item, scale: 50 } : item)) }));
    expect(scale().value).toBe('');
    expect(scale().placeholder).toBe('Mixta');
    // Scales within 0.05 % of each other still count as one.
    act(() => setDocument({ items: getDocument().items.map((item) => (item.id === 1 ? { ...item, scale: 100.04 } : item)) }));
    expect(scale().placeholder).toBe('');
  });
});
