// @vitest-environment jsdom
// «Preferencias»: a titled group only for two controls or more (Unidades,
// Impresión, Tema); «Idioma» is a list and «Atajos de 1 tecla» and «Consejos
// de uso» switches of their own, named by their labels; at its foot, the
// site's pages in the language on screen. Choosing a unit (saved and announced) is in
// unit-preference.test.tsx; that the choice survives a reload, in
// e2e/specs/keyboard-only.spec.ts.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PrefsDialog from '../../src/components/dialogs/PrefsDialog.tsx';
import { LANGUAGES, matchLanguage, type Language } from '../../src/core/language.js';
import { CATALOGUES } from '../../src/copy/all.ts';
import es from '../../src/copy/es.ts';
import { setTexts } from '../../src/copy/index.ts';
import { LANGUAGE_NAMES } from '../../src/copy/languages.ts';
import { SHORTCUTS } from '../../src/hooks/shortcuts.ts';
import { getPrefs, readStoredLanguage, readStoredTheme, setSingleKeys } from '../../src/state/prefs.ts';
import { neverShow, resetTips, useTips } from '../../src/state/tips.ts';
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
  test('three groups, each named by its title and holding two controls or more: Unidades, Impresión and Tema', () => {
    render(<PrefsDialog />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Preferencias');
    const groups = screen.getAllByRole('group');
    expect(groups.map((g) => referenced(g, 'aria-labelledby'))).toEqual(['Unidades', 'Impresión', 'Tema']);
    expect(groups.map((g) => g.querySelector('h3')?.id)).toEqual(groups.map((g) => g.getAttribute('aria-labelledby')));
    for (const group of groups) expect(within(group).queryAllByRole('radio').length + within(group).queryAllByRole('switch').length).toBeGreaterThanOrEqual(2);
    // No heading outside a group: a section title is there only for two controls or more.
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(groups.length);
  });

  test('a switch in a section is named by its label inside the titled group; one on its own, by its label alone, next to the other one', () => {
    render(<PrefsDialog />);
    const switches = screen.getAllByRole('switch') as HTMLInputElement[];
    const placed = switches.map((toggle) => {
      const group = toggle.closest('[role="group"]');
      return [group && referenced(group, 'aria-labelledby'), plain(toggle.labels?.[0]?.textContent)];
    });
    expect(placed).toEqual([
      [null, 'Atajos de 1 tecla, como D o R'],
      [null, 'Consejos de uso'],
      ['Impresión', 'Consejo'],
      ['Impresión', 'Resumen'],
    ]);
    // The ones on their own go together, not as stray rows.
    const block = (toggle: Element) => toggle.closest('.switch-row')?.parentElement;
    expect(block(switches[0])).toBe(block(switches[1]));
  });

  test('the Unidades group holds the three units, with no hint under them', () => {
    render(<PrefsDialog />);
    const [units] = screen.getAllByRole('group');
    const radios = within(units).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['mm', 'cm', 'in']);
    for (const radio of radios) expect(radio.hasAttribute('aria-describedby')).toBe(false);
    expect(units.querySelector('.switch-hint')).toBeNull();
  });

  test('«Atajos de 1 tecla» is a switch of its own, named with two of those keys and no hint, on by default', () => {
    render(<PrefsDialog />);
    const toggle = screen.getByRole('switch', { name: 'Atajos de 1 tecla, como D o R' }) as HTMLInputElement;
    expect(toggle.id).toBe('single-keys');
    expect(toggle.closest('[role="group"]')).toBeNull();
    expect(toggle.hasAttribute('aria-describedby')).toBe(false);
    expect(toggle.closest('.switch-row')!.querySelector('.switch-hint')).toBeNull();
    expect(toggle.checked).toBe(true);
  });

  test('the keys in the «Atajos de 1 tecla» label come from the shortcut table (duplicate and rotate)', () => {
    const { duplicateKey, rotateRight } = SHORTCUTS;
    const before = [duplicateKey.kbd, rotateRight.kbd];
    try {
      duplicateKey.kbd = 'J';
      rotateRight.kbd = 'Shift+Q';
      render(<PrefsDialog />);
      expect(screen.getByRole('switch', { name: 'Atajos de 1 tecla, como J o Shift+Q' }).id).toBe('single-keys');
    } finally {
      [duplicateKey.kbd, rotateRight.kbd] = before;
    }
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
    const printing = screen.getByRole('group', { name: 'Impresión' });
    const tip = within(printing).getByRole('switch', { name: 'Consejo' }) as HTMLInputElement;
    const summary = within(printing).getByRole('switch', { name: 'Resumen' }) as HTMLInputElement;
    expect([tip.checked, summary.checked]).toEqual([true, true]);
    fireEvent.click(summary);
    expect(getPrefs().printing).toEqual({ tip: true, summary: false });
    expect(JSON.parse(localStorage.getItem('scooch:print-preferences')!)).toEqual({ v: 1, tip: true, summary: false });
    fireEvent.click(tip);
    expect(getPrefs().printing.tip).toBe(false);
  });

  test('Tema: Automático, Claro and Oscuro, with no hint, automatic by default; the one chosen is saved in this browser', () => {
    render(<PrefsDialog />);
    const theme = screen.getByRole('group', { name: 'Tema' });
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

  test('Idioma comes first, one control named by its label (no heading): Automático, with the browser’s language, then each language by its own name and marked with it; the choice is saved in this browser', () => {
    render(<PrefsDialog />);
    const select = screen.getByRole('combobox', { name: 'Idioma' }) as HTMLSelectElement;
    expect(select.closest('.pref-section')).toBe(document.querySelector('.dialog-body > .pref-section'));
    expect(select.closest('.pref-section')?.querySelector('h3, [role="group"]')).toBeNull();
    expect(select.labels?.[0]?.textContent).toBe('Idioma');
    const options = [...select.options];
    expect(options.map((o) => [o.value, o.textContent, o.lang])).toEqual([['auto', `Automático (${LANGUAGE_NAMES[matchLanguage(navigator.languages, LANGUAGES)]})`, ''], ...LANGUAGES.map((language) => [language, LANGUAGE_NAMES[language], language])]);
    expect(select.value).toBe('auto');
    fireEvent.change(select, { target: { value: LANGUAGES.at(-1) } });
    expect(getPrefs().language).toBe(LANGUAGES.at(-1));
    expect(JSON.parse(localStorage.getItem('scooch:language-preference')!)).toEqual({ v: 1, language: LANGUAGES.at(-1) });
  });

  test('Idioma shows a language chosen in another tab', () => {
    render(<PrefsDialog />);
    localStorage.setItem('scooch:language-preference', JSON.stringify({ v: 1, language: 'es' }));
    act(() => readStoredLanguage());
    expect((screen.getByRole('combobox', { name: 'Idioma' }) as HTMLSelectElement).value).toBe('es');
  });

  test('Tema shows a theme chosen in another tab', () => {
    render(<PrefsDialog />);
    localStorage.setItem('scooch:theme-preference', JSON.stringify({ v: 1, theme: 'light' }));
    act(() => readStoredTheme());
    expect((screen.getByRole('radio', { name: 'Claro' }) as HTMLInputElement).checked).toBe(true);
  });

  test('«Consejos de uso» is a switch of its own, on by default, that turns them off in this browser; no hint', () => {
    resetTips();
    render(<PrefsDialog />);
    const toggle = screen.getByRole('switch', { name: 'Consejos de uso' }) as HTMLInputElement;
    expect(toggle.id).toBe('tips-pref');
    expect(toggle.closest('[role="group"]')).toBeNull();
    expect(toggle.checked).toBe(true);
    expect(toggle.closest('.switch-row')!.querySelector('.switch-hint')).toBeNull();
    fireEvent.click(toggle);
    expect(useTips.getState().on).toBe(false);
    expect(JSON.parse(localStorage.getItem('scooch:usage-tips')!)).toMatchObject({ v: 1, on: false });
  });

  test('«Consejos de uso» is the switch alone: no button to bring the dismissed ones back', () => {
    resetTips();
    render(<PrefsDialog />);
    const row = screen.getByRole('switch', { name: 'Consejos de uso' }).closest('.switch-row') as HTMLElement;
    expect(within(row).queryAllByRole('button')).toEqual([]);
    expect(screen.queryByRole('button', { name: /mostrar/i })).toBeNull();
  });

  test('turning «Consejos de uso» off and on again brings back the dismissed ones', () => {
    resetTips();
    act(() => neverShow('undoKey'));
    render(<PrefsDialog />);
    const toggle = screen.getByRole('switch', { name: 'Consejos de uso' });
    fireEvent.click(toggle);
    expect(useTips.getState()).toMatchObject({ on: false, dismissed: ['undoKey'] });
    fireEvent.click(toggle);
    expect(useTips.getState()).toMatchObject({ on: true, dismissed: [] });
  });
});

describe('the site’s pages', () => {
  afterEach(() => setTexts(es));

  const FOOT: Record<Language, string[][]> = {
    es: [
      ['Preguntas frecuentes', '/es/preguntas-frecuentes'],
      ['Términos de uso', '/es/terminos'],
      ['Política de privacidad', '/es/privacidad'],
    ],
    en: [
      ['Frequently asked questions', '/en/faq'],
      ['Terms of use', '/en/terms'],
      ['Privacy policy', '/en/privacy'],
    ],
    'zh-Hans': [
      ['常见问题', '/zh-hans/faq'],
      ['使用条款', '/zh-hans/terms'],
      ['隐私政策', '/zh-hans/privacy'],
    ],
    hi: [
      ['अक्सर पूछे जाने वाले सवाल', '/hi/faq'],
      ['इस्तेमाल की शर्तें', '/hi/terms'],
      ['निजता नीति', '/hi/privacy'],
    ],
    fr: [
      ['Questions fréquentes', '/fr/questions-frequentes'],
      ['Conditions d’utilisation', '/fr/conditions-utilisation'],
      ['Politique de confidentialité', '/fr/confidentialite'],
    ],
  };

  test.each(LANGUAGES)('in %s, the foot of Preferencias links to the questions, the terms of use and the privacy policy in that language, outside the groups', (language) => {
    setTexts(CATALOGUES[language]);
    render(<PrefsDialog />);
    const foot = document.getElementById('prefs-legal')!;
    const links = within(foot).getAllByRole('link');
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual(FOOT[language]);
    // In the page's own language: nothing to say about it.
    expect(links.map((a) => a.getAttribute('hreflang'))).toEqual(links.map(() => null));
    expect(foot.closest('[role="group"], .dialog-body')).toBeNull();
  });

  test('the questions open in a new tab, without a hold on the editor; the terms and the privacy policy in this one', () => {
    render(<PrefsDialog />);
    const links = within(document.getElementById('prefs-legal')!).getAllByRole('link');
    expect(links.map((a) => [a.getAttribute('target'), a.getAttribute('rel')])).toEqual([
      ['_blank', 'noopener'],
      [null, null],
      [null, null],
    ]);
  });
});
