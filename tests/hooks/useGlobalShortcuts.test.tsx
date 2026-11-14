// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Undo2 } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useGlobalShortcuts } from '../../src/hooks/useGlobalShortcuts.ts';
import { addAsset } from '../../src/state/assets.ts';
import { Button, IconButton } from '../../src/components/ui/Button.tsx';
import { useDialogs } from '../../src/components/dialogs/dialogs.ts';
import { getDocument, setDocument, useDocument, type Piece } from '../../src/state/document.ts';
import { historyDepth, resetHistory } from '../../src/state/history.ts';
import { getPrefs, setSingleKeys, setUnit } from '../../src/state/prefs.ts';
import { dims } from '../../src/state/selectors.ts';
import { getView, setView } from '../../src/state/view.ts';
import { piece as makePiece, resetState } from '../support/state.ts';
import { exportPdf, printPdf } from '../../src/state/actions/output.ts';
import { useProject } from '../../src/state/project.ts';
import { openProjects } from '../../src/state/actions/dialogs.ts';

vi.mock('../../src/state/actions/output.ts', () => ({ exportPdf: vi.fn(async () => {}), printPdf: vi.fn(async () => {}) }));
vi.mock('../../src/state/actions/dialogs.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/state/actions/dialogs.ts')>()),
  openProjects: vi.fn(async () => {}),
}));

const key = addAsset({
  kind: 'image',
  name: 'foto.png',
  src: 1,
  px: [600, 300],
  w: 50.8,
  h: 25.4,
  bytes: new Uint8Array(),
  preview: new Blob(),
  url: 'blob:test',
  format: 'png',
  dpi: 300,
  derived: false,
});

function Harness() {
  useGlobalShortcuts();
  const items = useDocument((s) => s.items);
  return (
    <div id="stage">
      <div id="sheets">
        <div className="page" data-sheet="1">
          <div className="sheet" tabIndex={-1}>
            {items.map((item) => (
              <div key={item.id} className="piece" data-id={item.id} tabIndex={0} />
            ))}
          </div>
        </div>
      </div>
      <input id="text" />
      <div id="props-panel">
        <button type="button" id="props-tab-piece">
          Pieza
        </button>
        <button type="button" id="props-tab-project">
          Proyecto
        </button>
      </div>
      <div id="live-polite" />
      <div id="live-assertive" />
      {/* Like the menus, it keeps every key it gets to itself. */}
      <div role="menu" onKeyDown={(e) => e.stopPropagation()}>
        <button type="button" id="menu-item" role="menuitem">
          Rotar
        </button>
      </div>
      <dialog id="dialog">
        <button type="button" id="dialog-button">
          Cerrar
        </button>
      </dialog>
    </div>
  );
}

const piece = () => document.querySelector<HTMLElement>('.piece')!;
const item = () => getDocument().items[0];

beforeEach(() => {
  setUnit('mm');
  setSingleKeys(true);
  setDocument({ sheets: [{ id: 1 }], items: [{ id: 1, asset: key, sheet: 1, x: 50, y: 50, scale: 100, r: 0, crop: null }], selection: [], margin: 10, busy: false });
  setView({ pinned: false, sheet: 1 });
  resetHistory();
  render(<Harness />);
  piece().focus();
});
afterEach(cleanup);

describe('keyboard shortcuts', () => {
  test('arrows on a piece select it and move it by the unit steps', () => {
    fireEvent.keyDown(piece(), { key: 'ArrowRight' });
    expect(getDocument().selection).toEqual([1]);
    expect(item().x).toBe(51);
    fireEvent.keyDown(piece(), { key: 'ArrowDown', shiftKey: true });
    expect(item().y).toBe(60);
    fireEvent.keyDown(piece(), { key: 'ArrowLeft', altKey: true });
    expect(item().x).toBe(50.9);
  });

  test('single keys act on the focused piece and can be turned off', () => {
    fireEvent.keyDown(piece(), { key: 'r' });
    expect(item().r).toBe(90);
    setSingleKeys(false);
    fireEvent.keyDown(piece(), { key: 'r' });
    expect(item().r).toBe(90);
    fireEvent.keyDown(piece(), { key: 'ArrowRight' });
    expect(item().x).not.toBe(50);
  });

  test('nothing single-key happens while typing; Ctrl+Z is the field’s there', () => {
    fireEvent.keyDown(piece(), { key: 'ArrowRight' });
    const text = document.getElementById('text')!;
    text.focus();
    fireEvent.keyDown(text, { key: 'r' });
    fireEvent.keyDown(text, { key: 'z', ctrlKey: true });
    expect(item()).toMatchObject({ r: 0, x: 51 });
  });

  test('Ctrl+Z undoes, Ctrl+Shift+Z redoes', () => {
    fireEvent.keyDown(piece(), { key: 'ArrowRight' });
    fireEvent.keyUp(piece(), { key: 'ArrowRight' });
    fireEvent.keyDown(piece(), { key: 'z', ctrlKey: true });
    expect(item().x).toBe(50);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(item().x).toBe(51);
  });

  test('Alt+Shift aligns by physical key, against the printable area with one piece', () => {
    fireEvent.keyDown(piece(), { key: 'Dead', code: 'ArrowLeft', altKey: true, shiftKey: true });
    expect(item().x).toBe(10);
    fireEvent.keyDown(piece(), { key: 'Ó', code: 'KeyV', altKey: true, shiftKey: true });
    // Centered is 135.8 mm; «Imán» (on, 1 mm grid) leaves the block on the grid.
    expect(item().y).toBe(136);
  });

  test('Escape on a piece clears the selection and focuses its sheet', () => {
    fireEvent.keyDown(piece(), { key: 'ArrowRight' });
    fireEvent.keyDown(piece(), { key: 'Escape' });
    expect(getDocument().selection).toEqual([]);
    expect(document.activeElement).toBe(document.querySelector('.sheet'));
  });
});

// ---------- Single keys on a piece and in the app ----------
// The image above is 50.8 × 25.4 mm; the sheet is A4 portrait (210 × 297 mm)
// with a 10 mm margin and a 5 mm gap.

/** What the polite live region says once the pending announcements went out. */
function heard() {
  act(() => vi.advanceTimersByTime(1000));
  return (document.getElementById('live-polite')!.textContent ?? '').replace(/ /g, ' ').trim();
}

const node = (id: number) => document.querySelector<HTMLElement>(`.piece[data-id="${id}"]`)!;
const find = (id: number) => getDocument().items.find((other) => other.id === id)!;
const ids = () => getDocument().items.map((other) => other.id);
const size = (id: number) => dims(find(id)).map((v) => Math.round(v * 1000) / 1000);

/** Pairs of pieces on the same sheet closer than `gap` mm (with 0, overlapping by more than touching). */
function closerThan(items: readonly Piece[], gap: number, eps = 0.011) {
  const bad: [number, number][] = [];
  items.forEach((a, i) =>
    items.slice(i + 1).forEach((b) => {
      const [aw, ah] = dims(a);
      const [bw, bh] = dims(b);
      const apart = b.x >= a.x + aw + gap - eps || a.x >= b.x + bw + gap - eps || b.y >= a.y + ah + gap - eps || a.y >= b.y + bh + gap - eps;
      if (a.sheet === b.sheet && !apart) bad.push([a.id, b.id]);
    })
  );
  return bad;
}

/** Starts again from these pieces (ids 1, 2…) of the image above, nothing selected, and focuses piece 1. */
function place(positions: readonly [number, number][]) {
  act(() => resetState({ items: positions.map(([x, y], i) => makePiece(i + 1, key, x, y)) }));
  node(1).focus();
}

/** Presses a key (down and up) on whatever has the focus. */
function press(k: string, init: Partial<KeyboardEventInit> = {}) {
  const target = document.activeElement ?? document.body;
  act(() => {
    fireEvent.keyDown(target, { key: k, ...init });
    fireEvent.keyUp(target, { key: k, ...init });
  });
}

describe('single keys', () => {
  beforeEach(() => {
    // The wide layout: no panel collapses.
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    vi.useFakeTimers();
  });
  afterEach(() => {
    act(() => vi.runAllTimers());
    vi.useRealTimers();
  });

  test('A arranges every piece without overlaps, the gap between them; the focus stays on the piece', () => {
    place([
      [10, 10],
      [20, 15],
      [30, 20],
    ]);
    expect(closerThan(getDocument().items, 0)).not.toEqual([]);
    press('a');
    expect(closerThan(getDocument().items, 5)).toEqual([]);
    expect(getView().flash).toBeNull();
    expect(heard()).toBe('Se acomodaron 3 piezas.');
    expect(document.activeElement).toBe(node(1));
  });

  test('− shrinks the selected piece 1 % from its center (Shift: 10 %), one undo step per press', () => {
    place([[50, 50]]);
    const depth = historyDepth().undo;
    press('-');
    expect(find(1).scale).toBe(99);
    expect(getDocument().selection).toEqual([1]);
    // From its center: 75.4, 62.7 before and after.
    const [w, h] = dims(find(1));
    expect(find(1).x + w / 2).toBeCloseTo(75.4, 6);
    expect(find(1).y + h / 2).toBeCloseTo(62.7, 6);
    press('_', { shiftKey: true });
    expect(find(1).scale).toBe(89);
    expect(historyDepth().undo).toBe(depth + 2);
    expect(document.activeElement).toBe(node(1));
  });

  test('R turns the piece 90° when it lands free, Shift+R turns it back; the focus stays on it', () => {
    place([[50, 50]]);
    press('r');
    expect(find(1).r).toBe(90);
    expect(size(1)).toEqual([25.4, 50.8]);
    press('R', { shiftKey: true });
    expect(find(1).r).toBe(0);
    expect(size(1)).toEqual([50.8, 25.4]);
    expect(document.activeElement).toBe(node(1));
  });

  test('R where the turned piece would cover another one: it doesn’t turn, and the notice says why and offers «Permitir superposición»', () => {
    // Turned around its center, piece 1 would reach y = 88.1 mm; piece 2 starts at y = 80 mm, right below.
    place([
      [50, 50],
      [50, 80],
    ]);
    const depth = historyDepth().undo;
    press('r');
    expect(find(1)).toMatchObject({ r: 0, x: 50, y: 50 });
    expect(getView().flash).toMatchObject({ text: 'No se puede rotar: las piezas se superpondrían', warn: true, action: { label: 'Permitir superposición' } });
    expect(historyDepth().undo).toBe(depth);
    expect(document.activeElement).toBe(node(1));
  });

  test('D adds a copy without overlapping anything; the copy is selected and takes the focus', () => {
    place([[50, 50]]);
    press('d');
    expect(ids()).toEqual([1, 2]);
    expect(getDocument().selection).toEqual([2]);
    expect(closerThan(getDocument().items, 0)).toEqual([]);
    expect(document.activeElement).toBe(node(2));
    expect(heard()).toBe('Se duplicó la pieza. Hay 2 piezas.');
  });

  test('Delete removes the piece; its neighbor on the sheet gets selected and the focus', () => {
    place([
      [10, 10],
      [100, 10],
    ]);
    press('Delete');
    expect(ids()).toEqual([2]);
    expect(getDocument().selection).toEqual([2]);
    expect(document.activeElement).toBe(node(2));
  });

  test('F fits the piece to the printable area (190 mm wide here) and centers it on the sheet', () => {
    place([[30, 40]]);
    press('f');
    expect(size(1)).toEqual([190, 95]);
    expect(find(1)).toMatchObject({ x: 10, y: 101 });
    expect(document.activeElement).toBe(node(1));
    expect(heard()).toBe('Ajustada a la hoja: 190 × 95 mm.');
  });

  test('C centers the piece on the sheet, keeping its size', () => {
    place([[30, 40]]);
    press('c');
    expect(size(1)).toEqual([50.8, 25.4]);
    expect(find(1).x).toBeCloseTo((210 - 50.8) / 2, 9);
    expect(find(1).y).toBeCloseTo((297 - 25.4) / 2, 9);
    expect(heard()).toBe('Centrada en la hoja.');
  });

  test('] on a piece that overlaps no other: nothing changes, no undo step, and it says there is no need', () => {
    place([
      [10, 10],
      [100, 10],
    ]);
    const depth = historyDepth().undo;
    press(']');
    expect(ids()).toEqual([1, 2]);
    expect(historyDepth().undo).toBe(depth);
    expect(heard()).toBe('La pieza no se superpone con otras: no hace falta traerla al frente.');
  });

  test('] on a piece under another one brings it to the front, in one undo step', () => {
    act(() => resetState({ items: [makePiece(1, key, 50, 50), makePiece(2, key, 60, 55)] }));
    act(() => setDocument({ allowOverlap: true }));
    node(1).focus();
    const depth = historyDepth().undo;
    press(']');
    expect(ids()).toEqual([2, 1]);
    expect(historyDepth().undo).toBe(depth + 1);
    expect(heard()).toBe('Se trajo la pieza al frente.');
  });

  test('G shows the grid and hides it again, and says so', () => {
    place([[50, 50]]);
    expect(getPrefs().grid.show).toBe(false);
    press('g');
    expect(getPrefs().grid.show).toBe(true);
    expect(heard()).toBe('Grilla visible, cada 1 mm.');
    press('g');
    expect(getPrefs().grid.show).toBe(false);
    expect(heard()).toBe('Grilla oculta.');
  });

  test('L turns the sheet landscape and back to portrait', () => {
    place([[50, 50]]);
    press('l');
    expect(getDocument().landscape).toBe(true);
    press('l');
    expect(getDocument().landscape).toBe(false);
  });

  test('H focuses the Proyecto tab; M the Pieza tab, selecting the focused piece; Esc from a tab goes back to the piece', () => {
    place([[50, 50]]);
    press('h');
    expect(getView().propsTab).toBe('project');
    expect(document.activeElement?.id).toBe('props-tab-project');
    expect(getDocument().selection).toEqual([]);
    node(1).focus();
    press('m');
    expect(getView().propsTab).toBe('piece');
    expect(document.activeElement?.id).toBe('props-tab-piece');
    expect(getDocument().selection).toEqual([1]);
    // On the tab they keep switching.
    press('h');
    expect(document.activeElement?.id).toBe('props-tab-project');
    press('m');
    expect(document.activeElement?.id).toBe('props-tab-piece');
    press('Escape');
    expect(document.activeElement).toBe(node(1));
    expect(getDocument().selection).toEqual([1]);
  });

  test('turned off, no single key does anything: A, −, +, R, D, F, C, ], G, L, H, M, I, ?', () => {
    act(() => resetState({ items: [makePiece(1, key, 10, 10), makePiece(2, key, 20, 15)], selection: [1] }));
    act(() => setSingleKeys(false));
    node(1).focus();
    const before = { doc: JSON.stringify(getDocument().items), grid: getPrefs().grid.show, tab: getView().propsTab, depth: historyDepth().undo };
    for (const k of ['a', '-', '+', 'r', 'd', 'f', 'c', ']', 'g', 'l', 'h', 'm', 'i', '?']) press(k);
    press('R', { shiftKey: true });
    expect(JSON.stringify(getDocument().items)).toBe(before.doc);
    expect(getDocument()).toMatchObject({ landscape: false, selection: [1] });
    expect(getPrefs().grid.show).toBe(before.grid);
    expect(getView().propsTab).toBe(before.tab);
    expect(historyDepth().undo).toBe(before.depth);
    expect(useDialogs.getState().open).toEqual({});
    expect(document.activeElement).toBe(node(1));
  });

  test('turned off, the arrows, Ctrl+Z, Alt+Shift aligning and Delete keep working', () => {
    place([
      [50, 50],
      [120, 50],
    ]);
    act(() => setSingleKeys(false));
    press('ArrowRight');
    expect(find(1).x).toBe(51);
    press('z', { ctrlKey: true });
    expect(find(1).x).toBe(50);
    press('ArrowLeft', { code: 'ArrowLeft', altKey: true, shiftKey: true });
    expect(find(1).x).toBe(10);
    press('Delete');
    expect(ids()).toEqual([2]);
  });
});

describe('aria-keyshortcuts', () => {
  function Buttons() {
    return (
      <>
        <Button id="arrange" shortcut="arrange">
          Acomodar
        </Button>
        <IconButton id="undo" shortcut="undo" label="Deshacer" icon={Undo2} />
      </>
    );
  }

  test('single-key shortcuts lose aria-keyshortcuts when turned off (the tooltip keeps the key); Ctrl ones keep it', () => {
    render(<Buttons />);
    const arrange = screen.getByRole('button', { name: 'Acomodar' });
    const undo = screen.getByRole('button', { name: 'Deshacer' });
    expect(arrange.getAttribute('aria-keyshortcuts')).toBe('A');
    expect(undo.getAttribute('aria-keyshortcuts')).toBe('Control+Z Meta+Z');
    act(() => setSingleKeys(false));
    expect(arrange.hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(arrange.getAttribute('data-kbd')).toBe('A');
    expect(undo.getAttribute('aria-keyshortcuts')).toBe('Control+Z Meta+Z');
  });
});

describe('saving and downloading', () => {
  beforeEach(() => {
    vi.mocked(exportPdf).mockClear();
    setView({ flash: null });
  });

  test('Ctrl+S never opens the browser’s «Save page»: changes save themselves, and a notice says so (no download)', () => {
    act(() => useProject.setState({ status: 'saved' }));
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => void piece().dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(exportPdf).not.toHaveBeenCalled();
    expect(getView().flash).toEqual({ text: 'Los cambios se guardan automáticamente', info: true });
  });

  test('Ctrl+S when this browser can’t save says that instead', () => {
    act(() => useProject.setState({ status: 'off' }));
    act(() => void fireEvent.keyDown(piece(), { key: 's', metaKey: true }));
    expect(getView().flash).toMatchObject({ text: expect.stringMatching(/^Este navegador no permite guardar proyectos/), warn: true });
  });

  test('Ctrl+E and Ctrl+Shift+S download the PDF', () => {
    fireEvent.keyDown(piece(), { key: 'e', ctrlKey: true });
    fireEvent.keyDown(piece(), { key: 'S', ctrlKey: true, shiftKey: true });
    expect(exportPdf).toHaveBeenCalledTimes(2);
  });
});

describe('the keys the browser would take', () => {
  /** Ctrl+P, Ctrl+E, Ctrl+Shift+S, Ctrl+S and Ctrl+O (⌘ on a Mac): print, download, the note on saving, Proyectos. */
  const KEYS = [{ key: 'p' }, { key: 'e' }, { key: 'S', shiftKey: true }, { key: 's' }, { key: 'o', metaKey: true }];

  /** Presses them on `target`; returns whether the browser was kept from each one. */
  function pressAll(target: Element) {
    return KEYS.map((init) => {
      const event = new KeyboardEvent('keydown', { ctrlKey: !init.metaKey, ...init, bubbles: true, cancelable: true });
      act(() => void target.dispatchEvent(event));
      return event.defaultPrevented;
    });
  }

  const nothingHappened = () => {
    expect(printPdf).not.toHaveBeenCalled();
    expect(exportPdf).not.toHaveBeenCalled();
    expect(openProjects).not.toHaveBeenCalled();
    expect(getView().flash).toBeNull();
  };

  beforeEach(() => {
    vi.mocked(printPdf).mockClear();
    vi.mocked(exportPdf).mockClear();
    vi.mocked(openProjects).mockClear();
    setView({ flash: null });
    act(() => useProject.setState({ status: 'saved' }));
  });

  test('with a dialog open they never reach the browser and do nothing, with the focus in it or left outside', () => {
    document.getElementById('dialog')!.setAttribute('open', '');
    expect(pressAll(document.getElementById('dialog-button')!)).toEqual([true, true, true, true, true]);
    expect(pressAll(piece())).toEqual([true, true, true, true, true]);
    nothingHappened();
  });

  test('in a menu, which keeps its keys, they never reach the browser and do nothing', () => {
    expect(pressAll(document.getElementById('menu-item')!)).toEqual([true, true, true, true, true]);
    nothingHappened();
  });

  test('with no dialog open they act once each', () => {
    expect(pressAll(piece())).toEqual([true, true, true, true, true]);
    expect(printPdf).toHaveBeenCalledTimes(1);
    expect(exportPdf).toHaveBeenCalledTimes(2);
    expect(getView().flash).toEqual({ text: 'Los cambios se guardan automáticamente', info: true });
    expect(openProjects).toHaveBeenCalledTimes(1);
  });

  test('Ctrl+D never reaches the browser (its bookmark): it duplicates on the canvas and does nothing while typing, in a dialog or in a menu; Ctrl+Shift+D stays the browser’s', () => {
    const pressD = (target: Element, init: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, ...init, bubbles: true, cancelable: true });
      act(() => void target.dispatchEvent(event));
      return event.defaultPrevented;
    };
    act(() => setDocument({ selection: [1] }));
    expect(pressD(document.getElementById('text')!)).toBe(true);
    expect(pressD(document.getElementById('menu-item')!)).toBe(true);
    document.getElementById('dialog')!.setAttribute('open', '');
    expect(pressD(document.getElementById('dialog-button')!)).toBe(true);
    expect(pressD(piece())).toBe(true);
    document.getElementById('dialog')!.removeAttribute('open');
    expect(pressD(piece(), { key: 'D', shiftKey: true })).toBe(false);
    expect(getDocument().items).toHaveLength(1);
    expect(pressD(piece())).toBe(true);
    expect(getDocument().items).toHaveLength(2);
  });
});
