// The request for a donation in a real browser, with a Patreon URL tried
// through ?donar= (the app is on 127.0.0.1): never a dialog of its own and
// never before the printer, but a link at the foot of the summary after
// printing or downloading, once per page load, that opens Patreon apart
// without interrupting anything, and «No volver a mostrar» lasting across
// reloads.
// Its copy and attributes are in tests/components/PrintSummary.test.tsx; when
// it asks (no URL, invalid URL, once per load), in tests/services/donate.test.ts.
import type { Page } from '@playwright/test';
import { saved } from '../support/projects.ts';
import { expect, printCalls, test } from '../support/print.ts';

const PATREON = 'https://www.patreon.com/ejemplo';
const DISMISSED = 'scooch:donate-dismissed';

test.use({ appQuery: `?donar=${encodeURIComponent(PATREON)}` });

const ask = (page: Page) => page.locator('#summary-donate');

/** Prints or downloads through the advice (its button), and waits for the summary. */
async function output(page: Page, button: '#print' | '#export') {
  await page.locator(button).click();
  await expect(page.locator('#print-tip')).toHaveAttribute('open', '');
  // Only one modal before the printer: the advice.
  expect(await page.locator('dialog[open]').count()).toBe(1);
  await page.locator('#print-tip-go').click();
  await expect(page.locator('#print-summary')).toHaveAttribute('open', '');
}

test.describe('printing, with a PDF viewer', () => {
  test.use({ pdfViewer: true, printSpy: 'record' });

  test('after the first print, the summary asks with a link (a comfortable target) at its foot; the next print in this page load doesn’t ask', async ({ app, page }) => {
    await app.addFiles(['small.jpg', 'square.webp']);
    await output(page, '#print');
    await expect.poll(() => printCalls(page)).toHaveLength(1);
    await expect(ask(page)).toHaveText('Aportar en Patreon');
    await expect(ask(page)).toHaveAttribute('target', '_blank');
    await expect(ask(page)).toHaveAttribute('rel', 'noopener noreferrer');
    for (const id of ['summary-donate', 'summary-donate-never']) {
      const box = (await page.locator(`#${id}`).boundingBox())!;
      expect(Math.round(box.height), `${id} height`).toBeGreaterThanOrEqual(40);
    }
    await page.locator('#summary-done').click();
    await output(page, '#print');
    await expect.poll(() => printCalls(page)).toHaveLength(2);
    await expect(ask(page)).toHaveCount(0);
  });
});

test.describe('downloading', () => {
  test('the link opens Patreon in another tab; the download had already gone', async ({ app, page, context }) => {
    await context.route((url) => url.hostname.endsWith('patreon.com'), (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Patreon (test)</title>' }));
    await app.addFiles(['small.jpg', 'square.webp']);
    const download = page.waitForEvent('download');
    await output(page, '#export');
    expect((await download).suggestedFilename()).toBe('scooch-a4.pdf');
    const [tab] = await Promise.all([context.waitForEvent('page'), ask(page).click()]);
    await tab.waitForURL(PATREON);
    await tab.close();
  });

  test('«No volver a mostrar»: the link goes, and after a reload it doesn’t ask again', async ({ app, page }) => {
    await app.addFiles(['small.jpg', 'square.webp']);
    await output(page, '#export');
    await page.locator('#summary-donate-never').click();
    await expect(ask(page)).toHaveCount(0);
    await expect(page.locator('#summary-done')).toBeFocused();
    await saved(page);
    await page.reload();
    await app.ready();
    await expect(app.pieces()).toHaveCount(2);
    await output(page, '#export');
    await expect(ask(page)).toHaveCount(0);
  });
});

test.describe('dismissed before the page loads', () => {
  // The key under the app's current name (where the rename moved it).
  test.use({ initialStorage: { [DISMISSED]: 'never' } });

  test('«No volver a mostrar» saved under scooch:donate-dismissed: the summary doesn’t ask', async ({ app, page }) => {
    await app.addFiles(['small.jpg']);
    await output(page, '#export');
    await expect(ask(page)).toHaveCount(0);
  });
});
