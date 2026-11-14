// @vitest-environment jsdom
// The «Grilla» section in each unit: the suggested sizes (mm 1/5/10, cm
// 0,1/0,5/1, in 1/8, 1/4, 1/2), the custom size field (named and marked with
// the unit) and how a typed size marks the suggestion it equals.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { GridSection } from '../../src/components/properties-panel/GridSection.tsx';
import { getPrefs, setUnit } from '../../src/state/prefs.ts';
import { resetState } from '../support/state.ts';

const plain = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ');
const chips = () => [...document.querySelectorAll('#grid-chips span')].map((el) => plain(el.textContent));
const checkedChip = () => (document.querySelector('#grid-chips input:checked') as HTMLInputElement | null)?.value ?? null;
const size = () => document.getElementById('grid-size') as HTMLInputElement;
const confirm = (text: string) => {
  size().focus();
  fireEvent.input(size(), { target: { value: text } });
  fireEvent.keyDown(size(), { key: 'Enter' });
};

beforeEach(() => {
  resetState();
  render(<GridSection />);
});
afterEach(cleanup);

describe('grid sizes per unit', () => {
  test('mm: 1, 5 and 10 mm suggested; 1 mm (the default) marked', () => {
    expect(chips()).toEqual(['1 mm', '5 mm', '10 mm']);
    expect(checkedChip()).toBe('1');
    expect(size().value).toBe('1');
  });

  test('cm: 0,1, 0,5 and 1 cm suggested; the field shows 0,1', () => {
    act(() => setUnit('cm'));
    expect(chips()).toEqual(['0,1 cm', '0,5 cm', '1 cm']);
    expect(size().value).toBe('0,1');
  });

  test('in: fractions, 1/8, 1/4 and 1/2 in', () => {
    act(() => setUnit('in'));
    expect(chips()).toEqual(['1/8 in', '1/4 in', '1/2 in']);
    // 1 mm is none of them: nothing marked.
    expect(checkedChip()).toBeNull();
  });

  test('in: choosing 1/4 in stores exactly 6,35 mm', () => {
    act(() => setUnit('in'));
    fireEvent.click(screen.getByRole('radio', { name: (name) => plain(name) === '1/4 in' }));
    expect(getPrefs().grid.size).toBe(6.35);
    expect(size().value).toBe('0,25');
  });
});

describe('the custom grid size', () => {
  test('cm: typing 0,5 cm marks the 5 mm suggestion', () => {
    act(() => setUnit('cm'));
    confirm('0,5');
    expect(getPrefs().grid.size).toBe(5);
    expect(size().value).toBe('0,5');
    expect(checkedChip()).toBe('5');
    expect((within(document.getElementById('grid-chips')!).getByRole('radio', { name: (name) => plain(name) === '0,5 cm' }) as HTMLInputElement).checked).toBe(true);
  });

  test('cm: named «en centímetros», with «cm» next to it', () => {
    act(() => setUnit('cm'));
    expect(screen.getByRole('textbox', { name: 'Otro tamaño de grilla, en centímetros' })).toBe(size());
    expect(size().nextElementSibling!.textContent).toBe('cm');
  });

  test('a size beyond the limits keeps the limit: 0,5 to 50 mm', () => {
    confirm('0,1');
    expect(getPrefs().grid.size).toBe(0.5);
    confirm('80');
    expect(getPrefs().grid.size).toBe(50);
  });
});

describe('the switches', () => {
  test('«Mostrar grilla» is named by its label alone, with its key G in the tooltip; «Imán» is plain text, without an icon', () => {
    const show = screen.getByRole('switch', { name: 'Mostrar grilla' });
    expect(show.dataset.tip).toBe('Mostrar grilla');
    expect(show.dataset.kbd).toBe('G');
    expect(show.getAttribute('aria-keyshortcuts')).toBe('G');
    expect(show.closest('.switch-row')!.querySelector('kbd')).toBeNull();
    const snap = document.getElementById('grid-snap') as HTMLInputElement;
    expect(snap.labels![0].firstElementChild!.textContent).toBe('Imán');
    expect(snap.closest('.switch-row')!.querySelector('svg')).toBeNull();
  });
});
