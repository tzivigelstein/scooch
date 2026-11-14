// Two fingers on a phone's canvas (390 px, touches through the DevTools
// protocol, so the browser's own gestures and touch-action take part): a pinch
// zooms the sheets around the fingers and the zoom becomes a hand-picked one,
// two fingers moving together pan, the zoom stops at the ends of its range, a
// pinch never moves a piece, and the browser's page zoom stays off the canvas
// but works over a panel. The pinch's math is in tests/core/zoom.test.js and
// tests/properties/pinch.test.js; its frames with 150 pieces, in
// performance.spec.ts.
import type { Page } from '@playwright/test';
import { PX_PER_MM, frames, stageBox, stageState } from '../support/canvas.ts';
import { Fingers, type Spot } from '../support/touch.ts';
import { cards, expect, test, type App } from '../support/test.ts';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** The sheet under a window point and that point on it, in mm (A4 portrait). */
const underPoint = (page: Page, at: Spot) =>
  page.evaluate(({ x, y }) => {
    for (const p of document.querySelectorAll<HTMLElement>('#sheets .page')) {
      const b = p.querySelector('.sheet-box')!.getBoundingClientRect();
      if (y >= b.top && y <= b.bottom) return { sheet: p.dataset.sheet, x: ((x - b.left) / b.width) * 210, y: ((y - b.top) / b.height) * 297 };
    }
    return null;
  }, at);

/** A spot on the first sheet below its pieces, in its middle: two fingers 300 px apart fit across it. */
const emptySpot = (page: Page) =>
  page.evaluate(() => {
    const b = document.querySelector('#sheets .sheet-box')!.getBoundingClientRect();
    const stage = document.getElementById('stage')!.getBoundingClientRect();
    return { x: stage.left + stage.width / 2, y: Math.min(b.top + b.height * 0.7, stage.bottom - 80) };
  });

/** How much the browser zoomed the page itself (1: not at all). */
const pageScale = (page: Page) => page.evaluate(() => visualViewport!.scale);

/**
 * Starts watching what the browser is told about touches: how many touch
 * pointers it took away from the page (it does when it handles a gesture
 * itself), and whether each move of two fingers was kept from it (seen after
 * the stage's own listeners, on the window).
 */
const watchTouches = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { touchLog: { cancels: number; moves: boolean[] } };
    w.touchLog = { cancels: 0, moves: [] };
    document.addEventListener('pointercancel', () => w.touchLog.cancels++, true);
    window.addEventListener('touchmove', (e) => e.touches.length > 1 && w.touchLog.moves.push(e.defaultPrevented));
  });
const touchLog = (page: Page) => page.evaluate(() => (window as unknown as { touchLog: { cancels: number; moves: boolean[] } }).touchLog);

/** The stored view preferences (scooch:view-preferences). */
const storedView = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('scooch:view-preferences') ?? 'null'));

/** A piece's center in window px. */
async function centerOf(app: App, id: number) {
  const b = (await app.piece(id).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Four cards and one undo step of a known kind after them: the second card 1 mm to the right, then nothing selected. */
async function cardsWithLastStep(app: App) {
  await app.addFiles(cards(0, 4));
  const ids = await app.ids();
  const x = (await app.geometry()).pieces[1].x;
  await app.piece(ids[1]).focus();
  await app.page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await app.geometry()).pieces[1].x).toBeCloseTo(x + 1, 3);
  await app.page.keyboard.press('Escape');
  await expect.poll(() => app.selectedIds()).toEqual([]);
  return { ids, x: x + 1 };
}

/** Ctrl+Z takes back the last step: it was the card moved by cardsWithLastStep, so nothing came after it. */
async function lastStepWasTheMove(app: App, x: number) {
  await app.page.keyboard.press('Control+z');
  await expect.poll(async () => (await app.geometry()).pieces[1].x).toBeCloseTo(x - 1, 3);
  await expect(app.pieces()).toHaveCount(4);
}

test.describe('pinching', () => {
  test('spreading two fingers zooms the sheets in around their midpoint, not the page, and the zoom is kept as one picked by hand', async ({ app, page }) => {
    await app.addFiles(cards(0, 4));
    await watchTouches(page);
    const fit = (await stageState(page)).pct;
    const at = await emptySpot(page);
    const before = (await underPoint(page, at))!;
    expect(before, 'a sheet under the fingers').not.toBeNull();

    const fingers = await Fingers.on(page);
    await fingers.pinch(at, 60, 240);
    const pct = (await stageState(page)).pct;
    expect(pct, 'four times as far apart, four times the zoom').toBeCloseTo(fit * 4, 1);
    await expect(page.locator('#zoom-level')).toHaveText(`${Math.round(pct)} %`);
    const after = (await underPoint(page, at))!;
    const z = (pct / 100) * PX_PER_MM;
    expect(after.sheet).toBe(before.sheet);
    expect(Math.abs(after.x - before.x) * z, 'the same point under the midpoint, across (px)').toBeLessThan(1);
    expect(Math.abs(after.y - before.y) * z, 'and down (px)').toBeLessThan(1);
    expect(await pageScale(page), 'the page itself not zoomed').toBe(1);
    const log = await touchLog(page);
    expect(log.cancels, 'the browser took no finger away').toBe(0);
    expect(log.moves.length, 'two-finger moves seen').toBeGreaterThan(0);
    expect(log.moves.every(Boolean), 'every one kept from the browser’s own scrolling and zoom').toBe(true);
    // Written once the zoom stops changing.
    await expect.poll(async () => (await storedView(page))?.zoomMode, { message: 'remembered on this device as a hand-picked zoom' }).toBe('manual');
    await expect.poll(async () => (await storedView(page)).zoomPct, { message: 'at that level' }).toBeCloseTo(pct, 1);
  });

  test('closing and spreading the fingers stops the zoom at 10 % and at 800 %', async ({ app, page }) => {
    await app.addFiles(cards(0, 4));
    const fingers = await Fingers.on(page);
    const s = await stageBox(page);
    const at = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
    await fingers.pinch(at, 300, 40);
    expect((await stageState(page)).pct).toBeCloseTo(10, 2);
    await expect(page.locator('#zoom-out')).toHaveAttribute('aria-disabled', 'true');
    await fingers.pinch(at, 300, 40);
    expect((await stageState(page)).pct, 'no further out').toBeCloseTo(10, 2);
    for (let i = 0; i < 3; i++) await fingers.pinch(at, 40, 300);
    expect((await stageState(page)).pct).toBeCloseTo(800, 2);
    await expect(page.locator('#zoom-in')).toHaveAttribute('aria-disabled', 'true');
    await fingers.pinch(at, 40, 300);
    expect((await stageState(page)).pct, 'no further in').toBeCloseTo(800, 2);
  });

  test('two fingers moving together pan the sheets without zooming, and a fitted zoom stays a fit', async ({ app, page }) => {
    await app.addFiles(cards(0, 4));
    await page.locator('#add-sheet').click();
    await page.locator('#add-sheet').click();
    await expect(page.locator('#sheets .page')).toHaveCount(3);
    await page.locator('#stage').evaluate((el) => (el.scrollTop = 0));
    const fingers = await Fingers.on(page);
    const at = await emptySpot(page);
    const fit = await stageState(page);
    // Their distance changes a little, as two real fingers' does.
    await fingers.pinch(at, 100, 108, { shift: { x: 0, y: -120 } });
    const panned = await stageState(page);
    expect(panned.pct, 'the same zoom').toBe(fit.pct);
    expect(Math.abs(panned.scrollTop - fit.scrollTop - 120), 'down 120 px').toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 360, height: 800 });
    await expect.poll(async () => (await stageState(page)).pct, { message: 'still a fit: it follows a narrower window' }).toBeLessThan(fit.pct - 1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#zoom-level').click();
    await page.locator('#zoom-menu-level-200').click();
    await expect(page.locator('#zoom-level')).toHaveText('200 %');
    const wide = await stageState(page);
    expect(wide.wide, 'zoomed past the stage’s width').toBe(true);
    const s = await stageBox(page);
    await fingers.pinch({ x: s.x + s.width / 2, y: s.y + s.height / 2 }, 120, 120, { shift: { x: -60, y: -80 } });
    const moved = await stageState(page);
    expect(moved.pct, 'the same zoom').toBe(wide.pct);
    expect(Math.abs(moved.scrollLeft - wide.scrollLeft - 60), 'across 60 px').toBeLessThanOrEqual(1);
    expect(Math.abs(moved.scrollTop - wide.scrollTop - 80), 'down 80 px').toBeLessThanOrEqual(1);
  });
});

test.describe('a pinch and the pieces', () => {
  test('a pinch that starts on a piece neither moves nor resizes it, adds no undo step and leaves the selection as it was', async ({ app, page }) => {
    const { ids, x } = await cardsWithLastStep(app);
    const shown = (await app.geometry()).pieces;
    const fit = (await stageState(page)).pct;
    const on = await centerOf(app, ids[0]);
    const fingers = await Fingers.on(page);
    await fingers.press({ 1: on });
    await frames(page, 1);
    await fingers.press({ 2: { x: on.x + 100, y: on.y + 60 } });
    for (let i = 1; i <= 8; i++) await fingers.move({ 1: { x: on.x - i * 8, y: on.y - i * 5 }, 2: { x: on.x + 100 + i * 8, y: on.y + 60 + i * 5 } });
    await fingers.lift();
    expect((await stageState(page)).pct, 'it zoomed').toBeGreaterThan(fit * 1.5);
    const now = (await app.geometry()).pieces;
    for (const [i, p] of now.entries()) {
      for (const key of ['x', 'y', 'w', 'h'] as const) expect(p[key], `piece ${p.id} ${key}`).toBeCloseTo(shown[i][key], 2);
      expect(p.sheet).toBe(shown[i].sheet);
    }
    expect(await app.selectedIds(), 'nothing selected, as before').toEqual([]);
    await expect(page.locator('#sheets > .marquee')).toBeHidden();
    await lastStepWasTheMove(app, x);
  });

  test('a second finger while a selected piece is dragged puts it back, adds no undo step and pinches instead', async ({ app, page }) => {
    const { ids, x } = await cardsWithLastStep(app);
    await app.piece(ids[0]).focus();
    await expect.poll(() => app.selectedIds()).toEqual([ids[0]]);
    const shown = (await app.geometry()).pieces;
    const fit = (await stageState(page)).pct;
    const on = await centerOf(app, ids[0]);
    const fingers = await Fingers.on(page);
    await fingers.press({ 1: on });
    for (let i = 1; i <= 6; i++) await fingers.move({ 1: { x: on.x + i * 6, y: on.y + i * 8 } });
    await expect(page.locator(`#drag-layer .piece[data-id="${ids[0]}"]`), 'being dragged').toHaveCount(1);
    const held = { x: on.x + 36, y: on.y + 48 };
    await fingers.press({ 2: { x: held.x + 90, y: held.y + 40 } });
    await expect(page.locator('#canvas'), 'the drag is over').not.toHaveClass(/\bis-dragging\b/);
    const back = (await app.geometry()).pieces[0];
    expect(back.sheet, 'back on its sheet').toBe(shown[0].sheet);
    for (let i = 1; i <= 8; i++) await fingers.move({ 1: { x: held.x - i * 8, y: held.y - i * 4 }, 2: { x: held.x + 90 + i * 8, y: held.y + 40 + i * 4 } });
    await fingers.lift();
    expect((await stageState(page)).pct, 'it zoomed').toBeGreaterThan(fit * 1.5);
    const now = (await app.geometry()).pieces;
    for (const key of ['x', 'y', 'w', 'h'] as const) expect(now[0][key], key).toBeCloseTo(shown[0][key], 2);
    expect(now[0].sheet).toBe(shown[0].sheet);
    expect(await app.selectedIds(), 'still the one selected').toEqual([ids[0]]);
    await lastStepWasTheMove(app, x);
  });
});

test('the page zoom stays off the canvas and keeps working over a panel', async ({ app, page }) => {
  await app.addFiles(cards(0, 2));
  expect(await page.locator('#stage').evaluate((el) => getComputedStyle(el).touchAction), 'the canvas: scrolling only').toBe('pan-x pan-y');
  await app.showTab('sheet');
  const panel = (await page.locator('#props-panel').boundingBox())!;
  const at = { x: panel.x + panel.width / 2, y: panel.y + Math.min(panel.height / 2, 160) };
  const chain = await page.evaluate(({ x, y }) => {
    const out: string[] = [];
    for (let el = document.elementFromPoint(x, y); el; el = el.parentElement) out.push(getComputedStyle(el).touchAction);
    return out;
  }, at);
  expect(chain.length, 'the panel is under the fingers').toBeGreaterThan(3);
  expect(chain.every((value) => value === 'auto'), `from the panel up, nothing holds the page zoom back (${chain.join(' < ')})`).toBe(true);
  const fingers = await Fingers.on(page);
  await fingers.pinch(at, 60, 240);
  await expect.poll(() => pageScale(page), { message: 'a pinch over the panel zooms the page' }).toBeGreaterThan(1.5);
});
