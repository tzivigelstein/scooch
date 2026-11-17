// @vitest-environment jsdom
// The select (ui/Select.tsx), a select-only combobox: its roles, names and
// states, the keys that open it, go through the options and choose (or close
// without choosing), typing to jump, the pointer, and what it says about the
// option being looked at. Where the list opens, the preview on the canvas and
// axe are in e2e/specs/canvas-previews.spec.ts and accessibility.spec.ts.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Select, type SelectOption } from '../../src/components/ui/Select.tsx';

const OPTIONS: SelectOption[] = [
  { value: 'original', label: 'Original' },
  { value: '9x13', label: '9 × 13 · 88,9 × 127 mm', group: 'Fotos' },
  { value: '10x15', label: '10 × 15 · 101,6 × 152,4 mm', group: 'Fotos' },
  { value: '13x18', label: '13 × 18 · 127 × 177,8 mm', group: 'Fotos' },
  { value: 'id-4x4', label: 'Carné 4 × 4 · 40 × 40 mm', group: 'Documentos' },
  { value: 'passport', label: 'Pasaporte 3,5 × 4,5 · 35 × 45 mm', group: 'Documentos' },
  { value: 'instant', label: 'Instantánea · 88 × 107 mm', group: 'Otros' },
];

let clock = 0;
let chosen: string[] = [];
let lookedAt: (string | undefined)[] = [];

function Harness({ initial = '10x15', disabled = false }: { initial?: string; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <span id="size-label">Tamaño de foto</span>
      <Select
        id="size"
        labelledBy="size-label"
        value={value}
        valueLabel="Mixto"
        options={OPTIONS}
        disabled={disabled}
        onChange={(next) => {
          chosen.push(next);
          setValue(next);
        }}
        looking={(size) => {
          lookedAt.push(size);
          return { 'data-looking': size };
        }}
      />
      <button type="button" id="after">
        Después
      </button>
    </>
  );
}

beforeEach(() => {
  // Typing to jump keeps the letters typed within 600 ms: the test sets the time.
  clock = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  chosen = [];
  lookedAt = [];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const combobox = () => screen.getByRole('combobox');
const list = () => document.getElementById('size-list')!;
const active = () => {
  const id = combobox().getAttribute('aria-activedescendant');
  return id ? document.getElementById(id)!.textContent : null;
};
const press = (key: string, more: object = {}) => fireEvent.keyDown(combobox(), { key, ...more });
const open = () => {
  act(() => combobox().focus());
  press('ArrowDown');
};

describe('what it is', () => {
  test('a combobox named by its label, showing the chosen option, that controls a hidden listbox of the same name', () => {
    render(<Harness />);
    const button = screen.getByRole('combobox', { name: 'Tamaño de foto' });
    expect(button.textContent).toBe('10 × 15 · 101,6 × 152,4 mm');
    expect(button.getAttribute('aria-haspopup')).toBe('listbox');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('size-list');
    expect(button.hasAttribute('aria-activedescendant')).toBe(false);
    expect(list().getAttribute('role')).toBe('listbox');
    expect(list().getAttribute('aria-labelledby')).toBe('size-label');
    expect(list().hidden).toBe(true);
  });

  test('open: expanded, its options in named groups, the chosen one selected and looked at', () => {
    render(<Harness />);
    open();
    expect(combobox().getAttribute('aria-expanded')).toBe('true');
    expect(list().hidden).toBe(false);
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(OPTIONS.map((o) => o.label));
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'false', 'false', 'false', 'false']);
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-labelledby')).map((id) => document.getElementById(id!)!.textContent)).toEqual(['Fotos', 'Documentos', 'Otros']);
    expect(screen.getByRole('group', { name: 'Documentos' }).querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(active()).toBe('10 × 15 · 101,6 × 152,4 mm');
    expect(document.activeElement).toBe(combobox());
  });

  test('a value that is no option: the button says so, nothing is selected or looked at when it opens, and ↓ goes to the first option', () => {
    render(<Harness initial="mixed" />);
    expect(combobox().textContent).toBe('Mixto');
    open();
    expect(screen.getAllByRole('option').some((o) => o.getAttribute('aria-selected') === 'true')).toBe(false);
    expect(active()).toBeNull();
    press('ArrowDown');
    expect(active()).toBe('Original');
  });

  test('reached with Tab like a native select (a focusable element, not a button, which Safari’s Tab skips)', () => {
    render(<Harness />);
    expect(combobox().tagName).toBe('DIV');
    expect(combobox().tabIndex).toBe(0);
  });

  test('disabled: said so, out of the Tab order, and it doesn’t open', () => {
    render(<Harness disabled />);
    expect(combobox().getAttribute('aria-disabled')).toBe('true');
    expect(combobox().tabIndex).toBe(-1);
    fireEvent.click(combobox());
    press('ArrowDown');
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
  });
});

describe('the keyboard', () => {
  test.each(['ArrowDown', 'ArrowUp', 'Enter', ' '])('%s opens it on the chosen option without choosing', (key) => {
    render(<Harness />);
    act(() => combobox().focus());
    press(key);
    expect(combobox().getAttribute('aria-expanded')).toBe('true');
    expect(active()).toBe('10 × 15 · 101,6 × 152,4 mm');
    expect(chosen).toEqual([]);
  });

  test('Home and End open it on the first and the last option', () => {
    render(<Harness />);
    act(() => combobox().focus());
    press('End');
    expect(active()).toBe('Instantánea · 88 × 107 mm');
    press('Escape');
    press('Home');
    expect(active()).toBe('Original');
  });

  test('open, the arrows move one option and stop at the ends; Home, End, Page Up and Page Down jump', () => {
    render(<Harness />);
    open();
    press('ArrowDown');
    expect(active()).toBe('13 × 18 · 127 × 177,8 mm');
    press('ArrowUp');
    press('ArrowUp');
    press('ArrowUp');
    press('ArrowUp');
    expect(active()).toBe('Original');
    press('End');
    press('ArrowDown');
    expect(active()).toBe('Instantánea · 88 × 107 mm');
    press('PageUp');
    expect(active()).toBe('Original');
    press('PageDown');
    expect(active()).toBe('Instantánea · 88 × 107 mm');
    press('Home');
    expect(active()).toBe('Original');
    expect(chosen).toEqual([]);
  });

  test('Enter chooses the option looked at and closes, the focus staying on the button', () => {
    render(<Harness />);
    open();
    press('ArrowDown');
    press('Enter');
    expect(chosen).toEqual(['13x18']);
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
    expect(combobox().textContent).toBe('13 × 18 · 127 × 177,8 mm');
    expect(document.activeElement).toBe(combobox());
  });

  test('Space chooses too, without scrolling the page', () => {
    render(<Harness />);
    open();
    press('ArrowUp');
    expect(press(' ')).toBe(false); // default prevented
    expect(chosen).toEqual(['9x13']);
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
  });

  test('choosing the option already chosen changes nothing', () => {
    render(<Harness />);
    open();
    press('Enter');
    expect(chosen).toEqual([]);
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
  });

  test('Esc closes without choosing, keeps the focus and goes no further (the panel stays open)', () => {
    render(<Harness />);
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    open();
    press('ArrowDown');
    press('Escape');
    document.removeEventListener('keydown', outside);
    expect(chosen).toEqual([]);
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(combobox());
    expect(outside).not.toHaveBeenCalled();
  });

  test('closed, Esc is left to the page', () => {
    render(<Harness />);
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    act(() => combobox().focus());
    press('Escape');
    document.removeEventListener('keydown', outside);
    expect(outside).toHaveBeenCalledTimes(1);
  });

  test('Tab closes without choosing and lets the focus move on', () => {
    render(<Harness />);
    open();
    press('ArrowDown');
    const tab = press('Tab');
    expect(tab).toBe(true); // not prevented: the browser moves the focus
    expect(chosen).toEqual([]);
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
  });

  test('Ctrl and ⌘ combinations are left to the app’s shortcuts', () => {
    render(<Harness />);
    open();
    expect(press('z', { ctrlKey: true })).toBe(true);
    expect(press('z', { metaKey: true })).toBe(true);
    expect(active()).toBe('10 × 15 · 101,6 × 152,4 mm');
  });

  test('typing jumps to the next option that starts with the letters (accents and case aside), and opens it when closed', () => {
    render(<Harness />);
    act(() => combobox().focus());
    press('1');
    expect(combobox().getAttribute('aria-expanded')).toBe('true');
    expect(active()).toBe('13 × 18 · 127 × 177,8 mm');
    clock += 1000;
    press('1');
    expect(active()).toBe('10 × 15 · 101,6 × 152,4 mm');
    clock += 1000;
    press('i');
    expect(active()).toBe('Instantánea · 88 × 107 mm');
    clock += 1000;
    press('C');
    expect(active()).toBe('Carné 4 × 4 · 40 × 40 mm');
    clock += 1000;
    press('p');
    clock += 100;
    press('a');
    expect(active()).toBe('Pasaporte 3,5 × 4,5 · 35 × 45 mm');
    expect(chosen).toEqual([]);
  });

  test('a space typed right after letters is part of the search, not a choice', () => {
    render(<Harness />);
    open();
    press('9');
    clock += 100;
    press(' ');
    expect(chosen).toEqual([]);
    expect(active()).toBe('9 × 13 · 88,9 × 127 mm');
    clock += 1000;
    press(' ');
    expect(chosen).toEqual(['9x13']);
  });
});

describe('the pointer and the focus', () => {
  test('a click opens and closes it; a click on an option chooses it', () => {
    render(<Harness />);
    fireEvent.click(combobox());
    expect(combobox().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(combobox());
    fireEvent.click(combobox());
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(combobox());
    fireEvent.click(screen.getByRole('option', { name: 'Carné 4 × 4 · 40 × 40 mm' }));
    expect(chosen).toEqual(['id-4x4']);
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
  });

  test('moving over an option looks at it; a press on the list keeps the focus on the button', () => {
    render(<Harness />);
    fireEvent.click(combobox());
    fireEvent.pointerMove(screen.getByRole('option', { name: 'Original' }));
    expect(active()).toBe('Original');
    expect(fireEvent.mouseDown(screen.getByRole('option', { name: 'Original' }))).toBe(false);
  });

  test('a press elsewhere or the focus leaving closes it without choosing', () => {
    render(<Harness />);
    open();
    fireEvent.pointerDown(document.getElementById('after')!);
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
    open();
    act(() => document.getElementById('after')!.focus());
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
    expect(chosen).toEqual([]);
  });

  test('what it says about the option looked at: nothing closed or on the chosen one, the option otherwise', () => {
    render(<Harness />);
    const box = () => combobox().parentElement!.getAttribute('data-looking');
    expect(box()).toBeNull();
    open();
    expect(box()).toBeNull();
    press('ArrowDown');
    expect(box()).toBe('13x18');
    press('Escape');
    expect(box()).toBeNull();
    expect(lookedAt.filter(Boolean)).toEqual(['13x18']);
  });
});
