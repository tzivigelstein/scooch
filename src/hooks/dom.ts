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
