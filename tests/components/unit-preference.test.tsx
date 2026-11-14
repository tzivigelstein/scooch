// @vitest-environment jsdom
// What follows the unit chosen in «Preferencias»: the choice itself (saved and
// announced), the shortcuts table's arrow steps, a piece's arrows help and the
// arrow keys on a piece, in inches.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import PrefsDialog from '../../src/components/dialogs/PrefsDialog.tsx';
import ShortcutsDialog from '../../src/components/dialogs/ShortcutsDialog.tsx';
import { t } from '../../src/copy/index.ts';
import { useGlobalShortcuts } from '../../src/hooks/useGlobalShortcuts.ts';
import { stepTexts } from '../../src/services/measure.ts';
import { getDocument, useDocument } from '../../src/state/document.ts';
import { getPrefs, setUnit } from '../../src/state/prefs.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

const plain = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ');
const live = () => plain(document.getElementById('live-polite')!.textContent).trim();
const regions = (
  <>
    <div id="live-polite" />
    <div id="live-assertive" />
  </>
);

beforeEach(() => {
  vi.useFakeTimers();
  resetState();
  localStorage.clear();
});
afterEach(() => {
  act(() => vi.runAllTimers());
  cleanup();
  vi.useRealTimers();
});

describe('choosing the unit in Preferences', () => {
  test('choosing cm sets the unit, saves it in this browser and announces «Medidas en centímetros»', () => {
    render(
      <>
        <PrefsDialog />
        {regions}
      </>
    );
    const cm = screen.getByRole('radio', { name: /cm/ }) as HTMLInputElement;
    fireEvent.click(cm);
    expect(getPrefs().unit).toBe('cm');
    expect(cm.checked).toBe(true);
    expect(localStorage.getItem('scooch:unit-preference')).toBe('cm');
    act(() => vi.advanceTimersByTime(200));
    expect(live()).toBe('Medidas en centímetros.');
  });

  test('the three units are named for screen readers, with no hint describing them', () => {
    render(<PrefsDialog />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual(['mm', 'cm', 'in']);
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['mm, milímetros', 'cm, centímetros', 'in, pulgadas']);
    expect(radios.map((r) => plain(r.closest('label')!.textContent))).toEqual(['mm', 'cm', 'in']);
    expect(radios.some((r) => r.hasAttribute('aria-describedby'))).toBe(false);
    expect(radios.find((r) => r.checked)!.value).toBe('mm');
  });
});

describe('in inches', () => {
  test('the shortcuts table gives the arrows’ steps in inches: 1/16 in (Shift: 1/2 in; Alt: 1/64 in)', () => {
    setUnit('in');
    render(<ShortcutsDialog />);
    expect(plain(document.getElementById('shortcuts-rows')!.textContent)).toMatch(/Mover la pieza 1\/16 in \(Shift: 1\/2 in; Alt: 1\/64 in\)/);
  });

  test('the shortcuts table follows a unit change while open', () => {
    render(<ShortcutsDialog />);
    expect(plain(document.getElementById('shortcuts-rows')!.textContent)).toMatch(/Mover la pieza 1 mm \(Shift: 10 mm; Alt: 0,1 mm\)/);
    act(() => setUnit('cm'));
    expect(plain(document.getElementById('shortcuts-rows')!.textContent)).toMatch(/Mover la pieza 0,1 cm \(Shift: 1 cm; Alt: 0,01 cm\)/);
  });

  test('a piece’s arrows help says the steps in inches: «Shift: 1/2 in; Alt: 1/64 in»', () => {
    setUnit('in');
    expect(plain(t('piecebar.hint', stepTexts()))).toMatch(/^Flechas: mover \(Shift: 1\/2 in; Alt: 1\/64 in\)\./);
    expect(plain(t('piecebar.hintNoKeys', stepTexts()))).toMatch(/Shift: 1\/2 in; Alt: 1\/64 in/);
  });

  test('the arrow keys on a piece step 1/16 in, Shift 1/2 in, Alt 1/64 in', () => {
    function Harness() {
      useGlobalShortcuts();
      const items = useDocument((s) => s.items);
      return (
        <div id="stage">
          <div id="sheets">
            <div className="page" data-sheet="1">
              <div className="sheet" tabIndex={-1}>
                {items.map((item) => (
                  <div key={item.id} className="piece" data-id={item.id} tabIndex={0} />
                ))}
              </div>
            </div>
          </div>
          {regions}
        </div>
      );
    }
    resetState({ items: [piece(1, fakeImageMm(20, 20), 50.8, 50.8)] });
    setUnit('in');
    render(<Harness />);
    const node = document.querySelector<HTMLElement>('.piece')!;
    node.focus();
    const x = () => getDocument().items[0].x;
    fireEvent.keyDown(node, { key: 'ArrowRight' });
    expect(x()).toBeCloseTo(50.8 + 25.4 / 16, 9);
    fireEvent.keyDown(node, { key: 'ArrowLeft', shiftKey: true });
    expect(x()).toBeCloseTo(50.8 + 25.4 / 16 - 12.7, 9);
    fireEvent.keyDown(node, { key: 'ArrowLeft', altKey: true });
    // Positions are kept to 0,0001 mm.
    expect(x()).toBeCloseTo(50.8 + 25.4 / 16 - 12.7 - 25.4 / 64, 4);
  });
});
