// The donation dialog in a real browser, with a Patreon URL tried through
// ?donar= (the app is on 127.0.0.1): a real modal on the first print or
// download, «Seguir sin aportar» as easy as donating, the export always going
// on however it closes, and «No volver a mostrar» lasting across reloads.
// Its copy, its links and each way of closing (X, backdrop) are in
// tests/components/DonateDialog.test.tsx; when it shows (no URL, invalid
// URL, once per load), in tests/services/donate.test.ts; that the PDF starts
// before it shows, in tests/state/export-with-donation.test.ts.
import type { Page } from '@playwright/test';
import { expect, printCalls, test } from '../support/print.ts';

const PATREON = 'https://www.patreon.com/ejemplo';
const DISMISSED = 'scooch:donate-dismissed';

test.use({ appQuery: `?donar=${encodeURIComponent(PATREON)}` });

const modal = (page: Page) => page.locator('#donate');
const isModal = (page: Page) => modal(page).evaluate((d) => d.matches(':modal'));

test.describe('printing, with a PDF viewer', () => {
  test.use({ pdfViewer: true, printSpy: 'record' });

  test('the first Print shows a real modal, focus on its title; «Seguir sin aportar» prints right away and gives the focus back to Print; a second Print prints without it', async ({ app, page }) => {
    await app.addFiles(['small.jpg', 'square.webp']);
    await page.locator('#print').click();
    await expect(modal(page)).toHaveAttribute('open', '');
    expect(await isModal(page)).toBe(true);
    await expect(page.locator('#donate-title')).toBeFocused();

    await test.step('every button is a comfortable touch target, and «Seguir sin aportar» isn’t a tiny grey link', async () => {
      for (const id of ['donate-cta', 'donate-skip', 'donate-close']) {
        const box = (await page.locator(`#${id}`).boundingBox())!;
        expect(Math.round(box.height), `${id} height`).toBeGreaterThanOrEqual(40);
        expect(Math.round(box.width), `${id} width`).toBeGreaterThanOrEqual(40);
      }
      const skip = await page.locator('#donate-skip').evaluate((el) => {
        const cs = getComputedStyle(el);
        return { size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) };
      });
      expect(skip.size).toBeGreaterThanOrEqual(14);
      expect(skip.weight).toBeGreaterThanOrEqual(600);
    });

    await page.locator('#donate-skip').click();
    await expect(modal(page)).not.toHaveAttribute('open');
    await expect.poll(() => printCalls(page)).toHaveLength(1);
    await expect(page.locator('#print')).toBeFocused();

    await page.locator('#print').click();
    await expect.poll(() => printCalls(page)).toHaveLength(2);
    await expect(modal(page)).not.toHaveAttribute('open');
  });
});

test.describe('downloading', () => {
  test('Esc closes the dialog and the download goes on', async ({ app, page }) => {
    await app.addFiles(['small.jpg', 'square.webp']);
    const download = page.waitForEvent('download');
    await page.locator('#export').click();
    await expect(modal(page)).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    expect((await download).suggestedFilename()).toBe('scooch-a4.pdf');
    await expect(modal(page)).not.toHaveAttribute('open');
  });

  test('the CTA opens Patreon in another tab and the download goes on', async ({ app, page, context }) => {
    await context.route((url) => url.hostname.endsWith('patreon.com'), (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Patreon (test)</title>' }));
    await app.addFiles(['small.jpg', 'square.webp']);
    const download = page.waitForEvent('download');
    await page.locator('#export').click();
    await expect(modal(page)).toHaveAttribute('open', '');
    const [tab] = await Promise.all([context.waitForEvent('page'), page.locator('#donate-cta').click()]);
    await tab.waitForURL(PATREON);
    expect((await download).suggestedFilename()).toBe('scooch-a4.pdf');
    await expect(modal(page)).not.toHaveAttribute('open');
    await tab.close();
  });

  test('«No volver a mostrar» checked: after a reload the download goes straight on', async ({ app, page }) => {
    await app.addFiles(['small.jpg', 'square.webp']);
    await page.locator('#export').click();
    await expect(modal(page)).toHaveAttribute('open', '');
    await page.locator('#donate-never').check();
    await Promise.all([page.waitForEvent('download'), page.locator('#donate-skip').click()]);
    await expect(page.locator('#project-status-text')).toHaveText('Guardado');
    await page.reload();
    await app.ready();
    await expect(app.pieces()).toHaveCount(2);
    const { name } = await app.download();
    expect(name).toBe('scooch-a4.pdf');
    await expect(modal(page)).not.toHaveAttribute('open');
  });
});

test.describe('dismissed before the page loads', () => {
  // The key under the app's current name (where the rename moved it).
  test.use({ initialStorage: { [DISMISSED]: 'never' } });

  test('«No volver a mostrar» saved under scooch:donate-dismissed: the download goes straight on', async ({ app, page }) => {
    await app.addFiles(['small.jpg']);
    const { name } = await app.download();
    expect(name).toBe('scooch-a4.pdf');
    await expect(modal(page)).not.toHaveAttribute('open');
  });
});
