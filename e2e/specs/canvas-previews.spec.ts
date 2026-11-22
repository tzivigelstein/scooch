// What a hovered or focused control shows on the sheets, in a real browser: the
// overlay comes with the hover or the keyboard focus and goes when the control
// is left, it never takes the pointer, activating applies exactly what it
// previewed (also an option of «Tamaño de foto», hovered or reached with the
// arrows), a touch shows nothing, «Imán» shows its grid while dragging, and
// the piece toolbar steps aside for as long as such a control is in use.
// What each control shows, exactly, is tested on the stores
// (tests/state/canvas-previews.test.ts), how it is drawn in
// tests/components/preview-layer.test.tsx and which control shows it in
// tests/hooks/preview-triggers.test.tsx.
import type { Locator, Page } from '@playwright/test';
import { frames } from '../support/canvas.ts';
import { noteToolbar, toolbarNoted } from '../support/motion.ts';
import { Fingers } from '../support/touch.ts';
import { expect, test, tiles, type App } from '../support/test.ts';

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

  test('hovering an option of «Tamaño de foto» shows the piece at that size; moving away clears it; clicking it puts the piece exactly there', async ({ app, page }) => {
    await app.addFiles(tiles(0, 2));
    const [id] = await app.ids();
    await app.setPosition(id, 60, 80);
    const control = page.locator('#photo-size');
    await control.click();
    await expect(page.locator('#photo-size-list')).toBeVisible();
    await expect(page.locator('.preview')).toHaveCount(0);
    const option = page.locator('#photo-size-10x15');
    await option.hover();
    const ghost = page.locator('.preview-ghost');
    await expect(ghost).toHaveCount(1);
    await expect(ghost).not.toHaveClass(/is-blocked/);
    await expect(page.locator('.preview-dimmed')).toHaveCount(1);
    const where = await boxOf(ghost);
    expect(where).not.toEqual(await boxOf(app.piece(id)));
    await away(page);
    await expect(page.locator('.preview')).toHaveCount(0);
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    await option.hover();
    await expect(ghost).toHaveCount(1);
    await option.click();
    // The pointer now rests on what the list covered, which may show its own preview: not this one.
    await expect(page.locator('.preview-dimmed')).toHaveCount(0);
    await expect(control).toHaveAttribute('data-value', '10x15');
    await expect.poll(() => boxOf(app.piece(id))).toEqual(where);
  });

  test('from the keyboard: the option of «Tamaño de foto» reached with the arrows shows its ghost; Esc takes it away and keeps the focus; opened again, Enter puts the piece exactly there', async ({ app, page }) => {
    await app.addFiles(tiles(0, 2));
    const [id] = await app.ids();
    await app.setPosition(id, 60, 80);
    const before = await boxOf(app.piece(id));
    const control = page.locator('#photo-size');
    const ghost = page.locator('.preview-ghost');
    await away(page);
    await control.focus();
    await page.keyboard.press('ArrowDown');
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    await expect(control).toHaveAttribute('aria-activedescendant', 'photo-size-original');
    await expect(page.locator('.preview')).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(control).toHaveAttribute('aria-activedescendant', 'photo-size-10x15');
    await expect(ghost).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.preview')).toHaveCount(0);
    await expect(control).toBeFocused();
    expect(await boxOf(app.piece(id))).toEqual(before);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(ghost).toHaveCount(1);
    const where = await boxOf(ghost);
    await page.keyboard.press('Enter');
    await expect(page.locator('.preview')).toHaveCount(0);
    await expect(control).toBeFocused();
    await expect(control).toHaveAttribute('data-value', '10x15');
    await expect.poll(() => boxOf(app.piece(id))).toEqual(where);
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

    test('tapping a field shows nothing on the canvas', async ({ app, page, browserName }) => {
      test.skip(browserName !== 'chromium', 'the touch goes through the Chrome DevTools Protocol (Input.dispatchTouchEvent), which only Chromium has');
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

    test('tapping «Tamaño de foto» and then an option chooses it, with nothing shown on the canvas', async ({ app, page, browserName }) => {
      test.skip(browserName !== 'chromium', 'the touch goes through the Chrome DevTools Protocol (Input.dispatchTouchEvent), which only Chromium has');
      await app.addFiles(tiles(0, 1));
      const [id] = await app.ids();
      await app.setPosition(id, 60, 80);
      const fingers = await Fingers.on(page);
      const tap = async (target: Locator) => {
        const r = (await target.boundingBox())!;
        await fingers.press({ 1: { x: r.x + r.width / 2, y: r.y + r.height / 2 } });
        await fingers.lift();
      };
      await tap(page.locator('#photo-size'));
      await expect(page.locator('#photo-size-list')).toBeVisible();
      await tap(page.locator('#photo-size-10x15'));
      await expect(page.locator('#photo-size')).toHaveAttribute('data-value', '10x15');
      await expect(page.locator('#photo-size-list')).toBeHidden();
      await frames(page);
      await expect(page.locator('.preview')).toHaveCount(0);
    });
  });
});

test.describe('the piece toolbar steps aside for as long as the control showing something is in use, frame by frame (support/motion.ts)', () => {
  const bar = (page: Page) => page.locator('#piecebar');

  /**
   * One piece, selected, with its toolbar showing, and «Photo size» open with
   * the arrows on an option that shows the piece at that size: the toolbar has
   * stepped aside.
   */
  async function browsingPhotoSize(app: App) {
    const page = app.page;
    await app.addFiles(tiles(0, 1));
    const [id] = await app.ids();
    await app.setPosition(id, 60, 80);
    await away(page);
    await page.locator('#photo-size').focus();
    await expect(bar(page)).toHaveCSS('opacity', '1');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#photo-size')).toHaveAttribute('aria-activedescendant', 'photo-size-9x13');
    await expect(page.locator('.preview-ghost')).toHaveCount(1);
    await expect(bar(page)).toHaveCSS('opacity', '0');
  }

  /** Up to the chosen option (it shows nothing) and back down, and again, a few frames on each. */
  async function throughTheChosenOption(page: Page) {
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowUp', 'ArrowDown']) {
      await page.keyboard.press(key);
      await frames(page, 3);
    }
  }

  test.describe('with motion', () => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });

    test('through the options of «Photo size», the chosen one too, it never comes back until the list closes', async ({ app, page }) => {
      await browsingPhotoSize(app);
      await noteToolbar(page);
      await throughTheChosenOption(page);
      await page.keyboard.press('Escape');
      await expect(bar(page)).toHaveCSS('opacity', '1');
      const noted = await toolbarNoted(page);
      const open = noted.frames.filter((f) => f.open);
      expect(open.some((f) => !f.preview), 'the chosen option showed nothing').toBe(true);
      expect(open.map((f) => f.opacity), 'hidden at every frame while the list was open').toEqual(open.map(() => 0));
      expect(noted.transitions.filter((t) => t.open), 'no fading while the list was open').toEqual([]);
    });

    test('moving the pointer across the align buttons, over the gaps between them, it never comes back until the pointer leaves them', async ({ app, page }) => {
      await app.addFiles(tiles(0, 1));
      const [id] = await app.ids();
      await app.setPosition(id, 60, 80);
      // Nothing hovered or focused shows anything meanwhile (the list's row and the Y field would).
      await away(page);
      await page.evaluate(() => (document.activeElement as HTMLElement).blur());
      await expect(bar(page)).toHaveCSS('opacity', '1');
      const first = (await page.locator('[data-align="left"]').boundingBox())!;
      const third = (await page.locator('[data-align="right"]').boundingBox())!;
      const y = first.y + first.height / 2;
      await page.mouse.move(first.x + first.width / 2, y);
      await expect(page.locator('.preview-ghost')).toHaveCount(1);
      await expect(bar(page)).toHaveCSS('opacity', '0');
      await noteToolbar(page);
      // 3 px at a time: at least once on each gap (4 px), a few frames there.
      for (let x = first.x + first.width / 2; x <= third.x + third.width / 2; x += 3) {
        await page.mouse.move(x, y);
        await frames(page, 2);
      }
      const noted = await toolbarNoted(page);
      expect(noted.frames.map((f) => f.opacity), 'hidden at every frame').toEqual(noted.frames.map(() => 0));
      expect(noted.transitions, 'no fading').toEqual([]);
      await away(page);
      await expect(bar(page)).toHaveCSS('opacity', '1');
    });
  });

  test('with reduced motion, through the options of «Photo size», it is hidden at every frame until the list closes', async ({ app, page }) => {
    await browsingPhotoSize(app);
    await noteToolbar(page);
    await throughTheChosenOption(page);
    const noted = await toolbarNoted(page);
    expect(noted.frames.some((f) => !f.preview), 'the chosen option showed nothing').toBe(true);
    expect(noted.frames.map((f) => f.opacity), 'hidden at every frame').toEqual(noted.frames.map(() => 0));
    await page.keyboard.press('Escape');
    await expect(bar(page)).toHaveCSS('opacity', '1');
  });
});
