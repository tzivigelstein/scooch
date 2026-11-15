// A row of tabs (role="tablist"): one tab stop, the arrows, Home and End move
// between tabs and show them. The panels are the owner's (role="tabpanel",
// labelled by `tab-${value}` ids and hidden when not selected).

import type { KeyboardEvent, ReactNode } from 'react';
import './Tabs.css';

export interface TabOption<T extends string> {
  value: T;
  label: ReactNode;
  /** The id of the tab's panel (aria-controls). */
  panel: string;
  /** Extra attributes for the tab (a tooltip, a shortcut…). */
  attrs?: Record<string, string | undefined>;
}

export function Tabs<T extends string>({
  idPrefix,
  label,
  value,
  options,
  onChange,
  className = 'tabs',
}: {
  idPrefix: string;
  label: string;
  value: T;
  options: readonly TabOption<T>[];
  onChange: (value: T, how: { focus: boolean }) => void;
  className?: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((option) => option.value === value);
    const last = options.length - 1;
    const next = ({ ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last } as Record<string, number>)[e.key];
    if (next === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(options[next].value, { focus: true });
  };
  return (
    <div className={className} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={`${idPrefix}-${option.value}`}
            className="tab"
            aria-selected={selected}
            aria-controls={option.panel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value, { focus: false })}
            {...option.attrs}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
