// The notice of work in progress (setBusy in src/state/actions/files.ts) on
// the real stores, with fake timers: actions wait from the first moment, but
// the notice shows only once the work has lasted BUSY_SHOW_DELAY, and then
// stays BUSY_MIN_SHOWN at least, so quick work shows nothing and nothing
// blinks. How the pill shows it and what is announced: tests/components/NoticePill.test.tsx.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getDocument } from '../../src/state/document.ts';
import { useView } from '../../src/state/view.ts';
import { BUSY_MIN_SHOWN, BUSY_SHOW_DELAY, setBusy, setBusyText } from '../../src/state/actions/files.ts';
import { resetState } from '../support/state.ts';

/** Every change of what the pill shows of the work, with when (ms since the test began). */
let shown: [number, string][] = [];
let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  resetState();
  const start = Date.now();
  shown = [];
  stop = useView.subscribe((now, before) => {
    if (now.busyNotice !== before.busyNotice) shown.push([Date.now() - start, now.busyNotice]);
  });
});

afterEach(() => {
  setBusy(false);
  vi.runAllTimers();
  stop();
  vi.useRealTimers();
});

test('the delays are what the guidelines ask: a show delay of 150–300 ms, a minimum time of 300–500 ms', () => {
  expect(BUSY_SHOW_DELAY).toBeGreaterThanOrEqual(150);
  expect(BUSY_SHOW_DELAY).toBeLessThanOrEqual(300);
  expect(BUSY_MIN_SHOWN).toBeGreaterThanOrEqual(300);
  expect(BUSY_MIN_SHOWN).toBeLessThanOrEqual(500);
});

describe('work in progress', () => {
  test('of 30 ms holds the actions back at once, and shows nothing', () => {
    setBusy(true, 'Cargando foto.png…');
    expect(getDocument().busy).toBe(true);
    vi.advanceTimersByTime(30);
    setBusy(false);
    expect(getDocument().busy).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(shown).toEqual([]);
  });

  test('of 400 ms shows from 200 ms, and stays 400 ms: until 600 ms, with no blink', () => {
    setBusy(true, 'Cargando foto.png…');
    vi.advanceTimersByTime(400);
    setBusy(false);
    vi.advanceTimersByTime(2000);
    expect(shown).toEqual([
      [BUSY_SHOW_DELAY, 'Cargando foto.png…'],
      [BUSY_SHOW_DELAY + BUSY_MIN_SHOWN, ''],
    ]);
  });

  test('of 2 s shows from 200 ms and goes as it ends', () => {
    setBusy(true, 'Creando el PDF…');
    vi.advanceTimersByTime(2000);
    setBusy(false);
    expect(shown).toEqual([
      [BUSY_SHOW_DELAY, 'Creando el PDF…'],
      [2000, ''],
    ]);
  });

  test('that changes what it says: the notice shows the latest, and once shown says each change at once', () => {
    setBusy(true, 'Cargando…');
    setBusyText('Cargando 1 de 3…');
    vi.advanceTimersByTime(300);
    setBusyText('Cargando 2 de 3…');
    vi.advanceTimersByTime(300);
    setBusy(false);
    vi.advanceTimersByTime(1000);
    expect(shown).toEqual([
      [200, 'Cargando 1 de 3…'],
      [300, 'Cargando 2 de 3…'],
      [600, ''],
    ]);
  });

  test('that starts again while its notice stays its minimum time keeps the notice, saying the new work', () => {
    setBusy(true, 'Cargando foto.png…');
    vi.advanceTimersByTime(250);
    setBusy(false);
    vi.advanceTimersByTime(100);
    setBusy(true, 'Cargando la página 2…');
    vi.advanceTimersByTime(1000);
    setBusy(false);
    expect(shown).toEqual([
      [200, 'Cargando foto.png…'],
      [350, 'Cargando la página 2…'],
      [1350, ''],
    ]);
  });

  test('that says nothing (a new project being set up) never shows a notice', () => {
    setBusy(true, '');
    vi.advanceTimersByTime(1000);
    setBusy(false);
    vi.advanceTimersByTime(1000);
    expect(shown).toEqual([]);
  });
});
