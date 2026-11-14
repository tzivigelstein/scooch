// @vitest-environment jsdom
// The usage tip in the notice area (src/components/feedback/UsageTip.tsx):
// its name and buttons, announced politely without taking the focus; it waits
// for the notice pill and gives way to it; it hides on its own unless hovered
// or focused; «No volver a mostrar», its close button and Esc.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NoticePill } from '../../src/components/feedback/NoticePill.tsx';
import { TIP_MS, UsageTip } from '../../src/components/feedback/UsageTip.tsx';
import { setDocument } from '../../src/state/document.ts';
import { gestureStore } from '../../src/state/gesture.ts';
import { resetTips, used, useTips } from '../../src/state/tips.ts';
import { setView } from '../../src/state/view.ts';
import { fakeImageMm, heard, listen, piece, resetState } from '../support/state.ts';

const box = () => document.getElementById('usage-tip')!;
const shown = () => !box().hidden;
/** The undo button three times: its tip is due. */
const undoThrice = () => act(() => [1, 2, 3].forEach(() => used('undo', 'pointer')));

beforeEach(() => {
  localStorage.clear();
  listen();
  resetState({ items: [piece(1, fakeImageMm(40, 30), 20, 20)] });
  resetTips();
  render(
    <>
      <button type="button">Antes</button>
      <div id="sheets">
        <div className="page" data-sheet="1">
          <div className="sheet" tabIndex={-1} />
        </div>
      </div>
      <NoticePill />
      <UsageTip />
    </>
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('usage tip', () => {
  test('a named group with its text and buttons, announced politely, and the focus stays where it was', () => {
    const before = screen.getByRole('button', { name: 'Antes' });
    before.focus();
    expect(shown()).toBe(false);
    undoThrice();
    expect(shown()).toBe(true);
    const group = screen.getByRole('group', { name: 'Consejo' });
    expect(group.querySelector('#usage-tip-text')!.textContent).toBe('También puedes deshacer con Ctrl+Z');
    expect(screen.getByRole('button', { name: 'No volver a mostrar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar consejo' })).toBeTruthy();
    expect(document.activeElement).toBe(before);
    expect(heard()).toBe('También puedes deshacer con Ctrl+Z.');
    expect(document.getElementById('live-assertive')!.textContent).toBe('');
  });

  test('it looks different from a result notice: no pill tone, its own box', () => {
    undoThrice();
    expect(document.getElementById('pill')!.hidden).toBe(true);
    expect(box().className).toBe('usage-tip');
  });

  test('while a result notice shows, it waits; when the notice goes, it shows', () => {
    act(() => setView({ flash: { text: 'Se quitaron 3 piezas', action: { label: 'Deshacer', run: () => {} } } }));
    undoThrice();
    expect(useTips.getState().tip).toMatchObject({ id: 'undoKey', shown: false });
    expect(shown()).toBe(false);
    act(() => setView({ flash: null }));
    expect(shown()).toBe(true);
  });

  test('a notice, a drag or crop mode coming while it shows closes it for good', () => {
    undoThrice();
    act(() => setView({ flash: { text: 'Se descargó tarjetas.pdf' } }));
    expect(shown()).toBe(false);
    expect(useTips.getState().tip).toBe(null);
    act(() => setView({ flash: null }));
    expect(shown()).toBe(false);
    for (const start of [() => gestureStore.setState({ dragging: true }), () => setView({ cropping: 1 })]) {
      resetTips();
      undoThrice();
      expect(shown()).toBe(true);
      act(start);
      expect(shown()).toBe(false);
      act(() => (gestureStore.setState({ dragging: false }), setView({ cropping: null })));
    }
  });

  test('it hides on its own after 15 s, but not while hovered or focused', () => {
    undoThrice();
    act(() => vi.advanceTimersByTime(TIP_MS - 100));
    expect(shown()).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    expect(shown()).toBe(false);

    resetTips();
    undoThrice();
    fireEvent.pointerEnter(box());
    act(() => vi.advanceTimersByTime(60_000));
    expect(shown()).toBe(true);
    fireEvent.pointerLeave(box());
    act(() => screen.getByRole('button', { name: 'No volver a mostrar' }).focus());
    act(() => vi.advanceTimersByTime(60_000));
    expect(shown()).toBe(true);
  });

  test('«No volver a mostrar» closes it and dismisses its topic; the focus goes back to the sheet', () => {
    undoThrice();
    const never = screen.getByRole('button', { name: 'No volver a mostrar' });
    never.focus();
    act(() => fireEvent.click(never));
    expect(shown()).toBe(false);
    expect(useTips.getState().dismissed).toEqual(['undoKey']);
    expect(document.activeElement).toBe(document.querySelector('#sheets .sheet'));
  });

  test('the close button and Esc close it without dismissing it', () => {
    undoThrice();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Cerrar consejo' })));
    expect(shown()).toBe(false);
    act(() => useTips.setState({ tip: { id: 'redoKey', topic: 'redoKey', text: 'Otro consejo', action: null, shown: false } }));
    expect(shown()).toBe(true);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cerrar consejo' }), { key: 'Escape' });
    expect(shown()).toBe(false);
    expect(useTips.getState().dismissed).toEqual([]);
  });

  test('its action button closes it and does what it says', () => {
    const run = vi.fn();
    act(() => useTips.setState({ tip: { id: 'sameFile', topic: 'sameFile', text: 'Un consejo', action: { label: 'Ir a Duplicar', run }, shown: false } }));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Ir a Duplicar' })));
    expect(run).toHaveBeenCalledOnce();
    expect(shown()).toBe(false);
  });

  test('while a current problem shows in the notice, it waits; once the problem is solved, it shows', () => {
    act(() => setDocument({ margin: 50 }));
    expect(document.getElementById('pill')!.hidden).toBe(false);
    undoThrice();
    expect(shown()).toBe(false);
    act(() => setDocument({ margin: 10 }));
    expect(shown()).toBe(true);
  });
});
