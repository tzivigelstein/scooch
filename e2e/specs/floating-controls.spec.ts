// What floats over the canvas keeps its place with classic scrollbars (as on
// Windows and Linux; the headless shell hides them by default): at four
// widths and at the fitted zoom, 200 % and 400 % (both scrollbars), the zoom
// control stays off the stage's scrollbars, the notice, the panel buttons,
// the piece's toolbar and the first sheet's heading; the notice stays off the
// scrollbars; the zoom menu opens inside the window, off the control.
// Screenshots are attached to each test. (The axe scans of these states are in
// accessibility.spec.ts; the theme doesn't change this geometry.)
import type { Page } from '@playwright/test';
import { frames, hit, setZoom, stageState, zoomMenu, type Rect } from '../support/canvas.ts';
import { cards, expect, test, type App } from '../support/test.ts';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 2560, height: 1440 },
];

/** What floats over the stage, the stage's scrollbars (as rectangles) and the zoom (window px). */
const readChrome = () => {
  const rect = (el: Element | null) => {
    if (!el || (el as HTMLElement).hidden) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return null;
    const b = el.getBoundingClientRect();
    return b.width && b.height ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
  };
  const stage = document.getElementById('stage')!;
  const s = stage.getBoundingClientRect();
  const right = stage.offsetWidth - stage.clientWidth;
  const bottom = stage.offsetHeight - stage.clientHeight;
  return {
    zoom: rect(document.querySelector('.zoom-control')),
    pill: rect(document.getElementById('pill')),
    bar: rect(document.getElementById('piecebar')),
    dock: [...document.querySelectorAll('.dock-btn')].map(rect).filter((r): r is NonNullable<typeof r> => !!r),
    menu: rect(document.getElementById('zoom-menu')),
    gutters: [right ? { x: s.left + stage.clientWidth, y: s.top, w: right, h: s.height } : null, bottom ? { x: s.left, y: s.top + stage.clientHeight, w: s.width, h: bottom } : null].filter((r): r is NonNullable<typeof r> => !!r),
    bars: { right, bottom },
    wide: stage.classList.contains('is-wide'),
    viewport: { w: innerWidth, h: innerHeight },
  };
};

/**
 * Twelve cards, the second one moved onto the first (an overlap: the notice
 * shows), nothing selected. Returns the pieces' ids.
 */
async function overlapping(app: App) {
  const page = app.page;
  await app.addFiles(cards(0, 12));
  const ids = await app.ids();
  await app.piece(ids[1]).focus();
  await app.setMeasure('pos-x', '20');
  await app.setMeasure('pos-y', '20');
  await app.closePopover();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pill')).toBeVisible();
  return ids;
}

/** Goes to a zoom: 'fit' (as it opens), 200 % from the menu, 400 % from there with + twice. */
async function zoomTo(page: Page, level: 'fit' | 200 | 400) {
  if (level === 'fit') return;
  await zoomMenu(page, 'level-200');
  if (level === 400) {
    await page.locator('#zoom-in').click();
    await page.locator('#zoom-in').click();
  }
  await expect.poll(async () => (await stageState(page)).pct).toBeCloseTo(level, 1);
}

/** What the zoom control overlaps, and the notice over a scrollbar. */
function problemsOf(c: ReturnType<typeof readChrome>) {
  const problems: string[] = [];
  if (!c.zoom) problems.push('no zoom control');
  for (const g of c.gutters) if (hit(c.zoom, g)) problems.push('over a scrollbar');
  if (hit(c.zoom, c.pill)) problems.push('over the notice');
  if (c.pill) for (const g of c.gutters) if (hit(c.pill, g)) problems.push('the notice over a scrollbar');
  for (const d of c.dock) if (hit(c.zoom, d)) problems.push('over the panel buttons');
  return problems;
}

const shot = async (page: Page, info: import('@playwright/test').TestInfo, name: string) => info.attach(name, { body: await page.screenshot(), contentType: 'image/png' });

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width} px`, () => {
    test.use({ viewport });

    for (const level of ['fit', 200, 400] as const) {
      const name = level === 'fit' ? 'at the fitted zoom' : `at ${level} %`;
      test(`${name}, the zoom control is off the scrollbars, the notice and the panel buttons`, async ({ app, page, browserName }, info) => {
        await overlapping(app);
        await zoomTo(page, level);
        const c = await page.evaluate(readChrome);
        const problems = problemsOf(c);
        // Only Chromium's are classic here: Playwright's WebKit and Firefox draw overlay ones (as Safari by default), which take no room.
        if (browserName === 'chromium') {
          expect(c.bars.right, 'classic scrollbars: the stage’s takes room').toBeGreaterThan(0);
          if (level === 400 || c.wide) expect(c.bars.bottom, 'zoomed past the width: the bottom scrollbar takes room too').toBeGreaterThan(0);
        }
        if (level === 'fit') {
          const head = await page.evaluate(() => {
            document.getElementById('stage')!.scrollTop = 0;
            const b = document.querySelector('#sheets .page-head')!.getBoundingClientRect();
            return { x: b.x, y: b.y, w: b.width, h: b.height };
          });
          if (hit(c.zoom, head)) problems.push('over the first sheet’s heading');
        }
        await shot(page, info, `zoom-${level}`);
        expect(problems, JSON.stringify(c)).toEqual([]);
      });
    }

    test('at 400 % with a piece selected, the zoom control is off the piece’s toolbar', async ({ app, page }, info) => {
      const ids = await overlapping(app);
      await zoomTo(page, 400);
      await app.piece(ids[0]).focus();
      await expect(page.locator('#piecebar')).toBeVisible();
      const c = await page.evaluate(readChrome);
      await shot(page, info, 'toolbar');
      expect(c.bar, 'the toolbar shows').not.toBeNull();
      expect(hit(c.zoom, c.bar), JSON.stringify(c)).toBe(false);
    });

    test('the zoom menu opens inside the window, off the control', async ({ app, page }, info) => {
      await overlapping(app);
      await zoomTo(page, 400);
      await page.locator('#zoom-level').click();
      await expect(page.locator('#zoom-menu')).toBeVisible();
      const c = await page.evaluate(readChrome);
      await shot(page, info, 'zoom-menu');
      const m = c.menu as Rect;
      expect(m, 'the menu shows').not.toBeNull();
      expect(m.x >= 0 && m.y >= 0 && m.x + m.w <= c.viewport.w && m.y + m.h <= c.viewport.h, `inside the window ${JSON.stringify(m)}`).toBe(true);
      expect(hit(m, c.zoom), 'off the control').toBe(false);
    });
  });
}

// (At the default 1440 × 900.) The old check above can't fail by itself: in its scenario the
// toolbar is never near the control. Here its first spot would be on it.
test('a toolbar whose first choice would cover the zoom control goes somewhere else', async ({ app, page }, info) => {
  // A card zoomed to about 700 px tall and scrolled so its top is near the top of the stage (no
  // room for the toolbar above it), its bottom 30 px above the zoom control and its middle over
  // the control's: the toolbar's first spot, below the piece, would cover the control.
  await app.addFiles(cards(0, 1));
  const [id] = await app.ids();
  // Away from the sheet's left edge, so the stage can scroll it under the control.
  await app.setPosition(id, 120, 100);
  await app.closePopover();
  const canvasBox = (await page.locator('#canvas').boundingBox())!;
  const before = (await page.locator('.zoom-control').boundingBox())!;
  const tall = before.y - canvasBox.y - 80;
  await setZoom(page, (tall / (await app.geometry()).pieces[0].h / (96 / 25.4)) * 100);
  await app.piece(id).focus();
  await expect(page.locator('#piecebar')).toBeVisible();
  const zoomBox = (await page.locator('.zoom-control').boundingBox())!;
  await page.evaluate(
    ([id, bottom, cx]) => {
      const stage = document.getElementById('stage')!;
      const r = document.querySelector(`#sheets .piece[data-id="${id}"]`)!.getBoundingClientRect();
      stage.scrollTop += r.bottom - bottom;
      stage.scrollLeft += r.left + r.width / 2 - cx;
    },
    [id, zoomBox.y - 30, zoomBox.x + zoomBox.width / 2] as const
  );
  await frames(page);
  const c = await page.evaluate(readChrome);
  const p = (await app.piece(id).boundingBox())!;
  await shot(page, info, 'toolbar-near-zoom');
  expect(c.bar, 'the toolbar shows').not.toBeNull();
  expect(c.wide, 'scrolls sideways (so the piece could be put over the control)').toBe(true);
  expect(Math.abs(p.x + p.width / 2 - (zoomBox.x + zoomBox.width / 2)), 'the piece’s middle over the control’s').toBeLessThan(2);
  expect(p.y - c.bar!.h - 12, `no room above the piece ${JSON.stringify(p)}`).toBeLessThan(canvasBox.y + 8);
  const firstChoice = { x: Math.min(p.x + p.width / 2 - c.bar!.w / 2, canvasBox.x + canvasBox.width - 8 - c.bars.right - c.bar!.w), y: p.y + p.height + 18, w: c.bar!.w, h: c.bar!.h };
  expect(hit(firstChoice, c.zoom), `the spot below the piece ${JSON.stringify(firstChoice)} covers the control ${JSON.stringify(c.zoom)}`).toBe(true);
  const side = await page.locator('#piecebar').getAttribute('data-side');
  expect(hit(c.bar, c.zoom), `the toolbar ${JSON.stringify(c.bar)} (${side}) off the control`).toBe(false);
});
