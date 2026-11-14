// The summary after printing or downloading, in a real browser: where its
// ring's label lands (only layout shows it) and «No lo imprimí» reaching the
// running total, with each PDF counted once. What each line says, when «No lo
// imprimí» shows and how the total counts are in
// tests/components/PrintSummary.test.tsx and tests/state/printing-flow.test.ts.
import type { Page } from '@playwright/test';
import { expect, printCalls, test } from '../support/print.ts';
import { norm } from '../support/test.ts';

const summary = (page: Page) => page.locator('#print-summary');

/** Where the ring's label sits: its glyphs' box against the ring's centre and the inner edge of its stroke (px). */
const readRing = (page: Page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    const ring = document.querySelector('#print-summary .summary-ring')!;
    const svg = ring.querySelector('svg')!;
    const track = ring.querySelector<SVGCircleElement>('.ring-track')!;
    const box = svg.getBoundingClientRect();
    const scale = box.width / svg.viewBox.baseVal.width;
    const inner = (track.r.baseVal.value - parseFloat(getComputedStyle(track).strokeWidth) / 2) * scale;
    const [cx, cy] = [box.left + box.width / 2, box.top + box.height / 2];
    const label = ring.querySelector('.ring-label')!;
    const range = document.createRange();
    range.selectNodeContents(label);
    const r = range.getBoundingClientRect();
    const farthest = Math.max(...[r.left, r.right].flatMap((x) => [r.top, r.bottom].map((y) => Math.hypot(x - cx, y - cy))));
    return { text: label.textContent, room: inner - farthest, dx: (r.left + r.right) / 2 - cx, dy: (r.top + r.bottom) / 2 - cy };
  });

test.describe('the ring', () => {
  test.use({ initialStorage: { 'scooch:print-preferences': JSON.stringify({ v: 1, tip: false, summary: true }) } });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ])
    test.describe(() => {
      test.use({ viewport });

      test(`at ${viewport.width} px, its widest label («100 %») sits in its middle with room to spare before the stroke`, async ({ app, page }) => {
        // One photo at 300 %: it covers the whole printable area.
        await app.addFiles(['big.png']);
        await app.selectIds(await app.ids());
        await app.openMeasures();
        await page.locator('#scale').fill('300');
        await page.locator('#scale').press('Enter');
        await expect(page.locator('#scale')).toHaveValue('300');
        await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
        await expect(summary(page)).toHaveAttribute('open', '');
        const ring = await readRing(page);
        expect(norm(ring.text)).toBe('100 %');
        expect(ring.room, 'px from the label’s corners to the stroke').toBeGreaterThanOrEqual(8);
        expect(Math.abs(ring.dx), 'off the middle, across').toBeLessThanOrEqual(1);
        expect(Math.abs(ring.dy), 'off the middle, down').toBeLessThanOrEqual(1);
      });
    });
});

test.describe('«No lo imprimí»', () => {
  test.use({ pdfViewer: true, printSpy: 'record' });

  test('takes the PDF back out of the total and closes, back to «Imprimir»; printing the same PDF again counts it once', async ({ app, page }) => {
    // Two cards on one sheet: 1 sheet saved.
    await app.addFiles(['card00.png', 'card01.png']);
    const total = page.locator('#summary-total');
    const notPrinted = page.locator('#summary-not-printed');

    await page.locator('#print').click();
    await page.locator('#print-tip-never').check();
    await page.locator('#print-tip-go').click();
    await expect.poll(() => printCalls(page)).toHaveLength(1);
    await expect(summary(page)).toHaveAttribute('open', '');
    await expect(total).toHaveText('Llevas 1 hoja ahorrada');
    await notPrinted.click();
    await expect(summary(page)).not.toHaveAttribute('open');
    await expect(page.locator('#print')).toBeFocused();

    // Taken back: printing it again counts it, once.
    await page.locator('#print').click();
    await expect.poll(() => printCalls(page)).toHaveLength(2);
    await expect(total).toHaveText('Llevas 1 hoja ahorrada');
    await expect(notPrinted).toBeVisible();
    await page.locator('#summary-done').click();
    await page.locator('#print').click();
    await expect.poll(() => printCalls(page)).toHaveLength(3);
    await expect(total).toHaveText('Llevas 1 hoja ahorrada');
    await expect(notPrinted, 'nothing added this time: nothing to take back').toHaveCount(0);
  });
});
