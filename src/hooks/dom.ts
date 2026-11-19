// DOM helpers shared by the keyboard and pointer code.

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Can `el` still hold the focus: in the page, not disabled and not inside something hidden? */
export const canHoldFocus = (el: Element) => el.isConnected && !(el as HTMLButtonElement).disabled && !el.closest('[hidden]');

const TEXT_INPUTS_EXCLUDED = ['checkbox', 'radio', 'button', 'submit', 'range'];

/** Is the user typing in this element (single-key shortcuts and drags leave it alone)? */
export const isTyping = (el: Element | null | undefined) =>
  (el instanceof HTMLInputElement && !TEXT_INPUTS_EXCLUDED.includes(el.type)) ||
  el instanceof HTMLSelectElement ||
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLElement && el.isContentEditable);

/**
 * For a scroll box whose header sticks to its top: what gets the focus
 * inside it comes out from under the header, focus ring and all. The box's
 * `scroll-padding-top` says how far the header reaches, and where the
 * browser honours it when it scrolls to the focus this finds nothing to do;
 * WebKit doesn't, and left a field reached with Shift+Tab under the tabs.
 */
export function keepFocusBelowStickyHeader(e: { target: EventTarget; currentTarget: EventTarget }) {
  const box = e.currentTarget as HTMLElement;
  const focused = e.target as HTMLElement;
  if (focused === box) return;
  const settle = () => {
    if (!box.contains(focused)) return;
    const padding = parseFloat(getComputedStyle(box).scrollPaddingTop) || 0;
    const under = box.getBoundingClientRect().top + padding - focused.getBoundingClientRect().top;
    if (!padding || under <= 0 || box.scrollTop <= 0) return;
    // The header's own controls stay where they stick.
    for (let el: HTMLElement | null = focused; el && el !== box; el = el.parentElement) if (getComputedStyle(el).position === 'sticky') return;
    box.scrollTop -= under;
  };
  settle();
  // The browser's own scroll to the focus can come after the event.
  requestAnimationFrame(settle);
}

