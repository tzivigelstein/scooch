// @vitest-environment jsdom
// A tooltip (feedback/Tooltip.tsx) and scrolling: it goes when a scroll moves
// the element the pointer was on (the page, or a box the element is in),
// follows the element that has the focus (the browser scrolls a field into
// view right after the focus reaches it), and stays when something else
// scrolls (the canvas, to the selection, while a field of the panel shows why
// it is off).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Tooltip } from '../../src/components/feedback/Tooltip.tsx';

const tooltip = () => document.getElementById('tooltip')!;

function hover() {
  fireEvent.pointerOver(screen.getByRole('button'), { pointerType: 'mouse' });
  act(() => vi.advanceTimersByTime(300));
  expect(tooltip().hidden).toBe(false);
}

beforeEach(() => {
  vi.useFakeTimers();
  render(
    <>
      <div id="panel">
        <button type="button" data-tip="X" data-tip-note="Disponible cuando las piezas están en una misma hoja">
          X
        </button>
      </div>
      <div id="stage" />
      <Tooltip />
    </>
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('another box scrolling (the canvas) leaves the tooltip showing', () => {
  hover();
  act(() => void fireEvent.scroll(document.getElementById('stage')!));
  expect(tooltip().hidden).toBe(false);
  expect(tooltip().textContent).toBe('XDisponible cuando las piezas están en una misma hoja');
});

test('the box its element is in scrolling, or the page, hides it', () => {
  hover();
  act(() => void fireEvent.scroll(document.getElementById('panel')!));
  expect(tooltip().hidden).toBe(true);
  hover();
  act(() => void fireEvent.scroll(document));
  expect(tooltip().hidden).toBe(true);
});

test('the box scrolling its focused element into view leaves its tooltip showing; scrolled out of view, it goes', () => {
  const button = screen.getByRole('button');
  act(() => button.focus());
  expect(tooltip().hidden).toBe(false);
  act(() => void fireEvent.scroll(document.getElementById('panel')!));
  expect(tooltip().hidden).toBe(false);
  expect(tooltip().textContent).toBe('XDisponible cuando las piezas están en una misma hoja');

  button.getBoundingClientRect = () => new DOMRect(0, -40, 20, 20);
  act(() => void fireEvent.scroll(document.getElementById('panel')!));
  expect(tooltip().hidden).toBe(true);
});
