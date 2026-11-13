import type { InputHTMLAttributes, ReactNode } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Extra attributes for the radio (a tooltip, a shortcut…). */
  input?: InputHTMLAttributes<HTMLInputElement> & Record<`data-${string}`, string | undefined>;
}

/** A row of radio chips: one choice among a few. */
export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  className = 'segmented chips',
  id,
  labelledBy,
  label,
}: {
  name: string;
  value: T | null;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  id?: string;
  /** Names the group (it becomes a radiogroup): an element's id, or a text. */
  labelledBy?: string;
  label?: string;
}) {
  const group = labelledBy || label ? { role: 'radiogroup', 'aria-labelledby': labelledBy, 'aria-label': label } : {};
  return (
    <div id={id} className={className} {...group}>
      {options.map((option) => (
        <label key={option.value} className="seg">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={(e) => {
              if (e.target.checked) onChange(option.value);
            }}
            {...option.input}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
