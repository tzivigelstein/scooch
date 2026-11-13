// A menu (role="menu") that opens at a point: the arrows, Home and End move
// between items, typing jumps to the next item starting with those letters,
// Enter or Space choose, Esc and Tab close it (the focus goes back). Disabled
// items stay reachable and say why. It stays inside the viewport and closes
// when the page scrolls, the window resizes or the focus or a press goes
// elsewhere.

import type { LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { keyLabel } from '../../copy/index.ts';
import { announce } from '../feedback/announcer.ts';
import { Icon } from './Icon.tsx';

export interface MenuEntry {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Shortcut hint (keyLabel names, e.g. 'Mod+D'), shown at the right. */
  keys?: string;
  /** Value of aria-keyshortcuts. */
  aria?: string;
  /** Why it can't be chosen now (it is disabled), or null. */
  disabled?: string | null;
  /** A separator before it. */
  separator?: boolean;
  run: () => void;
}

const EDGE = 8;
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Where a menu opens: at window point (x, y), by default below it and to its
 * right; `end`: to its left (ending at x); `above`: above it. It flips when
 * that doesn't fit and always stays inside the window.
 */
export interface MenuPlace {
  x: number;
  y: number;
  end?: boolean;
  above?: boolean;
}

export function Menu({ id, label, entries, at, onClose }: { id: string; label: string; entries: readonly MenuEntry[]; at: MenuPlace; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() => Math.max(0, entries.findIndex((entry) => !entry.disabled)));
  const typed = useRef({ text: '', at: 0 });
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });

  // Inside the viewport: on the side asked for when it fits, otherwise flipped.
  useLayoutEffect(() => {
    const el = menu.current!;
    const { offsetWidth: w, offsetHeight: h } = el;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const right = at.x + w <= vw - EDGE;
    const left = at.end ? (at.x - w >= EDGE || !right ? at.x - w : at.x) : right ? at.x : at.x - w;
    const below = at.y + h <= vh - EDGE;
    const top = at.above ? (at.y - h >= EDGE || !below ? at.y - h : at.y) : below ? at.y : at.y - h;
    el.style.left = `${Math.round(Math.max(EDGE, Math.min(left, vw - EDGE - w)))}px`;
    el.style.top = `${Math.round(Math.max(EDGE, Math.min(top, vh - EDGE - h)))}px`;
  }, [at.x, at.y, at.end, at.above]);

  useEffect(() => {
    menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[active]?.focus({ preventScroll: true });
  }, [active]);

  useEffect(() => {
    const el = menu.current!;
    const outside = (e: Event) => {
      if (!el.contains(e.target as Node)) close.current();
    };
    const leave = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) close.current();
    };
    const resized = () => close.current();
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', outside, true);
    window.addEventListener('resize', resized);
    el.addEventListener('focusout', leave);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', outside, true);
      window.removeEventListener('resize', resized);
      el.removeEventListener('focusout', leave);
    };
  }, []);

  const choose = (entry: MenuEntry) => {
    if (entry.disabled) return announce(entry.disabled);
    close.current();
    entry.run();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const last = entries.length - 1;
    const move = ({ ArrowDown: active === last ? 0 : active + 1, ArrowUp: active === 0 ? last : active - 1, Home: 0, End: last } as Record<string, number>)[e.key];
    e.stopPropagation();
    if (move !== undefined) {
      e.preventDefault();
      return setActive(move);
    }
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      return close.current();
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      return choose(entries[active]);
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Typing the first letters: to the next item that starts with them.
      const now = performance.now();
      const text = now - typed.current.at > 600 ? e.key : typed.current.text + e.key;
      typed.current = { text, at: now };
      const query = fold(text);
      const order = [...entries.keys()].map((i) => (active + (text.length > 1 ? 0 : 1) + i) % entries.length);
      const found = order.find((i) => fold(entries[i].label).startsWith(query));
      if (found !== undefined) setActive(found);
    }
  };

  return createPortal(
    <div ref={menu} id={id} className="menu" role="menu" aria-label={label} onKeyDown={onKeyDown}>
      {entries.map((entry, i) => (
        <div key={entry.id} role="none" className="menu-row">
          {entry.separator && <div className="menu-sep" role="separator" />}
          <div
            role="menuitem"
            id={`${id}-${entry.id}`}
            className="menu-item"
            tabIndex={i === active ? 0 : -1}
            aria-disabled={entry.disabled ? 'true' : undefined}
            aria-describedby={entry.disabled ? `${id}-${entry.id}-why` : undefined}
            aria-keyshortcuts={entry.aria}
            onClick={() => choose(entry)}
            onPointerEnter={() => setActive(i)}
          >
            <span className="menu-icon">{entry.icon && <Icon icon={entry.icon} />}</span>
            <span className="menu-label">{entry.label}</span>
            {entry.keys && (
              <span className="menu-keys" aria-hidden="true">
                {entry.keys.split(' ').map((key) => (
                  <kbd key={key}>{keyLabel(key)}</kbd>
                ))}
              </span>
            )}
            {entry.disabled && (
              <span id={`${id}-${entry.id}-why`} className="menu-why">
                {entry.disabled}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>,
    // Inside the main landmark (the canvas), where every menu of the app belongs.
    document.querySelector('main') ?? document.body
  );
}
