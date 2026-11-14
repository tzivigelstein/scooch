// @vitest-environment jsdom
// The command palette's content: the combobox and its listbox (ARIA 1.2), the
// recent commands first and every command by section with nothing typed, the
// search with what it matched marked, the keys that move through the list,
// running a command (or not, saying why), and the second step of a command
// that needs a value. What each command does is in tests/state/commands.test.ts;
// Mod+K in tests/hooks/useGlobalShortcuts.test.tsx; the real dialog, focus and
// touch in e2e/specs/command-palette.spec.ts.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import CommandPalette from '../../src/components/palette/CommandPalette.tsx';
import { recentCommands } from '../../src/components/palette/recents.ts';
import { useDialogs } from '../../src/components/dialogs/dialogs.ts';
import { PALETTE_STORAGE } from '../../src/config.ts';
import { COMMAND_IDS } from '../../src/state/commands.ts';
import { getDocument } from '../../src/state/document.ts';
import { setSingleKeys } from '../../src/state/prefs.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

const plain = (s: string | null | undefined) => String(s ?? '').replace(/[  ]/g, ' ').trim();
const field = () => screen.getByRole('combobox');
const options = () => screen.queryAllByRole('option');
/** Each option's label (its name, without the reason it can't run). */
const names = () => options().map((o) => plain(o.querySelector('.palette-label')?.textContent));
const active = () => document.getElementById(field().getAttribute('aria-activedescendant') ?? '');
const activeName = () => plain(active()?.querySelector('.palette-label')?.textContent);
const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(field(), { key, ...init });
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
  // jsdom doesn't lay out: keeping the active option in view does nothing here.
  Element.prototype.scrollIntoView ??= () => {};
});
beforeEach(() => {
  localStorage.clear();
  resetState();
  act(() => useDialogs.setState({ open: { palette: { returnTo: null } } }));
});
afterEach(() => {
  cleanup();
  act(() => useDialogs.setState({ open: {} }));
  document.body.innerHTML = '';
});

describe('the combobox and its listbox', () => {
  test('a field named «Buscar acciones» that controls the listbox, expanded, pointing at the active option', () => {
    render(<CommandPalette />);
    const input = field();
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('aria-labelledby')).toBe('palette-title');
    expect(plain(document.getElementById('palette-title')?.textContent)).toBe('Buscar acciones');
    expect(input.getAttribute('placeholder')).toBe('Busca una acción');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    const list = screen.getByRole('listbox');
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(active()).toBe(options()[0]);
    expect(active()?.getAttribute('aria-selected')).toBe('true');
    expect(options().filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  test('with nothing typed, every command once, by section, each section a group named by its heading', () => {
    render(<CommandPalette />);
    const groups = within(screen.getByRole('listbox')).getAllByRole('group');
    expect(groups.map((g) => plain(document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent))).toEqual(['General', 'Proyectos', 'Selección', 'Hojas', 'Vista', 'Preferencias']);
    expect(options()).toHaveLength(COMMAND_IDS.length);
    expect(new Set(names()).size).toBe(COMMAND_IDS.length);
    expect(names().slice(0, 3)).toEqual(['Agregar imágenes o PDF', 'Acomodar las piezas sin superponerlas', 'Deshacer']);
  });

  test('the recent commands come first, the newest first, and aren’t repeated in their sections; an id no longer known is left out', () => {
    localStorage.setItem(PALETTE_STORAGE, JSON.stringify({ v: 1, ids: ['paper', 'gone', 'undo'] }));
    render(<CommandPalette />);
    const [recent] = within(screen.getByRole('listbox')).getAllByRole('group');
    expect(plain(document.getElementById(recent.getAttribute('aria-labelledby')!)?.textContent)).toBe('Recientes');
    expect(within(recent).getAllByRole('option').map((o) => plain(o.querySelector('.palette-label')?.textContent))).toEqual(['Cambiar el papel', 'Deshacer']);
    expect(options()).toHaveLength(COMMAND_IDS.length);
    expect(names().filter((n) => n === 'Deshacer')).toHaveLength(1);
  });
});

describe('searching', () => {
  test('typing filters the list, best first, with the matched part of each name marked', () => {
    render(<CommandPalette />);
    type('rotar');
    expect(names().slice(0, 2)).toEqual(['Rotar a la derecha', 'Rotar a la izquierda']);
    expect([...options()[0].querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Rotar']);
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(active()).toBe(options()[0]);
  });

  test('another word for a command finds it: «girar» finds the rotations, «oscuro» the dark theme', () => {
    render(<CommandPalette />);
    type('girar');
    expect(names()).toEqual(expect.arrayContaining(['Rotar a la izquierda', 'Rotar a la derecha']));
    type('oscuro');
    expect(names()[0]).toBe('Usar el tema oscuro');
  });

  test('nothing found: the listbox hides, the field says it is collapsed, and one line says so with what was typed', () => {
    render(<CommandPalette />);
    type('  xyzzy ');
    expect(options()).toHaveLength(0);
    expect(document.getElementById('palette-list')!.hidden).toBe(true);
    expect(field().getAttribute('aria-expanded')).toBe('false');
    expect(field().hasAttribute('aria-activedescendant')).toBe(false);
    expect(plain(document.getElementById('palette-empty')?.textContent)).toBe('No hay acciones que coincidan con «xyzzy»');
    expect(document.getElementById('palette-empty')?.getAttribute('role')).toBe('status');
  });
});

describe('moving through the list', () => {
  test('↓ and ↑ move one (wrapping at the ends), Home and End to the first and last, Page Down and Page Up by 8', () => {
    render(<CommandPalette />);
    const all = names();
    press('ArrowDown');
    expect(activeName()).toBe(all[1]);
    press('ArrowUp');
    press('ArrowUp');
    expect(activeName()).toBe(all.at(-1));
    press('ArrowDown');
    expect(activeName()).toBe(all[0]);
    press('End');
    expect(activeName()).toBe(all.at(-1));
    press('Home');
    expect(activeName()).toBe(all[0]);
    press('PageDown');
    expect(activeName()).toBe(all[8]);
    press('PageDown');
    expect(activeName()).toBe(all[16]);
    press('PageUp');
    expect(activeName()).toBe(all[8]);
    press('PageUp');
    press('PageUp');
    expect(activeName()).toBe(all[0]);
  });

  test('typing again starts from the first result; the pointer over an option makes it the active one', () => {
    render(<CommandPalette />);
    press('ArrowDown');
    type('hoja');
    expect(active()).toBe(options()[0]);
    fireEvent.pointerMove(options()[2]);
    expect(active()).toBe(options()[2]);
  });
});

describe('running a command', () => {
  test('Enter runs the active one, closes the palette and keeps it as the newest recent command', () => {
    render(<CommandPalette />);
    type('agregar hoja');
    expect(activeName()).toBe('Agregar hoja');
    press('Enter');
    expect(getDocument().sheets).toHaveLength(2);
    expect(useDialogs.getState().open.palette).toBeUndefined();
    expect(recentCommands()).toEqual(['addSheet']);
  });

  test('a click runs it too', () => {
    render(<CommandPalette />);
    type('orientación');
    fireEvent.click(options()[0]);
    expect(getDocument().landscape).toBe(true);
    expect(useDialogs.getState().open.palette).toBeUndefined();
  });

  test('one that can’t run now stays listed with why (its description), and Enter doesn’t run it but says why again', () => {
    render(<CommandPalette />);
    type('acomodar');
    const arrange = options()[0];
    expect(arrange.getAttribute('aria-disabled')).toBe('true');
    const why = document.getElementById(arrange.getAttribute('aria-describedby')!)!;
    expect(plain(why.textContent)).toBe('Todavía no hay piezas');
    // Said as its description, not as part of its name.
    expect(why.getAttribute('aria-hidden')).toBe('true');
    press('Enter');
    press('Enter');
    expect(useDialogs.getState().open.palette).toBeDefined();
    expect(recentCommands()).toEqual([]);
    const statuses = screen.getAllByRole('status');
    expect(statuses.some((s) => plain(s.textContent).replace(/​/g, '') === 'Todavía no hay piezas')).toBe(true);
  });

  test('the keys of each command show next to it and are its aria-keyshortcuts; single-key ones only while those are on', () => {
    resetState({ items: [piece(1, fakeImageMm(40, 30), 20, 20)], selection: [1] });
    render(<CommandPalette />);
    type('rotar a la derecha');
    expect(options()[0].querySelector('kbd')?.textContent).toBe('R');
    expect(options()[0].getAttribute('aria-keyshortcuts')).toBe('R');
    type('duplicar');
    expect(options()[0].querySelector('kbd')?.textContent).toBe('Ctrl+D');
    cleanup();
    act(() => setSingleKeys(false));
    render(<CommandPalette />);
    type('rotar a la derecha');
    expect(options()[0].querySelector('kbd')).toBeNull();
    expect(options()[0].hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  test('the option in use is marked as current: the light theme, once chosen', () => {
    render(<CommandPalette />);
    type('tema');
    const marked = options().filter((o) => o.getAttribute('aria-current') === 'true');
    expect(marked.map((o) => plain(o.querySelector('.palette-label')?.textContent))).toEqual(['Usar el tema automático']);
  });
});

describe('a command that needs a value', () => {
  test('opens its choices in a second step, named by the command, with the one in use active and marked', () => {
    render(<CommandPalette />);
    type('papel');
    expect(options()[0].querySelector('.palette-end .icon')).not.toBeNull();
    press('Enter');
    expect(useDialogs.getState().open.palette).toBeDefined();
    expect(field().getAttribute('aria-labelledby')).toBe('palette-step');
    expect(plain(document.getElementById('palette-step')?.textContent)).toBe('Cambiar el papel');
    expect(field().getAttribute('placeholder')).toBe('Busca una opción');
    expect((field() as HTMLInputElement).value).toBe('');
    expect(plain(activeName())).toBe('A4 (210 × 297 mm)');
    expect(active()?.getAttribute('aria-current')).toBe('true');
    const groups = within(screen.getByRole('listbox')).getAllByRole('group');
    expect(groups.map((g) => plain(document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent))).toEqual(['Serie A', 'Serie B', 'América', 'Fotográfico']);
    expect(names().at(-1)).toBe('Personalizado');
  });

  test('choosing one runs it, closes and keeps the command (not the choice) as recent', () => {
    render(<CommandPalette />);
    type('papel');
    press('Enter');
    type('a3');
    press('Enter');
    expect(getDocument().paper).toBe('A3');
    expect(useDialogs.getState().open.palette).toBeUndefined();
    expect(recentCommands()).toEqual(['paper']);
  });

  test('Backspace on the empty field, or the back button, goes back to the commands with what was typed', () => {
    render(<CommandPalette />);
    type('líneas');
    press('Enter');
    expect(names()).toEqual(['Ninguna', 'Esquinas', 'Contorno', 'Silueta']);
    press('Backspace');
    expect((field() as HTMLInputElement).value).toBe('líneas');
    expect(activeName()).toBe('Cambiar las líneas de corte');
    press('Enter');
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(activeName()).toBe('Cambiar las líneas de corte');
  });
});
