// Helpers for the canvas geometry specs (zoom-and-pan, off-sheet,
// floating-controls): the zoom and scroll of the stage, rectangles in window
// px, zooming with the wheel and the menu, scrolling a piece into a given spot
// of the stage, grabbing and dragging it there.
import type { Page } from '@playwright/test';
import { cards, expect, type App } from './test.ts';

/** CSS px per mm at 100 %. */
export const PX_PER_MM = 96 / 25.4;

/** The levels the zoom buttons step through (src/core/zoom.js). */
export const ZOOM_LEVELS = [10, 25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400, 600, 800];

/** A rectangle in window px. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Same rectangle within `tol` px on every side. */
export const nearRect = (a: Rect | null, b: Rect | null, tol = 1.5) => !!a && !!b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol;

/**
 * How far a piece's image may sit from its piece (px), by engine. The image is
 * centered in its piece with a transform (translate(−50%)), and WebKit draws
 * a transformed box on whole device pixels: up to half a pixel off at 1× (a
 * quarter on a 2× screen), where Chromium and Firefox keep it within 0.05 px.
 * Half a device pixel doesn't show; the bug this guards moved it by several.
 */
export const imageOnPiece = (browserName: string) => (browserName === 'webkit' ? 0.5 : 0.05);

/** The rectangles overlap (by more than half a px). */
export const hit = (a: Rect | null, b: Rect | null) => !!a && !!b && a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

/** `a` lies inside `b` (within `tol` px). */
export const inside = (a: Rect, b: Rect, tol = 1) => a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol;

export interface StageState {
  /** The zoom in percent (from the first sheet's box, A4 portrait). */
  pct: number;
  /** What the zoom control shows. */
  shown: string;
  scrollTop: number;
  scrollLeft: number;
  /** Zoomed past the stage's width: it scrolls sideways too. */
  wide: boolean;
  /** Some sheet scrolled inside itself (it never should). */
  sheetScroll: boolean;
  /** How far the page scrolls sideways (should be 0). */
  docOverflow: number;
  /** The notice's text, or ''. */
  pill: string;
  /** Sheets still marked as a drop target. */
  dropTargets: number;
}

/** The stage's zoom and scroll, read inside the page. */
export const readStage = (): StageState => {
  const stage = document.getElementById('stage')!;
  const box = document.querySelector<HTMLElement>('#sheets .sheet-box')!;
  const pill = document.getElementById('pill')!;
  return {
    pct: (parseFloat(box.style.width) / 210 / (96 / 25.4)) * 100,
    shown: (document.getElementById('zoom-level')!.textContent ?? '').replace(/\s/g, ' '),
    scrollTop: stage.scrollTop,
    scrollLeft: stage.scrollLeft,
    wide: stage.classList.contains('is-wide'),
    sheetScroll: [...document.querySelectorAll('#sheets .sheet')].some((sh) => sh.scrollTop || sh.scrollLeft),
    docOverflow: document.documentElement.scrollWidth - innerWidth,
    pill: pill.hidden ? '' : (document.getElementById('pill-text')!.textContent ?? ''),
    dropTargets: document.querySelectorAll('.page.is-drop-target').length,
  };
};

export const stageState = (page: Page) => page.evaluate(readStage);

/** Scrolls the stage to `top` px (and to its left edge). */
export const scrollStage = (page: Page, top: number) => page.evaluate((y) => document.getElementById('stage')!.scrollTo(0, y), top);

/** Resolves after `n` animation frames (what the app does on the next frame has happened). */
export const frames = (page: Page, n = 2) =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const next = (left: number) => (left ? requestAnimationFrame(() => next(left - 1)) : resolve());
        next(n);
      }),
    n
  );

/** The stage's box in window px. */
export const stageBox = async (page: Page) => (await page.locator('#stage').boundingBox())!;

/**
 * Turns the mouse wheel with Ctrl held at window point `at` (default: the
 * middle of the stage) so the zoom grows by `factor`: the app multiplies the
 * zoom by exp(−0.006 · deltaY) per wheel event (at most 60 px a notch), so the
 * turn is split in notches of 60 px or less, in whole pixels: the zoom
 * reached is within 0.3 % of `factor`. Leaves the mouse at `at`.
 */
export async function wheelZoom(page: Page, factor: number, at?: { x: number; y: number }) {
  const point = at ?? (await page.evaluate(() => {
    const stage = document.getElementById('stage')!;
    const r = stage.getBoundingClientRect();
    return { x: r.left + stage.clientWidth / 2, y: r.top + stage.clientHeight / 2 };
  }));
  await page.mouse.move(point.x, point.y);
  // Whole pixels: WebKit drops a delta's fraction (24.74 px arrives as 24).
  let total = Math.round(-Math.log(factor) / 0.006);
  await page.keyboard.down('Control');
  try {
    while (total !== 0) {
      const d = Math.max(-60, Math.min(60, total));
      total -= d;
      await page.mouse.wheel(0, d);
    }
  } finally {
    await page.keyboard.up('Control');
  }
  await frames(page);
}

/** Chooses an item of the zoom menu (fit, width, level-50, level-100, level-200) with the mouse. */
export async function zoomMenu(page: Page, item: string) {
  await page.locator('#zoom-level').click();
  await page.locator(`#zoom-menu-${item}`).click();
  await expect(page.locator('#zoom-menu')).toHaveCount(0);
}

/**
 * Sets the zoom to `pct` %: 100 % from the menu, then Ctrl + wheel in the
 * middle of the stage for the rest (so 116 % stays fractional). Returns the
 * zoom reached, in percent (within 0.3 % of `pct`, see wheelZoom).
 */
export async function setZoom(page: Page, pct: number) {
  await zoomMenu(page, 'level-100');
  await expect.poll(async () => (await stageState(page)).pct).toBeCloseTo(100, 2);
  if (pct !== 100) await wheelZoom(page, pct / 100);
  await expect.poll(async () => Math.abs((await stageState(page)).pct / pct - 1)).toBeLessThan(0.0031);
  return (await stageState(page)).pct;
}

/**
 * Scrolls the stage so the piece sits at fraction `f` of the stage's height
 * and, when the sheets are wider than the stage, at the middle of its width
 * (`panned`: at 30 % of it, so the stage is scrolled sideways off center).
 */
export const scrollPieceTo = (page: Page, id: number, f: number, panned = false) =>
  page.evaluate(
    ([id, f, panned]) => {
      const stage = document.getElementById('stage')!;
      const el = document.querySelector(`#sheets .piece[data-id="${id}"]`)!;
      const s = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      stage.scrollTop += r.top + Math.min(r.height, 120) / 2 - (s.top + stage.clientHeight * f);
      if (stage.classList.contains('is-wide')) stage.scrollLeft += r.left + Math.min(r.width, 160) / 2 - (s.left + stage.clientWidth * (panned ? 0.3 : 0.5));
    },
    [id, f, panned] as const
  );

/**
 * The middle of what can be seen of a piece (the stage and its sheet clip it),
 * away from the stage's edges where a drag autoscrolls; null if too little shows.
 */
export const grabPoint = (page: Page, id: number) =>
  page.evaluate((id) => {
    const el = document.querySelector(`#sheets .piece[data-id="${id}"]`)!;
    const stage = document.getElementById('stage')!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const sheet = el.closest('.sheet')!.getBoundingClientRect();
    const x0 = Math.max(r.left, stage.left + 60, sheet.left);
    const x1 = Math.min(r.right, stage.right - 60, sheet.right);
    const y0 = Math.max(r.top, stage.top + 60, sheet.top);
    const y1 = Math.min(r.bottom, stage.bottom - 60, sheet.bottom);
    return x1 - x0 > 4 && y1 - y0 > 4 ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : null;
  }, id);

/** Waits until no gesture is in progress and the page has drawn its result. */
export async function settled(page: Page) {
  await expect(page.locator('#canvas')).not.toHaveClass(/\bis-(dragging|panning)\b/);
  await frames(page);
}

/** Presses at `from`, moves by (dx, dy) px in `steps` moves and releases; waits until it settled. */
export async function dragPx(page: Page, from: { x: number; y: number }, dx: number, dy: number, steps = 10) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
  await page.mouse.up();
  await settled(page);
}

/**
 * A drag of (dx, dy) px from `from` as the engine delivers it. Playwright's
 * WebKit and Firefox cut pointer positions down to whole pixels (100.7
 * arrives as 100): 2.84 px across arrives as 3 px from 637.99 but as 2 from
 * 638.01, and a few pixels can fall under the 3 px a press needs to become a
 * drag. There it starts on a whole pixel and moves by the whole pixels
 * nearest to (dx, dy); Chromium keeps the fractions.
 */
export const wholePixelDrag = (browserName: string, from: { x: number; y: number }, dx: number, dy: number) =>
  browserName === 'chromium' ? { from, dx, dy } : { from: { x: Math.round(from.x), y: Math.round(from.y) }, dx: Math.round(dx), dy: Math.round(dy) };

/** A piece as the page shows it (mm). */
export async function shownPiece(app: App, id: number) {
  return (await app.geometry()).pieces.find((p) => p.id === id)!;
}

/**
 * Four business cards on three sheets (1 · 2 · 1), the two of sheet 2 apart
 * so a short drag never touches the other one. Returns their ids: [sheet 1,
 * sheet 2, sheet 3, sheet 2 at (60, 150) mm].
 */
export async function cardsOnThreeSheets(app: App) {
  const page = app.page;
  await app.addFiles(cards(0, 4));
  const ids = await app.ids();
  const send = async (id: number, times: number) => {
    for (let i = 0; i < times; i++) {
      const before = (await shownPiece(app, id)).sheetIndex;
      await app.piece(id).focus();
      await page.keyboard.press('Shift+PageDown');
      await expect.poll(async () => (await shownPiece(app, id)).sheetIndex).toBe(before + 1);
    }
  };
  await send(ids[1], 1);
  await send(ids[3], 1);
  await send(ids[2], 2);
  await app.setPosition(ids[3], 60, 150);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await shownPiece(app, ids[3])).x).toBeCloseTo(60, 2);
  const g = await app.geometry();
  expect(g.sheets, 'three sheets').toHaveLength(3);
  expect(g.pieces.map((p) => p.sheetIndex), 'with 1, 2 and 1 pieces').toEqual([0, 1, 2, 1]);
  return ids;
}
