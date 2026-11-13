// @vitest-environment jsdom
// The align and distribute tools of the «Pieza» panel (PieceSection): which
// controls show with one piece or several, and when distributing is disabled,
// with the reason in its tooltip note and announced when activated anyway.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PieceSection } from '../../src/components/properties-panel/PieceSection.tsx';
import { getDocument } from '../../src/state/document.ts';
import { historyDepth } from '../../src/state/history.ts';
import { setSelection } from '../../src/state/actions/selection.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

const NEED_THREE = 'Selecciona 3 piezas o más de una misma hoja para repartir parejo';
const NEED_TWO = 'Selecciona 2 piezas o más de una misma hoja para distribuir';

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

beforeEach(() => {
  vi.useFakeTimers();
  const key = fakeImage({ px: [531, 591] });
  resetState({ items: [piece(1, key, 20, 20), piece(2, key, 90, 80), piece(3, key, 150, 150)] });
  render(
    <>
      <PieceSection />
      <div id="live-polite" />
      <div id="live-assertive" />
    </>
  );
});

afterEach(() => {
  cleanup();
  vi.runAllTimers();
  vi.useRealTimers();
});

const distributeButtons = () => [...document.querySelectorAll<HTMLElement>('[data-distribute]')];
const heard = () => {
  act(() => vi.advanceTimersByTime(1000));
  return (document.getElementById('live-polite')!.textContent ?? '').replace(/ /g, ' ').trim();
};

describe('align and distribute tools', () => {
  test('two pieces with «Parejo»: distribute is disabled, says why in its tooltip, and announces it when activated', () => {
    act(() => setSelection([1, 2]));
    fireEvent.click(document.querySelector('#distribute-mode input[value="even"]')!);
    for (const button of distributeButtons()) {
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.dataset.tipNote).toBe(NEED_THREE);
    }
    const before = getDocument().items;
    fireEvent.click(document.querySelector('[data-distribute="x"]')!);
    expect(getDocument().items).toBe(before);
    expect(historyDepth().undo).toBe(0);
    expect(heard()).toBe(`${NEED_THREE}.`);
  });

  test('two pieces with «Separación»: distribute is enabled, with the gap in its note', () => {
    act(() => setSelection([1, 2]));
    fireEvent.click(document.querySelector('#distribute-mode input[value="even"]')!);
    fireEvent.click(document.querySelector('#distribute-mode input[value="gap"]')!);
    for (const button of distributeButtons()) {
      expect(button.getAttribute('aria-disabled')).toBe('false');
      expect(button.dataset.tipNote?.replace(/ /g, ' ')).toBe('5 mm entre piezas, la separación de Distribución');
    }
  });

  test('several pieces: the «Alinear a» selector shows, not the printable-area note', () => {
    act(() => setSelection([1, 2, 3]));
    expect(document.getElementById('align-to-field')!.hidden).toBe(false);
    expect(document.getElementById('align-sheet-note')!.hidden).toBe(true);
  });

  test('one piece: «Alinear al área útil de la hoja» instead of the selector, and distribute disabled', () => {
    act(() => setSelection([2]));
    const note = document.getElementById('align-sheet-note')!;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('Alinear al área útil de la hoja');
    expect(document.getElementById('align-to-field')!.hidden).toBe(true);
    for (const button of distributeButtons()) {
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.dataset.tipNote).toBe(NEED_TWO);
    }
  });
});
