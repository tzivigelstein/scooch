// @vitest-environment jsdom
// The «Pieza» panel (PieceSection) with several pieces selected: its title
// (how many and where), the measure fields (the group's box, or off when the
// pieces are on several sheets) and the scale field (a common scale, or
// «Mixta»).
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { PieceSection } from '../../src/components/properties-panel/PieceSection.tsx';
import { getDocument, setDocument } from '../../src/state/document.ts';
import { historyDepth } from '../../src/state/history.ts';
import { getView } from '../../src/state/view.ts';
import { setSelection } from '../../src/state/actions/selection.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

const OFF = 'Disponible cuando las piezas están en una misma hoja';
const MEASURES = ['pos-x', 'pos-y', 'width', 'height'];

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

const text = (id: string) => (document.getElementById(id)!.textContent ?? '').replace(/ /g, ' ');
const scale = () => document.getElementById('scale') as HTMLInputElement;
const field = (id: string) => document.getElementById(id) as HTMLInputElement;
/** What aria-describedby points to (hidden or not, as the accessible description reads it). */
const description = (el: Element) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

describe('group measures', () => {
  test('the title names how many and on which sheet, as one name; the piece’s name line is hidden', () => {
    act(() => setSelection([1, 2, 3]));
    expect(document.getElementById('piece-title')!.hidden).toBe(false);
    expect(text('piece-title')).toBe('3 piezas en la hoja 1');
    expect(document.getElementById('piece-name')!.hidden).toBe(true);
  });

  test('on several sheets the title names how many pieces on how many sheets: «2 piezas en 2 hojas», «6 piezas en 4 hojas»', () => {
    act(() => setSelection([1, 4]));
    expect(text('piece-title')).toBe('2 piezas en 2 hojas');
    const key = getDocument().items[0].asset;
    act(() => {
      resetState({
        sheets: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
        items: [piece(1, key, 20, 20), piece(2, key, 90, 20), piece(3, key, 20, 20, { sheet: 2 }), piece(4, key, 90, 20, { sheet: 2 }), piece(5, key, 20, 20, { sheet: 3 }), piece(6, key, 20, 20, { sheet: 4 })],
      });
      setSelection([1, 2, 3, 4, 5, 6]);
    });
    expect(text('piece-title')).toBe('6 piezas en 4 hojas');
  });

  test('on several sheets X, Y, width and height are off: empty and in place, read-only, saying why in the tooltip and the description, with nothing to show on the canvas', () => {
    act(() => setSelection([1, 2, 4]));
    for (const id of MEASURES) {
      const input = field(id);
      expect(input.value, id).toBe('');
      expect(input.hidden || !!input.closest('[hidden]'), id).toBe(false);
      expect(input.getAttribute('aria-disabled'), id).toBe('true');
      expect(input.readOnly, id).toBe(true);
      expect(input.dataset.tipNote, id).toBe(OFF);
      expect(input.closest('[data-preview]'), id).toBeNull();
    }
    expect(description(field('pos-x'))).toBe(OFF);
    expect(description(field('width'))).toBe(OFF);
  });

  test('an off measure changes nothing: the arrows, Enter and leaving it start no edit, add no undo step and leave it empty', () => {
    act(() => setSelection([1, 4]));
    const before = getDocument().items;
    const x = field('pos-x');
    x.focus();
    for (const key of [{ key: 'ArrowUp' }, { key: 'ArrowDown', shiftKey: true }, { key: 'Enter' }]) {
      fireEvent.keyDown(x, key);
      expect(x.value, key.key).toBe('');
      expect(getView().editing, key.key).toBe(false);
    }
    fireEvent.blur(x);
    expect(getDocument().items).toBe(before);
    expect(historyDepth().undo).toBe(0);
    expect(x.value).toBe('');
  });

  test('back on one sheet the measures come back, with the box’s values', () => {
    act(() => setSelection([1, 4]));
    act(() => setSelection([1, 2]));
    expect(field('pos-x').value).toBe('20');
    expect(field('pos-y').value).toBe('20');
    expect(field('width').value).not.toBe('');
    for (const id of MEASURES) {
      expect(field(id).getAttribute('aria-disabled'), id).toBeNull();
      expect(field(id).readOnly, id).toBe(false);
      expect(field(id).dataset.tipNote, id).toBeUndefined();
      expect(field(id).closest('[data-preview]'), id).not.toBeNull();
    }
    expect(document.getElementById('length-fields-off')).toBeNull();
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

  test('on several sheets the scale field and the slider stay on and change every selected piece', () => {
    act(() => setSelection([1, 4]));
    expect(scale().getAttribute('aria-disabled')).toBeNull();
    expect(scale().value).toBe('100');
    const slider = document.getElementById('slider') as HTMLInputElement;
    expect(slider.disabled).toBe(false);
    act(() => {
      fireEvent.input(scale(), { target: { value: '80' } });
      fireEvent.change(scale());
    });
    expect(getDocument().items.filter((item) => [1, 4].includes(item.id)).map((item) => item.scale)).toEqual([80, 80]);
    act(() => {
      slider.value = '60';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(getDocument().items.filter((item) => [1, 4].includes(item.id)).map((item) => item.scale)).toEqual([60, 60]);
    expect(getDocument().items.filter((item) => ![1, 4].includes(item.id)).every((item) => item.scale === 100)).toBe(true);
  });
});
