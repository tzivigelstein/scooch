// A focus a key moves shows, in WebKit too. WebKit decides whether a focus a
// script moves matches :focus-visible by whether the last focus came from a
// click, and only a key's default action changes that; the app's key
// handlers prevent it. So after a click, Enter on a piece took the focus to
// its toolbar with no ring and no tooltip, and the arrows kept it so. While a
// key is handled, focus() asks to be visible, as Chromium and Firefox show it
// anyway.

let handlingKey = false;

/** Installs it once, before anything handles a key. */
export function showFocusMovedByKeys() {
  document.addEventListener(
    'keydown',
    () => {
      handlingKey = true;
      setTimeout(() => (handlingKey = false));
    },
    true
  );
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
    focus.call(this, handlingKey ? { ...options, focusVisible: true } : options);
  };
}
