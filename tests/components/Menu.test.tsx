// @vitest-environment jsdom
// The menu primitive (ui/Menu.tsx) as the piece's context menu
// (canvas/ContextMenu.tsx) uses it, on the real stores: the arrows, Home and
// End, typing to jump, a disabled item that stays reachable and says why, and
// an item that acts in one undo step. (Where the menu opens — at the pointer,
// next to the focus, by a long press — and the focus going back are in
// e2e/specs/context-menus.spec.ts.)
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import ContextMenu from '../../src/components/canvas/ContextMenu.tsx';
import { useContextMenu } from '../../src/components/canvas/contextMenu.ts';
import { getDocument } from '../../src/state/document.ts';
import { historyDepth, undo } from '../../src/state/history.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

const PASTE_REASON = 'Primero copia piezas. Para pegar una imagen copiada en otra app, usa Ctrl+V.';

let clock = 0;

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

beforeEach(() => {
  // Typing to jump keeps the letters typed within 600 ms: the test sets the time.
  clock = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  document.body.innerHTML = '<div id="live-polite"></div><div id="live-assertive"></div>';
  const key = fakeImage({ px: [600, 400] });
  resetState({ items: [piece(1, key, 10, 10), piece(2, key, 80, 10), piece(3, key, 10, 80), piece(4, key, 80, 80)], selection: [2] });
  useContextMenu.setState({ request: { kind: 'piece', sheet: 1, x: 20, y: 30, returnTo: null } });
  render(<ContextMenu />);
});

afterEach(() => {
  cleanup();
  act(() => useContextMenu.setState({ request: null }));
  vi.restoreAllMocks();
});

const focused = () => document.activeElement?.id.replace('context-menu-', '');
const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });
const live = () => (document.getElementById('live-polite')!.textContent ?? '').replace(/\s/g, ' ');

describe('the piece’s context menu', () => {
  test('a menu named «Acciones de la pieza» with the focus on its first item', () => {
    expect(screen.getByRole('menu', { name: 'Acciones de la pieza' })).toBeTruthy();
    expect(focused()).toBe('rotate-left');
  });

  test('the arrows move through the items and wrap; Home and End go to the ends', () => {
    press('ArrowDown');
    press('ArrowDown');
    expect(focused()).toBe('duplicate');
    press('ArrowUp');
    expect(focused()).toBe('rotate-right');
    press('Home');
    press('ArrowUp');
    expect(focused()).toBe('remove');
    press('ArrowDown');
    expect(focused()).toBe('rotate-left');
    press('End');
    expect(focused()).toBe('remove');
  });

  test('typing jumps to the next item that starts with it; letters typed together make a word', () => {
    press('s');
    expect(focused()).toBe('same');
    clock += 1000;
    press('c');
    expect(focused()).toBe('copy');
    clock += 1000;
    press('c');
    expect(focused()).toBe('cut');
    // «re»: from «Cortar», the next one starting with it is «Recortar».
    clock += 1000;
    press('r');
    clock += 100;
    press('e');
    expect(focused()).toBe('crop');
    // Nothing starts with «x»: the focus stays.
    clock += 1000;
    press('x');
    expect(focused()).toBe('crop');
  });

  test('a disabled item stays reachable and says why', () => {
    for (let i = 0; i < 5; i++) press('ArrowDown');
    expect(focused()).toBe('paste');
    const paste = document.activeElement!;
    expect(paste.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(paste.getAttribute('aria-describedby')!)!.textContent).toBe(PASTE_REASON);
    // An enabled item has neither.
    expect(document.getElementById('context-menu-duplicate')!.hasAttribute('aria-disabled')).toBe(false);
    expect(document.getElementById('context-menu-duplicate')!.hasAttribute('aria-describedby')).toBe(false);
  });

  test('choosing a disabled item announces the reason, changes nothing and leaves the menu open', async () => {
    const before = getDocument().items;
    for (let i = 0; i < 5; i++) press('ArrowDown');
    vi.useFakeTimers();
    press('Enter');
    vi.advanceTimersByTime(100);
    vi.useRealTimers();
    expect(live()).toMatch(/^Primero copia piezas\./);
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(useContextMenu.getState().request).not.toBeNull();
    expect(getDocument().items).toBe(before);
  });

  test('«Duplicar» closes the menu and adds one copy, selected, that one undo takes away', () => {
    const before = getDocument().items;
    const depth = historyDepth().undo;
    fireEvent.click(screen.getByRole('menuitem', { name: /^Duplicar/ }));
    expect(useContextMenu.getState().request).toBeNull();
    const after = getDocument().items;
    expect(after).toHaveLength(5);
    const copy = after.find((item) => !before.some((b) => b.id === item.id))!;
    expect(copy.asset).toBe(before[1].asset);
    expect(getDocument().selection).toEqual([copy.id]);
    expect(historyDepth().undo).toBe(depth + 1);
    undo();
    expect(getDocument().items).toEqual(before);
  });
});
