// @vitest-environment jsdom
// How to print at real size is said where it is needed: in the tooltip of
// «Descargar PDF» (and in the notice after downloading), not as fixed text.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Tooltip } from '../../src/components/feedback/Tooltip.tsx';
import { Topbar } from '../../src/components/topbar/Topbar.tsx';
import { fakeImage, piece, resetState } from '../support/state.ts';

const nb = (s: string | null | undefined) => String(s ?? '').replace(/\u00a0/g, ' ');

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

describe('the printing tip', () => {
  test('lives in the tooltip of «Descargar PDF»', () => {
    const download = screen.getByRole('button', { name: 'Descargar PDF' });
    expect(nb(download.dataset.tipNote)).toBe('Al imprimirlo, elige «Tamaño real» o «100 %»');
    fireEvent.pointerOver(download, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(300));
    const tip = screen.getByRole('tooltip');
    expect(tip.hidden).toBe(false);
    expect(nb(tip.textContent)).toMatch(/^Descargar PDF.*Al imprimirlo, elige «Tamaño real» o «100 %»$/);
  });

  test('is not fixed text in the bar', () => {
    const bar = document.querySelector('header')!;
    expect(bar.textContent).not.toMatch(/Tamaño real/);
  });
});
