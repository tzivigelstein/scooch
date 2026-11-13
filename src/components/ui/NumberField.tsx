// The field primitive behind every measurement and number (lengths, scale,
// copies). While typing, the preview uses the value clamped to the field's
// range (what confirming will keep) and the field says inline when the typed
// value is out of range; what can't be read previews nothing. Problem notices
// wait while it is being edited. Confirming (Enter, change, blur) keeps the
// clamped value, in one undo step, or none if nothing changed; Esc goes back
// to how it was. Arrows step (Shift: coarse; Alt: fine).

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type Ref } from 'react';
import { asSentence, t } from '../../copy/index.ts';
import { cancelEdit } from '../../state/history.ts';
import { setView } from '../../state/view.ts';
import { announce } from '../feedback/announcer.ts';

export interface NumberFieldHandle {
  /** Shows a value unless the field is being typed in (e.g. live during a drag). */
  show(value: number | null): void;
}

export interface Range {
  min: number;
  max: number;
}

export type StepSize = 'fine' | 'normal' | 'coarse';

export interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'> {
  /** The current value (the document's or the preference's), or null. Read again after applying. */
  value: () => number | null;
  /** Applies a value already within range (`final`: it was confirmed). */
  apply: (value: number, options: { final: boolean }) => void;
  /** The values the field accepts (what is typed beyond them is clamped). */
  range?: () => Range | null;
  /** Another problem with a readable value (not its range), or null. */
  check?: (value: number) => string | null;
  /** Reads what was typed; null when it can't be read. */
  parse: (text: string) => number | null;
  /** Is it the beginning of something readable (still being typed)? */
  isPartial?: (text: string) => boolean;
  /** The value as the field shows it. */
  format: (value: number) => string;
  /** The value for a sentence (with its unit): «50 mm», «1000 %». */
  describe: (value: number) => string;
  /** The arrows' step. */
  stepBy?: (size: StepSize) => number;
  /** Shows a problem with what is typed elsewhere (e.g. under the custom paper). */
  problem?: (text: string | null) => void;
  /** What to say about text that can't be read. */
  unreadable?: string;
  /** True when it can't be edited for now. */
  busy?: () => boolean;
  /** The undo key of this field's edit, to drop it when nothing changed or on Esc. */
  editKey?: () => string | null;
  /** After Enter confirmed (e.g. «Duplicar ×N» runs). */
  onEnter?: () => void;
  ref?: Ref<NumberFieldHandle>;
  inputRef?: Ref<HTMLInputElement>;
}

const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const clampTo = (value: number, range: Range | null) => (range ? Math.min(range.max, Math.max(range.min, value)) : value);

export function NumberField({
  value,
  apply,
  range,
  check,
  parse,
  isPartial,
  format,
  describe,
  stepBy,
  problem,
  unreadable,
  busy,
  editKey,
  onEnter,
  ref,
  inputRef,
  id,
  'aria-describedby': describedBy,
  ...rest
}: NumberFieldProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const props = useRef({ value, apply, range, check, parse, isPartial, format, describe, stepBy, problem, unreadable, busy, editKey, onEnter });
  useLayoutEffect(() => {
    props.current = { value, apply, range, check, parse, isPartial, format, describe, stepBy, problem, unreadable, busy, editKey, onEnter };
  });
  // The edit in progress: the value before it, and whether the person changed anything.
  const edit = useRef<{ start: number | null; dirty: boolean }>({ start: null, dirty: false });

  const show = (v: number | null) => {
    const el = input.current;
    if (!el || document.activeElement === el) return;
    el.value = v !== null && Number.isFinite(v) ? props.current.format(v) : '';
  };

  // Every render shows the current value, except while the person types in it.
  useLayoutEffect(() => show(value()));
  useImperativeHandle(ref, () => ({ show }), []);

  useEffect(() => {
    const el = input.current!;
    const limitText = (v: number, r: Range | null) =>
      !r ? null : v > r.max + 1e-9 ? t('units.max', { value: props.current.describe(r.max) }) : v < r.min - 1e-9 ? t('units.min', { value: props.current.describe(r.min) }) : null;

    const begin = () => {
      if (edit.current.dirty) return;
      edit.current = { start: props.current.value(), dirty: true };
      setView({ editing: true });
    };

    const finish = (shown: number | null) => {
      edit.current = { start: null, dirty: false };
      setLimit(null);
      props.current.problem?.(null);
      setView({ editing: false });
      el.value = shown !== null && Number.isFinite(shown) ? props.current.format(shown) : '';
    };

    // Back to how it was before the edit, leaving nothing to undo.
    const revert = () => {
      const p = props.current;
      const { start } = edit.current;
      const key = p.editKey?.() ?? null;
      if (!(key && cancelEdit(key)) && start !== null && p.value() !== start) p.apply(start, { final: true });
      finish(p.value());
    };

    const onInput = () => {
      const p = props.current;
      if (p.busy?.()) return;
      begin();
      const v = p.parse(el.value);
      if (v === null) {
        setLimit(null);
        p.problem?.(p.isPartial?.(el.value) ? null : (p.unreadable ?? t('units.unreadable')));
        return;
      }
      const issue = p.check?.(v) ?? null;
      p.problem?.(issue);
      if (issue) return setLimit(null);
      const r = p.range?.() ?? null;
      setLimit(limitText(v, r));
      p.apply(clampTo(v, r), { final: false });
    };

    const confirm = () => {
      const p = props.current;
      if (p.busy?.()) return;
      // Nothing typed (focus and leave, or Enter on the shown value): nothing to apply.
      if (!edit.current.dirty) return finish(p.value());
      const v = p.parse(el.value);
      const issue = v === null ? null : (p.check?.(v) ?? null);
      if (v === null || issue) {
        const typed = el.value.trim();
        const { start } = edit.current;
        revert();
        if (!typed || start === null) return; // empty: back to the previous value, nothing else
        const shown = p.describe(start);
        const text = issue ? t('units.invalidValue', { text: asSentence(issue), value: shown }) : t('units.invalid', { text: typed, value: shown });
        announce(text, { assertive: true });
        return;
      }
      const next = clampTo(v, p.range?.() ?? null);
      const { start } = edit.current;
      if (start !== null && same(next, start)) return revert();
      p.apply(next, { final: true });
      finish(p.value());
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const p = props.current;
      if (e.key === 'Enter') {
        // Confirms without leaving the field (Enter's «change» doesn't arrive in every browser).
        confirm();
        p.onEnter?.();
        return;
      }
      if (e.key === 'Escape' && edit.current.dirty) {
        // The edit is undone; then Esc goes on doing what it does in a panel.
        revert();
        return;
      }
      if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.ctrlKey || e.metaKey || p.busy?.() || !p.stepBy) return;
      e.preventDefault();
      const amount = p.stepBy(e.altKey ? 'fine' : e.shiftKey ? 'coarse' : 'normal');
      // If the field shows the current (rounded) value, it starts from the exact value.
      const current = p.value();
      const base = current !== null && el.value === p.format(current) ? current : (p.parse(el.value) ?? current ?? 0);
      const next = clampTo(base + (e.key === 'ArrowUp' ? amount : -amount), p.range?.() ?? null);
      if (p.check?.(next)) return;
      begin();
      setLimit(null);
      p.problem?.(null);
      p.apply(next, { final: false });
      el.value = p.format(next);
    };

    el.addEventListener('input', onInput);
    el.addEventListener('change', confirm);
    el.addEventListener('blur', confirm);
    el.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('change', confirm);
      el.removeEventListener('blur', confirm);
      el.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const limitId = `${id}-limit`;
  return (
    <>
      <input
        {...rest}
        ref={(el) => {
          input.current = el;
          if (typeof inputRef === 'function') inputRef(el);
          else if (inputRef) inputRef.current = el;
        }}
        id={id}
        aria-invalid={limit ? 'true' : rest['aria-invalid']}
        aria-describedby={[limit ? limitId : '', describedBy ?? ''].filter(Boolean).join(' ') || undefined}
      />
      {limit && (
        // Hidden from the label's name; the field's description reads it.
        <span id={limitId} className="field-limit" aria-hidden="true">
          {limit}
        </span>
      )}
    </>
  );
}
