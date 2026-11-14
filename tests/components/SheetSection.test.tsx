// @vitest-environment jsdom
// The «Hoja» section's paper fields on the real document store: the preset
// list (groups, names, «Personalizado» last), the custom paper's width and
// height (starting from the current size, the note when they match a preset,
// accessible names with the unit, out-of-range and unreadable values, Esc,
// leaving out of range), the same in cm, and the margin and gap fields' unit.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { SheetLength, SheetSection } from '../../src/components/properties-panel/SheetSection.tsx';
import { getDocument } from '../../src/state/document.ts';
import { historyDepth } from '../../src/state/history.ts';
import { setUnit } from '../../src/state/prefs.ts';
import { sheetSize } from '../../src/state/selectors.ts';
import { resetState } from '../support/state.ts';

const plain = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ');
const byId = (id: string) => document.getElementById(id);
const field = (id: string) => byId(id) as HTMLInputElement;
const select = () => byId('paper') as HTMLSelectElement;
const choose = (value: string) => fireEvent.change(select(), { target: { value } });
/** Types in a field (it has the focus, as when a person types). */
const type = (id: string, text: string) => {
  field(id).focus();
  fireEvent.input(field(id), { target: { value: text } });
};
const enter = (id: string) => fireEvent.keyDown(field(id), { key: 'Enter' });
const escape = (id: string) => fireEvent.keyDown(field(id), { key: 'Escape' });
/** Types and confirms with Enter. */
const confirm = (id: string, text: string) => {
  type(id, text);
  enter(id);
};
const describedBy = (id: string) => (field(id).getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
const shows = (id: string) => !!byId(id) && !byId(id)!.hidden;

beforeEach(() => {
  resetState();
  localStorage.clear();
  render(
    <>
      <SheetSection />
      <SheetLength name="gap" />
      <div id="live-polite" />
      <div id="live-assertive" />
    </>
  );
});
afterEach(cleanup);

describe('the paper list', () => {
  test('the presets come in 4 groups in order: Serie A, Serie B, América (Carta, Oficio, Folio, Tabloide), Fotográfico', () => {
    const groups = [...select().querySelectorAll('optgroup')].map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.value)] as const);
    expect(groups.map(([label]) => label)).toEqual(['Serie A', 'Serie B', 'América', 'Fotográfico']);
    expect(groups[2][1]).toEqual(['letter', 'legal', 'folio', 'tabloid']);
  });

  test('each option shows its name from the copy and its size: «Carta (215,9 × 279,4 mm)»', () => {
    const name = (value: string) => plain(select().querySelector(`option[value="${value}"]`)!.textContent);
    expect(name('letter')).toBe('Carta (215,9 × 279,4 mm)');
    expect(name('legal')).toBe('Oficio (215,9 × 355,6 mm)');
    expect(name('folio')).toBe('Folio (216 × 330 mm)');
    expect(name('photo-10x15')).toBe('Foto 10 × 15 (101,6 × 152,4 mm)');
  });

  test('the options follow the unit: «A4 (21 × 29,7 cm)» in cm, «Carta (8,5 × 11 in)» in inches', () => {
    const name = (value: string) => plain(select().querySelector(`option[value="${value}"]`)!.textContent);
    act(() => setUnit('cm'));
    expect(name('A4')).toBe('A4 (21 × 29,7 cm)');
    act(() => setUnit('in'));
    expect(name('letter')).toBe('Carta (8,5 × 11 in)');
  });

  test('«Personalizado» is the last option, outside the groups', () => {
    const last = select().lastElementChild as HTMLOptionElement;
    expect([last.tagName, last.value, last.textContent]).toEqual(['OPTION', 'custom', 'Personalizado']);
  });

  test('A4 by default; choosing Folio changes the paper and shows no custom fields', () => {
    expect(select().value).toBe('A4');
    expect(byId('custom-paper')!.hidden).toBe(true);
    choose('folio');
    expect(getDocument().paper).toBe('folio');
    expect(select().value).toBe('folio');
    expect(byId('custom-paper')!.hidden).toBe(true);
  });
});

describe('the custom paper fields', () => {
  test('choosing «Personalizado» shows width and height, starting from the current size', () => {
    choose('folio');
    choose('custom');
    expect(byId('custom-paper')!.hidden).toBe(false);
    expect([field('paper-w').value, field('paper-h').value]).toEqual(['216', '330']);
  });

  test('a size that matches a preset says so, and that note describes both fields', () => {
    choose('folio');
    choose('custom');
    expect(shows('paper-match')).toBe(true);
    expect(plain(byId('paper-match')!.textContent)).toBe('Coincide con Folio');
    expect(describedBy('paper-w')).toEqual(['paper-match']);
    expect(describedBy('paper-h')).toEqual(['paper-match']);
  });

  test('accessible names with the unit: «Ancho de la hoja, en milímetros», «Alto de la hoja, en milímetros»', () => {
    choose('custom');
    expect(screen.getByRole('textbox', { name: 'Ancho de la hoja, en milímetros' }).id).toBe('paper-w');
    expect(screen.getByRole('textbox', { name: 'Alto de la hoja, en milímetros' }).id).toBe('paper-h');
    // Marked with letters, like the piece's width and height.
    expect([byId('paper-w'), byId('paper-h')].map((f) => f!.closest('label')!.querySelector('.num-prefix')!.textContent)).toEqual(['An', 'Al']);
  });

  test('a valid size matching no preset: no note', () => {
    choose('custom');
    confirm('paper-w', '200');
    confirm('paper-h', '250');
    expect(sheetSize()).toEqual([200, 250]);
    expect(shows('paper-match')).toBe(false);
    expect(describedBy('paper-w')).toEqual([]);
  });

  test('«29.7 cm» × «21 cm» matches A4 landscape, and the list stays on «Personalizado»', () => {
    choose('custom');
    confirm('paper-w', '29.7 cm');
    confirm('paper-h', '21 cm');
    expect(plain(byId('paper-match')!.textContent)).toBe('Coincide con A4 horizontal');
    expect(select().value).toBe('custom');
    expect(typeof getDocument().paper).toBe('object');
  });

  describe('out of range and unreadable values', () => {
    // From a custom 297 × 210 mm sheet (A4 landscape made custom), as the old suite.
    beforeEach(() => {
      choose('custom');
      confirm('paper-w', '297');
      confirm('paper-h', '210');
      expect(sheetSize()).toEqual([297, 210]);
    });

    test('too small: «Mínimo 20 mm» next to the width, which is invalid and described by it; the sheet previews the minimum', () => {
      type('paper-w', '5');
      expect(plain(byId('paper-w-limit')!.textContent)).toBe('Mínimo 20 mm');
      expect(field('paper-w').getAttribute('aria-invalid')).toBe('true');
      expect(describedBy('paper-w')).toContain('paper-w-limit');
      expect(sheetSize()).toEqual([20, 210]);
    });

    test('Esc puts back the sheet from before, and the limit note goes away', () => {
      const depth = historyDepth().undo;
      type('paper-w', '5');
      escape('paper-w');
      expect(sheetSize()).toEqual([297, 210]);
      expect(byId('paper-w-limit')).toBeNull();
      expect(field('paper-w').value).toBe('297');
      expect(historyDepth().undo).toBe(depth);
    });

    test('too big in the height: «Máximo 2000 mm», and only the height is invalid', () => {
      type('paper-h', '2500');
      expect(plain(byId('paper-h-limit')!.textContent)).toBe('Máximo 2000 mm');
      expect(field('paper-h').getAttribute('aria-invalid')).toBe('true');
      expect(field('paper-w').getAttribute('aria-invalid')).toBeNull();
    });

    test('not a number: its own message under the fields, tied to the height, and no limit note', () => {
      type('paper-h', 'abc');
      expect(shows('paper-error')).toBe(true);
      expect(byId('paper-error')!.textContent).toBe('Escribe el alto con números, por ejemplo 330');
      expect(byId('paper-h-limit')).toBeNull();
      expect(field('paper-h').getAttribute('aria-invalid')).toBe('true');
      expect(describedBy('paper-h')).toContain('paper-error');
      expect(field('paper-w').getAttribute('aria-invalid')).toBeNull();
      // Meanwhile the matching preset isn't mentioned (it would be the previous size).
      expect(shows('paper-match')).toBe(false);
    });

    test('half typed («1/»): not an error yet', () => {
      type('paper-h', 'abc');
      type('paper-h', '1/');
      expect(shows('paper-error')).toBe(false);
      expect(field('paper-h').getAttribute('aria-invalid')).toBeNull();
    });

    test('leaving out of range keeps the minimum (20) and the note goes away', () => {
      type('paper-h', '9');
      act(() => field('paper-h').blur());
      expect(field('paper-h').value).toBe('20');
      expect(byId('paper-h-limit')).toBeNull();
      expect(field('paper-h').getAttribute('aria-invalid')).toBeNull();
      expect(sheetSize()).toEqual([297, 20]);
    });

    test('leaving something unreadable puts back the size and the message goes away', () => {
      type('paper-h', 'abc');
      act(() => field('paper-h').blur());
      expect(field('paper-h').value).toBe('210');
      expect(shows('paper-error')).toBe(false);
      expect(sheetSize()).toEqual([297, 210]);
    });

    test('typing any size keeps the list on «Personalizado», even one that is a preset', () => {
      confirm('paper-w', '210');
      confirm('paper-h', '297');
      expect(select().value).toBe('custom');
      expect(plain(byId('paper-match')!.textContent)).toBe('Coincide con A4');
    });
  });
});

describe('the custom paper in cm', () => {
  beforeEach(() => {
    act(() => setUnit('cm'));
    choose('custom');
  });

  test('cm: the fields are named «en centímetros», start in cm and show «cm» next to them', () => {
    expect(screen.getByRole('textbox', { name: 'Ancho de la hoja, en centímetros' }).id).toBe('paper-w');
    expect(screen.getByRole('textbox', { name: 'Alto de la hoja, en centímetros' }).id).toBe('paper-h');
    expect([field('paper-w').value, field('paper-h').value]).toEqual(['21', '29,7']);
    const symbols = [...document.querySelectorAll('.num-unit')].map((el) => el.textContent);
    expect(symbols.length).toBeGreaterThanOrEqual(4); // width, height, margin, gap
    expect(new Set(symbols)).toEqual(new Set(['cm']));
  });

  test('cm: 30 × 20 cm makes a custom landscape sheet of 300 × 200 mm', () => {
    confirm('paper-w', '30');
    confirm('paper-h', '20');
    expect(sheetSize()).toEqual([300, 200]);
    expect(getDocument().landscape).toBe(true);
    expect((byId('landscape') as HTMLInputElement).checked).toBe(true);
    expect(shows('paper-match')).toBe(false);
  });

  test('cm: ↑ in the width adds 0,1 cm', () => {
    fireEvent.keyDown(field('paper-w'), { key: 'ArrowUp' });
    expect(field('paper-w').value).toBe('21,1');
    expect(sheetSize()[0]).toBeCloseTo(211, 9);
  });

  test('cm: out of range, the limit in cm next to the field («Mínimo 2 cm»), accessible from it', () => {
    type('paper-w', '1');
    const limit = byId('paper-w-limit')!;
    expect(plain(limit.textContent)).toBe('Mínimo 2 cm');
    expect(field('paper-w').getAttribute('aria-invalid')).toBe('true');
    expect(describedBy('paper-w')).toContain('paper-w-limit');
    expect(field('paper-w').nextElementSibling).toBe(limit);
  });

  test('cm: Esc undoes the edit: the size from before, without an undo step', () => {
    const depth = historyDepth().undo;
    type('paper-w', '25');
    expect(sheetSize()).toEqual([250, 297]);
    escape('paper-w');
    expect(sheetSize()).toEqual([210, 297]);
    expect(field('paper-w').value).toBe('21');
    expect(historyDepth().undo).toBe(depth);
  });
});

describe('margin and gap', () => {
  test('their names for screen readers start with the label and say the unit: «Margen, en milímetros» → «, en centímetros»', () => {
    expect(field('margin').getAttribute('aria-label')).toBe('Margen, en milímetros');
    act(() => setUnit('cm'));
    expect(field('margin').getAttribute('aria-label')).toBe('Margen, en centímetros');
    expect(field('gap').getAttribute('aria-label')).toBe('Separación entre piezas, en centímetros');
  });

  test('in cm: margin 1, gap 0,5; typing «1,5» makes the margin 15 mm and «3 mm» the gap 0,3 cm', () => {
    act(() => setUnit('cm'));
    expect([field('margin').value, field('gap').value]).toEqual(['1', '0,5']);
    confirm('margin', '1,5');
    expect(getDocument().margin).toBe(15);
    expect(field('margin').value).toBe('1,5');
    confirm('gap', '3 mm');
    expect(getDocument().gap).toBe(3);
    expect(field('gap').value).toBe('0,3');
  });
});
