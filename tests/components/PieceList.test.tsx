// @vitest-environment jsdom
// The list of pieces as a multi-select listbox: clicks with Shift and Ctrl,
// the arrows with and without modifiers, Shift+Space and Shift+Enter, and
// aria-selected kept equal to the document's selection.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { PieceList } from '../../src/components/pieces-panel/PieceList.tsx';
import { getDocument } from '../../src/state/document.ts';
import { setSelection } from '../../src/state/actions/selection.ts';
import { fakeImage, fakePdf, piece, resetState } from '../support/state.ts';

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

beforeEach(() => {
  // Six pieces on one sheet, nothing selected.
  const key = fakeImage({ px: [531, 591] });
  resetState({ items: Array.from({ length: 6 }, (_, i) => piece(i + 1, key, 10 + (i % 3) * 60, 10 + Math.floor(i / 3) * 60)) });
  render(<PieceList />);
});

afterEach(cleanup);

const row = (id: number) => document.querySelector<HTMLElement>(`#piece-list [role="option"][data-id="${id}"]`)!;
const selected = () => [...getDocument().selection].sort((a, b) => a - b);
const focusedId = () => Number((document.activeElement as HTMLElement).dataset.id);
const key = (key: string, mods: { shiftKey?: boolean; ctrlKey?: boolean } = {}) => fireEvent.keyDown(document.activeElement!, { key, ...mods });

describe('piece list (listbox)', () => {
  test('Shift+click selects the range from the row picked last', () => {
    fireEvent.click(row(2));
    fireEvent.click(row(4), { shiftKey: true });
    expect(selected()).toEqual([2, 3, 4]);
    expect(getDocument().selection.at(-1)).toBe(4);
  });

  test('Ctrl+click toggles a row in and out of the selection', () => {
    fireEvent.click(row(2));
    fireEvent.click(row(4), { shiftKey: true });
    fireEvent.click(row(3), { ctrlKey: true });
    expect(selected()).toEqual([2, 4]);
    fireEvent.click(row(3), { ctrlKey: true });
    expect(selected()).toEqual([2, 3, 4]);
  });

  test('Shift+↓ extends the selection from the row picked', () => {
    fireEvent.click(row(1));
    key('ArrowDown', { shiftKey: true });
    key('ArrowDown', { shiftKey: true });
    expect(selected()).toEqual([1, 2, 3]);
    expect(focusedId()).toBe(3);
  });

  test('Ctrl+↓ only moves the focus; Shift+Space then adds the focused row', () => {
    fireEvent.click(row(1));
    key('ArrowDown', { shiftKey: true });
    key('ArrowDown', { shiftKey: true });
    key('ArrowDown', { ctrlKey: true });
    expect(selected()).toEqual([1, 2, 3]);
    expect(focusedId()).toBe(4);
    key(' ', { shiftKey: true });
    expect(selected()).toEqual([1, 2, 3, 4]);
    key(' ', { shiftKey: true });
    expect(selected()).toEqual([1, 2, 3]);
  });

  test('Shift+Enter adds or removes the focused row, as on the sheet, instead of going to the piece', () => {
    fireEvent.click(row(1));
    key('ArrowDown', { ctrlKey: true });
    key('Enter', { shiftKey: true });
    expect(selected()).toEqual([1, 2]);
    expect(focusedId()).toBe(2);
    key('Enter', { shiftKey: true });
    expect(selected()).toEqual([1]);
  });

  test('↓ without modifiers selects only the row it lands on', () => {
    fireEvent.click(row(1));
    key('ArrowDown', { shiftKey: true });
    key('ArrowDown');
    expect(selected()).toEqual([3]);
    expect(focusedId()).toBe(3);
  });

  test('a PDF page’s row has its name and its size and page whole in its tooltip and its accessible name (the row may cut them with «…»)', () => {
    const pdf = fakePdf({ name: 'catálogo de verano.pdf', w: 91.2, h: 129.4, page: 2, pages: 3 });
    act(() => resetState({ items: [piece(1, pdf, 10, 10)] }));
    // The copy joins these with non-breaking spaces; \s matches them.
    const option = screen.getByRole('option', { name: /^catálogo de verano\.pdf\s?91,2\s×\s129,4\smm\s·\spág\.\s2$/ });
    expect(option.dataset.tip).toBe('catálogo de verano.pdf');
    expect(option.dataset.tipNote).toMatch(/^91,2\s×\s129,4\smm\s·\spág\.\s2$/);
  });

  test('aria-selected is the selection, also when it changes elsewhere; the listbox is multiselectable', () => {
    const list = document.getElementById('piece-list')!;
    expect(list.getAttribute('role')).toBe('listbox');
    expect(list.getAttribute('aria-multiselectable')).toBe('true');
    act(() => setSelection([1, 3, 6]));
    const marked = [...list.querySelectorAll<HTMLElement>('[role="option"][aria-selected="true"]')].map((option) => Number(option.dataset.id));
    expect(marked).toEqual([1, 3, 6]);
    expect(list.querySelectorAll('[role="option"][aria-selected="false"]')).toHaveLength(3);
    // One tab stop: the primary (the last selected).
    expect([...list.querySelectorAll<HTMLElement>('[role="option"][tabindex="0"]')].map((option) => Number(option.dataset.id))).toEqual([6]);
  });
});
