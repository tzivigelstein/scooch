// @vitest-environment jsdom
// How to print at real size lives in one place: the advice before printing
// (PrintTipDialog.test.tsx). The bar's buttons don't repeat it: «Descargar
// PDF» says just that and its shortcut.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Tooltip } from '../../src/components/feedback/Tooltip.tsx';
import { Topbar } from '../../src/components/topbar/Topbar.tsx';
import { fakeImage, piece, resetState } from '../support/state.ts';

beforeEach(() => {
  vi.useFakeTimers();
  resetState({ items: [piece(1, fakeImage(), 20, 20)] });
  render(
    <>
      <Topbar />
      <Tooltip />
    </>
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the bar’s download and print buttons', () => {
  test('«Descargar PDF»: its name and its shortcut, nothing more', () => {
    const download = screen.getByRole('button', { name: 'Descargar PDF' });
    expect(download.dataset.tipNote).toBeUndefined();
    expect(download.getAttribute('aria-keyshortcuts')).toBe('Control+E Meta+E Control+Shift+S Meta+Shift+S');
    fireEvent.pointerOver(download, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole('tooltip').textContent).toBe('Descargar PDFCtrl+E');
  });

  test('«Imprimir»: no tip about the print dialog either, and none as fixed text in the bar', () => {
    expect(screen.getByRole('button', { name: 'Imprimir' }).dataset.tipNote).toBeUndefined();
    expect(document.querySelector('header')!.textContent).not.toMatch(/Tamaño real/);
  });
});
