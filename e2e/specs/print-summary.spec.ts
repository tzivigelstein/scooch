// The summary after printing or downloading, in a real browser: where its
// ring's label lands (only layout shows it), and a print joining the running
// total at the next page load. What each line says is in
// tests/components/PrintSummary.test.tsx; how the total counts, in
// tests/core/savings.test.js and tests/state/printing-flow.test.ts.
import type { Page } from '@playwright/test';
import { saved } from '../support/projects.ts';
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
