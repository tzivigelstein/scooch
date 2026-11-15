// The page before the app runs: the editor's script held back, as on a slow
// connection, so that what index.html shows by itself can be read.
import type { Page } from '@playwright/test';

/** The editor's module script: the build's entry, or the dev server's. */
const APP_SCRIPT = /\/(assets\/index-[\w-]+\.js|src\/main\.tsx)(\?.*)?$/;

/**
 * Holds the editor's script back (on every load of the page) until the
 * returned function lets it go; call it before the test ends.
 */
export async function holdApp(page: Page) {
  let release!: () => void;
  const held = new Promise<void>((done) => (release = done));
  await page.route(APP_SCRIPT, async (route) => {
    await held;
    // A load the page left (a reload while held) has nothing to continue.
    await route.continue().catch(() => {});
  });
  return release;
}

declare global {
  interface Window {
    /** The page when the skeleton left it (see watchHandOff). */
    handOff?: { loading: boolean; sheets: number; pieces: number };
  }
}

/** For addInitScript: records what the page has at the moment the skeleton leaves it, in window.handOff. */
export const watchHandOff = () => {
  let seen = false;
  new MutationObserver((_, observer) => {
    if (document.querySelector('.boot')) {
      seen = true;
      return;
    }
    if (!seen) return;
    observer.disconnect();
    window.handOff = { loading: document.body.classList.contains('is-loading'), sheets: document.querySelectorAll('#sheets .sheet').length, pieces: document.querySelectorAll('#sheets .piece').length };
  }).observe(document, { childList: true, subtree: true });
};

/** For evaluate: how much the page has moved since it started loading (the sum of its layout shifts), two frames from now. */
export const layoutShift = () =>
  new Promise<number>((done) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const observer = new PerformanceObserver(() => {});
        observer.observe({ type: 'layout-shift', buffered: true });
        const entries = observer.takeRecords() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[];
        observer.disconnect();
        done(entries.filter((e) => !e.hadRecentInput).reduce((sum, e) => sum + e.value, 0));
      })
    )
  );

/** For evaluate: what the tool does on the skeleton's sheet: its text, whether all of it is on the sheet, and how far its column is from the sheet's middle (px). */
export const readAbout = () => {
  const about = document.querySelector('.boot-about')!;
  const range = document.createRange();
  range.selectNodeContents(about);
  const text = range.getBoundingClientRect();
  const column = about.getBoundingClientRect();
  const sheet = document.querySelector('.boot-sheet')!.getBoundingClientRect();
  return {
    text: range.toString(),
    offCenter: column.x + column.width / 2 - (sheet.x + sheet.width / 2),
    onSheet: text.width > 0 && text.left >= sheet.left && text.right <= sheet.right && text.top >= sheet.top && text.bottom <= sheet.bottom,
  };
};

/** Waits until index.html is parsed, with the stylesheet and the fonts its skeleton uses. */
export async function skeletonShown(page: Page) {
  await page.locator('body > noscript').waitFor({ state: 'attached' });
  await page.waitForFunction(() => !!document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')?.sheet);
  // Not document.fonts.ready nor its status: WebKit and Firefox settle them
  // only once the document has loaded, which it doesn't while the app's
  // script is held. Once a font the page asked for has loaded, none may be
  // loading.
  await page.waitForFunction(
    () => {
      const faces = [...document.fonts];
      return faces.some((face) => face.status === 'loaded') && !faces.some((face) => face.status === 'loading');
    },
    undefined,
    { polling: 50 }
  );
}
