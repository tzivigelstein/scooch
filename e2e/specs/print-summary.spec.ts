// The summary after printing or downloading, in a real browser: on a small
// phone it fits the screen with «Listo» in reach (only layout shows it), and
// a print joins the running total at the next page load. What each line says
// and what the comparison draws are in tests/components/PrintSummary.test.tsx;
// how the total counts, in tests/core/savings.test.js and
// tests/state/printing-flow.test.ts.
import type { Page } from '@playwright/test';
import { saved } from '../support/projects.ts';
import { expect, printCalls, test } from '../support/print.ts';

const summary = (page: Page) => page.locator('#print-summary');

/** The dialog, «Listo» and the body's sizes, in px. */
const readLayout = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    const body = document.querySelector('#print-summary .summary-body')!;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      dialog: box(document.getElementById('print-summary')!),
      title: box(document.getElementById('summary-title')!),
      done: box(document.getElementById('summary-done')!),
      overflowX: body.scrollWidth - body.clientWidth,
    };
  });

test.describe('on a small phone', () => {
  test.use({
    viewport: { width: 390, height: 700 },
    appQuery: `?donar=${encodeURIComponent('https://www.patreon.com/ejemplo')}`,
    // 8 sheets saved before: 12 cards on 2 sheets reach 10.
    initialStorage: {
      'scooch:print-preferences': JSON.stringify({ v: 1, tip: false, summary: true }),
      'scooch:savings': JSON.stringify({ v: 1, sheets: 8, turn: 0 }),
    },
  });

  test('at 390 × 700, with the comparison, a milestone and the request for a donation, it fits the screen and «Listo» stays in it', async ({ app, page }) => {
    await app.addFiles(Array.from({ length: 12 }, (_, i) => `card${String(i).padStart(2, '0')}.png`));
    await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
    await expect(summary(page)).toHaveAttribute('open', '');
    await expect(page.locator('#print-summary .summary-compare')).toBeVisible();
    await expect(page.locator('#summary-milestone')).toBeVisible();
    await expect(page.locator('#summary-donate')).toBeAttached();

    const fits = async () => {
      const { viewport, dialog, title, done, overflowX } = await readLayout(page);
      expect(dialog.top, 'the dialog starts on screen').toBeGreaterThanOrEqual(0);
      expect(dialog.bottom, 'and ends on screen').toBeLessThanOrEqual(viewport.height);
      expect(dialog.right - dialog.left).toBeLessThanOrEqual(viewport.width);
      expect(title.top, 'the title inside the dialog (only the body scrolls)').toBeGreaterThanOrEqual(dialog.top);
      expect(done.top, '«Listo» inside the dialog').toBeGreaterThanOrEqual(dialog.top);
      expect(done.bottom).toBeLessThanOrEqual(dialog.bottom);
      expect(overflowX, 'nothing wider than the dialog').toBeLessThanOrEqual(0);
    };
    await fits();
    // What doesn't fit scrolls inside the body, and «Listo» stays put.
    await page.locator('#summary-donate-never').scrollIntoViewIfNeeded();
    await expect(page.locator('#summary-donate-never')).toBeInViewport();
    await fits();
    await expect(page.locator('#summary-done')).toBeInViewport();
  });
});

test.describe('the running total', () => {
  test.use({ pdfViewer: true, printSpy: 'record' });

  test('a print stays out of the total until the next page load, then counts once', async ({ app, page }) => {
    // Two cards on one sheet: 1 sheet saved.
    await app.addFiles(['card00.png', 'card01.png']);
    const total = page.locator('#summary-total');

    await page.locator('#print').click();
    await page.locator('#print-tip-never').check();
    await page.locator('#print-tip-go').click();
    await expect.poll(() => printCalls(page)).toHaveLength(1);
    await expect(summary(page)).toHaveAttribute('open', '');
    await expect(page.locator('#summary-lines')).toContainText('Usaste 1 hoja en lugar de 2');
    await expect(total, 'nothing in the total yet').toHaveCount(0);
    await page.locator('#summary-done').click();
    await page.locator('#print').click();
    await expect.poll(() => printCalls(page)).toHaveLength(2);
    await expect(summary(page)).toHaveAttribute('open', '');
    await expect(total, 'the same PDF again: still waiting').toHaveCount(0);
    await page.locator('#summary-done').click();

    await saved(page);
    await page.reload();
    await app.ready();
    await page.locator('#print').click();
    await expect.poll(() => printCalls(page)).toHaveLength(1);
    await expect(total).toHaveText('Llevas 1 hoja ahorrada');
  });
});
