// The segmented controls' thumb on screen: it covers the chosen segment's box
// (within a pixel) after a choice, after the panel changes width, with
// segments of different widths and right to left; it slides, except under
// reduced motion. The radio group itself (index, arrows, disabled options) is
// in tests/components/Segmented.test.tsx.
import type { Page } from '@playwright/test';
import { expect, test } from '../support/test.ts';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The boxes of a group's thumb, its chosen segment and every segment, on screen. */
const boxes = (page: Page, group: string) =>
  page.locator(group).evaluate((el) => {
    const box = (e: Element | null) => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      thumb: box(el.querySelector(':scope > .seg-thumb')),
      chosen: box(el.querySelector(':scope > .seg:has(> input:checked)')),
      segments: [...el.querySelectorAll(':scope > .seg')].map((s) => box(s)!),
    };
  });

/** The largest difference between two boxes' edges and sizes, in px. */
const apart = (a: Box | null, b: Box | null) => (a && b ? Math.max(...(['x', 'y', 'width', 'height'] as const).map((k) => Math.abs(a[k] - b[k]))) : Infinity);

/** Waits until the group's thumb covers its chosen segment. */
async function expectThumbOnChoice(page: Page, group: string) {
  await expect.poll(async () => {
    const { thumb, chosen } = await boxes(page, group);
    return apart(thumb, chosen);
  }).toBeLessThanOrEqual(1);
}

test('the thumb covers the chosen cut line mode after another is chosen and after the panel widens', async ({ app, page }) => {
  await app.openSetting('#cut-mode');
  await expectThumbOnChoice(page, '#cut-mode');
  await page.getByRole('radio', { name: 'Contorno' }).check();
  await expectThumbOnChoice(page, '#cut-mode');
  const before = await boxes(page, '#cut-mode');
  // The side panel is 19 % of a window this wide (its narrowest below).
  await page.setViewportSize({ width: 1800, height: 900 });
  await expect.poll(async () => (await boxes(page, '#cut-mode')).segments[0].width).toBeGreaterThan(before.segments[0].width + 5);
  await expectThumbOnChoice(page, '#cut-mode');
});

test('the grid sizes are as wide as their labels, and the thumb covers the chosen one after a click, an arrow and the panel widening', async ({ app, page }) => {
  await app.openSetting('#grid-chips');
  const { segments } = await boxes(page, '#grid-chips');
  // «10 mm» is wider than «1 mm»: so is its segment.
  expect(segments[2].width).toBeGreaterThan(segments[0].width + 3);
  await expectThumbOnChoice(page, '#grid-chips');
  await page.getByRole('radio', { name: '10 mm' }).check();
  await expectThumbOnChoice(page, '#grid-chips');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: '5 mm' })).toBeChecked();
  await expectThumbOnChoice(page, '#grid-chips');
  await page.setViewportSize({ width: 1800, height: 900 });
  await expect.poll(async () => (await boxes(page, '#grid-chips')).segments[1].width).toBeGreaterThan(segments[1].width + 5);
  await expectThumbOnChoice(page, '#grid-chips');
  // A size that isn't suggested: no thumb.
  await page.locator('#grid-size').fill('7');
  await page.locator('#grid-size').press('Enter');
  await expect(page.locator('#grid-chips input:checked')).toHaveCount(0);
  await expect(page.locator('#grid-chips .seg-thumb')).toBeHidden();
});

test('right to left, the thumb covers the chosen segment of both kinds', async ({ app, page }) => {
  await page.evaluate(() => (document.documentElement.dir = 'rtl'));
  await app.openSetting('#grid-chips');
  await page.getByRole('radio', { name: '10 mm' }).check();
  await expectThumbOnChoice(page, '#grid-chips');
  const { segments } = await boxes(page, '#grid-chips');
  expect(segments[2].x).toBeLessThan(segments[0].x);
  await app.openSetting('#cut-mode');
  await page.getByRole('radio', { name: 'Silueta' }).check();
  await expectThumbOnChoice(page, '#cut-mode');
});

test('the thumb slides to the chosen segment, and jumps there under reduced motion', async ({ app, page }) => {
  await app.openSetting('#cut-mode');
  const thumb = page.locator('#cut-mode .seg-thumb');
  const duration = () => thumb.evaluate((el) => getComputedStyle(el).transitionDuration.split(', ').map(parseFloat));
  const property = () => thumb.evaluate((el) => getComputedStyle(el).transitionProperty);
  expect([await property(), await duration()]).toEqual(['none', [0]]);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await property()).toBe('transform, width');
  expect((await duration()).every((s) => s > 0.1 && s < 0.2)).toBe(true);
});
