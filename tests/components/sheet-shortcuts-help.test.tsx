// @vitest-environment jsdom
// The shortcuts dialog documents the keys that go from sheet to sheet: Re Pág /
// Av Pág, and with Shift to move the piece to the previous or next sheet.
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import ShortcutsDialog from '../../src/components/dialogs/ShortcutsDialog.tsx';
import { resetState } from '../support/state.ts';

beforeEach(() => {
  resetState();
  render(<ShortcutsDialog />);
});
afterEach(cleanup);

/** The dialog's rows as [action, keys] texts. */
const rows = () =>
  [...document.querySelectorAll<HTMLTableRowElement>('#shortcuts-rows tr')].map((tr) => [...tr.cells].map((cell) => (cell.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ').trim()));

test('the sheet keys are documented: Re Pág or Av Pág to go to another sheet; with Shift, to move the piece there', () => {
  expect(rows()).toContainEqual(['En las hojas, ir a la hoja anterior o a la siguiente', 'Re Pág o Av Pág']);
  expect(rows()).toContainEqual(['Mover la pieza a la hoja anterior o a la siguiente (si no hay lugar, a una hoja nueva)', 'Shift+Re Pág o Shift+Av Pág']);
  // Neither is a single-key shortcut (they work with «Atajos de 1 tecla» off).
  const marked = [...document.querySelectorAll('#shortcuts-rows tr[data-single]')].map((tr) => tr.textContent ?? '');
  expect(marked.some((text) => /Pág/.test(text))).toBe(false);
});
