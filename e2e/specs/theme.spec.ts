// The theme in a real browser: each option of «Tema» in «Preferencias» reaches
// the page (the stylesheet, native controls, the browser's bar) while the
// sheet stays white, «Automático» follows the system as it changes, the
// stored theme is on the page before the app's script runs, and other tabs
// follow at once. Reading the stored preference and resolving the theme are
// in tests/core/storedprefs.test.js; following the choice, the system and
// other tabs, and the script in index.html, in tests/services/theme.test.ts.
import type { Page } from '@playwright/test';
import { App, expect, test } from '../support/test.ts';

const LABELS = { auto: 'Automático', light: 'Claro', dark: 'Oscuro' } as const;

/** What each theme looks like before the stylesheet's own rules matter. */
const LOOKS = {
  light: { theme: 'light', scheme: 'light', background: 'rgb(255, 255, 255)', bar: ['#ffffff'] },
  dark: { theme: 'dark', scheme: 'dark', background: 'rgb(21, 23, 28)', bar: ['#15171c'] },
} as const;
const WHITE = 'rgb(255, 255, 255)';

/** Chooses an option of «Tema» in «Preferencias» (opened with the gear) and closes it with Esc. */
async function chooseTheme(page: Page, theme: keyof typeof LABELS) {
  await page.locator('#prefs-open').click();
  await expect(page.locator('#prefs')).toHaveAttribute('open');
  await page.locator('#prefs').getByRole('radio', { name: LABELS[theme] }).check();
  await page.keyboard.press('Escape');
  await expect(page.locator('#prefs')).not.toHaveAttribute('open');
}

/** What the page shows of the theme. */
const readTheme = () => {
  const sheet = document.querySelector('.sheet');
  return {
    theme: document.documentElement.dataset.theme,
    // What native controls and scrollbars follow: the meta before the stylesheet arrives, the property after.
    scheme: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
    cssScheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor,
    // The colors of the browser's bar that apply.
    bar: [...document.querySelectorAll('meta[name="theme-color"]')].filter((m) => matchMedia(m.getAttribute('media') ?? 'all').matches).map((m) => m.getAttribute('content')),
    sheet: sheet ? getComputedStyle(sheet).backgroundColor : null,
    mounted: !!document.querySelector('#paper'),
  };
};

const mountedIn = (theme: keyof typeof LOOKS) => ({ ...LOOKS[theme], cssScheme: theme, sheet: WHITE, mounted: true });

test('each option of Tema applies at once whatever the system’s theme, and the sheet stays white', async ({ app: { page } }) => {
  await expect.poll(() => page.evaluate(readTheme)).toEqual(mountedIn('light'));
  await chooseTheme(page, 'dark');
  await expect.poll(() => page.evaluate(readTheme)).toEqual(mountedIn('dark'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await chooseTheme(page, 'light');
  await expect.poll(() => page.evaluate(readTheme)).toEqual(mountedIn('light'));
  await chooseTheme(page, 'auto');
  await expect.poll(() => page.evaluate(readTheme)).toEqual(mountedIn('dark'));
});

test('on Automático the page follows the system’s theme as it changes', async ({ app: { page } }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.evaluate(readTheme)).toEqual(mountedIn('dark'));
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => page.evaluate(readTheme)).toEqual(mountedIn('light'));
});

test('after a reload the chosen theme is on the page before the app’s script runs, and stays once it mounts', async ({ app, page }) => {
  await chooseTheme(page, 'dark');
  let release!: () => void;
  const held = new Promise<void>((done) => (release = done));
  await page.route(/\/assets\/index-[\w-]+\.js(\?.*)?$/, async (route) => {
    await held;
    await route.continue();
  });
  await page.reload({ waitUntil: 'commit' });
  await page.locator('.boot').waitFor({ state: 'attached' });
  expect(await page.evaluate(readTheme)).toMatchObject({ ...LOOKS.dark, sheet: null, mounted: false });
  release();
  await app.ready();
  expect(await page.evaluate(readTheme)).toEqual(mountedIn('dark'));
  await page.locator('#prefs-open').click();
  await expect(page.locator('#prefs').getByRole('radio', { name: LABELS.dark })).toBeChecked();
});

test('the browser’s bar takes the top bar’s color in each theme, so the two read as one', async ({ app: { page } }) => {
  /** The color of the browser's bar that applies, and the top bar's, both as rgb(). */
  const readBars = () => {
    const [hex] = [...document.querySelectorAll('meta[name="theme-color"]')].filter((m) => matchMedia(m.getAttribute('media') ?? 'all').matches).map((m) => m.getAttribute('content')!);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return { browser: `rgb(${r}, ${g}, ${b})`, topbar: getComputedStyle(document.querySelector('.topbar')!).backgroundColor };
  };
  for (const theme of ['light', 'dark'] as const) {
    await chooseTheme(page, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const bars = await page.evaluate(readBars);
    expect(bars.browser, theme).toBe(bars.topbar);
  }
});

test('a theme chosen in one tab shows in the others at once', async ({ app: { page }, context }, testInfo) => {
  const other = await context.newPage();
  await new App(other, testInfo).open();
  await chooseTheme(page, 'dark');
  await expect.poll(() => other.evaluate(readTheme)).toEqual(mountedIn('dark'));
  await chooseTheme(page, 'auto');
  await expect.poll(() => other.evaluate(readTheme)).toEqual(mountedIn('light'));
});
