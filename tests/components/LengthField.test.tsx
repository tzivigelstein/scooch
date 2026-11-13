// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LengthField } from '../../src/components/ui/LengthField.tsx';
import { setUnit } from '../../src/state/prefs.ts';

function Field({ initial = 10.5, check, onApply }: { initial?: number; check?: (mm: number) => string | null; onApply?: (mm: number, final: boolean) => void }) {
  const [mm, setMm] = useState(initial);
  return (
    <>
      <LengthField
        id="field"
        aria-label="Largo"
        value={() => mm}
        check={check}
        limit={(v) => Math.max(0, Math.min(50, v))}
        apply={(v, { final }) => {
          setMm(v);
          onApply?.(v, final);
        }}
      />
      <output>{mm}</output>
      <button type="button">otro</button>
      <div id="live-polite" />
      <div id="live-assertive" />
    </>
  );
}

const input = () => document.getElementById('field') as HTMLInputElement;
const type = (text: string) => fireEvent.input(input(), { target: { value: text } });

beforeEach(() => setUnit('mm'));
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
    type('2,');
    expect(applied).toHaveLength(2); // «2,» reads as 2 mm; nothing breaks while typing
    fireEvent.change(input());
    expect(applied.at(-1)?.[1]).toBe(true);
  });

  test('arrows step from the exact value (Shift coarse, Alt fine), within the limit', () => {
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
    expect(document.getElementById('live-assertive')!.textContent).toMatch(/«hola» no es una medida válida\. Se mantiene 10,5\u00a0mm\./);
  });

  test('a value that fails the check is not applied', () => {
    const applied: number[] = [];
    render(<Field check={(mm) => (mm > 0 ? null : 'La medida tiene que ser mayor que 0')} onApply={(mm) => applied.push(mm)} />);
    input().focus();
    type('0');
    expect(applied).toEqual([]);
  });

  test('typing is never overwritten by a render', () => {
    render(<Field />);
    input().focus();
    input().value = '12,3';
    act(() => setUnit('cm'));
    expect(input().value).toBe('12,3');
  });
});
