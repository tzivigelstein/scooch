import type { ReactNode } from 'react';
import './Switch.css';

/**
 * A labeled on/off switch, with an optional hint (a checkbox with
 * role="switch"). The whole row is its label: a click or a tap anywhere on
 * it toggles the switch, once, with no dead space between the text and it.
 */
export function Switch({
  id,
  label,
  hint,
  checked,
  onChange,
  ...rest
}: {
  id: string;
  label: ReactNode;
  hint?: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  'aria-keyshortcuts'?: string;
  'data-single'?: string;
  'data-tip'?: string;
  'data-kbd'?: string;
}) {
  return (
    <label className="switch-row" htmlFor={id}>
      {label}
      {hint && (
        <span className="switch-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      <input type="checkbox" role="switch" id={id} aria-describedby={hint ? `${id}-hint` : undefined} checked={checked} onChange={(e) => onChange(e.target.checked)} {...rest} />
    </label>
  );
}
