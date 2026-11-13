// Selecting from the pieces list shows the piece on the canvas, with real
// scrolling at the three layouts: a click or the arrows scroll the stage until
// the piece is fully visible (the focus stays in the list); Enter or a double
// click also move the focus to the piece (closing the list where it is an
// overlay); selecting on the canvas scrolls the row into the list. Never a
// horizontal scroll or a scrolled sheet. (The list as a listbox is in
// tests/components/PieceList.test.tsx.)
import type { Page } from '@playwright/test';
import { frames } from '../support/layout.ts';
import { cards, expect, test, type App } from '../support/test.ts';

/** Where a piece is against what can be seen of the stage (left of an open drawer excluded), and the focus. */
const SEEN = (id: number) => {
  const piece = document.querySelector(`#sheets .piece[data-id="${id}"]`)!.getBoundingClientRect();
  const stage = document.getElementById('stage')!;
  const s = stage.getBoundingClientRect();
  let left = s.left;
  const drawer = document.querySelector('.panel.is-drawer.is-open');
  if (drawer) {
    const r = drawer.getBoundingClientRect();
    if (r.left <= s.left + 4 && r.right < s.right - 48) left = Math.max(left, r.right);
  }
  const active = document.activeElement as HTMLElement | null;
  return {
    inside: piece.left >= left - 0.5 && piece.top >= s.top - 0.5 && piece.right <= s.left + stage.clientWidth + 0.5 && piece.bottom <= s.top + stage.clientHeight + 0.5,
    scrollTop: stage.scrollTop,
    scrollLeft: stage.scrollLeft,
    docOverflow: document.documentElement.scrollWidth - innerWidth,
    sheetScroll: [...document.querySelectorAll('#sheets .sheet')].some((sh) => sh.scrollTop || sh.scrollLeft),
    focusRow: active?.getAttribute('role') === 'option' ? Number(active.dataset.id) : null,
    focusPiece: active?.classList.contains('piece') ? Number(active.dataset.id) : null,
    selected: [...document.querySelectorAll<HTMLElement>('#sheets .piece.is-selected')].map((p) => Number(p.dataset.id)),
  };
};

/** The row of piece `id` is fully inside the list's box. */
const ROW_SEEN = (id: number) => {
  const list = document.getElementById('piece-list')!.getBoundingClientRect();
  const row = document.querySelector(`#piece-list [role="option"][data-id="${id}"]`)!.getBoundingClientRect();
  return row.top >= list.top - 0.5 && row.bottom <= list.bottom + 0.5;
};

const NO_SIDEWAYS = { scrollLeft: 0, sheetScroll: false };

const seen = (page: Page, id: number) => page.evaluate(SEEN, id);
const scrollStage = (page: Page, top: number) => page.evaluate((y) => document.getElementById('stage')!.scrollTo(0, y), top);

/** 20 business cards on 3 sheets; the ids of the first piece and of the first one on sheet 3. */
async function threeSheets(app: App) {
  await app.addFiles(cards(0, 20));
  await app.page.keyboard.press('Escape');
  const sheets = await app.page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#sheets .page')].map((page) => page.dataset.sheet!));
  expect(sheets).toHaveLength(3);
  const onSheet = (sheet: string) => app.page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(`#sheets .page[data-sheet="${s}"] .piece`)].map((p) => Number(p.dataset.id)), sheet);
  const third = await onSheet(sheets[2]);
  const first = (await onSheet(sheets[0]))[0];
  await scrollStage(app.page, 0);
  return { first, last: third[0], neighbor: third[1] };
}

/** Opens the list where it is an overlay (below 1100 px). */
async function openList(app: App, width: number) {
  if (width >= 1100 || (await app.page.locator('#pieces-panel').isVisible())) return;
  await app.page.locator(width < 800 ? '#pieces-dock' : '#pieces-toggle').click();
  await expect(app.page.locator('#pieces-panel')).toBeVisible();
}

for (const [width, height] of [
  [1440, 900],
  [1024, 768],
  [390, 844],
]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height } });

    if (width >= 800) {
      test('a click on a row shows its piece fully, with the focus still on the row; one already in view doesn’t scroll; ↑ and Shift+click show what they select', async ({ app, page }) => {
        const { first, last, neighbor } = await threeSheets(app);
        await openList(app, width);
        await app.row(last).click();
        await expect.poll(() => seen(page, last)).toMatchObject({ inside: true, focusRow: last, selected: [last], ...NO_SIDEWAYS });
        const x = await seen(page, last);
        expect(x.scrollTop).toBeGreaterThan(0);
        expect(x.docOverflow).toBeLessThanOrEqual(0);
        if (width < 1100) await expect(page.locator('#pieces-panel')).toBeVisible();

        await test.step('a piece already in view doesn’t scroll', async () => {
          await app.row(neighbor).click();
          await expect.poll(() => seen(page, neighbor)).toMatchObject({ inside: true, selected: [neighbor] });
          await frames(page);
          expect((await seen(page, neighbor)).scrollTop).toBe(x.scrollTop);
        });

        await test.step('↑ in the list selects the previous one and shows it, the focus in the list', async () => {
          await scrollStage(page, 0);
          await page.keyboard.press('ArrowUp');
          await expect.poll(() => seen(page, last)).toMatchObject({ inside: true, focusRow: last, selected: [last] });
        });

        await test.step('Shift+click across sheets shows the primary piece', async () => {
          await scrollStage(page, 99999);
          await app.row(first).click({ modifiers: ['Shift'] });
          await expect.poll(() => seen(page, first)).toMatchObject({ inside: true });
          expect((await seen(page, first)).selected.length).toBeGreaterThan(2);
        });
      });
    }

    test('Enter on a row moves the focus to its piece, fully visible, without sideways or sheet scroll', async ({ app, page }) => {
      const { last } = await threeSheets(app);
      await openList(app, width);
      await app.row(last).focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => seen(page, last)).toMatchObject({ focusPiece: last, inside: true, ...NO_SIDEWAYS });
      expect((await seen(page, last)).docOverflow).toBeLessThanOrEqual(0);
      if (width < 1100) await expect(page.locator('#pieces-panel')).toBeHidden();
    });

    if (width >= 1100) {
      test('a double click on a row moves the focus to its piece; selecting on the canvas scrolls its row into the list, the focus staying on the piece', async ({ app, page }) => {
        const { first, last } = await threeSheets(app);
        await scrollStage(page, 99999);
        await app.row(first).dblclick();
        await expect.poll(() => seen(page, first)).toMatchObject({ focusPiece: first, inside: true });

        await page.evaluate(() => (document.getElementById('piece-list')!.scrollTop = 0));
        await scrollStage(page, 99999);
        expect(await page.evaluate(ROW_SEEN, last)).toBe(false);
        await app.piece(last).click();
        await expect.poll(() => page.evaluate(ROW_SEEN, last)).toBe(true);
        await expect(app.row(last)).toHaveAttribute('aria-selected', 'true');
        expect((await seen(page, last)).focusPiece).toBe(last);
      });
    }
  });
}
