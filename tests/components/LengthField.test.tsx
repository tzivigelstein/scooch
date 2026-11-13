// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LengthField } from '../../src/components/ui/LengthField.tsx';
import { getDocument, setDocument } from '../../src/state/document.ts';
import { commit, endEdit, historyDepth, resetHistory } from '../../src/state/history.ts';
import { setUnit } from '../../src/state/prefs.ts';
import { getView } from '../../src/state/view.ts';

function Field({ initial = 10.5, onApply }: { initial?: number; onApply?: (mm: number, final: boolean) => void }) {
  const [mm, setMm] = useState(initial);
  return (
    <>
      <LengthField
        id="field"
        aria-label="Largo"
        value={() => mm}
        range={() => ({ min: 0, max: 50 })}
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
