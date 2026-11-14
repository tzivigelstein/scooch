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

/** Waits until index.html is parsed, with the stylesheet and the fonts its skeleton uses. */
export async function skeletonShown(page: Page) {
  await page.locator('body > noscript').waitFor({ state: 'attached' });
  await page.waitForFunction(() => !!document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')?.sheet);
  await page.evaluate(() => document.fonts.ready);
}
