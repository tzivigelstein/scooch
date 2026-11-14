// The summary after printing or downloading, in a real browser: where its
// ring's label lands (only layout shows it). What each line says is in
// tests/components/PrintSummary.test.tsx.
import type { Page } from '@playwright/test';
import { expect, test } from '../support/print.ts';
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
