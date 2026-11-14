// The controls that show something on the canvas while they are hovered or
// have the keyboard focus carry `data-preview` (and `data-preview-arg`; see
// previewAttrs): this hook, listening on the document, tells the preview store
// (state/preview.ts) which one that is. The pointer wins over the focus. An
// action's preview goes away when the action is activated, and anything with
// Esc, until the control is left. A touch has no hover: only the keyboard
// focus shows one.

import { useEffect } from 'react';
import { ACTION_PREVIEWS, showPreview, type PreviewKind, type PreviewTrigger } from '../state/preview.ts';

/** The attributes that make an element show `kind` on the canvas while hovered or focused. */
export const previewAttrs = (kind: PreviewKind, arg?: string | number) => ({
  'data-preview': kind,
  'data-preview-arg': arg === undefined ? undefined : String(arg),
});

const SOURCE = '[data-preview]';
/** A focus this soon after a touch came from the finger, not the keyboard (ms). */
const AFTER_TOUCH = 800;

const sourceOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>(SOURCE) : null);

function triggerOf(el: HTMLElement): PreviewTrigger | null {
  const kind = el.dataset.preview as PreviewKind | undefined;
  return kind ? { kind, arg: el.dataset.previewArg } : null;
}

function focusVisible(el: Element) {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

export function usePreviewTriggers() {
  useEffect(() => {
    let hovered: HTMLElement | null = null;
    let focused: HTMLElement | null = null;
    // Activated (or Esc): shows nothing until neither the pointer nor the focus is on it.
    const dismissed = new Set<HTMLElement>();
    let touchedAt = -Infinity;
    // A control whose argument changes while it shows («Duplicar ×N» as N is typed) shows the new one.
    const observer = new MutationObserver(() => update());

    function update() {
      for (const source of dismissed) if (source !== hovered && source !== focused) dismissed.delete(source);
      const el = [hovered, focused].find((source) => source && !dismissed.has(source) && source.isConnected) ?? null;
      observer.disconnect();
      if (el) observer.observe(el, { attributes: true, attributeFilter: ['data-preview', 'data-preview-arg'] });
      showPreview(el && triggerOf(el));
    }

    const onPointerOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = sourceOf(e.target);
      if (el === hovered) return;
      hovered = el;
      update();
    };
    // Out of the window (or onto something that isn't the page).
    const onPointerOut = (e: PointerEvent) => {
      if (e.relatedTarget || !hovered) return;
      hovered = null;
      update();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') touchedAt = performance.now();
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = sourceOf(e.target);
      const byTouch = performance.now() - touchedAt < AFTER_TOUCH;
      focused = el && !byTouch && focusVisible(e.target as Element) ? el : null;
      update();
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!focused || focused.contains(e.relatedTarget as Node | null)) return;
      focused = null;
      update();
    };
    // Before the action runs: the preview mustn't show its result once more.
    const onClick = (e: MouseEvent) => {
      const el = sourceOf(e.target);
      const kind = el && triggerOf(el)?.kind;
      if (!el || !kind || !ACTION_PREVIEWS.has(kind) || !(e.target as Element).closest('button')) return;
      dismissed.add(el);
      update();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      for (const source of [hovered, focused]) if (source) dismissed.add(source);
      update();
    };

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      observer.disconnect();
      showPreview(null);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
}
