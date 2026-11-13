// @vitest-environment jsdom
// «Preferencias»: two titled groups (Unidades, Teclado), the units hint
// describing each unit option, and the «Atajos de 1 tecla» switch. Choosing a
// unit (saved and announced) is in unit-preference.test.tsx; that the choice
// survives a reload, in e2e/specs/keyboard-only.spec.ts.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PrefsDialog from '../../src/components/dialogs/PrefsDialog.tsx';
import { getPrefs, setSingleKeys } from '../../src/state/prefs.ts';
import { resetState } from '../support/state.ts';

const plain = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ').trim();
/** The text of the elements an aria-describedby / aria-labelledby points to. */
const referenced = (el: Element, attribute: string) =>
  (el.getAttribute(attribute) ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => plain(document.getElementById(id)?.textContent))
    .join(' ');

beforeEach(() => {
  resetState();
  localStorage.clear();
});
afterEach(cleanup);

describe('Preferences', () => {
  test('two groups, each named by its title: Unidades and Teclado', () => {
    render(<PrefsDialog />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Preferencias');
    const groups = screen.getAllByRole('group');
    expect(groups.map((g) => referenced(g, 'aria-labelledby'))).toEqual(['Unidades', 'Teclado']);
    expect(groups.map((g) => g.querySelector('h3')?.id)).toEqual(groups.map((g) => g.getAttribute('aria-labelledby')));
  });

  test('the Unidades group holds the three units, each described by the units hint', () => {
    render(<PrefsDialog />);
    const [units] = screen.getAllByRole('group');
    const radios = within(units).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['mm', 'cm', 'in']);
    for (const radio of radios) expect(referenced(radio, 'aria-describedby')).toBe('Para mostrar y escribir medidas. No cambia el documento ni el PDF.');
  });

  test('the Teclado group holds the «Atajos de 1 tecla» switch, described by its hint, on by default', () => {
    render(<PrefsDialog />);
    const [, keyboard] = screen.getAllByRole('group');
    const toggle = within(keyboard).getByRole('switch') as HTMLInputElement;
    expect(toggle.id).toBe('single-keys');
    expect(plain(toggle.labels?.[0]?.firstChild?.textContent)).toBe('Atajos de 1 tecla');
    expect(referenced(toggle, 'aria-describedby')).toBe(
      'Desactívalos si usas control por voz o si se activan sin querer. Los atajos con Ctrl, las flechas y Supr sobre una pieza siguen funcionando.'
    );
    expect(toggle.checked).toBe(true);
  });

  test('the switch turns the single keys off and on again, saved in this browser', () => {
    render(<PrefsDialog />);
    const toggle = screen.getByRole('switch') as HTMLInputElement;
    fireEvent.click(toggle);
    expect(getPrefs().singleKeys).toBe(false);
    expect(toggle.checked).toBe(false);
    expect(localStorage.getItem('scooch:single-key-shortcuts')).toBe('off');
    fireEvent.click(toggle);
    expect(getPrefs().singleKeys).toBe(true);
    expect(localStorage.getItem('scooch:single-key-shortcuts')).toBe('on');
  });

  test('the switch shows a change made elsewhere', () => {
    render(<PrefsDialog />);
    act(() => setSingleKeys(false));
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
  });
});
