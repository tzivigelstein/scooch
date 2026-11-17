// A select-only combobox (the WAI-ARIA pattern for a custom <select>): a
// button that shows the chosen option and opens a listbox of options under
// it, or over it when there is more room there. The focus stays on the button
// while the list is open: aria-activedescendant says which option is being
// looked at, and the arrows, Home, End, Page Up, Page Down, typing its first
// letters or the pointer move it. Looking at an option chooses nothing (the
// canvas can preview it: see `looking`); Enter, Space or a click choose it.
// Esc, Tab, the focus or a press elsewhere, a scroll of the page and a resize
// close the list without choosing. The list is a popover in the top layer, so
// no panel clips it or scrolls with it.

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon.tsx';
import { typeahead } from './typeahead.ts';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
  /** The heading of the group it belongs to (options of a group come one after another). */
  group?: string;
}

/** The space kept between the list and the window's edge, and between the list and its button (px). */
const EDGE = 8;
const GAP = 4;
/** How many options Page Up and Page Down move. */
const PAGE = 10;

/** Without the Popover API (jsdom), the list is a fixed box over the page. */
const POPOVER = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

const isTyped = (e: KeyboardEvent) => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

/** Puts the list under the button (or over it, with more room there), at least as wide, inside the window. */
function place(list: HTMLElement, button: HTMLElement) {
  const r = button.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  list.style.minWidth = `${Math.round(r.width)}px`;
  list.style.maxHeight = '';
  const below = vh - r.bottom - GAP - EDGE;
  const above = r.top - GAP - EDGE;
  const down = list.offsetHeight <= below || below >= above;
  list.style.maxHeight = `${Math.floor(down ? below : above)}px`;
  const top = down ? r.bottom + GAP : r.top - GAP - list.offsetHeight;
  list.style.top = `${Math.round(top)}px`;
  list.style.left = `${Math.round(Math.max(EDGE, Math.min(r.left, vw - EDGE - list.offsetWidth)))}px`;
}

export function Select({
  id,
  labelledBy,
  value,
  valueLabel,
  options,
  onChange,
  looking,
  disabled,
}: {
  /** The button's id; the list's is `${id}-list` and each option's `${id}-${value}`. */
  id: string;
  /** The id of the visible label: it names the button and the list. */
  labelledBy: string;
  value: string;
  /** What the button shows when `value` is no option (several pieces with different values…). */
  valueLabel?: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  /**
   * Attributes for the control's box from the option being looked at: one
   * hovered or reached with the keyboard while the list is open, unless it is
   * the chosen one (choosing it changes nothing). undefined: none.
   */
  looking?: (value: string | undefined) => Record<string, string | undefined>;
  disabled?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef(typeahead());
  const chosen = options.findIndex((option) => option.value === value);
  const optionId = (index: number) => `${id}-${options[index].value}`;
  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const show = (index: number) => {
    if (disabled) return;
    setOpen(true);
    setActive(index);
    // Safari doesn't always focus what is clicked: the keys must reach the button.
    if (document.activeElement !== button.current) button.current?.focus({ preventScroll: true });
  };

  const choose = (index: number) => {
    close();
    if (index >= 0 && options[index].value !== value) onChange(options[index].value);
  };

  useLayoutEffect(() => {
    const el = list.current;
    if (!open || !el || !button.current) return;
    if (POPOVER) el.showPopover();
    place(el, button.current);
    return () => {
      if (POPOVER && el.matches(':popover-open')) el.hidePopover();
    };
  }, [open]);

  // The option looked at stays in view in the list.
  useLayoutEffect(() => {
    const el = list.current;
    const option = active >= 0 ? document.getElementById(optionId(active)) : null;
    if (!el || !option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  });

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    const scrolled = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', scrolled, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) close();
  }, [disabled]);

  const search = (key: string, from: number) => {
    const found = typed.current.find(
      key,
      options.map((option) => option.label),
      from
    );
    if (found >= 0) setActive(found);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || disabled) return;
    const last = options.length - 1;
    if (!open) {
      const to = ({ ArrowDown: chosen, ArrowUp: chosen, Home: 0, End: last, Enter: chosen, ' ': chosen } as Record<string, number>)[e.key];
      if (to === undefined && !isTyped(e)) return;
      e.preventDefault();
      e.stopPropagation();
      show(to ?? chosen);
      if (to === undefined) search(e.key, chosen);
      return;
    }
    if (e.key === 'Tab') return close();
    e.stopPropagation();
    const from = active < 0 ? chosen : active;
    const move = (
      {
        ArrowDown: active < 0 ? Math.max(chosen, 0) : Math.min(last, active + 1),
        ArrowUp: active < 0 ? Math.max(chosen, 0) : Math.max(0, active - 1),
        Home: 0,
        End: last,
        PageDown: Math.min(last, Math.max(from, 0) + PAGE),
        PageUp: Math.max(0, from - PAGE),
      } as Record<string, number>
    )[e.key];
    if (move !== undefined) {
      e.preventDefault();
      return setActive(move);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      return close();
    }
    if (e.key === 'Enter' || (e.key === ' ' && !typed.current.typing())) {
      e.preventDefault();
      return choose(active);
    }
    if (isTyped(e)) {
      e.preventDefault();
      search(e.key, active);
    }
  };

  // Options in their groups, as they come.
  const groups: { label?: string; start: number; items: number[] }[] = [];
  options.forEach((option, index) => {
    const current = groups.at(-1);
    if (current && current.label === option.group) current.items.push(index);
    else groups.push({ label: option.group, start: index, items: [index] });
  });
  const renderOption = (index: number) => {
    const option = options[index];
    const selected = index === chosen;
    return (
      <div
        key={option.value}
        id={optionId(index)}
        role="option"
        aria-selected={selected}
        className={index === active ? 'select-option is-active' : 'select-option'}
        onPointerMove={() => index !== active && setActive(index)}
        onClick={() => choose(index)}
      >
        <span className="select-check">{selected && <Icon icon={Check} />}</span>
        <span>{option.label}</span>
      </div>
    );
  };
  const lookedAt = open && active >= 0 && active !== chosen ? options[active].value : undefined;

  return (
    <div ref={box} className="select" {...looking?.(lookedAt)}>
      {/* Not a <button>: Safari's Tab, by default, reaches selects and text fields but skips buttons. */}
      <div
        ref={button}
        id={id}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        className="select-button"
        aria-labelledby={labelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-disabled={disabled || undefined}
        data-value={value}
        onClick={() => (open ? close() : show(chosen))}
        onKeyDown={onKeyDown}
        onBlur={close}
      >
        <span className="select-value">{chosen >= 0 ? options[chosen].label : valueLabel}</span>
        <Icon icon={ChevronDown} />
      </div>
      <div
        ref={list}
        id={`${id}-list`}
        role="listbox"
        aria-labelledby={labelledBy}
        className="select-list"
        popover={POPOVER ? 'manual' : undefined}
        hidden={!open}
        // A press on the list keeps the focus on the button.
        onMouseDown={(e) => e.preventDefault()}
      >
        {groups.map((group) =>
          group.label === undefined ? (
            group.items.map(renderOption)
          ) : (
            <div key={`group-${group.start}`} role="group" aria-labelledby={`${id}-group-${group.start}`}>
              <div id={`${id}-group-${group.start}`} role="presentation" className="select-group">
                {group.label}
              </div>
              {group.items.map(renderOption)}
            </div>
          )
        )}
      </div>
    </div>
  );
}
