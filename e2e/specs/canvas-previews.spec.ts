// What a hovered or focused control shows on the sheets, in a real browser: the
// overlay comes with the hover or the keyboard focus and goes when the control
// is left, it never takes the pointer, activating applies exactly what it
// previewed, a touch shows nothing, and «Imán» shows its grid while dragging.
// What each control shows, exactly, is tested on the stores
// (tests/state/canvas-previews.test.ts), how it is drawn in
// tests/components/preview-layer.test.tsx and which control shows it in
// tests/hooks/preview-triggers.test.tsx.
import type { Locator, Page } from '@playwright/test';
import { frames } from '../support/canvas.ts';
import { Fingers } from '../support/touch.ts';
import { expect, test, tiles } from '../support/test.ts';

/** Screen boxes, rounded to the px. */
const boxesOf = (page: Page, selector: string) =>
  page.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => {
    const r = el.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map(Math.round);
  }), selector);

async function boxOf(locator: Locator) {
  const r = (await locator.boundingBox())!;
  return [r.x, r.y, r.width, r.height].map(Math.round);
}

/** The pointer where nothing reacts to it (the canvas's bottom right corner). */
const away = async (page: Page) => {
  const r = (await page.locator('#stage').boundingBox())!;
  await page.mouse.move(r.x + r.width - 30, r.y + r.height - 80);
};

test.describe('the canvas shows what a control does', () => {
  test('hovering «Margen» tints the margin of every sheet; moving away clears it', async ({ app, page }) => {
    await app.addFiles(tiles(0, 2));
    await page.locator('#add-sheet').click();
    await app.openSetting('#margin');
    await page.locator('label:has(#margin)').hover();
    await expect(page.locator('.preview-margin')).toHaveCount(2);
    await away(page);
    await expect(page.locator('.preview')).toHaveCount(0);
  });

  test('from the keyboard: the focused align button shows a ghost the pointer goes through; Enter puts the piece exactly there and the ghost goes', async ({ app, page }) => {
    await app.addFiles(tiles(0, 2));
    const [id] = await app.ids();
    await app.clickPiece(app.piece(id));
    await app.openMeasures();
    await page.locator('[data-align="centerX"]').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-align="right"]')).toBeFocused();
    const ghost = page.locator('.preview-ghost');
    await expect(ghost).toHaveCount(1);
    await expect(page.locator('.preview-line')).toHaveCount(1);
    const where = await boxOf(ghost);
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.preview') ?? null, [where[0] + where[2] / 2, where[1] + where[3] / 2]);
    expect(hit, 'the ghost doesn’t take the pointer').toBeNull();
    await page.keyboard.press('Enter');
    await expect(page.locator('.preview')).toHaveCount(0);
    expect(await boxOf(app.piece(id))).toEqual(where);
  });

  test('hovering «Duplicar ×3» shows the copies as ghosts; clicking adds them exactly there', async ({ app, page }) => {
    await app.addFiles(tiles(0, 1));
    const [id] = await app.ids();
    await app.clickPiece(app.piece(id));
    await app.openMeasures();
    await page.locator('#dup-count').fill('3');
    await page.locator('#dup-many').hover();
    await expect(page.locator('.preview-ghost')).toHaveCount(3);
    const ghosts = (await boxesOf(page, '.preview-ghost')).sort();
    await page.locator('#dup-many').click();
    await expect(app.pieces()).toHaveCount(4);
    await expect(page.locator('.preview')).toHaveCount(0);
    const copies = (await boxesOf(page, `#sheets .piece:not([data-id="${id}"])`)).sort();
    expect(copies).toEqual(ghosts);
  });

  test('hovering a row of the list outlines its piece, without selecting it or scrolling', async ({ app, page }) => {
    await app.addFiles(tiles(0, 3));
    const [a, b] = await app.ids();
    await app.selectIds([a]);
    const scroll = await page.locator('#stage').evaluate((el) => el.scrollTop);
    await app.row(b).hover();
    const outline = page.locator('.preview-outline');
    await expect(outline).toHaveCount(1);
    const [ox, oy, ow, oh] = await boxOf(outline);
    const [px, py, pw, ph] = await boxOf(app.piece(b));
    expect(ox < px && oy < py && ox + ow > px + pw && oy + oh > py + ph, 'around the piece').toBe(true);
    expect(await app.selectedIds()).toEqual([a]);
    expect(await page.locator('#stage').evaluate((el) => el.scrollTop)).toBe(scroll);
  });

  test('hovering the notice of a piece off the sheet outlines that piece', async ({ app, page }) => {
    await app.addFiles(tiles(0, 2));
    const [a] = await app.ids();
    await app.setPosition(a, -30, 20);
    await page.keyboard.press('Escape');
    await expect(page.locator('#pill-text')).toContainText('se sale de la hoja');
    await page.locator('#pill').hover();
    await expect(page.locator('.preview-outline.is-problem')).toHaveCount(1);
  });

  test('dragging a piece with «Imán» shows the grid it snaps to, even when the grid is hidden, until it is dropped', async ({ app, page }) => {
    await app.addFiles(tiles(0, 1));
    const grid = page.locator('#sheets .grid-layer').first();
    await expect(grid).toBeHidden();
    const r = (await app.pieces().first().boundingBox())!;
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + 40, r.y + r.height / 2 + 30, { steps: 6 });
    await expect(grid).toBeVisible();
    await page.mouse.up();
    await expect(grid).toBeHidden();
  });

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true });

    test('tapping a field shows nothing on the canvas', async ({ app, page }) => {
      await app.addFiles(tiles(0, 1));
      await app.openSetting('#margin');
      const r = (await page.locator('#margin').boundingBox())!;
      const fingers = await Fingers.on(page);
      await fingers.press({ 1: { x: r.x + r.width / 2, y: r.y + r.height / 2 } });
      await fingers.lift();
      await expect(page.locator('#margin')).toBeFocused();
      await frames(page);
      await expect(page.locator('.preview')).toHaveCount(0);
    });
  });
});
