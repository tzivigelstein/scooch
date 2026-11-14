// @vitest-environment jsdom
// «Preferencias»: two titled groups (Unidades, Teclado), the units hint
// describing each unit option, and the «Atajos de 1 tecla» switch. Choosing a
// unit (saved and announced) is in unit-preference.test.tsx; that the choice
// survives a reload, in e2e/specs/keyboard-only.spec.ts.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PrefsDialog from '../../src/components/dialogs/PrefsDialog.tsx';
import { getPrefs, readStoredTheme, setSingleKeys } from '../../src/state/prefs.ts';
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
  test('four groups, each named by its title: Unidades, Teclado, Impresión and Tema', () => {
    render(<PrefsDialog />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Preferencias');
    const groups = screen.getAllByRole('group');
    expect(groups.map((g) => referenced(g, 'aria-labelledby'))).toEqual(['Unidades', 'Teclado', 'Impresión', 'Tema']);
    expect(groups.map((g) => g.querySelector('h3')?.id)).toEqual(groups.map((g) => g.getAttribute('aria-labelledby')));
  });

  test('the Unidades group holds the three units, with no hint under them', () => {
    render(<PrefsDialog />);
    const [units] = screen.getAllByRole('group');
    const radios = within(units).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['mm', 'cm', 'in']);
    for (const radio of radios) expect(radio.hasAttribute('aria-describedby')).toBe(false);
    expect(units.querySelector('.switch-hint')).toBeNull();
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
    const toggle = screen.getByRole('switch', { name: /^Atajos de 1 tecla/ }) as HTMLInputElement;
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
    expect((screen.getByRole('switch', { name: /^Atajos de 1 tecla/ }) as HTMLInputElement).checked).toBe(false);
  });

  test('Impresión: the advice before printing and the summary after, each a switch saved in this browser', () => {
    render(<PrefsDialog />);
    const tip = screen.getByRole('switch', { name: 'Consejo antes de imprimir' }) as HTMLInputElement;
    const summary = screen.getByRole('switch', { name: 'Resumen después de imprimir' }) as HTMLInputElement;
    expect([tip.checked, summary.checked]).toEqual([true, true]);
    fireEvent.click(summary);
    expect(getPrefs().printing).toEqual({ tip: true, summary: false });
    expect(JSON.parse(localStorage.getItem('scooch:print-preferences')!)).toEqual({ v: 1, tip: true, summary: false });
    fireEvent.click(tip);
    expect(getPrefs().printing.tip).toBe(false);
  });

  test('Tema: Automático, Claro and Oscuro, with no hint, automatic by default; the one chosen is saved in this browser', () => {
    render(<PrefsDialog />);
    const theme = screen.getAllByRole('group')[3];
    const radios = within(theme).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => [r.value, plain(r.labels?.[0]?.textContent)])).toEqual([
      ['auto', 'Automático'],
      ['light', 'Claro'],
      ['dark', 'Oscuro'],
    ]);
    for (const radio of radios) expect(radio.hasAttribute('aria-describedby')).toBe(false);
    expect(theme.querySelector('.switch-hint')).toBeNull();
    expect(radios.map((r) => r.checked)).toEqual([true, false, false]);
    fireEvent.click(screen.getByRole('radio', { name: 'Oscuro' }));
    expect(getPrefs().theme).toBe('dark');
    expect(radios.map((r) => r.checked)).toEqual([false, false, true]);
    expect(JSON.parse(localStorage.getItem('scooch:theme-preference')!)).toEqual({ v: 1, theme: 'dark' });
  });

  test('Tema shows a theme chosen in another tab', () => {
    render(<PrefsDialog />);
    localStorage.setItem('scooch:theme-preference', JSON.stringify({ v: 1, theme: 'light' }));
    act(() => readStoredTheme());
    expect((screen.getByRole('radio', { name: 'Claro' }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('the site’s legal pages', () => {
  test('the foot of Preferencias links to the terms of use and the privacy policy, outside the groups', () => {
    render(<PrefsDialog />);
    const foot = document.getElementById('prefs-legal')!;
    const links = within(foot).getAllByRole('link');
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Términos de uso', '/es/terminos'],
      ['Política de privacidad', '/es/privacidad'],
    ]);
    expect(foot.closest('[role="group"], .dialog-body')).toBeNull();
  });
});
