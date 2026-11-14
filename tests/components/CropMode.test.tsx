// @vitest-environment jsdom
// Crop mode for assistive technology and the keyboard: the frame's name, role
// description and instructions, what it announces, and how it ends.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import CropMode from '../../src/components/canvas/crop/CropMode.tsx';
import { getDocument } from '../../src/state/document.ts';
import { historyDepth, resetHistory } from '../../src/state/history.ts';
import { getView, setView } from '../../src/state/view.ts';
import { applyPhotoSize } from '../../src/state/actions/crop.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

const frame = () => document.getElementById('crop-frame')!;
const help = () => document.getElementById('crop-help')!.textContent ?? '';
const heard = () => (document.getElementById('live-polite')!.textContent ?? '').replace(/ /g, ' ');
const press = (key: string, init: Partial<KeyboardEventInit> = {}) => {
  fireEvent.keyDown(frame(), { key, ...init });
  // Announcements wait for a burst of keys to end (up to 500 ms), then go out together (60 ms).
  act(() => vi.advanceTimersByTime(600));
};

/** Crop mode on piece 1 (`foto.png`, 50 × 30 mm at 200 %), optionally at a standard size first. */
function start({ size = '' } = {}) {
  const canvas = document.createElement('div');
  canvas.id = 'canvas';
  canvas.innerHTML = '<div id="stage"><div id="sheets"></div></div><div id="live-polite"></div><div id="live-assertive"></div>';
  document.body.append(canvas);
  resetState({ items: [piece(1, fakeImageMm(50, 30, { dpi: 254 }), 40, 40, { scale: 200 })], selection: [1] });
  if (size) {
    applyPhotoSize(size);
    resetHistory();
  }
  render(<CropMode />, { container: canvas.querySelector<HTMLElement>('#stage')! });
  act(() => setView({ cropping: 1 }));
  // What was said before (applying the size) goes out now, so each test hears only its own.
  act(() => vi.advanceTimersByTime(600));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  act(() => setView({ cropping: null }));
  act(() => vi.advanceTimersByTime(600));
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('crop mode', () => {
  test('the frame is focused, named and says it is a crop; the instructions describe it', () => {
    start();
    expect(document.activeElement).toBe(frame());
    expect(frame().getAttribute('role')).toBe('application');
    expect(frame().getAttribute('aria-roledescription')).toBe('recorte');
    expect(frame().getAttribute('aria-label')?.replace(/ /g, ' ')).toBe('Recorte de foto.png: 100 × 60 mm');
    expect(frame().getAttribute('aria-describedby')).toBe('crop-help');
    expect(help()).toMatch(/usa las flechas para moverla/);
    expect(help()).toMatch(/Alt\+flechas para cambiar el tamaño del recorte\. Enter: aplicar\. Esc: cancelar\./);
    expect(help()).not.toMatch(/mantiene la proporción/);
  });

  test('with a standard size, the instructions say the proportion is kept', () => {
    start({ size: '10x15' });
    expect(help()).toMatch(/cambiar el tamaño del recorte, que mantiene la proporción de 10 × 15\./);
  });

  test('zooming is announced', () => {
    start();
    press('+');
    expect(heard()).toMatch(/^Se ve el (\d+) % de la imagen\./);
    expect(Number(/(\d+) %/.exec(heard())![1])).toBeLessThan(100);
  });

  test('panning is announced; at the edge it says so', () => {
    start();
    press('ArrowLeft');
    expect(heard()).toMatch(/^La imagen ya llegó al borde\./);
    press('+');
    press('ArrowRight');
    expect(heard()).toMatch(/^Se ve desde el \d+ % por la izquierda y el \d+ % por arriba\./);
  });

  test('resizing with Alt+arrows is announced with the new size, and renames the frame', () => {
    start();
    press('ArrowLeft', { altKey: true });
    expect(heard()).toMatch(/^Recorte de 99 × 60 mm\./);
    expect(frame().getAttribute('aria-label')?.replace(/ /g, ' ')).toBe('Recorte de foto.png: 99 × 60 mm');
  });

  test('Esc cancels: it says so, the piece is as it was and there is nothing to undo', () => {
    start();
    const before = getDocument().items;
    press('+');
    press('Escape');
    expect(getView().cropping).toBeNull();
    expect(heard()).toMatch(/^Se canceló el recorte\./);
    expect(getDocument().items).toBe(before);
    expect(historyDepth().undo).toBe(0);
  });

  test('Enter applies it in one undo step and says so', () => {
    start();
    press('+');
    press('Enter');
    expect(getView().cropping).toBeNull();
    expect(getDocument().items[0].crop).not.toBeNull();
    expect(historyDepth().undo).toBe(1);
    expect(heard()).toMatch(/^Se recortó foto\.png: \d/);
  });
});
