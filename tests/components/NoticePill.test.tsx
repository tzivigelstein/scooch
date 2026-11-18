// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NoticePill } from '../../src/components/feedback/NoticePill.tsx';
import { addAsset } from '../../src/state/assets.ts';
import { getDocument, setDocument } from '../../src/state/document.ts';
import { resetHistory } from '../../src/state/history.ts';
import { setBusy } from '../../src/state/actions/files.ts';
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
  setView({ flash: null, editing: false, busyText: '', busyNotice: '' });
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
    // The canvas shows the result: only announced, and the problem is gone.
    expect(text()).toBe('');
    expect(pill().hidden).toBe(true);
  });
});

describe('a notice of work in progress', () => {
  const live = () => `${document.getElementById('live-polite')!.textContent}${document.getElementById('live-assertive')!.textContent}`.trim();

  /** Lets `ms` go by in steps of 10 ms, keeping each change of what the pill shows or the live regions say, with when (ms since the work began). */
  let clock = 0;
  const seen: string[] = [];
  const heard: string[] = [];
  const look = () => {
    const now = text() ?? '';
    if (now !== (seen.at(-1)?.replace(/^\d+ /, '') ?? '')) seen.push(`${clock} ${now}`);
    // Without the no-break space the announcer alternates to repeat a text.
    const said = live().replace(/ /g, '').trim();
    if (said && said !== heard.at(-1)?.replace(/^\d+ /, '')) heard.push(`${clock} ${said}`);
  };
  const pass = (ms: number) => {
    look();
    for (let end = clock + ms; clock < end; ) {
      act(() => vi.advanceTimersByTime(10));
      clock += 10;
      look();
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 0;
    seen.length = 0;
    heard.length = 0;
  });
  afterEach(() => {
    act(() => setBusy(false));
    act(() => vi.runAllTimers());
  });

  test('a 30 ms load shows nothing and says nothing', () => {
    act(() => setBusy(true, 'Cargando foto.png…'));
    pass(30);
    act(() => setBusy(false));
    pass(2000);
    expect(seen).toEqual([]);
    expect(heard).toEqual([]);
  });

  test('a 400 ms load shows from 200 ms to 600 ms, without a blink; once over, its «Cargando…» isn’t announced', () => {
    act(() => setBusy(true, 'Cargando foto.png…'));
    pass(400);
    act(() => setBusy(false));
    pass(2000);
    expect(seen).toEqual(['200 Cargando foto.png…', '600 ']);
    expect(heard).toEqual([]);
  });

  test('a long load is announced while it lasts, and what came of it after its notice', () => {
    act(() => setBusy(true, 'Cargando foto.png…'));
    pass(1000);
    act(() => {
      setBusy(false);
      setView({ flash: { text: 'Se agregó 1 archivo a la hoja 2', info: true } });
    });
    pass(500);
    expect(seen).toEqual(['200 Cargando foto.png…', '1000 Se agregó 1 archivo a la hoja 2']);
    // Shown at 200 ms, said 250 ms later (and the 60 ms the live regions gather what comes together).
    expect(heard).toEqual(['510 Cargando foto.png…', '1060 Se agregó 1 archivo a la hoja 2.']);
  });

  test('a result while its notice stays its minimum time shows after it', () => {
    act(() => setBusy(true, 'Cargando foto.png…'));
    pass(300);
    act(() => {
      setBusy(false);
      setView({ flash: { text: 'Se agregaron 7 archivos en las hojas 1 y 2' } });
    });
    pass(1000);
    expect(seen).toEqual(['200 Cargando foto.png…', '600 Se agregaron 7 archivos en las hojas 1 y 2']);
    expect(heard).toEqual(['660 Se agregaron 7 archivos en las hojas 1 y 2.']);
  });

  test('while the notice waits, the one already there stays', () => {
    act(() => setView({ flash: { text: 'Se copiaron 3 piezas', info: true } }));
    act(() => setBusy(true, 'Cargando foto.png…'));
    expect(text()).toBe('Se copiaron 3 piezas');
    pass(200);
    expect(text()).toBe('Cargando foto.png…');
  });
});
