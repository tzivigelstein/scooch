// A measurement field out of range in a real browser: the sheet's margin guide
// previews the clamped value while typing, the field shows its limit, and Esc
// puts the guide back with the focus on the sheet. The field's own behavior
// (clamping, the limit's text and ARIA, one undo step, Esc without a step) is
// in tests/components/LengthField.test.tsx; the notice waiting while editing,
// in tests/components/NoticePill.test.tsx; the X range, in
// tests/state/units-and-fields.test.ts. One theme: it doesn't change any of this.
import type { Page } from '@playwright/test';
import { cards, expect, test } from '../support/test.ts';

/** The margin guide's inset on screen, in mm of the sheet (A4 portrait: 210 mm wide). */
const guideMm = (page: Page) =>
  page.evaluate(() => {
    const zoom = parseFloat(document.querySelector<HTMLElement>('.sheet-box')!.style.width) / 210;
    return Math.round((parseFloat(document.querySelector<HTMLElement>('.safe')!.style.inset) / zoom) * 1000) / 1000;
  });

/** Selects the margin's text and types `text` in it, key by key. */
async function typeMargin(page: Page, text: string) {
  const margin = page.locator('#margin');
  await margin.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text);
}

test.beforeEach(async ({ app }) => {
  await app.addFiles(cards(0, 2));
  await app.openSetting('#margin');
  expect(await guideMm(app.page)).toBe(10);
});

test('margin 21312 → while typing, the guide draws the clamped 50 mm margin and the field shows «Máximo 50 mm»', async ({ page }) => {
  await typeMargin(page, '21312');
  await expect.poll(() => guideMm(page)).toBe(50);
  const limit = page.locator('#margin-limit');
  await expect(limit).toBeVisible();
  await expect(limit).toHaveText('Máximo 50 mm');
  await expect(page.locator('#margin')).toBeFocused();
});

test('30 shows in the guide while typing', async ({ page }) => {
  await typeMargin(page, '30');
  await expect.poll(() => guideMm(page)).toBe(30);
  await expect(page.locator('#margin-limit')).toHaveCount(0);
});

test('Esc puts the guide back as it was and the focus returns to the sheet', async ({ page }) => {
  await typeMargin(page, '30');
  await expect.poll(() => guideMm(page)).toBe(30);
  await page.keyboard.press('Escape');
  await expect(page.locator('#margin')).toHaveValue('10');
  await expect.poll(() => guideMm(page)).toBe(10);
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#sheets') && !document.activeElement?.closest('.panel'))).toBe(true);
});
