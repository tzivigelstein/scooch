import type { ReactNode } from 'react';

/** A labeled on/off switch, with an optional hint (a checkbox with role="switch"). */
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
    <div className="switch-row">
      <label htmlFor={id}>
        {label}
        {hint && (
          <span className="switch-hint" id={`${id}-hint`}>
            {hint}
          </span>
        )}
      </label>
      <input type="checkbox" role="switch" id={id} aria-describedby={hint ? `${id}-hint` : undefined} checked={checked} onChange={(e) => onChange(e.target.checked)} {...rest} />
    </div>
  );
}
