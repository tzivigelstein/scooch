// @vitest-environment jsdom
// The route each way to an action reports to the usage tips: the top bar's
// buttons, the keyboard shortcuts (useGlobalShortcuts) and the commands run
// from a menu or the palette (state/commands.ts runCommand), with whether
// the menu showed a shortcut. The same action by its shortcut doesn't count
// and makes its tip known.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Topbar } from '../../src/components/topbar/Topbar.tsx';
import { TIPS_STORAGE } from '../../src/config.ts';
import { useGlobalShortcuts } from '../../src/hooks/useGlobalShortcuts.ts';
import { runCommand } from '../../src/state/commands.ts';
import { patchItems } from '../../src/state/document.ts';
import { commit } from '../../src/state/history.ts';
import { setSingleKeys } from '../../src/state/prefs.ts';
import { resetTips, useTips } from '../../src/state/tips.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

function Shortcuts() {
  useGlobalShortcuts();
  return null;
}

const due = () => useTips.getState().tip?.id ?? null;
const known = () => JSON.parse(localStorage.getItem(TIPS_STORAGE) ?? '{"known":[]}').known;
const undoButton = () => screen.getByRole('button', { name: 'Deshacer' });
const ctrlZ = () => act(() => void fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true }));

beforeEach(() => {
  localStorage.clear();
  resetState({ items: [piece(1, fakeImageMm(40, 30), 20, 20)] });
  // Six steps to undo.
  for (let x = 30; x <= 80; x += 10) {
    commit();
    patchItems(new Map([[1, { x }]]));
  }
  resetTips();
  render(
    <>
      <Topbar />
      <Shortcuts />
    </>
  );
});
afterEach(cleanup);

describe('routes reported to the usage tips', () => {
  test('the undo button, clicked three times, offers Ctrl+Z', () => {
    for (let i = 0; i < 3; i++) fireEvent.click(undoButton(), { detail: 1 });
    expect(due()).toBe('undoKey');
  });

  test('Ctrl+Z three times doesn’t count and makes the tip known: the button after it offers nothing', () => {
    for (let i = 0; i < 3; i++) ctrlZ();
    expect(due()).toBe(null);
    expect(known()).toEqual(['undoKey']);
    for (let i = 0; i < 3; i++) fireEvent.click(undoButton(), { detail: 1 });
    expect(due()).toBe(null);
  });

  test('a command from a menu counts with its route, also when the menu shows its shortcut', () => {
    for (let i = 0; i < 3; i++) act(() => runCommand('rotateRight', 'menu'));
    expect(due()).toBe(null);
    act(() => runCommand('rotateRight', 'menu'));
    expect(due()).toBe('rotateKey');
  });

  test('the same command from the palette doesn’t count toward its shortcut tip', () => {
    for (let i = 0; i < 6; i++) act(() => runCommand('rotateRight', 'palette'));
    expect(due()).toBe(null);
  });

  test('the palette tip counts a menu action only while the menu shows no shortcut for it', () => {
    for (let i = 0; i < 3; i++) act(() => runCommand('front', 'menu'));
    expect(due()).toBe(null);
    act(() => setSingleKeys(false));
    for (let i = 0; i < 3; i++) act(() => runCommand('front', 'menu'));
    expect(due()).toBe('palette');
  });
});
