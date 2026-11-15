// What Playwright's mouse can do in each engine, for the specs whose drags
// leave the window (sheets, accessibility).

/**
 * Whether the mouse can be held and moved outside the window, and let go
 * there. Not in Playwright's Firefox: a move there arrives as a move to
 * (0, −86) with no button held, which the app takes for the button let go
 * where it couldn't hear it (it cancels the drag), and a release there
 * doesn't arrive at all, so the page keeps the pointer captured and the next
 * click goes to what captured it. Chromium and WebKit deliver both, with
 * the button held, as a real Firefox does while a button is held.
 */
export const movesOutsideWindow = (browserName: string) => browserName !== 'firefox';

/** Why a test that holds the mouse outside the window can't run in Firefox (see movesOutsideWindow). */
export const OUTSIDE_WINDOW = 'Playwright’s Firefox can’t hold the mouse outside the window: a move there arrives with no button held, a release not at all';
