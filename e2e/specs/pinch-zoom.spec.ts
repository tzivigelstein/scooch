// Two fingers on a phone's canvas (390 px, touches through the DevTools
// protocol, so the browser's own gestures and touch-action take part): a pinch
// zooms the sheets around the fingers and the zoom becomes a hand-picked one,
// two fingers moving together pan, the zoom stops at the ends of its range, a
// pinch never moves a piece, and the browser's page zoom stays off the canvas
// but works over a panel. Lifted while panning, the sheets glide on until
// they stop, and anything new stops them. In crop mode two fingers still zoom
// and pan the view and leave the crop as it was. The pinch's math is in
// tests/core/zoom.test.js and tests/properties/pinch.test.js, the glide's in
// tests/core/glide.test.js and tests/properties/glide.test.js; their frames
// with 150 pieces, in performance.spec.ts.
import type { Page } from '@playwright/test';
import { glideDistance } from '../../src/core/glide.js';
import { PX_PER_MM, frames, stageBox, stageState } from '../support/canvas.ts';
import { FRAME_MS, Fingers, type Spot } from '../support/touch.ts';
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
  await app.showTab('project');
  const panel = (await page.locator('#props-panel').boundingBox())!;
  const at = { x: panel.x + panel.width / 2, y: panel.y + Math.min(panel.height / 2, 160) };
  const { inPanel, chain } = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    const values: string[] = [];
    for (let el = hit; el; el = el.parentElement) values.push(getComputedStyle(el).touchAction);
    return { inPanel: !!hit?.closest('#props-panel'), chain: values };
  }, at);
  expect(inPanel, 'the panel is under the fingers').toBe(true);
  expect(chain.every((value) => value === 'auto'), `from the panel up, nothing holds the page zoom back (${chain.join(' < ')})`).toBe(true);
  const fingers = await Fingers.on(page);
  await fingers.pinch(at, 60, 240);
  await expect.poll(() => pageScale(page), { message: 'a pinch over the panel zooms the page' }).toBeGreaterThan(1.5);
});

// ---------- The glide after two fingers pan ----------

/** Five sheets, the first with four cards, scrolled to the top: room to glide down. */
async function fiveSheets(app: App) {
  await app.addFiles(cards(0, 4));
  for (let i = 0; i < 4; i++) await app.page.locator('#add-sheet').click();
  await expect(app.page.locator('#sheets .page')).toHaveCount(5);
  await app.page.keyboard.press('Escape');
  await app.page.locator('#stage').evaluate((el) => (el.scrollTop = 0));
}

/**
 * Two fingers 100 px apart across `at` that move together by `step` px a
 * frame for 8 frames, on the fingers' clock (so their speed is exactly
 * step / FRAME_MS px per ms); still down.
 */
async function panTogether(page: Page, at: Spot, step: Spot) {
  const fingers = await Fingers.on(page);
  fingers.clock = Date.now();
  const pair = (i: number) => ({ 1: { x: at.x - 50 + step.x * i, y: at.y + step.y * i }, 2: { x: at.x + 50 + step.x * i, y: at.y + step.y * i } });
  await fingers.press(pair(0));
  for (let i = 1; i <= 8; i++) await fingers.move(pair(i));
  return fingers;
}

/** Starts noting the stage's scroll every frame (until scrollsNoted). */
const noteScrolls = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { scrolls: number[]; noting: boolean };
    const stage = document.getElementById('stage')!;
    w.scrolls = [];
    w.noting = true;
    const note = () => {
      if (!w.noting) return;
      w.scrolls.push(stage.scrollTop);
      requestAnimationFrame(note);
    };
    requestAnimationFrame(note);
  });

/** For how many frames the stage's scroll has stayed where it is. */
const stillFor = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { scrolls: number[] }).scrolls;
    let n = 0;
    while (n < s.length - 1 && s[s.length - 1 - n] === s[s.length - 2 - n]) n++;
    return n;
  });

/** Stops noting and returns the scroll of each frame. */
const scrollsNoted = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { scrolls: number[]; noting: boolean };
    w.noting = false;
    return w.scrolls;
  });

/** Lifts the fingers and waits until the stage has stayed put for 10 frames; returns its scroll each frame. */
async function liftAndSettle(page: Page, fingers: Fingers) {
  await noteScrolls(page);
  await fingers.lift();
  await expect.poll(() => stillFor(page), { message: 'the sheets come to rest' }).toBeGreaterThanOrEqual(10);
  return scrollsNoted(page);
}

test.describe('the glide after two fingers pan', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('lifted while panning, the sheets glide on the same way, slowing down, as far as that speed goes, and never back', async ({ app, page }) => {
    await fiveSheets(app);
    const fit = await stageState(page);
    const fingers = await panTogether(page, await emptySpot(page), { x: 0, y: -24 });
    const released = (await stageState(page)).scrollTop;
    expect(released - fit.scrollTop, 'the fingers panned 8 × 24 px').toBeCloseTo(192, 0);
    const seen = (await liftAndSettle(page, fingers)).filter((top, i, all) => i === 0 || top !== all[i - 1]);
    expect(seen.every((top, i) => i === 0 || top > seen[i - 1]), `always down: ${seen.join(', ')}`).toBe(true);
    const glided = seen.at(-1)! - released;
    expect(Math.abs(glided - glideDistance(24 / FRAME_MS)), `${glided} px after the fingers lifted`).toBeLessThanOrEqual(2);
    // Each frame noted while it moved: the first half of them went much further than the second.
    const half = Math.floor(seen.length / 2);
    expect(seen[half] - seen[0], 'it slows down').toBeGreaterThan(3 * (seen.at(-1)! - seen[half]));
    const now = await stageState(page);
    expect(now.pct, 'the zoom as it was').toBe(fit.pct);
    expect(now.scrollLeft).toBe(0);
  });

  test('fingers that stop before lifting leave the sheets where they are, and so does a zoom: it never goes on', async ({ app, page }) => {
    await fiveSheets(app);
    const at = await emptySpot(page);
    const fingers = await panTogether(page, at, { x: 0, y: -24 });
    const held = await stageState(page);
    // A tenth of a second still before lifting.
    fingers.wait(100);
    expect(new Set(await liftAndSettle(page, fingers)), 'no glide').toEqual(new Set([held.scrollTop]));

    // One finger still and the other moving away from it: the midpoint moves too, but the fingers were zooming.
    const zoom = await Fingers.on(page);
    zoom.clock = Date.now();
    await zoom.press({ 1: { x: at.x - 60, y: at.y }, 2: { x: at.x, y: at.y } });
    for (let i = 1; i <= 8; i++) await zoom.move({ 2: { x: at.x + i * 12, y: at.y - i * 4 } });
    const zoomed = await stageState(page);
    expect(zoomed.pct, 'it zoomed').toBeGreaterThan(held.pct * 1.5);
    expect(new Set(await liftAndSettle(page, zoom)), 'no glide').toEqual(new Set([zoomed.scrollTop]));
    const after = await stageState(page);
    expect(after.pct, 'the zoom stopped with the fingers').toBe(zoomed.pct);
    expect(after.scrollLeft).toBe(zoomed.scrollLeft);
  });

  test('with reduced motion the sheets stop as the fingers lift', async ({ app, page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fiveSheets(app);
    const fingers = await panTogether(page, await emptySpot(page), { x: 0, y: -24 });
    const released = (await stageState(page)).scrollTop;
    expect(new Set(await liftAndSettle(page, fingers))).toEqual(new Set([released]));
  });

  test('a new touch, the wheel, a key or the zoom buttons stop the glide at once', async ({ app, page }) => {
    await fiveSheets(app);
    const at = await emptySpot(page);
    const stoppers: [string, () => Promise<unknown>][] = [
      [
        'a finger',
        async () => {
          const finger = await Fingers.on(page);
          await finger.press({ 3: at });
          return finger;
        },
      ],
      ['the wheel', () => page.mouse.move(at.x, at.y).then(() => page.mouse.wheel(40, 0))],
      ['a key', () => page.keyboard.press('Shift')],
      ['the zoom buttons', () => page.locator('#zoom-in').click()],
    ];
    for (const [name, stop] of stoppers) {
      await test.step(name, async () => {
        await page.locator('#stage').evaluate((el) => (el.scrollTop = 0));
        const fingers = await panTogether(page, at, { x: 0, y: -24 });
        await fingers.lift();
        const lifted = (await stageState(page)).scrollTop;
        await frames(page, 1);
        expect((await stageState(page)).scrollTop, 'gliding').toBeGreaterThan(lifted);
        const held = await stop();
        await frames(page, 2);
        const stopped = (await stageState(page)).scrollTop;
        await frames(page, 10);
        expect((await stageState(page)).scrollTop, 'stopped').toBe(stopped);
        if (held instanceof Fingers) await held.lift();
      });
    }
  });
});

// ---------- Crop mode ----------

/** The crop in mm from the first sheet's corner: its frame and the whole image under it. */
const cropMm = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector('#sheets .sheet-box')!.getBoundingClientRect();
    const k = 210 / box.width;
    const mm = (sel: string) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return { x: (r.x - box.x) * k, y: (r.y - box.y) * k, w: r.width * k, h: r.height * k };
    };
    return { frame: mm('#crop-frame'), image: mm('.crop-ghost') };
  });

type CropMm = Awaited<ReturnType<typeof cropMm>>;

function expectSameCrop(now: CropMm, then: CropMm, what: string) {
  for (const part of ['frame', 'image'] as const) {
    for (const key of ['x', 'y', 'w', 'h'] as const) expect(now[part][key], `${what}: the ${part}'s ${key} (mm)`).toBeCloseTo(then[part][key], 1);
  }
}

/** How the whole image sits in the piece's box: image width over box width (a crop shows as more than 1). */
const cropRatio = (page: Page) =>
  page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('#sheets .piece')!;
    const img = node.querySelector('img')!;
    return parseFloat(img.style.width) / parseFloat(node.style.width);
  });

/** One wide image in crop mode with its image zoomed in under the frame (room to move it), focused. */
async function cropping(app: App) {
  await app.addFiles(['wide.png']);
  const [id] = await app.ids();
  await app.piece(id).focus();
  await app.page.keyboard.press('k');
  await expect(app.page.locator('#crop-frame')).toBeFocused();
  for (let i = 0; i < 4; i++) await app.page.keyboard.press('+');
  await expect.poll(async () => ((c) => c.image.w / c.frame.w)(await cropMm(app.page))).toBeGreaterThan(1.4);
}

/** The middle of the crop window, and a spot on the sheet below the whole image (outside the crop). */
async function cropSpots(page: Page) {
  const spots = await page.evaluate(() => {
    const frame = document.getElementById('crop-frame')!.getBoundingClientRect();
    const image = document.querySelector('.crop-ghost')!.getBoundingClientRect();
    const sheet = document.querySelector('#sheets .sheet-box')!.getBoundingClientRect();
    const beside = { x: sheet.left + sheet.width / 2, y: image.bottom + 60 };
    const hit = document.elementFromPoint(beside.x, beside.y);
    return { on: { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 }, beside, onSheet: !!hit?.closest('.sheet') && !hit.closest('.crop, .piece') };
  });
  expect(spots.onSheet, 'the spot beside the crop is on the empty sheet').toBe(true);
  return spots;
}

/** Spreads two fingers already down at `a` and `b` apart along the line between them, 12 px more a frame for 8 frames. */
async function spread(fingers: Fingers, a: Spot, b: Spot) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / d;
  const uy = (b.y - a.y) / d;
  for (let i = 1; i <= 8; i++) await fingers.move({ 1: { x: a.x - ux * i * 6, y: a.y - uy * i * 6 }, 2: { x: b.x + ux * i * 6, y: b.y + uy * i * 6 } });
}

/** Crop mode is still on, with its frame focused; Enter applies the crop as `then` showed it, in one undo step. */
async function enterApplies(app: App, then: CropMm) {
  const { page } = app;
  await expect(page.locator('#crop-frame'), 'still in crop mode, ready for the keys').toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#crop-frame')).toHaveCount(0);
  expect(await cropRatio(page), 'the crop as it was').toBeCloseTo(then.image.w / then.frame.w, 2);
  await page.keyboard.press('Control+z');
  await expect.poll(() => cropRatio(page), { message: 'one undo step brings back the whole image' }).toBeCloseTo(1, 3);
}

test.describe('a pinch in crop mode', () => {
  test('starting on the crop window, with the other finger beside it, zooms the view and leaves the crop as it was; Enter then applies it', async ({ app, page }) => {
    await cropping(app);
    const before = await cropMm(page);
    const fit = (await stageState(page)).pct;
    const { on, beside } = await cropSpots(page);
    const fingers = await Fingers.on(page);
    await fingers.press({ 1: on });
    await frames(page, 1);
    await fingers.press({ 2: beside });
    await spread(fingers, on, beside);
    await fingers.lift();
    expect((await stageState(page)).pct, 'it zoomed').toBeGreaterThan(fit * 1.3);
    expectSameCrop(await cropMm(page), before, 'after the pinch');
    await expect(page.locator('.crop')).not.toHaveClass(/\bis-(panning|resizing)\b/);
    await enterApplies(app, before);
  });

  test('a second finger while one drags the image puts the image back where it was before it, and the two zoom the view', async ({ app, page }) => {
    await cropping(app);
    const before = await cropMm(page);
    const fit = (await stageState(page)).pct;
    const { on, beside } = await cropSpots(page);
    const shown = (await page.locator('.crop-ghost').boundingBox())!;
    const fingers = await Fingers.on(page);
    await fingers.press({ 1: on });
    for (let i = 1; i <= 6; i++) await fingers.move({ 1: { x: on.x + i * 4, y: on.y + i * 3 } });
    const dragged = (await page.locator('.crop-ghost').boundingBox())!;
    expect(dragged.x - shown.x, 'one finger moves the image all the way').toBeCloseTo(24, 0);
    expect(dragged.y - shown.y).toBeCloseTo(18, 0);
    const held = { x: on.x + 24, y: on.y + 18 };
    await fingers.press({ 2: beside });
    await frames(page, 1);
    expectSameCrop(await cropMm(page), before, 'the second finger landed');
    await expect(page.locator('.crop')).not.toHaveClass(/\bis-panning\b/);
    await spread(fingers, held, beside);
    await fingers.lift();
    expect((await stageState(page)).pct, 'it zoomed').toBeGreaterThan(fit * 1.3);
    expectSameCrop(await cropMm(page), before, 'after the pinch');
    await enterApplies(app, before);
  });

  test('a second finger while one drags an edge puts the frame back as it was before it', async ({ app, page }) => {
    await cropping(app);
    const before = await cropMm(page);
    const { on } = await cropSpots(page);
    const edge = (await page.locator('.crop-handle[data-handle="e"]').boundingBox())!;
    const grab = { x: edge.x + edge.width / 2, y: edge.y + edge.height / 2 };
    const fingers = await Fingers.on(page);
    await fingers.press({ 1: grab });
    for (let i = 1; i <= 6; i++) await fingers.move({ 1: { x: grab.x - i * 5, y: grab.y } });
    expect((await cropMm(page)).frame.w, 'the frame narrower').toBeLessThan(before.frame.w - 3);
    await fingers.press({ 2: on });
    await frames(page, 1);
    expectSameCrop(await cropMm(page), before, 'the second finger landed');
    await expect(page.locator('.crop')).not.toHaveClass(/\bis-resizing\b/);
    await spread(fingers, { x: grab.x - 30, y: grab.y }, on);
    await fingers.lift();
    expectSameCrop(await cropMm(page), before, 'after the pinch');
    await enterApplies(app, before);
  });

  test('starting beside the crop it zooms the view too and leaves crop mode on; one finger there still applies the crop', async ({ app, page }) => {
    await cropping(app);
    const before = await cropMm(page);
    const fit = (await stageState(page)).pct;
    const { on, beside } = await cropSpots(page);
    const fingers = await Fingers.on(page);
    await fingers.press({ 1: beside });
    await frames(page, 1);
    await fingers.press({ 2: on });
    await spread(fingers, beside, on);
    await fingers.lift();
    expect((await stageState(page)).pct, 'it zoomed').toBeGreaterThan(fit * 1.3);
    expectSameCrop(await cropMm(page), before, 'after the pinch');
    await expect(page.locator('#crop-frame'), 'still in crop mode').toBeFocused();

    const { beside: tap } = await cropSpots(page);
    await fingers.press({ 1: tap });
    await fingers.lift();
    await expect(page.locator('#crop-frame'), 'a tap beside the crop applies it').toHaveCount(0);
    expect(await cropRatio(page)).toBeCloseTo(before.image.w / before.frame.w, 2);
  });
});
