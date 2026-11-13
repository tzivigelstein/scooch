// @vitest-environment jsdom
// Which tab of «Propiedades» shows (state/actions/panels.ts): tabFor picks it
// from the selection, and followSelection switches it when the selection
// changes, keeps the person's choice until then, never touches the history,
// keeps a field someone is typing in and announces the switch only when the
// keyboard caused it. (The tabs' keyboard and ARIA are in
// tests/components/Tabs.test.tsx; real clicks, focus and M / H in
// e2e/specs/panels-and-tabs.spec.ts.)
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { getDocument } from '../../src/state/document.ts';
import { historyDepth, undo } from '../../src/state/history.ts';
import { getView, setView } from '../../src/state/view.ts';
import { followSelection, showPropsTab, tabFor } from '../../src/state/actions/panels.ts';
import { select, selectAll, setSelection } from '../../src/state/actions/selection.ts';
import { setSheetLength } from '../../src/state/actions/sheets.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

let stop = () => {};

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

beforeEach(() => {
  vi.useFakeTimers();
  // The live regions, a field in each tab's panel and something else to focus.
  document.body.innerHTML = `
    <div id="live-polite"></div><div id="live-assertive"></div>
    <div id="props-piece"><input id="pos-x"></div>
    <div id="props-sheet"><input id="gap"></div>
    <button id="elsewhere"></button>`;
  const key = fakeImage();
  resetState({ items: [piece(1, key, 10, 10), piece(2, key, 80, 10), piece(3, key, 10, 80)] });
  stop = followSelection();
});

afterEach(() => {
  stop();
  vi.runAllTimers();
  vi.useRealTimers();
});

const tab = () => getView().propsTab;
const byPointer = () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
const byKeyboard = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
const focus = (id: string) => document.getElementById(id)!.focus();

/** What the polite live region says once the delayed announcements are out (then it is cleared). */
function heard() {
  vi.advanceTimersByTime(1000);
  const region = document.getElementById('live-polite')!;
  const text = (region.textContent ?? '').replace(/\s/g, ' ').trim();
  region.textContent = '';
  return text;
}

describe('tabFor', () => {
  test('nothing selected: Hoja; one piece or several: Pieza', () => {
    expect(tabFor([])).toBe('sheet');
    expect(tabFor([2])).toBe('piece');
    expect(tabFor([1, 2, 3])).toBe('piece');
  });
});

describe('the tab follows the selection', () => {
  test('when it starts: Hoja with nothing selected, Pieza with a selection', () => {
    stop();
    setView({ propsTab: 'piece' });
    stop = followSelection();
    expect(tab()).toBe('sheet');
    stop();
    setSelection([2]);
    setView({ propsTab: 'sheet' });
    stop = followSelection();
    expect(tab()).toBe('piece');
  });

  test('selecting a piece with the pointer opens Pieza, leaves the focus where it was and says nothing', () => {
    focus('elsewhere');
    byPointer();
    select(1);
    expect(tab()).toBe('piece');
    expect(document.activeElement?.id).toBe('elsewhere');
    expect(heard()).toBe('');
  });

  test('choosing Hoja with a piece selected sticks through an edit, its undo and selecting the same piece again', () => {
    select(1);
    showPropsTab('sheet');
    setSheetLength('margin', 12, { final: true });
    expect(getDocument().margin).toBe(12);
    undo();
    expect(getDocument().margin).toBe(10);
    expect(getDocument().selection).toEqual([1]);
    expect(tab()).toBe('sheet');
    select(1);
    setSelection([1]);
    expect(tab()).toBe('sheet');
  });

  test('selecting another piece switches to Pieza', () => {
    select(1);
    showPropsTab('sheet');
    select(2);
    expect(tab()).toBe('piece');
  });

  test('clearing the selection opens Hoja', () => {
    select(1);
    expect(tab()).toBe('piece');
    select(null);
    expect(tab()).toBe('sheet');
  });

  test('Ctrl+A (selectAll) selects the three pieces and opens Pieza', () => {
    selectAll();
    expect([...getDocument().selection].sort()).toEqual([1, 2, 3]);
    expect(tab()).toBe('piece');
  });

  test('switching tabs adds nothing to the history (undo and redo stay as they were)', () => {
    select(1);
    setSheetLength('margin', 12, { final: true });
    setSheetLength('margin', 14, { final: true });
    undo();
    const depth = historyDepth();
    expect(depth).toEqual({ undo: 1, redo: 1 });
    const items = getDocument().items;
    showPropsTab('sheet');
    showPropsTab('piece');
    showPropsTab('sheet');
    expect(historyDepth()).toEqual(depth);
    expect(getDocument().items).toBe(items);
    expect(getDocument().margin).toBe(12);
  });

  test('a switch caused by the keyboard is announced; one caused by the pointer is not', () => {
    byKeyboard();
    select(1);
    expect(heard()).toBe('Propiedades muestra la pieza.');
    byKeyboard();
    select(null);
    expect(heard()).toBe('Propiedades muestra la hoja.');
    byPointer();
    select(2);
    expect(tab()).toBe('piece');
    expect(heard()).toBe('');
  });

  test('typing in a field of the tab showing keeps that tab when the selection changes', () => {
    focus('gap');
    byKeyboard();
    select(1);
    expect(tab()).toBe('sheet');
    expect(heard()).toBe('');
    // Once the field is left, the next change switches again.
    focus('elsewhere');
    select(2);
    expect(tab()).toBe('piece');
    // The same from Pieza: a field there keeps Pieza when the selection clears.
    focus('pos-x');
    select(null);
    expect(tab()).toBe('piece');
  });

  test('once stopped, the tab no longer follows', () => {
    stop();
    select(1);
    expect(tab()).toBe('sheet');
  });
});
