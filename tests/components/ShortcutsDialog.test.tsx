// @vitest-environment jsdom
// The shortcuts dialog's content: a table per section (the commands'
// sections) with each action and its keys, the single-key ones marked, the
// keys as this device names them, the search field that filters the rows, and
// the note whose link opens «Preferencias» and hands it the focus to give
// back. The steps in other units are in unit-preference.test.tsx; the row for
// I in duplicate-and-select-same.test.tsx; the rows themselves come from
// src/state/commands.ts (tests/state/commands.test.ts).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ShortcutsDialog from '../../src/components/dialogs/ShortcutsDialog.tsx';
import { useDialogs } from '../../src/components/dialogs/dialogs.ts';
import { SHORTCUTS } from '../../src/hooks/shortcuts.ts';
import { COMMAND_IDS, command } from '../../src/state/commands.ts';
import { resetState } from '../support/state.ts';
import { keyLabel } from '../../src/copy/index.ts';

const plain = (s: string | null | undefined) => String(s ?? '').replace(/[  ]/g, ' ').trim();

/** Each body row as [action, keys] (the «Desactivado» badge left out of the action). */
const rows = () =>
  [...document.querySelectorAll<HTMLTableRowElement>('#shortcuts-rows tbody tr')].map((tr) => [plain(tr.cells[0].firstChild?.textContent), plain(tr.cells[1].textContent)]);
/** The row of an action (its header's text, without the badge). */
const rowOf = (action: string) => [...document.querySelectorAll<HTMLTableRowElement>('#shortcuts-rows tr')].find((tr) => tr.cells[0].firstChild?.textContent === action)!;
const tables = () => screen.queryAllByRole('table');
const tableName = (table: HTMLElement) => plain(document.getElementById(table.getAttribute('aria-labelledby')!)?.textContent);
const search = (text: string) => fireEvent.change(screen.getByRole('textbox', { name: 'Buscar atajos' }), { target: { value: text } });

beforeEach(() => {
  resetState();
  act(() => useDialogs.setState({ open: { shortcuts: { returnTo: null } } }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  act(() => useDialogs.setState({ open: {} }));
  document.body.innerHTML = '';
});

describe('the shortcuts, by section', () => {
  test('a table per section, named by its heading, in order; Preferences has no keys, so no table', () => {
    render(<ShortcutsDialog />);
    expect(screen.getByRole('heading', { level: 2, name: 'Atajos de teclado' })).toBeTruthy();
    expect(tables().map(tableName)).toEqual(['General', 'Proyectos', 'Selección', 'Hojas', 'Vista']);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['General', 'Proyectos', 'Selección', 'Hojas', 'Vista']);
  });

  test('each row is the action, as the row’s header, then its keys, each in a <kbd>: two joined by «o», more side by side', () => {
    render(<ShortcutsDialog />);
    const table = rows();
    const keysOf = (action: string) => table.filter(([a]) => a === action).map(([, keys]) => keys);
    expect(keysOf('Descargar PDF')).toEqual(['Ctrl+E o Ctrl+Shift+S']);
    expect(keysOf('Rehacer')).toEqual(['Ctrl+Shift+Z o Ctrl+Y']);
    expect(keysOf('Quitar de la hoja')).toEqual(['Supr o Retroceso']);
    expect(keysOf('Mover la pieza 1 mm (Shift: 10 mm; Alt: 0,1 mm). Si choca con otra, salta al otro lado.')).toEqual(['← ↑ → ↓']);
    expect(keysOf('En las hojas, ir a la hoja anterior o a la siguiente')).toEqual(['Re Pág o Av Pág']);
    expect(keysOf('Ver los atajos de teclado')).toEqual(['?']);
    expect(keysOf('Buscar acciones')).toEqual(['Ctrl+K']);
    // A command with Ctrl and single-key keys: a row for each kind.
    expect(keysOf('Duplicar')).toEqual(['Ctrl+D', 'D']);
    const download = [...document.querySelectorAll('#shortcuts-rows tr')].find((tr) => /Descargar PDF/.test(tr.textContent ?? ''))!;
    expect(download.querySelector('th')?.getAttribute('scope')).toBe('row');
    expect([...download.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['Ctrl+E', 'Ctrl+Shift+S']);
    // A page the browser translates leaves the keys as the keyboard has them.
    expect([...download.querySelectorAll('kbd')].map((k) => k.getAttribute('translate'))).toEqual(['no', 'no']);
  });

  test('every command with keys has its row, by its name, and every key of the shortcut table shows', () => {
    render(<ShortcutsDialog />);
    const actions = rows().map(([action]) => action);
    for (const id of COMMAND_IDS) if (command(id).keys.length) expect(actions, id).toContain(command(id).label);
    const shown = new Set([...document.querySelectorAll('#shortcuts-rows kbd')].map((k) => k.textContent));
    for (const [name, keys] of Object.entries(SHORTCUTS) as [string, { kbd?: string }][]) if (keys.kbd) expect(shown, name).toContain(keyLabel(keys.kbd));
  });

  test('the single-key rows, and only those, are marked and carry the «Desactivado» badge (shown while they are off)', () => {
    render(<ShortcutsDialog />);
    const marked = [...document.querySelectorAll<HTMLTableRowElement>('#shortcuts-rows tr')].filter((tr) => tr.hasAttribute('data-single'));
    expect(marked.map((tr) => plain(tr.cells[1].textContent)).sort()).toEqual(['+ o −', '?', 'A', 'C', 'D', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'O', 'P', 'R', 'Shift+1', 'Shift+2', 'Shift+R', ']'].sort());
    expect(marked.every((tr) => tr.querySelector('.off-badge')?.textContent === 'Desactivado')).toBe(true);
    expect(document.querySelectorAll('#shortcuts-rows .off-badge')).toHaveLength(marked.length);
  });

  test('on a Mac, Apple’s symbols, each said by its name; elsewhere, Ctrl and Shift', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    render(<ShortcutsDialog />);
    const download = [...document.querySelectorAll('#shortcuts-rows tr')].find((tr) => /Descargar PDF/.test(tr.textContent ?? ''))!;
    const [e, s] = download.querySelectorAll('kbd');
    expect(e.querySelector('[aria-hidden="true"]')?.textContent).toBe('⌘E');
    expect(e.querySelector('.sr-only')?.textContent).toBe('Comando+E');
    expect(s.querySelector('[aria-hidden="true"]')?.textContent).toBe('⇧⌘S');
    expect(s.querySelector('.sr-only')?.textContent).toBe('Shift+Comando+S');
    const align = rowOf('Alinear a la izquierda');
    expect(align.querySelector('.sr-only')?.textContent).toBe('Opción+Shift+←');
    // A key without a symbol stays as it is, with nothing extra.
    const help = rowOf('Ver los atajos de teclado');
    expect(help.querySelector('kbd')?.innerHTML).toBe('?');
  });
});

describe('searching', () => {
  test('a field named «Buscar atajos» that controls the rows', () => {
    render(<ShortcutsDialog />);
    const field = screen.getByRole('textbox', { name: 'Buscar atajos' });
    expect(field.getAttribute('aria-controls')).toBe('shortcuts-rows');
    expect(field.getAttribute('placeholder')).toBe('Buscar atajos');
  });

  test('typing filters the rows by name, by other words and by keys; a section with none left goes', () => {
    render(<ShortcutsDialog />);
    search('girar');
    expect(rows()).toEqual([
      ['Rotar a la izquierda', 'Shift+R'],
      ['Rotar a la derecha', 'R'],
      ['Cambiar la orientación de la hoja', 'L'],
    ]);
    expect(tables().map(tableName)).toEqual(['Selección', 'Hojas']);
    search('retroceso');
    expect(rows()).toEqual([['Quitar de la hoja', 'Supr o Retroceso']]);
    search('ctrl+z');
    expect(rows()).toEqual([['Deshacer', 'Ctrl+Z']]);
    search('');
    expect(tables()).toHaveLength(5);
  });

  test('nothing found: no table, and one line says so with what was typed', () => {
    render(<ShortcutsDialog />);
    expect(plain(document.getElementById('shortcuts-empty')?.textContent)).toBe('');
    search(' xyzzy ');
    expect(tables()).toHaveLength(0);
    const empty = document.getElementById('shortcuts-empty')!;
    expect(plain(empty.textContent)).toBe('No hay atajos que coincidan con «xyzzy»');
    expect(empty.getAttribute('role')).toBe('status');
  });
});

describe('the note and its link to Preferences', () => {
  test('the note is one sentence with the link: «Los atajos de 1 tecla se activan en Preferencias»', () => {
    render(<ShortcutsDialog />);
    const note = document.getElementById('shortcuts-note')!;
    expect(plain(note.textContent)).toBe('Los atajos de 1 tecla se activan en Preferencias');
    const link = within(note).getByRole('button', { name: 'Preferencias' });
    expect(link.id).toBe('shortcuts-prefs');
    expect(link.getAttribute('aria-haspopup')).toBe('dialog');
    expect(note.querySelectorAll('button')).toHaveLength(1);
  });

  test('the link closes the shortcuts and opens Preferences, which will give the focus back to whoever opened the shortcuts', async () => {
    const piece = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'piece', tabIndex: 0 }));
    act(() => useDialogs.setState({ open: { shortcuts: { returnTo: piece } } }));
    render(<ShortcutsDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Preferencias' }));
    await waitFor(() => expect(useDialogs.getState().open.prefs).toBeDefined());
    expect(useDialogs.getState().open).toEqual({ prefs: { returnTo: piece } });
  });

  test('opened from nowhere in particular, Preferences gives the focus back to the shortcuts button', async () => {
    const help = document.body.appendChild(Object.assign(document.createElement('button'), { id: 'help' }));
    act(() => useDialogs.setState({ open: { shortcuts: { returnTo: document.body } } }));
    render(<ShortcutsDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Preferencias' }));
    await waitFor(() => expect(useDialogs.getState().open.prefs).toBeDefined());
    expect(useDialogs.getState().open).toEqual({ prefs: { returnTo: help } });
  });
});
