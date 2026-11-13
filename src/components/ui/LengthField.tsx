// Length fields (X, Y, width, height, margin, gap, grid, paper): a text input
// with inputmode="decimal" that shows and accepts the chosen unit. It reads
// «2,5», «2.5 cm», «1/2 in»… (core/units.js), steps with the arrows (Shift:
// coarse; Alt: fine) and, if what was typed can't be read when confirmed, goes
// back to the previous value and announces it.

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type InputHTMLAttributes, type Ref } from 'react';
import { isPartialLength, parseLength, stepFor } from '../../core/units.js';
import { asSentence, t } from '../../copy/index.ts';
import { lengthText, lengthValue } from '../../services/measure.ts';
import { getPrefs, usePrefs } from '../../state/prefs.ts';
import { announce } from '../feedback/announcer.ts';

export interface LengthFieldHandle {
  /** Shows a value (in mm) unless the field is being typed in (e.g. live during a drag). */
  show(mm: number | null): void;
}

export interface LengthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type'> {
  /**
   * The current value in mm (the document's or the preference's), or null.
   * A getter: confirming reads it again right after applying.
   */
  value: () => number | null;
  /** Applies a valid value (`final`: it was confirmed). */
  apply: (mm: number, options: { final: boolean }) => void;
  /** The problem's text when a value isn't valid (e.g. out of range), or null. */
  check?: (mm: number) => string | null;
  /** Brings a value into the allowed range (for the arrows). */
  limit?: (mm: number) => number;
  /**
   * Shows the problem while typing (what can't become a length is explained
   * with `unreadable`; what is half typed, like «1/» or «2,», isn't yet).
   */
  problem?: (text: string | null) => void;
  unreadable?: string;
  /** True when it can't be edited for now. */
  busy?: () => boolean;
  ref?: Ref<LengthFieldHandle>;
  /** The input element (for focusing it from outside). */
  inputRef?: Ref<HTMLInputElement>;
}

const noProblem = () => null;
const same = (mm: number) => mm;
const nothing = () => {};
const never = () => false;

export function LengthField({ value, apply, check = noProblem, limit = same, problem = nothing, unreadable, busy = never, ref, inputRef, ...rest }: LengthFieldProps) {
  const input = useRef<HTMLInputElement | null>(null);
  // A unit change re-renders the field, which shows the value in the new unit.
  usePrefs((s) => s.unit);
  const props = useRef({ value, apply, check, limit, problem, unreadable, busy });
  useLayoutEffect(() => {
    props.current = { value, apply, check, limit, problem, unreadable, busy };
  });

  const show = (mm: number | null) => {
    const el = input.current;
    if (!el || document.activeElement === el) return;
    el.value = mm !== null && Number.isFinite(mm) ? lengthValue(mm) : '';
  };

  // Every render shows the current value, except while the person types in it.
  useLayoutEffect(() => show(value()));
  useImperativeHandle(ref, () => ({ show }), []);

  useEffect(() => {
    const el = input.current!;
    const read = () => parseLength(el.value, getPrefs().unit);

    const onInput = () => {
      const p = props.current;
      if (p.busy()) return;
      const mm = read();
      if (mm === null) return p.problem(isPartialLength(el.value, getPrefs().unit) ? null : (p.unreadable ?? t('units.unreadable')));
      const issue = p.check(mm);
      p.problem(issue);
      if (!issue) p.apply(mm, { final: false });
    };

    const confirm = () => {
      const p = props.current;
      if (p.busy()) return;
      const mm = read();
      const issue = mm === null ? null : p.check(mm);
      if (mm === null || issue) {
        const typed = el.value.trim();
        const current = p.value();
        el.value = current === null ? '' : lengthValue(current);
        p.problem(null);
        if (!typed || current === null) return; // empty: back to the previous value, nothing else
        const shown = lengthText(current);
        const text = issue ? t('units.invalidValue', { text: asSentence(issue), value: shown }) : t('units.invalid', { text: typed, value: shown });
        announce(text, { assertive: true });
        return;
      }
      p.problem(null);
      p.apply(mm, { final: true });
      const current = p.value();
      if (current !== null) el.value = lengthValue(current);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const p = props.current;
      if (e.key === 'Enter') {
        // Confirms without leaving the field (Enter's «change» doesn't arrive in every browser).
        confirm();
        return;
      }
      if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.ctrlKey || e.metaKey || p.busy()) return;
      e.preventDefault();
      const size = e.altKey ? 'fine' : e.shiftKey ? 'coarse' : 'normal';
      const step = stepFor(getPrefs().unit, size).mm;
      // If the field shows the current (rounded) value, it starts from the exact value.
      const current = p.value();
      const base = current !== null && el.value === lengthValue(current) ? current : (read() ?? current ?? 0);
      const next = p.limit(base + (e.key === 'ArrowUp' ? step : -step));
      if (p.check(next)) return;
      p.problem(null);
      p.apply(next, { final: false });
      el.value = lengthValue(next);
    };

    // Leaving the field reformats it with what the state kept.
    const onBlur = () => setTimeout(() => show(props.current.value()));

    el.addEventListener('input', onInput);
    el.addEventListener('change', confirm);
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('change', confirm);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('blur', onBlur);
    };
  }, []);

  return (
    <input
      ref={(el) => {
        input.current = el;
        if (typeof inputRef === 'function') inputRef(el);
        else if (inputRef) inputRef.current = el;
      }}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      {...rest}
    />
  );
}
