// @vitest-environment jsdom
// The list of pieces with several sheets: grouped by sheet (role="group" named
// by its heading «Hoja N» and its count), still one Tab stop for the whole
// list, and the arrows go on from one group to the next. With one sheet there
// are no groups.
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { PieceList } from '../../src/components/pieces-panel/PieceList.tsx';
import { getDocument } from '../../src/state/document.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

afterEach(cleanup);

const groups = () => [...document.querySelectorAll<HTMLElement>('#piece-list [role="group"]')];
const norm = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ');
/** A group's accessible name: the text of what labels it. */
const nameOf = (group: HTMLElement) =>
  (group.getAttribute('aria-labelledby') ?? '')
    .split(' ')
    .map((id) => norm(document.getElementById(id)?.textContent))
    .join(' ');
const tabStops = () => [...document.querySelectorAll<HTMLElement>('#piece-list [tabindex="0"]')].map((row) => Number(row.dataset.id));

describe('piece list grouped by sheet', () => {
  beforeEach(() => {
    // Sheets 1, 2 and 3 with 9, 9 and 2 pieces (ids 1–20), nothing selected; and an empty fourth.
    const key = fakeImage({ px: [661, 945] });
    const sheetOf = (i: number) => (i < 9 ? 1 : i < 18 ? 2 : 3);
    resetState({
      sheets: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      items: Array.from({ length: 20 }, (_, i) => piece(i + 1, key, 10 + (i % 3) * 61, 10 + (Math.floor(i / 3) % 3) * 85, { sheet: sheetOf(i) })),
    });
    render(<PieceList />);
  });

  test('one group per sheet, in order, named by its heading: «Hoja 1» and its count (an empty one says so)', () => {
    expect(groups()).toHaveLength(4);
    expect(groups().map(nameOf)).toEqual(['Hoja 19 piezas', 'Hoja 29 piezas', 'Hoja 32 piezas', 'Hoja 4Vacía']);
    expect(groups().map((group) => group.querySelectorAll('[role="option"]').length)).toEqual([9, 9, 2, 0]);
    // The heading is not an option: the listbox only has the rows.
    expect(document.querySelectorAll('#piece-list .group-head[role="presentation"]')).toHaveLength(4);
  });

  test('the whole list is one Tab stop: the first row, then the selected one, wherever its sheet', () => {
    expect(tabStops()).toEqual([1]);
    fireEvent.click(document.querySelector('#piece-list [data-id="19"]')!);
    expect(getDocument().selection).toEqual([19]);
    expect(tabStops()).toEqual([19]);
  });

  test('the arrows go on from the last row of a group to the first of the next', () => {
    fireEvent.click(document.querySelector('#piece-list [data-id="9"]')!);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect((document.activeElement as HTMLElement).dataset.id).toBe('10');
    expect(getDocument().selection).toEqual([10]);
  });
});

test('with one sheet the rows are not grouped', () => {
  const key = fakeImage({ px: [661, 945] });
  resetState({ items: [piece(1, key, 10, 10), piece(2, key, 80, 10)] });
  render(<PieceList />);
  expect(groups()).toHaveLength(0);
  expect(document.querySelectorAll('#piece-list > [role="option"]')).toHaveLength(2);
  expect(tabStops()).toEqual([1]);
});
