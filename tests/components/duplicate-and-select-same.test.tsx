// @vitest-environment jsdom
// «Duplicar ×N» in the «Pieza» panel (PieceSection): the button's text and
// name follow the copies field, which stops at what the 200-piece cap allows;
// and «Seleccionar iguales» (I) is in the shortcuts dialog.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import ShortcutsDialog from '../../src/components/dialogs/ShortcutsDialog.tsx';
import { PieceSection } from '../../src/components/properties-panel/PieceSection.tsx';
import { getDocument } from '../../src/state/document.ts';
import { setSelection } from '../../src/state/actions/selection.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

afterEach(cleanup);

describe('Duplicar ×N', () => {
  beforeEach(() => {
    const key = fakeImage({ px: [60, 40] });
    resetState({ items: [piece(1, key, 20, 20)] });
    render(
      <>
        <PieceSection />
        <div id="live-polite" />
        <div id="live-assertive" />
      </>
    );
    act(() => setSelection([1]));
  });

  const button = () => document.getElementById('dup-many')!;
  const count = () => document.getElementById('dup-count') as HTMLInputElement;
  const type = (value: string) => {
    fireEvent.input(count(), { target: { value } });
    fireEvent.change(count());
  };

  test('with 1 in the field the button says «Duplicar»; with 5, «Duplicar ×5» and its name tells the copies', () => {
    expect(count().value).toBe('1');
    expect(button().textContent).toBe('Duplicar');
    type('5');
    expect(button().textContent).toBe('Duplicar ×5');
    expect(button().getAttribute('aria-label')).toBe('Duplicar: 5 copias de cada pieza seleccionada');
  });

  test('the field allows up to 199 copies of one piece (200 in all); typing 250 leaves 199', () => {
    expect(count().max).toBe('199');
    type('250');
    expect(count().value).toBe('199');
    expect(button().textContent).toBe('Duplicar ×199');
  });

  test('the button makes as many copies as the field says', () => {
    type('3');
    fireEvent.click(button());
    expect(getDocument().items).toHaveLength(4);
    // The 3 copies end up selected: 196 more pieces fit, 65 copies of each.
    expect(getDocument().selection).toHaveLength(3);
    expect(count().max).toBe('65');
  });
});

describe('shortcuts dialog', () => {
  test('lists I for selecting the pieces of the same file', () => {
    render(<ShortcutsDialog />);
    const rows = [...document.querySelectorAll<HTMLTableRowElement>('#shortcuts-rows tr')];
    const row = rows.find((tr) => /mismo archivo/.test(tr.textContent ?? ''));
    expect(row?.cells[0].textContent).toBe('I');
  });
});
