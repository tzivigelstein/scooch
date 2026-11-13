// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NoticePill } from '../../src/components/feedback/NoticePill.tsx';
import { addAsset } from '../../src/state/assets.ts';
import { getDocument, setDocument } from '../../src/state/document.ts';
import { resetHistory } from '../../src/state/history.ts';

import { setView } from '../../src/state/view.ts';

const key = addAsset({
  kind: 'image',
  name: 'foto.png',
  src: 1,
  px: [600, 600],
  w: 50.8,
  h: 50.8,
  bytes: new Uint8Array(),
  preview: new Blob(),
  url: 'blob:test',
  format: 'png',
  dpi: 300,
  derived: false,
});

const pill = () => document.getElementById('pill')!;
const text = () => (pill().hidden ? '' : document.getElementById('pill-text')!.textContent);

beforeEach(() => {
  setDocument({ sheets: [{ id: 1 }], items: [{ id: 1, asset: key, sheet: 1, x: 20, y: 20, scale: 100, r: 0, crop: null }], margin: 10, busy: false });
  setView({ flash: null, editing: false, busyText: '' });
  render(
    <>
      <NoticePill />
      <div id="live-polite" />
      <div id="live-assertive" />
    </>
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('notice pill', () => {
  test('problems wait while a field is being edited, results do not', () => {
    expect(text()).toBe('');
    act(() => setView({ editing: true }));
    act(() => setDocument({ margin: 50 }));
    expect(text()).toBe('');
    act(() => setView({ flash: { text: 'Se descargó tarjetas.pdf' } }));
    expect(text()).toBe('Se descargó tarjetas.pdf');
    act(() => setView({ flash: null }));
    expect(text()).toBe('');
    act(() => setView({ editing: false }));
    expect(text()).toMatch(/pasa el margen/);
  });

  test('a result goes away on its own after 5 s, a warning after 9 s', () => {
    vi.useFakeTimers();
    act(() => setView({ flash: { text: 'Se descargó scooch-a4.pdf' } }));
    act(() => vi.advanceTimersByTime(4900));
    expect(text()).toBe('Se descargó scooch-a4.pdf');
    act(() => vi.advanceTimersByTime(200));
    expect(text()).toBe('');
    act(() => setView({ flash: { text: 'No se pudo leer notanimage.png', warn: true } }));
    act(() => vi.advanceTimersByTime(8900));
    expect(text()).toBe('No se pudo leer notanimage.png');
    act(() => vi.advanceTimersByTime(200));
    expect(text()).toBe('');
  });

  test('a result marked to persist, or with a button, stays until the next action or until closed', () => {
    vi.useFakeTimers();
    act(() => setView({ flash: { text: 'En el diálogo de impresión, elige «Tamaño real»', persist: true } }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(text()).toMatch(/^En el diálogo de impresión/);
    act(() => setView({ flash: { text: 'Se acomodaron 7 piezas en 2 hojas', action: { label: 'Reducir', run: () => {} } } }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(text()).toBe('Se acomodaron 7 piezas en 2 hojas');
    fireEvent.click(document.getElementById('pill-close')!);
    expect(text()).toBe('');
  });

  test('with no pieces there is nothing to say', () => {
    act(() => setDocument({ items: [], margin: 50 }));
    expect(pill().hidden).toBe(true);
  });

  test('overlapping pieces: «Hay piezas superpuestas» with «Acomodar», unless overlaps are allowed', () => {
    const items = [
      { id: 1, asset: key, sheet: 1, x: 20, y: 20, scale: 100, r: 0 as const, crop: null },
      { id: 2, asset: key, sheet: 1, x: 40, y: 40, scale: 100, r: 0 as const, crop: null },
    ];
    act(() => setDocument({ allowOverlap: true }));
    act(() => setDocument({ items, gap: 5, paper: 'A4', landscape: false }));
    resetHistory();
    // Allowed: not a problem.
    expect(text()).toBe('');
    act(() => setDocument({ allowOverlap: false }));
    expect(text()).toBe('Hay piezas superpuestas');
    expect(pill().dataset.tone).toBe('info');
    const action = document.getElementById('pill-action')!;
    expect(action.hidden).toBe(false);
    expect(action.textContent).toBe('Acomodar');
    // A problem, not a result: it has no close button.
    expect(document.getElementById('pill-close')!.hidden).toBe(true);
    act(() => fireEvent.click(action));
    const [a, b] = getDocument().items;
    expect(a.x + 50.8 + 5 <= b.x + 1e-6 || b.x + 50.8 + 5 <= a.x + 1e-6 || a.y + 50.8 + 5 <= b.y + 1e-6 || b.y + 50.8 + 5 <= a.y + 1e-6).toBe(true);
    expect(text()).toBe('Se acomodaron 2 piezas');
  });
});
