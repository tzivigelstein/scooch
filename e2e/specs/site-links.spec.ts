// The site's questions from the editor, in a real browser: from Preferences
// and from the command palette they open in a new tab, in the language the
// editor shows (French here, from the browser's), and the editor stays as it
// was, not reloaded. Each language's labels and addresses are in
// tests/components/PrefsDialog.test.tsx and tests/state/commands.test.ts;
// that the site builds those pages, in tests/site/editor-links.test.ts.
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '../support/test.ts';

test.use({ locale: 'fr-FR' });

const FAQ = '/fr/questions-frequentes';

/** Marks the editor's page, so a reload (which would drop the mark) shows. */
const mark = (page: Page) => page.evaluate(() => ((window as unknown as { kept: boolean }).kept = true));
const marked = (page: Page) => page.evaluate(() => (window as unknown as { kept?: boolean }).kept);

/** The tab `open` opens, once it shows the French questions. */
async function questionsTab(context: BrowserContext, open: () => Promise<void>) {
  const [tab] = await Promise.all([context.waitForEvent('page'), open()]);
  await tab.waitForLoadState();
  expect(new URL(tab.url()).pathname).toBe(FAQ);
  await expect(tab.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(tab.locator('h1')).toHaveText('Questions fréquentes');
  return tab;
}

test('Preferences: «Questions fréquentes» opens the French questions in a new tab; the editor stays as it was, Preferences open', async ({ app, page, context }) => {
  await app.addFiles(['small.jpg']);
  const ids = await app.ids();
  await mark(page);
  await page.locator('#prefs-open').click();
  await expect(page.locator('#prefs[open]')).toBeVisible();

  const tab = await questionsTab(context, () => page.locator('#prefs-legal').getByRole('link', { name: 'Questions fréquentes' }).click());

  expect(new URL(page.url()).pathname).toBe('/');
  expect(await marked(page), 'the same page, not reloaded').toBe(true);
  await expect(page.locator('#prefs[open]')).toBeVisible();
  expect(await app.ids()).toEqual(ids);
  await tab.close();
});

test('the palette: «questions» and Enter open the French questions in a new tab, then the palette closes and the focus goes back', async ({ app, context }) => {
  const page = app.page;
  await mark(page);
  await page.locator('#palette-open').click();
  await expect(page.locator('#palette-input')).toBeFocused();
  await page.keyboard.type('questions');
  await expect(page.locator('#palette-option-faq')).toHaveAttribute('aria-selected', 'true');

  const tab = await questionsTab(context, () => page.keyboard.press('Enter'));

  await expect(page.locator('#palette[open]')).toHaveCount(0);
  await expect(page.locator('#palette-open')).toBeFocused();
  expect(new URL(page.url()).pathname).toBe('/');
  expect(await marked(page), 'the same page, not reloaded').toBe(true);
  await tab.close();
});
