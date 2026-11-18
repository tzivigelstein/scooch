// @vitest-environment jsdom
// A tooltip (feedback/Tooltip.tsx) and scrolling: it goes when a scroll moves
// the element the pointer was on (the page, or a box the element is in),
// follows the element that has the focus (the browser scrolls a field into
// view right after the focus reaches it), and stays when something else
// scrolls (the canvas, to the selection, while a field of the panel shows why
// it is off). And what slides under a pointer that doesn't move (the bottom
// sheet opening under it) doesn't take the tooltip from the focused element;
// the pointer moving does.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Tooltip } from '../../src/components/feedback/Tooltip.tsx';

const tooltip = () => document.getElementById('tooltip')!;
const NOTE = 'Disponible cuando las piezas están en una misma hoja';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('scrolling', () => {
  function hover() {
    fireEvent.pointerOver(screen.getByRole('button'), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(300));
    expect(tooltip().hidden).toBe(false);
  }

  beforeEach(() => {
    render(
      <>
        <div id="panel">
          <button type="button" data-tip="X" data-tip-note={NOTE}>
            X
          </button>
        </div>
        <div id="stage" />
        <Tooltip />
      </>
    );
  });

  test('another box scrolling (the canvas) leaves the tooltip showing', () => {
    hover();
    act(() => void fireEvent.scroll(document.getElementById('stage')!));
    expect(tooltip().hidden).toBe(false);
    expect(tooltip().textContent).toBe(`X${NOTE}`);
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
    expect(tooltip().textContent).toBe(`X${NOTE}`);

    button.getBoundingClientRect = () => new DOMRect(0, -40, 20, 20);
    act(() => void fireEvent.scroll(document.getElementById('panel')!));
    expect(tooltip().hidden).toBe(true);
  });
});

describe('the pointer resting while the keyboard moves', () => {
  /** A pointer event of the mouse at (x, 100). */
  const at = (x: number) => ({ pointerType: 'mouse', clientX: x, clientY: 100 });
  const field = () => screen.getByRole('textbox', { name: 'X' });
  const same = () => screen.getByRole('button', { name: 'Seleccionar iguales' });
  const shows = () => (tooltip().hidden ? null : tooltip().textContent);

  beforeEach(() => {
    render(
      <>
        {/* A measure field that is off, its tooltip saying why (what the keyboard reaches). */}
        <input aria-label="X" aria-disabled="true" data-tip="X" data-tip-note={NOTE} />
        <button type="button" data-tip="Seleccionar iguales">
          Seleccionar iguales
        </button>
        <Tooltip />
      </>
    );
  });

  test('a button that slides under the pointer doesn’t take the focused field’s tooltip; the pointer moving over it does, at once', () => {
    fireEvent.pointerMove(document.body, at(50));
    act(() => field().focus());
    expect(shows()).toBe(`X${NOTE}`);

    // The bottom sheet opens and the button ends up under the pointer, which didn't move.
    fireEvent.pointerOver(same(), at(50));
    act(() => vi.advanceTimersByTime(1000));
    expect(shows()).toBe(`X${NOTE}`);

    fireEvent.pointerMove(same(), at(52));
    act(() => vi.advanceTimersByTime(0));
    expect(shows()).toBe('Seleccionar iguales');
  });

  test('the pointer moving onto a button takes the tooltip at once, from the focused field too', () => {
    fireEvent.pointerMove(document.body, at(50));
    act(() => field().focus());
    fireEvent.pointerOver(same(), at(80));
    act(() => vi.advanceTimersByTime(0));
    expect(shows()).toBe('Seleccionar iguales');
  });

  test('the button under the pointer sliding away leaves the focused field’s tooltip', () => {
    fireEvent.pointerOver(same(), at(50));
    fireEvent.pointerMove(same(), at(50));
    act(() => vi.advanceTimersByTime(300));
    expect(shows()).toBe('Seleccionar iguales');
    act(() => field().focus());
    expect(shows()).toBe(`X${NOTE}`);

    fireEvent.pointerOut(same(), { ...at(50), relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(1000));
    expect(shows()).toBe(`X${NOTE}`);
  });
});
