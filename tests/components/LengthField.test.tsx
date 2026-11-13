// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LengthField } from '../../src/components/ui/LengthField.tsx';
import { getDocument, setDocument } from '../../src/state/document.ts';
import { commit, endEdit, historyDepth, resetHistory } from '../../src/state/history.ts';
import { setUnit } from '../../src/state/prefs.ts';
import { getView } from '../../src/state/view.ts';

function Field({ initial = 10.5, onApply, range = { min: 0, max: 50 } }: { initial?: number; onApply?: (mm: number, final: boolean) => void; range?: { min: number; max: number } }) {
  const [mm, setMm] = useState(initial);
  return (
    <>
      <LengthField
        id="field"
        aria-label="Largo"
        value={() => mm}
        range={() => range}
        apply={(v, { final }) => {
          setMm(v);
          onApply?.(v, final);
        }}
      />
      <output>{mm}</output>
      <div id="live-polite" />
      <div id="live-assertive" />
    </>
  );
}

// The margin, as the panel binds it: keyed undo steps on the document.
function Margin() {
  return (
    <LengthField
      id="margin"
      aria-label="Margen"
      value={() => getDocument().margin}
      range={() => ({ min: 0, max: 50 })}
      editKey={() => 'sheet:margin'}
      apply={(mm, { final }) => {
        if (getDocument().margin !== mm) {
          commit('sheet:margin');
          setDocument({ margin: mm });
        }
        if (final) endEdit();
      }}
    />
  );
}

const input = (id = 'field') => document.getElementById(id) as HTMLInputElement;
const type = (text: string, id = 'field') => fireEvent.input(input(id), { target: { value: text } });

beforeEach(() => {
  setUnit('mm');
  setDocument({ margin: 10, items: [], sheets: [{ id: 1 }] });
  resetHistory();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('LengthField', () => {
  test('shows the value in the chosen unit and follows unit changes', () => {
    render(<Field />);
    expect(input().value).toBe('10,5');
    act(() => setUnit('cm'));
    expect(input().value).toBe('1,05');
  });

  test('applies what can be read while typing, and confirms on change', () => {
    const applied: [number, boolean][] = [];
    render(<Field onApply={(mm, final) => applied.push([mm, final])} />);
    input().focus();
    type('2,5 cm');
    expect(applied.at(-1)).toEqual([25, false]);
    fireEvent.change(input());
    expect(applied.at(-1)).toEqual([25, true]);
  });

  test('out of range: the preview is the clamped value and the field says why', () => {
    const applied: number[] = [];
    render(<Field onApply={(mm) => applied.push(mm)} />);
    input().focus();
    type('21312');
    expect(applied.at(-1)).toBe(50);
    expect(input().getAttribute('aria-invalid')).toBe('true');
    const helper = document.getElementById(input().getAttribute('aria-describedby')!.split(' ')[0])!;
    expect(helper.textContent).toBe('Máximo 50 mm');
    fireEvent.change(input());
    expect(input().value).toBe('50');
    expect(input().getAttribute('aria-invalid')).toBeNull();
    expect(document.querySelector('.field-limit')).toBeNull();
  });

  test('what is half typed previews nothing; while editing, the view knows', () => {
    const applied: number[] = [];
    render(<Field onApply={(mm) => applied.push(mm)} />);
    input().focus();
    type('1/');
    expect(applied).toEqual([]);
    expect(getView().editing).toBe(true);
    fireEvent.blur(input());
    expect(getView().editing).toBe(false);
  });

  test('arrows step from the exact value (Shift coarse, Alt fine), within the range', () => {
    render(<Field initial={10.04} />);
    input().focus();
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(document.querySelector('output')!.textContent).toBe('11.04');
    fireEvent.keyDown(input(), { key: 'ArrowUp', shiftKey: true });
    expect(input().value).toBe('21');
    fireEvent.keyDown(input(), { key: 'ArrowDown', altKey: true });
    expect(input().value).toBe('20,9');
    for (let i = 0; i < 5; i++) fireEvent.keyDown(input(), { key: 'ArrowUp', shiftKey: true });
    expect(document.querySelector('output')!.textContent).toBe('50');
  });

  test('confirming something unreadable goes back to the value and says so', () => {
    vi.useFakeTimers();
    render(<Field />);
    input().focus();
    type('hola');
    fireEvent.change(input());
    expect(input().value).toBe('10,5');
    act(() => vi.advanceTimersByTime(100));
    expect(document.getElementById('live-assertive')!.textContent).toMatch(/«hola» no es una medida válida\. Se mantiene 10,5 mm\./);
  });

  test('one undo step per confirmed edit, none when the value ends where it started', () => {
    render(<Margin />);
    input('margin').focus();
    type('21312', 'margin');
    type('20', 'margin');
    fireEvent.change(input('margin'));
    expect(getDocument().margin).toBe(20);
    expect(historyDepth().undo).toBe(1);
    type('35', 'margin');
    type('20', 'margin');
    fireEvent.blur(input('margin'));
    expect(historyDepth().undo).toBe(1);
  });

  test('Esc goes back to how it was, without an undo step', () => {
    render(<Margin />);
    input('margin').focus();
    type('40', 'margin');
    expect(getDocument().margin).toBe(40);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      input('margin').dispatchEvent(esc);
    });
    expect(getDocument().margin).toBe(10);
    expect(input('margin').value).toBe('10');
    expect(historyDepth().undo).toBe(0);
  });

  test('leaving without changing anything applies nothing (no rounded value)', () => {
    const applied: number[] = [];
    render(<Field initial={12.3456} onApply={(mm) => applied.push(mm)} />);
    input().focus();
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.change(input());
    fireEvent.blur(input());
    expect(applied).toEqual([]);
    expect(document.querySelector('output')!.textContent).toBe('12.3456');
  });

  test('typing is never overwritten by a render', () => {
    render(<Field />);
    input().focus();
    input().value = '12,3';
    act(() => setUnit('cm'));
    expect(input().value).toBe('12,3');
  });
});

describe('LengthField in cm and inches', () => {
  const shown = () => document.querySelector('output')!.textContent;
  const confirm = (text: string) => {
    type(text);
    fireEvent.keyDown(input(), { key: 'Enter' });
  };
  const helper = () => {
    const ids = (input().getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    return ids.length ? (document.getElementById(ids[0])?.textContent ?? '').replace(/ /g, ' ') : null;
  };

  test('a text field with the decimal keyboard (type text, inputmode decimal), without autocomplete or spellcheck', () => {
    render(<Field />);
    expect([input().type, input().getAttribute('inputmode'), input().getAttribute('autocomplete'), input().getAttribute('spellcheck')]).toEqual(['text', 'decimal', 'off', 'false']);
  });

  test('in: shows the value to 3 decimals (10 mm → 0,394; 67,733 mm → 2,667)', () => {
    setUnit('in');
    render(<Field initial={10} />);
    expect(input().value).toBe('0,394');
    cleanup();
    render(<Field initial={(800 / 300) * 25.4} />);
    expect(input().value).toBe('2,667');
  });

  test('cm: reads «2.5», «30 mm» and «1/2 in», and shows each in cm', () => {
    setUnit('cm');
    render(<Field />);
    input().focus();
    for (const [text, mm, value] of [
      ['2.5', '25', '2,5'],
      ['30 mm', '30', '3'],
      ['1/2 in', '12.7', '1,27'],
    ]) {
      confirm(text);
      expect([shown(), input().value], text).toEqual([mm, value]);
    }
  });

  test('in: reads «1 1/2», 1-1/4 with the inch mark and «25,4 mm», and shows each in inches', () => {
    setUnit('in');
    render(<Field />);
    input().focus();
    for (const [text, mm, value] of [
      ['1 1/2', 38.1, '1,5'],
      ['1-1/4"', 31.75, '1,25'],
      ['25,4 mm', 25.4, '1'],
    ] as const) {
      confirm(text);
      expect(Number(shown())).toBeCloseTo(mm, 9);
      expect(input().value, text).toBe(value);
    }
  });

  test('cm: arrows step 0,1 cm; Shift 1 cm; Alt 0,01 cm', () => {
    setUnit('cm');
    render(<Field initial={10} />);
    input().focus();
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect([Number(shown()), input().value]).toEqual([11, '1,1']);
    fireEvent.keyDown(input(), { key: 'ArrowUp', shiftKey: true });
    expect([Number(shown()), input().value]).toEqual([21, '2,1']);
    fireEvent.keyDown(input(), { key: 'ArrowDown', altKey: true });
    expect(Number(shown())).toBeCloseTo(20.9, 9);
    expect(input().value).toBe('2,09');
  });

  test('in: arrows step 1/16 in; Shift 1/2 in; Alt 1/64 in', () => {
    setUnit('in');
    render(<Field initial={38.1} range={{ min: 0, max: 100 }} />);
    input().focus();
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(Number(shown())).toBeCloseTo(38.1 + 25.4 / 16, 9);
    expect(input().value).toBe('1,563');
    fireEvent.keyDown(input(), { key: 'ArrowUp', shiftKey: true });
    expect(Number(shown())).toBeCloseTo(38.1 + 25.4 / 16 + 12.7, 9);
    expect(input().value).toBe('2,063');
    fireEvent.keyDown(input(), { key: 'ArrowUp', altKey: true });
    expect(Number(shown())).toBeCloseTo(38.1 + 25.4 / 16 + 12.7 + 25.4 / 64, 9);
    expect(input().value).toBe('2,078');
  });

  test('cm: out of range the field says «Máximo 5 cm» or «Mínimo 0 cm», and confirming keeps the limit', () => {
    setUnit('cm');
    render(<Field />);
    input().focus();
    type('7');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(helper()).toBe('Máximo 5 cm');
    expect(shown()).toBe('50');
    type('-1');
    expect(helper()).toBe('Mínimo 0 cm');
    expect(shown()).toBe('0');
    type('9');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect([shown(), input().value, helper(), input().getAttribute('aria-invalid')]).toEqual(['50', '5', null, null]);
  });

  test('in: the limit is said in inches', () => {
    setUnit('in');
    render(<Field />);
    input().focus();
    type('3');
    expect(helper()).toBe('Máximo 1,969 in');
  });

  test('cm: confirming 0 where the minimum is 0,07 cm (a 1 % width) keeps the minimum', () => {
    setUnit('cm');
    const min = 67.733 / 100;
    render(<Field initial={67.733} range={{ min, max: 677.33 }} />);
    input().focus();
    type('0');
    expect(helper()).toBe('Mínimo 0,07 cm');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(Number(shown())).toBeCloseTo(min, 9);
    expect(input().value).toBe('0,07');
  });

  test('in: something unreadable goes back to the value and says so in inches; half a fraction is not an error yet', () => {
    vi.useFakeTimers();
    setUnit('in');
    const applied: number[] = [];
    render(<Field onApply={(mm) => applied.push(mm)} />);
    input().focus();
    type('1 1/');
    expect(applied).toEqual([]);
    type('hola');
    fireEvent.change(input());
    expect(input().value).toBe('0,413');
    act(() => vi.advanceTimersByTime(100));
    expect(document.getElementById('live-assertive')!.textContent!.replace(/ /g, ' ')).toMatch(/«hola» no es una medida válida\. Se mantiene 0,413 in\./);
  });
});
