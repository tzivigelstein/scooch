// Tooltips for the elements with `data-tip` (and `data-kbd` for the shortcut,
// `data-tip-note` for a note). They show with the mouse (after a short delay)
// and with the keyboard focus; the pointer can move onto them, and Esc closes
// them without moving the focus (WCAG 1.4.13).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clamp } from '../../core/util.ts';
import { usePrefs } from '../../state/prefs.ts';
import './Tooltip.css';

interface Tip {
  el: HTMLElement;
  label: string;
  keys: string[];
  note: string | null;
}

export function Tooltip() {
  const tip = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Tip | null>(null);
  const singleKeys = usePrefs((s) => s.singleKeys);
  const state = useRef({ target: null as HTMLElement | null, showTimer: 0 as ReturnType<typeof setTimeout> | 0, hideTimer: 0 as ReturnType<typeof setTimeout> | 0, lastPointer: -Infinity, singleKeys });

  // The shortcut shows unless it is a single-key one and those are off.
  const tipOf = (el: HTMLElement): Tip => ({
    el,
    label: el.dataset.tip ?? '',
    keys: el.dataset.kbd && (el.dataset.single === undefined || state.current.singleKeys) ? el.dataset.kbd.split(' ') : [],
    note: el.dataset.tipNote ?? null,
  });

  useEffect(() => {
    const s = state.current;
    const hide = () => {
      clearTimeout(s.showTimer);
      clearTimeout(s.hideTimer);
      if (!s.target) return;
      s.target = null;
      setShown(null);
    };
    const show = (el: HTMLElement) => {
      clearTimeout(s.hideTimer);
      if (!el.isConnected || el.closest('[hidden]')) return;
      s.target = el;
      setShown(tipOf(el));
    };
    const scheduleHide = () => {
      clearTimeout(s.hideTimer);
      s.hideTimer = setTimeout(hide, 120);
    };
    const onPointerOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const target = e.target as Element;
      const el = target.closest?.<HTMLElement>('[data-tip]') ?? null;
      if (el === s.target) return clearTimeout(s.hideTimer);
      if (tip.current?.contains(target)) return clearTimeout(s.hideTimer);
      if (!el) return;
      clearTimeout(s.showTimer);
      // With no tooltip showing there is nothing to hide: the hide that leaving
      // another button scheduled would only cancel this one before it shows.
      if (!s.target) clearTimeout(s.hideTimer);
      s.showTimer = setTimeout(() => show(el), s.target ? 0 : 300);
    };
    const onPointerOut = (e: PointerEvent) => {
      const target = e.target as Element;
      const el = target.closest?.('[data-tip]');
      const to = e.relatedTarget as Node | null;
      if (el && el.contains(to)) return;
      if (!el && !tip.current?.contains(target)) return;
      clearTimeout(s.showTimer);
      if (to && (tip.current?.contains(to) || s.target?.contains(to))) return;
      scheduleHide();
    };
    const onFocusIn = (e: FocusEvent) => {
      clearTimeout(s.showTimer); // the focus wins over a pending hover
      const el = (e.target as Element).closest?.<HTMLElement>('[data-tip]');
      const fromPointer = performance.now() - s.lastPointer < 800;
      if (el && el.matches(':focus-visible') && !fromPointer) show(el);
      else if (s.target) hide();
    };
    const onPointerDown = () => {
      s.lastPointer = performance.now();
      hide();
    };
    // With the keyboard, the next focus is a keyboard one.
    const onKeyDown = () => (s.lastPointer = -Infinity);
    // A scroll that moves the element (the page's, or a box it is in) would
    // leave the tooltip behind. If the element has the focus and is still in
    // view, the tooltip follows it: the browser scrolls a field into view
    // right after the focus reaches it. Otherwise the tooltip goes, and one
    // about to show for the pointer too. Another scroll (the canvas scrolling
    // to the selection while a field of the panel has the focus) leaves a
    // tooltip showing.
    const onScroll = (e: Event) => {
      const scrolled = e.target;
      const el = s.target;
      if (el && scrolled instanceof Element && !scrolled.contains(el)) return;
      if (!el || !el.contains(document.activeElement)) return hide();
      const r = el.getBoundingClientRect();
      const box = scrolled instanceof Element ? scrolled.getBoundingClientRect() : null;
      const inView = r.bottom >= Math.max(0, box?.top ?? 0) && r.top <= Math.min(window.innerHeight, box?.bottom || Infinity) && r.right >= 0 && r.left <= window.innerWidth;
      if (!inView) return hide();
      clearTimeout(s.showTimer);
      setShown(tipOf(el));
    };
    // Esc closes the tooltip without moving the focus and does nothing else. In
    // a panel or a dialog, Esc also does its own thing (back to the piece,
    // close), and the tooltip goes with it.
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !s.target) return;
      const inOverlay = (e.target as Element).closest?.('.panel, dialog') || s.target.closest('.panel, dialog');
      hide();
      if (inOverlay) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keydown', onEscape, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keydown', onEscape, true);
      window.removeEventListener('scroll', onScroll, true);
      clearTimeout(s.showTimer);
      clearTimeout(s.hideTimer);
    };
  }, []);

  // A preference change redraws the visible tooltip.
  useEffect(() => {
    state.current.singleKeys = singleKeys;
    if (state.current.target) setShown(tipOf(state.current.target));
  }, [singleKeys]);

  // Below if it belongs to the top bar or there is no room above; otherwise above.
  useLayoutEffect(() => {
    const el = tip.current;
    if (!shown || !el) return;
    const r = shown.el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 8;
    const below = shown.el.closest('.topbar') || r.top - h - gap < 4;
    const top = below ? r.bottom + gap : r.top - h - gap;
    const left = clamp(r.left + r.width / 2 - w / 2, 6, vw - w - 6);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    // Inside a dialog that is still animating in (a transform), fixed
    // positioning is relative to the dialog: corrected by what it moved.
    const placed = el.getBoundingClientRect();
    const dx = placed.left - Math.round(left);
    const dy = placed.top - Math.round(top);
    if (dx || dy) {
      el.style.left = `${Math.round(left - dx)}px`;
      el.style.top = `${Math.round(top - dy)}px`;
    }
  }, [shown]);

  // A modal dialog sits in the top layer: its tooltips go inside it, or they'd be underneath.
  const host = shown?.el.closest('dialog[open]') ?? null;
  const element = (
    <div ref={tip} id="tooltip" className="tooltip" role="tooltip" hidden={!shown}>
      {shown && (
        <>
          <span className="tip-line">
            <span>{shown.label}</span>
            {shown.keys.map((key, i) => (
              <kbd key={i}>{key}</kbd>
            ))}
          </span>
          {shown.note && <span className="tip-note">{shown.note}</span>}
        </>
      )}
    </div>
  );
  return host ? createPortal(element, host) : element;
}
