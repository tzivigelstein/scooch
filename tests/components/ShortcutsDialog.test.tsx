// @vitest-environment jsdom
// The shortcuts dialog's content: the table of every shortcut (keys and
// action), the single-key ones marked, and the note whose link opens
// «Preferencias» and hands it the focus to give back. The steps in other
// units are in unit-preference.test.tsx; the row for I in
// duplicate-and-select-same.test.tsx.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import ShortcutsDialog from '../../src/components/dialogs/ShortcutsDialog.tsx';
import { useDialogs } from '../../src/components/dialogs/dialogs.ts';
import { SHORTCUT_ROWS } from '../../src/hooks/shortcuts.ts';
import { resetState } from '../support/state.ts';

const plain = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ').trim();

/** Each body row as [keys, action] (the «Desactivado» badge left out of the action). */
const rows = () =>
  within(screen.getByRole('table', { name: 'Atajos de teclado' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => {
      const [keys, action] = within(row).getAllByRole('cell');
      return [plain(keys.textContent), plain(action.firstChild?.textContent)];
    });

beforeEach(() => {
  resetState();
  act(() => useDialogs.setState({ open: { shortcuts: { returnTo: null } } }));
});
afterEach(() => {
  cleanup();
  act(() => useDialogs.setState({ open: {} }));
  document.body.innerHTML = '';
});

describe('the shortcuts table', () => {
  test('a table named «Atajos de teclado» with a Tecla and an Acción column and one row per shortcut', () => {
    render(<ShortcutsDialog />);
    expect(screen.getByRole('heading', { name: 'Atajos de teclado' })).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Atajos de teclado' });
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Tecla', 'Acción']);
    expect(rows()).toHaveLength(SHORTCUT_ROWS.length);
  });

  test('each key in its own <kbd> with its visible name: two keys joined by «o», more by spaces', () => {
    render(<ShortcutsDialog />);
    const table = rows();
    const row = (action: string) => table.find(([, a]) => a === action)?.[0];
    expect(row('Descargar PDF')).toBe('Ctrl+S o Ctrl+E');
    expect(row('Rehacer')).toBe('Ctrl+Shift+Z o Ctrl+Y');
    expect(row('Quitar la pieza')).toBe('Supr o Retroceso');
    expect(row('Mover la pieza 1 mm (Shift: 10 mm; Alt: 0,1 mm). Si choca con otra, salta al otro lado.')).toBe('← ↑ → ↓');
    expect(row('Copiar, cortar o pegar piezas. Si copiaste una imagen en otra app, la pega como pieza nueva.')).toBe('Ctrl+C Ctrl+X Ctrl+V');
    expect(row('En las hojas, ir a la hoja anterior o a la siguiente')).toBe('Re Pág o Av Pág');
    expect(row('Mostrar estos atajos')).toBe('?');
    const kbds = [...document.querySelectorAll('#shortcuts-rows tr')].find((tr) => /Descargar PDF/.test(tr.textContent ?? ''))!.querySelectorAll('kbd');
    expect([...kbds].map((k) => k.textContent)).toEqual(['Ctrl+S', 'Ctrl+E']);
  });

  test('the actions, in order', () => {
    render(<ShortcutsDialog />);
    expect(rows().map(([, action]) => action)).toEqual([
      'Recorrer la barra, los paneles y las piezas; en la hoja, enfocar una pieza la selecciona',
      'Mover la pieza 1 mm (Shift: 10 mm; Alt: 0,1 mm). Si choca con otra, salta al otro lado.',
      'Agrandar o reducir 1 % (Shift: 10 %)',
      'Girar 90° a la derecha o a la izquierda',
      'Duplicar la pieza',
      'Duplicar la selección (siempre, también con los atajos de 1 tecla desactivados)',
      'Copiar, cortar o pegar piezas. Si copiaste una imagen en otra app, la pega como pieza nueva.',
      'Abrir el menú de la pieza o de la hoja (también con clic derecho o manteniendo presionado)',
      'Acercar o alejar la vista (también con Ctrl y la rueda, o pellizcando el trackpad)',
      'Ajustar la hoja entera o su ancho a la vista',
      'Mover la vista (también con el botón del medio o desplazando con dos dedos)',
      'Seleccionar las piezas del mismo archivo',
      'Recortar la pieza (también con doble clic); en el recorte, flechas para mover la imagen, más y menos para acercarla, Enter para aplicar y Esc para cancelar',
      'Ajustar a la hoja',
      'Centrar en la hoja',
      'Traer al frente',
      'Sobre una pieza, ir a su barra de acciones',
      'Sobre una pieza, agregarla a la selección o quitarla',
      'Agregar una pieza a la selección o quitarla (arrastrar en un lugar vacío selecciona con un recuadro)',
      'Seleccionar las piezas de la hoja actual; otra vez, las de todas las hojas',
      'Alinear a la izquierda o a la derecha (con 1 pieza, al área útil)',
      'Alinear arriba o abajo',
      'Centrar en horizontal o en vertical',
      'Distribuir en horizontal o en vertical',
      'En las hojas, ir a la hoja anterior o a la siguiente',
      'Mover la pieza a la hoja anterior o a la siguiente (si no hay lugar, a una hoja nueva)',
      'Quitar la pieza',
      'Ir a la pestaña Pieza de Propiedades',
      'Ir a la pestaña Hoja de Propiedades',
      'Ir a la lista de piezas',
      'Acomodar las piezas sin superponerlas',
      'Agregar imágenes o PDF',
      'Cambiar la orientación de la hoja',
      'Mostrar u ocultar la grilla',
      'Deshacer',
      'Rehacer',
      'Imprimir',
      'Descargar PDF',
      'Abrir Proyectos',
      'En un panel, volver a la pieza o cerrar el panel; en la hoja, anular la selección',
      'Mostrar estos atajos',
    ]);
  });

  test('the single-key rows, and only those, are marked and carry the «Desactivado» badge (shown while they are off)', () => {
    render(<ShortcutsDialog />);
    const marked = [...document.querySelectorAll<HTMLTableRowElement>('#shortcuts-rows tr')].filter((tr) => tr.hasAttribute('data-single'));
    expect(marked.map((tr) => plain(tr.cells[0].textContent))).toEqual(['+ o −', 'R o Shift+R', 'D', 'Shift+1 o Shift+2', 'I', 'K', 'F', 'C', ']', 'M', 'H', 'P', 'A', 'O', 'L', 'G', '?']);
    expect(marked.every((tr) => tr.querySelector('.off-badge')?.textContent === 'Desactivado')).toBe(true);
    expect(document.querySelectorAll('#shortcuts-rows .off-badge')).toHaveLength(marked.length);
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
