// @vitest-environment jsdom
// What the view remembers in this browser (scooch:view-preferences, written by
// src/state/view.ts): the zoom's mode and, when manual, its percentage,
// «Alinear a» and «Distribuir con». Written once the changes stop (the wheel
// changes the zoom many times a second) or when leaving the page; read when
// the app starts. Where the sheets are scrolled is never stored.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { VIEW_STORAGE } from '../../src/config.ts';
import { fromPercent, toPercent } from '../../src/core/zoom.js';

/** The view store as a fresh start of the app has it. */
async function start() {
  vi.resetModules();
  return import('../../src/state/view.ts');
}

const stored = () => JSON.parse(localStorage.getItem(VIEW_STORAGE) ?? 'null');

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('the view this browser remembers', () => {
  test('with nothing saved: fit the sheet, align to the selection, distribute with the gap', async () => {
    const { getView } = await start();
    expect(getView()).toMatchObject({ zoomMode: 'fit', alignTo: 'selection', distribute: 'gap' });
  });

  test('a manual zoom is written once it stops changing, and the next start opens at that zoom', async () => {
    const { setView } = await start();
    for (let pct = 110; pct <= 190; pct += 10) {
      setView({ zoom: fromPercent(pct), zoomMode: 'manual' });
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(stored(), 'nothing while the wheel turns').toBeNull();
    await vi.advanceTimersByTimeAsync(400);
    expect(stored()).toEqual({ v: 1, zoomMode: 'manual', zoomPct: 190, alignTo: 'selection', distribute: 'gap' });
    const { getView } = await start();
    expect(getView().zoomMode).toBe('manual');
    expect(toPercent(getView().zoom)).toBeCloseTo(190, 6);
  });

  test('a fit mode is remembered as that mode (fitted again to the window on start)', async () => {
    const { setView } = await start();
    setView({ zoom: fromPercent(87.3), zoomMode: 'width' });
    await vi.advanceTimersByTimeAsync(400);
    expect((await start()).getView().zoomMode).toBe('width');
  });

  test('«Alinear a» and «Distribuir con» are remembered', async () => {
    const { setView } = await start();
    setView({ alignTo: 'sheet', distribute: 'even' });
    await vi.advanceTimersByTimeAsync(400);
    expect((await start()).getView()).toMatchObject({ alignTo: 'sheet', distribute: 'even' });
  });

  test('leaving the page writes what is still waiting', async () => {
    const { setView } = await start();
    setView({ zoom: fromPercent(300), zoomMode: 'manual' });
    window.dispatchEvent(new Event('pagehide'));
    expect(stored()).toMatchObject({ zoomMode: 'manual', zoomPct: 300 });
  });

  test('other view changes (the current sheet, a notice, the selection being pinned) write nothing', async () => {
    const { setView } = await start();
    setView({ sheet: 3, pinned: true, flash: { text: 'x' }, busyText: 'Cargando…' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(stored()).toBeNull();
  });
});
