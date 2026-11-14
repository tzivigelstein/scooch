// @vitest-environment jsdom
// The «Propiedades» tabs (ui/Tabs.tsx inside PropertiesPanel): the tablist and
// its two tabs wired to their panels, one tab stop, the arrows, Home and End,
// the shortcut each tab shows, what each panel shows and where a sheet's
// title takes the focus. (Which tab follows
// the selection is in tests/state/follow-selection.test.ts; M and H with the
// real focus, and the drawer and the bottom sheet, in
// e2e/specs/panels-and-tabs.spec.ts.)
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { PropertiesPanel } from '../../src/components/properties-panel/PropertiesPanel.tsx';
import { getDocument } from '../../src/state/document.ts';
import { usePrefs } from '../../src/state/prefs.ts';
import { getView } from '../../src/state/view.ts';
import { showPropsTab } from '../../src/state/actions/panels.ts';
import { setSelection } from '../../src/state/actions/selection.ts';
import { showPaperSettings } from '../../src/state/actions/sheets.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
  // The wide layout: the panel is a column, not a drawer.
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  const key = fakeImage({ name: 'tall.png' });
  resetState({ items: [piece(1, key, 10, 10), piece(2, key, 80, 10)] });
  render(<PropertiesPanel />);
});

afterEach(cleanup);

const tab = (name: 'piece' | 'project') => document.getElementById(`props-tab-${name}`)!;
const panel = (name: 'piece' | 'project') => document.getElementById(`props-${name}`)!;

describe('the «Propiedades» tabs', () => {
  test('a tablist named «Propiedades» with two tabs, Pieza and Proyecto, each wired to its panel', () => {
    const list = screen.getByRole('tablist', { name: 'Propiedades' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Pieza', 'Proyecto']);
    for (const t of tabs) {
      const controlled = document.getElementById(t.getAttribute('aria-controls')!)!;
      expect(controlled.getAttribute('role')).toBe('tabpanel');
      expect(controlled.getAttribute('aria-labelledby')).toBe(t.id);
    }
    expect(tabs.map((t) => t.getAttribute('aria-controls'))).toEqual(['props-piece', 'props-project']);
  });

  test('the selected tab is the only tab stop and only its panel shows', () => {
    expect(tab('project').getAttribute('aria-selected')).toBe('true');
    expect(tab('piece').getAttribute('aria-selected')).toBe('false');
    expect([tab('piece').tabIndex, tab('project').tabIndex]).toEqual([-1, 0]);
    expect([panel('piece').hidden, panel('project').hidden]).toEqual([true, false]);
    act(() => showPropsTab('piece'));
    expect(tab('piece').getAttribute('aria-selected')).toBe('true');
    expect([tab('piece').tabIndex, tab('project').tabIndex]).toEqual([0, -1]);
    expect([panel('piece').hidden, panel('project').hidden]).toEqual([false, true]);
  });

  test('← and → move between the tabs and wrap, Home and End go to the ends; each shows its tab with the focus on it', async () => {
    const user = userEvent.setup();
    tab('project').focus();
    await user.keyboard('{ArrowLeft}');
    expect(getView().propsTab).toBe('piece');
    expect(document.activeElement).toBe(tab('piece'));
    await user.keyboard('{ArrowLeft}');
    expect(getView().propsTab).toBe('project');
    expect(document.activeElement).toBe(tab('project'));
    await user.keyboard('{ArrowRight}');
    expect(getView().propsTab).toBe('piece');
    await user.keyboard('{End}');
    expect(getView().propsTab).toBe('project');
    expect(document.activeElement).toBe(tab('project'));
    await user.keyboard('{Home}');
    expect(getView().propsTab).toBe('piece');
    expect(document.activeElement).toBe(tab('piece'));
    // With Ctrl the arrows are someone else's.
    await user.keyboard('{Control>}{ArrowRight}{/Control}');
    expect(getView().propsTab).toBe('piece');
  });

  test('a click shows its tab', () => {
    fireEvent.click(tab('piece'));
    expect(getView().propsTab).toBe('piece');
    expect(panel('piece').hidden).toBe(false);
  });

  test('the tabs show their shortcut (M, H) in the tooltip and in aria-keyshortcuts, which goes when single keys are off', () => {
    expect(tab('piece').dataset.tip).toBe('Pieza');
    expect(tab('project').dataset.tip).toBe('Proyecto');
    expect(tab('piece').dataset.kbd).toBe('M');
    expect(tab('piece').getAttribute('aria-keyshortcuts')).toBe('M');
    expect(tab('project').dataset.kbd).toBe('H');
    expect(tab('project').getAttribute('aria-keyshortcuts')).toBe('H');
    act(() => usePrefs.setState({ singleKeys: false }));
    expect(tab('piece').hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(tab('project').hasAttribute('aria-keyshortcuts')).toBe(false);
  });
});

describe('what each tab shows', () => {
  test('Proyecto starts with its first section, with no note above it', () => {
    expect(tab('project').textContent).toBe('Proyecto');
    expect(panel('project').firstElementChild!.classList.contains('prop-section')).toBe(true);
  });

  test('Pieza with nothing selected shows only the hint', () => {
    act(() => showPropsTab('piece'));
    const hint = document.getElementById('piece-empty')!;
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).not.toBe('');
    const shown = [...panel('piece').querySelectorAll<HTMLElement>('*')].filter((el) => !el.closest('[hidden]'));
    expect(shown.filter((el) => !el.closest('#piece-empty') && el.id !== 'section-piece')).toEqual([]);
  });

  test('a collapsed section stays collapsed across tab switches', () => {
    const toggle = () => document.querySelector('[aria-controls="section-arrange"]')!;
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(tab('piece'));
    fireEvent.click(tab('project'));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('section-arrange')!.hidden).toBe(true);
  });
});

describe('a sheet’s title («Cambiar el papel»)', () => {
  test('shows Proyecto with nothing selected and Papel open (even if it was collapsed), with the focus on the paper size', () => {
    const papel = () => document.querySelector('[aria-controls="section-sheet"]')!;
    fireEvent.click(papel());
    expect(papel().getAttribute('aria-expanded')).toBe('false');
    act(() => {
      setSelection([1]);
      showPropsTab('piece');
    });
    act(() => showPaperSettings(1));
    expect(getView().propsTab).toBe('project');
    expect(getDocument().selection).toEqual([]);
    expect(papel().getAttribute('aria-expanded')).toBe('true');
    expect(usePrefs.getState().sections.sheet).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('paper'));
  });
});
