// Focusing something the app has just shown, or that a dialog has just
// stopped making inert.

/**
 * Asks for the element's box, then focuses it. While a stylesheet is loading
 * (a lazy part's CSS, which the app also fetches when idle), WebKit doesn't
 * restyle the page: an element shown again keeps the display: none it had
 * while hidden, and after a dialog closes the page behind it still counts as
 * inert. Then focus() either refuses the element or takes it unchecked, and
 * at the next frame WebKit takes the focus back from what it takes for hidden.
 * Asking for a box styles the page first, ignoring the stylesheets still
 * loading.
 */
export function focusShown(element: HTMLElement, options?: FocusOptions) {
  element.getBoundingClientRect();
  element.focus(options);
}
