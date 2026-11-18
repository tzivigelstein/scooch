// Where the piece's toolbar goes, measured on screen: next to the selected
// piece without leaving the canvas, sitting on an open panel or covering the
// piece, covering few neighbors; hidden while the piece is scrolled out of
// view; docked at the bottom on narrow screens, above the panel buttons and
// under the notice. (Which spot wins is decided by pickSpot, unit-tested in
// tests/core/placement.test.js.)
import type { Page } from '@playwright/test';
import { frames, zoomMenu } from '../support/canvas.ts';
import { hit, within, type Rect } from '../support/layout.ts';
import { cards, expect, test, type App } from '../support/test.ts';

/** The toolbar and what it must avoid, in window px. */
const RECTS = () => {
  const r = (el: Element) => {
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  };
  const sheetEl = document.querySelector('#sheets .piece.is-selected')?.closest('.sheet') ?? document.querySelector('#sheets .sheet')!;
  const sheet = r(sheetEl);
  const clip = (a: Rect) => {
    const x = Math.max(a.x, sheet.x);
    const y = Math.max(a.y, sheet.y);
    const w = Math.min(a.x + a.w, sheet.x + sheet.w) - x;
    const h = Math.min(a.y + a.h, sheet.y + sheet.h) - y;
    return w > 0 && h > 0 ? { x, y, w, h } : null;
  };
  const bar = document.getElementById('piecebar')!;
  const pill = document.getElementById('pill')!;
  return {
    bar: r(bar),
    side: bar.dataset.side ?? '',
    hidden: bar.hidden || getComputedStyle(bar).visibility === 'hidden',
    canvas: r(document.getElementById('canvas')!),
    selected: r(document.querySelector('#sheets .piece.is-selected')!),
    others: [...sheetEl.querySelectorAll('.piece:not(.is-selected)')].map((p) => clip(r(p))).filter((x): x is Rect => !!x),
    panels: [...document.querySelectorAll<HTMLElement>('.panel')].filter((p) => p.offsetParent && getComputedStyle(p).display !== 'none' && p.classList.contains('is-open')).map(r),
    dock: [...document.querySelectorAll<HTMLElement>('.dock-btn')].filter((b) => b.offsetParent).map(r),
    pill: pill.hidden ? null : r(pill),
    /** The middle of the stage without its scrollbar. */
    stageCenter: (() => {
      const stage = document.getElementById('stage')!;
      return stage.getBoundingClientRect().left + stage.clientWidth / 2;
    })(),
  };
};

const rects = (page: Page) => page.evaluate(RECTS);

/** Focuses a piece (it gets selected) and waits until the toolbar has been placed for it. */
async function focusPiece(app: App, index: number) {
  const piece = app.pieces().nth(index);
  const id = Number(await piece.getAttribute('data-id'));
  await piece.focus();
  await expect.poll(() => app.selectedIds()).toEqual([id]);
  await frames(app.page);
}

for (const [width, height] of [
  [1440, 900],
  [1280, 720],
  [1024, 768],
]) {
  test.describe(`at ${width} × ${height}`, () => {
    test.use({ viewport: { width, height } });

    test('next to each piece: never out of the canvas, on an open panel or over its piece, covering few neighbors; a named toolbar', async ({ app, page }) => {
      await app.addFiles(['big.png', 'small.jpg', 'square.webp', 'twopage.pdf', 'tall.png', 'exif6.jpg']);
      await page.locator('#arrange').click();
      await app.idle();
      if (await page.locator('#pill-action').isVisible()) await page.locator('#pill-action').click();
      if (await page.locator('#pill-close').isVisible()) await page.locator('#pill-close').click();
      const n = await app.pieces().count();
      const sides: string[] = [];
      const problems: string[] = [];
      let covered = 0;
      for (let i = 0; i < n; i++) {
        await focusPiece(app, i);
        const g = await rects(page);
        if (g.hidden) continue;
        sides.push(g.side);
        if (!within(g.bar, g.canvas)) problems.push(`${i}: out of the canvas`);
        if (g.panels.some((panel) => hit(g.bar, panel))) problems.push(`${i}: on a panel`);
        if (g.side !== 'over' && hit(g.bar, g.selected)) problems.push(`${i}: over its piece`);
        covered += g.others.filter((o) => hit(g.bar, o)).length;
      }
      expect(problems).toEqual([]);
      expect(covered, 'neighbors covered, at most one per piece on average').toBeLessThanOrEqual(n);
      // Placed for most pieces, beside them (above, below, left or right), «over» only without room.
      expect(sides.length).toBeGreaterThanOrEqual(n - 1);
      expect(sides.filter((side) => !['above', 'below', 'left', 'right', 'over'].includes(side))).toEqual([]);
      expect(sides.filter((side) => side !== 'over').length).toBeGreaterThan(0);
      await expect(page.locator('#piecebar')).toHaveRole('toolbar');
      await expect(page.locator('#piecebar')).toHaveAttribute('aria-label', /^Acciones de /);
    });
  });
}

test.describe('at 1024 × 768', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('with the pieces panel open over the canvas, the toolbar moves out from under it', async ({ app, page }) => {
    await app.addFiles(['big.png', 'small.jpg', 'square.webp', 'tall.png']);
    // The leftmost piece: the drawer opens over it, where its toolbar would go.
    const leftmost = await page.evaluate(() => {
      const xs = [...document.querySelectorAll('#sheets .piece')].map((p) => p.getBoundingClientRect().left);
      return xs.indexOf(Math.min(...xs));
    });
    await focusPiece(app, leftmost);
    // The focus goes into the list: the selection stays and the panel stays open.
    await page.locator('#pieces-toggle').click();
    await expect(page.locator('#pieces-panel')).toBeVisible();
    await frames(page);
    const g = await rects(page);
    expect(g.panels).toHaveLength(1);
    expect(g.hidden).toBe(false);
    expect(hit(g.bar, g.panels[0])).toBe(false);
    expect(within(g.bar, g.canvas)).toBe(true);
  });
});

// (At the default 1440 × 900.) It covered the notice: the spot over the piece
// that it takes when none beside it is free ignored what floats there.
test('with no room beside the piece, the toolbar goes over it, lifted off the notice and the zoom control', async ({ app, page }) => {
  // A card sticking out of the sheet's bottom (the notice says so), centered on the sheet and
  // at 100 %, so the sheet leaves no room for the toolbar on either side.
  await app.addFiles(cards(0, 1));
  const [id] = await app.ids();
  await app.setPosition(id, 65, 260);
  await zoomMenu(page, 'level-100');
  await app.piece(id).focus();
  await expect(page.locator('#pill')).toBeVisible();
  // Scrolled so the piece's top is 20 px below the notice's: the spot above it would be on the
  // notice and the one below it out of the canvas.
  await page.evaluate((id) => {
    const stage = document.getElementById('stage')!;
    const top = document.querySelector(`#sheets .piece[data-id="${id}"]`)!.getBoundingClientRect().top;
    stage.scrollTop += top - (document.getElementById('pill')!.getBoundingClientRect().top + 20);
  }, id);
  await frames(page);
  const g = await rects(page);
  const extra = await page.evaluate(() => {
    const r = (el: Element) => {
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    };
    return { zoom: r(document.querySelector('.zoom-control')!), sheet: r(document.querySelector('#sheets .sheet')!) };
  });
  expect(Math.abs(g.selected.y - (g.pill!.y + 20)), 'scrolled there').toBeLessThan(1);
  expect(extra.sheet.x - g.bar.w - 12, 'no room left of the sheet').toBeLessThan(g.canvas.x + 8);
  expect(extra.sheet.x + extra.sheet.w + 12 + g.bar.w, 'nor right of it').toBeGreaterThan(g.canvas.x + g.canvas.w - 8);
  expect(g.side).toBe('over');
  expect(g.hidden).toBe(false);
  expect(within(g.bar, g.canvas), 'inside the canvas').toBe(true);
  expect(hit(g.bar, g.pill!), `the toolbar ${JSON.stringify(g.bar)} off the notice ${JSON.stringify(g.pill)}`).toBe(false);
  expect(hit(g.bar, extra.zoom), `and off the zoom control ${JSON.stringify(extra.zoom)}`).toBe(false);
});

test('scrolling the piece out of view hides its toolbar; scrolling back shows it next to the piece again', async ({ app, page }) => {
  await app.addFiles(['big.png', 'small.jpg', 'square.webp', 'twopage.pdf', 'tall.png', 'exif6.jpg', 'rotated.pdf']);
  await focusPiece(app, 0);
  const g0 = await rects(page);
  expect(g0.hidden).toBe(false);
  await page.evaluate(() => document.getElementById('stage')!.scrollBy(0, 2000));
  await expect.poll(async () => {
    const g = await rects(page);
    return { pieceInView: hit(g.selected, g.canvas), barHidden: g.hidden };
  }).toEqual({ pieceInView: false, barHidden: true });
  await page.evaluate(() => document.getElementById('stage')!.scrollTo(0, 0));
  await expect.poll(async () => {
    const g = await rects(page);
    return !g.hidden && Math.abs(g.bar.y - g0.bar.y) < 2 && Math.abs(g.bar.x - g0.bar.x) < 2;
  }).toBe(true);
});

for (const [width, height] of [
  [390, 844],
  [360, 740],
]) {
  test.describe(`at ${width} × ${height}`, () => {
    test.use({ viewport: { width, height } });

    test('docked at the bottom, centered on the stage, above the panel buttons and inside the canvas; a notice goes above it', async ({ app, page }) => {
      await app.addFiles(['small.jpg', 'square.webp']);
      await focusPiece(app, 0);
      const g = await rects(page);
      expect(g.side).toBe('docked');
      expect(Math.abs(g.bar.x + g.bar.w / 2 - g.stageCenter)).toBeLessThan(2);
      expect(g.dock).toHaveLength(2);
      for (const d of g.dock) expect(g.bar.y + g.bar.h).toBeLessThanOrEqual(d.y + 0.5);
      expect(within(g.bar, g.canvas)).toBe(true);

      // A piece off the sheet raises a notice: it goes above the bar.
      await app.setMeasure('pos-x', -5);
      await page.keyboard.press('Escape');
      if (await page.locator('#props-panel.is-open').count()) await page.locator('#props-toggle').click();
      await focusPiece(app, 0);
      await expect(page.locator('#pill')).toBeVisible();
      const g2 = await rects(page);
      expect(g2.pill).not.toBeNull();
      expect(g2.pill!.y + g2.pill!.h).toBeLessThanOrEqual(g2.bar.y + 0.5);
    });
  });
}

// WebKit didn't show a focus a key moved after a click (src/hooks/keyboardFocus.ts).
test('after a click on the piece, Enter takes the focus visibly to its toolbar, with the tooltip, and an arrow keeps it visible', async ({ app, page }) => {
  await app.addFiles(['small.jpg']);
  const piece = app.pieces().first();
  const box = (await piece.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(piece).toBeFocused();
  await page.keyboard.press('Enter');
  const buttons = page.locator('#piecebar button');
  await expect(buttons.first()).toBeFocused();
  expect(await buttons.first().evaluate((el) => el.matches(':focus-visible')), 'the first button shows its focus').toBe(true);
  await expect(page.locator('#tooltip')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(buttons.nth(1)).toBeFocused();
  expect(await buttons.nth(1).evaluate((el) => el.matches(':focus-visible')), 'the next one too').toBe(true);
  await expect(page.locator('#tooltip')).toHaveText(new RegExp((await buttons.nth(1).getAttribute('data-tip'))!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
