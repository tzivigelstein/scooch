// What an action adds ends up in view and selected: files added to a full
// sheet go to the next one and the stage scrolls there; pasted and duplicated
// pieces the same. Something added where it can already be seen doesn't move
// the view. (Which sheet they land on, and what is announced, is in
// tests/state/sheets.test.ts.)
import type { Page } from '@playwright/test';
import { frames } from '../support/canvas.ts';
import { clipboardKey } from '../support/keyboard.ts';
import { cards, expect, test, type App } from '../support/test.ts';

/** Where a piece is against the stage's visible box, the stage's scroll and what is selected. */
const SEEN = (id: number) => {
  const piece = document.querySelector(`#sheets .piece[data-id="${id}"]`)!.getBoundingClientRect();
  const stage = document.getElementById('stage')!;
  const s = stage.getBoundingClientRect();
  return {
    inside: piece.left >= s.left - 0.5 && piece.top >= s.top - 0.5 && piece.right <= s.left + stage.clientWidth + 0.5 && piece.bottom <= s.top + stage.clientHeight + 0.5,
    scrollTop: stage.scrollTop,
    selected: [...document.querySelectorAll<HTMLElement>('#sheets .piece.is-selected')].map((p) => Number(p.dataset.id)),
  };
};

const seen = (page: Page, id: number) => page.evaluate(SEEN, id);
const scrollStage = (page: Page, top: number) => page.evaluate((y) => document.getElementById('stage')!.scrollTo(0, y), top);

/** The ids of the pieces on the sheet at `index`. */
const onSheet = (page: Page, index: number) =>
  page.evaluate((i) => [...document.querySelectorAll<HTMLElement>('#sheets .page')[i].querySelectorAll<HTMLElement>('.piece')].map((p) => Number(p.dataset.id)), index);

/** Sheet 1 full with 9 business cards, nothing selected, the stage at its top. */
async function fullFirstSheet(app: App) {
  await app.addFiles(cards(0, 9));
  await app.page.keyboard.press('Escape');
  await expect(app.page.locator('#sheets .page')).toHaveCount(1);
  await scrollStage(app.page, 0);
  await frames(app.page);
}

test('sheet 1 full: an added image lands on sheet 2, which scrolls into view with the piece selected, and its sheet is announced', async ({ app, page }) => {
  await fullFirstSheet(app);
  await app.addFiles(['card09.png']);
  const [added] = await onSheet(page, 1);
  expect(added).toBeDefined();
  await expect.poll(() => seen(page, added)).toMatchObject({ inside: true, selected: [added] });
  expect((await seen(page, added)).scrollTop).toBeGreaterThan(0);
  await app.heard(/Se agregó 1 archivo a la hoja 2/);
  expect((await app.notice()).text).toBe('');
});

test('an image added where it can already be seen leaves the stage where it was', async ({ app, page }) => {
  await app.addFiles(cards(0, 3));
  await page.keyboard.press('Escape');
  // A little scrolled, with the first sheet still in view.
  await scrollStage(page, 8);
  await frames(page);
  const before = (await page.evaluate(() => document.getElementById('stage')!.scrollTop)) as number;
  await app.addFiles(['card03.png']);
  const added = Math.max(...(await onSheet(page, 0)));
  await expect.poll(() => seen(page, added)).toMatchObject({ inside: true, selected: [added] });
  await frames(page);
  expect((await seen(page, added)).scrollTop).toBe(before);
});

test('pasted and duplicated pieces that go on to sheet 2 bring it into view, selected', async ({ app, page }) => {
  await fullFirstSheet(app);
  const [first] = await onSheet(page, 0);

  await test.step('Ctrl+C and Ctrl+V on a full sheet: the copy lands on sheet 2, in view and selected', async () => {
    await app.piece(first).click();
    await clipboardKey(page, 'copy');
    await clipboardKey(page, 'paste');
    await expect(page.locator('#sheets .page')).toHaveCount(2);
    const [pasted] = await onSheet(page, 1);
    await expect.poll(() => seen(page, pasted)).toMatchObject({ inside: true, selected: [pasted] });
    expect((await seen(page, pasted)).scrollTop).toBeGreaterThan(0);
  });

  await test.step('back at the top, Ctrl+D on a piece of sheet 1: the copy goes to sheet 2, in view and selected', async () => {
    await scrollStage(page, 0);
    await frames(page);
    await app.piece(first).click({ force: true });
    await page.keyboard.press('Control+d');
    await expect.poll(async () => (await onSheet(page, 1)).length).toBe(2);
    const copy = Math.max(...(await onSheet(page, 1)));
    await expect.poll(() => seen(page, copy)).toMatchObject({ inside: true, selected: [copy] });
    expect((await seen(page, copy)).scrollTop).toBeGreaterThan(0);
  });
});
