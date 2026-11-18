// Helpers for the sheets specs: how many pieces each sheet has, the new-sheet
// placeholders shown while dragging, and holding a piece with the pointer
// while the stage scrolls by itself (and waiting until it stops).
import type { Page } from '@playwright/test';
import { frames, stageBox } from './canvas.ts';
import { expect, type App } from './test.ts';

/** Pieces per sheet, in order. */
export async function counts(app: App) {
  return (await app.sheets()).map((sheet) => sheet.pieces.length);
}

/** Piece ids per sheet, in order. */
export async function pieceIds(app: App) {
  return (await app.sheets()).map((sheet) => sheet.pieces.map((piece) => Number(piece.id)));
}

/** The sheet ids, in order. */
export async function sheetIds(app: App) {
  return (await app.sheets()).map((sheet) => Number(sheet.id));
}

/** The page (sheet with its heading) at `index`. */
export const pageAt = (p: Page, index: number) => p.locator('#sheets .page').nth(index);

type Rect = { x: number; y: number; w: number; h: number };

export interface Placeholders {
  /** The dashed sheet below the last one shows… */
  end: boolean;
  /** …and is where the drop would go. */
  endActive: boolean;
  /** The bar between two sheets (or above the first) shows. */
  bar: boolean;
  /** Both are hidden from screen readers. */
  hidden: boolean;
  endRect: Rect | null;
  barRect: Rect | null;
  /** Each sheet box's place inside #sheets (px, 0.1): they must not move while the placeholders show. */
  pages: [number, number][];
  sheetBox: Rect;
}

/** The new-sheet placeholders as the page shows them. */
export function placeholders(p: Page) {
  return p.evaluate((): Placeholders => {
    const r = (el: Element) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    const end = document.getElementById('new-sheet-end')!;
    const bar = document.getElementById('new-sheet-gap')!;
    const origin = document.getElementById('sheets')!.getBoundingClientRect();
    return {
      end: !end.hidden,
      endActive: end.classList.contains('is-active'),
      bar: !bar.hidden,
      hidden: end.getAttribute('aria-hidden') === 'true' && bar.getAttribute('aria-hidden') === 'true',
      endRect: end.hidden ? null : r(end),
      barRect: bar.hidden ? null : r(bar),
      pages: [...document.querySelectorAll('#sheets .page')].map((pg) => {
        const b = pg.querySelector('.sheet-box')!.getBoundingClientRect();
        return [Math.round((b.x - origin.x) * 10) / 10, Math.round((b.y - origin.y) * 10) / 10] as [number, number];
      }),
      sheetBox: r(document.querySelector('#sheets .sheet-box')!),
    };
  });
}

/** Presses the mouse on a piece's center (scrolled to the middle first) and starts dragging it. */
export async function holdPiece(app: App, id: number) {
  const p = app.page;
  await app.piece(id).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = (await app.piece(id).boundingBox())!;
  const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(from.x + 4, from.y + 4, { steps: 2 });
  return from;
}

/** The stage's scroll and how far it reaches (px). */
export const scrollOf = (p: Page) =>
  p.evaluate(() => {
    const s = document.getElementById('stage')!;
    return { top: s.scrollTop, left: s.scrollLeft, height: s.scrollHeight, width: s.scrollWidth, maxTop: s.scrollHeight - s.clientHeight, maxLeft: s.scrollWidth - s.clientWidth };
  });

/** Waits, frame by frame, until the stage scrolls no more by itself; returns where it stopped. */
export async function scrollStops(p: Page) {
  await expect
    .poll(
      async () => {
        const a = await scrollOf(p);
        await frames(p, 10);
        const b = await scrollOf(p);
        return a.top === b.top && a.left === b.left && a.height === b.height && a.width === b.width;
      },
      { intervals: [0], message: 'the stage stops scrolling' }
    )
    .toBe(true);
  return scrollOf(p);
}

/** The bottom of the last sheet's box, on screen. */
export const lastSheetBottom = (p: Page) => p.evaluate(() => [...document.querySelectorAll('#sheets .sheet-box')].at(-1)!.getBoundingClientRect().bottom);

/**
 * With something held, `move(x, y)` takes the pointer (mouse or finger) to the
 * stage's bottom edge, where it scrolls by itself, until the last sheet's
 * bottom shows, then 120 px below it: outside every sheet.
 */
export async function toBelowLastSheet(p: Page, x: number, move: (x: number, y: number) => Promise<unknown> = (mx, my) => p.mouse.move(mx, my)) {
  const stage = await stageBox(p);
  await expect
    .poll(
      async () => {
        await move(x, stage.y + stage.height - 8);
        return lastSheetBottom(p);
      },
      { intervals: [16], timeout: 15_000, message: 'the last sheet’s bottom scrolls into view' }
    )
    .toBeLessThan(stage.y + stage.height - 160);
  const bottom = await lastSheetBottom(p);
  for (let i = 1; i <= 6; i++) await move(x, bottom + i * 20);
}
