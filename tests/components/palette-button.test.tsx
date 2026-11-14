// @vitest-environment jsdom
// The way into the command palette in the top bar: a button named «Buscar
// acciones» that opens a dialog, with Ctrl+K in sight (for the eyes only: the
// name stays the name, and the keys go in aria-keyshortcuts).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Topbar } from '../../src/components/topbar/Topbar.tsx';
import { openPalette } from '../../src/state/actions/dialogs.ts';
import { resetState } from '../support/state.ts';

vi.mock('../../src/state/actions/dialogs.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/state/actions/dialogs.ts')>()),
  openPalette: vi.fn(),
}));

beforeEach(() => {
  resetState();
  render(<Topbar />);
});
afterEach(cleanup);

test('«Buscar acciones» shows Ctrl+K, hidden from screen readers, announces it as its shortcut and opens the palette', () => {
  const button = screen.getByRole('button', { name: 'Buscar acciones' });
  expect(button.getAttribute('aria-haspopup')).toBe('dialog');
  expect(button.getAttribute('aria-keyshortcuts')).toBe('Control+K Meta+K');
  const keys = button.querySelector('kbd')!;
  expect(keys.textContent).toBe('Ctrl+K');
  expect(keys.getAttribute('aria-hidden')).toBe('true');
  expect(button.dataset.tip).toBe('Buscar acciones');
  fireEvent.click(button);
  expect(openPalette).toHaveBeenCalledTimes(1);
});
