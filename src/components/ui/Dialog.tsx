// Modal dialogs (<dialog>): always in the page, shown with showModal while
// `open`, closed with Esc, their button or a click on the backdrop, and the
// focus goes back to whoever opened them.

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import './Dialog.css';

export interface DialogProps {
  id: string;
  className: string;
  labelledBy: string;
  describedBy?: string;
  open: boolean;
  /** Asked to close (Esc, the backdrop, a close button): the owner sets `open` to false. */
  onClose: () => void;
  /** Where the focus returns; `fallback()` if that one is gone (e.g. the bar's button). */
  returnTo: Element | null;
  fallback?: () => Element | null;
  /** What gets the focus when it opens (by default the browser's choice). */
  initialFocus?: () => HTMLElement | null;
  /** Another dialog takes the focus when this one closes. */
  focusTaken?: () => boolean;
  /** Esc (the dialog's «cancel»): by default it closes. */
  onCancel?: () => void;
  children?: ReactNode;
}

const usable = (el: Element | null | undefined): el is HTMLElement =>
  el instanceof HTMLElement && el.isConnected && el !== document.body && !el.closest('[hidden]') && !(el as HTMLButtonElement).disabled;

export function Dialog({ id, className, labelledBy, describedBy, open, onClose, returnTo, fallback, initialFocus, focusTaken, onCancel, children }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const before = useRef<Element | null>(null); // the browser gives it the focus back when closing
  const back = useRef<Element | null>(null); // where the focus returns, as it was when opening
  const shown = useRef(false);
  const props = useRef({ onClose, returnTo, fallback, initialFocus, focusTaken });
  useLayoutEffect(() => {
    props.current = { onClose, returnTo, fallback, initialFocus, focusTaken };
  });

  useLayoutEffect(() => {
    const el = dialog.current!;
    if (open && !shown.current) {
      shown.current = true;
      before.current = document.activeElement;
      back.current = props.current.returnTo;
      el.showModal();
      props.current.initialFocus?.()?.focus();
    } else if (!open && shown.current) {
      shown.current = false;
      if (el.open) el.close();
      const { fallback: other, focusTaken: taken } = props.current;
      // If the focus already moved somewhere else meanwhile, that is respected.
      const active = document.activeElement;
      if (active && active !== document.body && active !== before.current && !el.contains(active)) return;
      if (taken?.()) return;
      [back.current, other?.()].find(usable)?.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    const el = dialog.current!;
    const closed = () => {
      if (shown.current) props.current.onClose();
    };
    el.addEventListener('close', closed);
    return () => {
      el.removeEventListener('close', closed);
      if (el.open) el.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      id={id}
      className={className}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      // Esc closes through the owner's state right away (the native «close» event comes later).
      onCancel={(e) => {
        e.preventDefault();
        (onCancel ?? onClose)();
      }}
      onClick={(e) => {
        // A click on the backdrop (outside the box) closes it.
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
