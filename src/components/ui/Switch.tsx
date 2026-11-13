import type { ReactNode } from 'react';

/** A labeled on/off switch with a hint (a checkbox with role="switch"). */
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
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  'aria-keyshortcuts'?: string;
  'data-single'?: string;
}) {
  return (
    <div className="switch-row">
      <label htmlFor={id}>
        {label}
        <span className="switch-hint" id={`${id}-hint`}>
          {hint}
        </span>
      </label>
      <input type="checkbox" role="switch" id={id} aria-describedby={`${id}-hint`} checked={checked} onChange={(e) => onChange(e.target.checked)} {...rest} />
    </div>
  );
}
