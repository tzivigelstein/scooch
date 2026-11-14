// Usage tips in a real browser, end to end: one piece duplicated three times
// with the toolbar offers «Duplicar ×N», and «No volver a mostrar» keeps it
// away after reloading; the undo button three times offers Ctrl+Z; a file
// added again (recognized by its content) offers «Duplicar», whose button
// goes to the copies' count. The tip never takes the focus and is announced.
// What counts and when a tip is due: tests/core/tips.test.js,
// tests/state/usage-tips.test.ts; the box itself: tests/components/UsageTip.test.tsx.
// Everywhere else tips are off (App.tips).
import type { Page, TestInfo } from '@playwright/test';
import { saved } from '../support/projects.ts';
import { App, expect, norm, test } from '../support/test.ts';

/** The app opened with usage tips on, as a person has them. */
async function openWithTips(page: Page, info: TestInfo) {
  const app = new App(page, info);
  app.tips = true;
  await app.open();
  return app;
}

const tip = (page: Page) => page.locator('#usage-tip');
const tipText = (page: Page) => page.locator('#usage-tip-text');
const focusInTip = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('#usage-tip'));

/** Selects the first piece and duplicates it with the toolbar, one copy at a time: `n` pieces in all at the end. */
async function duplicateOneByOne(app: App, times: number) {
  const page = app.page;
  await app.clickPiece(app.pieces().first());
  const start = await app.pieces().count();
  for (let i = 1; i <= times; i++) {
    if (i === times) await expect(tip(page)).toBeHidden();
    await page.locator('#piecebar [data-action="duplicate"]').click();
    // The tip, when due, comes in the same render as the copy.
    await expect(app.pieces()).toHaveCount(start + i);
  }
}

test('one piece duplicated three times offers «Duplicar ×N»; «No volver a mostrar» keeps it away after reloading', async ({ page }, info) => {
  const app = await openWithTips(page, info);
  await app.addFiles(['small.jpg']);
  await duplicateOneByOne(app, 3);
  await expect(tip(page)).toBeVisible();
  await expect(tip(page)).toHaveAccessibleName('Consejo');
  await expect(tipText(page)).toHaveText('Puedes hacer varias copias de una vez: escribe cuántas junto a Duplicar, en la pestaña Pieza');
  await expect(page.locator('#usage-tip-action')).toHaveText('Ir a Duplicar');
  expect(await focusInTip(page)).toBe(false);
  await expect.poll(async () => norm(await page.locator('#live-polite').textContent())).toContain('Puedes hacer varias copias de una vez');

  await page.locator('#usage-tip-never').click();
  await expect(tip(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('scooch:usage-tips')!).dismissed)).toEqual(['duplicateMany']);

  await saved(page);
  await page.reload();
  await app.ready();
  await expect(app.pieces()).toHaveCount(4);
  await duplicateOneByOne(app, 3);
  await expect(app.pieces()).toHaveCount(7);
  await expect(tip(page)).toBeHidden();
});

test('the undo button three times offers Ctrl+Z, without taking the focus', async ({ page }, info) => {
  const app = await openWithTips(page, info);
  for (const name of ['small.jpg', 'square.webp', 'big.png']) await app.addFiles([name]);
  const undo = page.locator('#undo');
  await undo.click();
  await undo.click();
  await expect(tip(page)).toBeHidden();
  await undo.click();
  await expect(app.pieces()).toHaveCount(0);
  await expect(tipText(page)).toHaveText('También puedes deshacer con Ctrl+Z');
  await expect(page.locator('#usage-tip-action')).toHaveCount(0);
  expect(await focusInTip(page)).toBe(false);
  await page.locator('#usage-tip-close').click();
  await expect(tip(page)).toBeHidden();
});

test('a file added again twice offers «Duplicar», and its button goes to the copies’ count', async ({ page }, info) => {
  const app = await openWithTips(page, info);
  await app.addFiles(['small.jpg']);
  await app.addFiles(['small.jpg']);
  await expect(tip(page)).toBeHidden();
  await app.addFiles(['small.jpg']);
  await expect(tipText(page)).toHaveText('Duplicar y Rellenar con copias repiten una pieza sin agregar el archivo otra vez');
  await page.locator('#usage-tip-action').click();
  await expect(tip(page)).toBeHidden();
  await expect(page.locator('#props-tab-piece')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#dup-count')).toBeFocused();
});
