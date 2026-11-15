// Zoom and pan of the sheets, where only a real browser tells: fits that
// follow the window until the person zooms, Ctrl + wheel around the pointer,
// the zoom control's ends, panning with Space and the middle button, and the
// geometry at several zooms and scroll positions (a fractional zoom and a
// stage scrolled sideways included: commit a622c07 fixed a bug that lived
// there). The menu's items and keys are in tests/components/ZoomMenu.test.tsx,
// which zoom keys the app takes in tests/hooks/zoom-shortcuts.test.tsx, the
// levels in tests/core/zoom.test.js and «zoom is not undoable» in
// tests/state/zoom.test.ts.
import { onGrid } from '../support/geometry.ts';
import {
  PX_PER_MM,
  ZOOM_LEVELS,
  cardsOnThreeSheets,
  dragPx,
  frames,
  grabPoint,
  hit,
  imageOnPiece,
  nearRect,
  scrollPieceTo,
  setZoom,
  settled,
  shownPiece,
  stageBox,
  stageState,
  wheelZoom,
  wholePixelDrag,
} from '../support/canvas.ts';
import { cards, expect, test } from '../support/test.ts';

/** The room the sheets have across the stage (without the padding around them), px. */
const stageRoom = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const stage = document.getElementById('stage')!;
    const cs = getComputedStyle(stage.querySelector('.stage-area')!);
    return stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  });

test.describe('the zoom control and the fits', () => {
  test('a fit follows the window until the person zooms; then + goes to the next level and the window leaves it as it is', async ({ app, page }) => {
    await app.addFiles(cards(0, 2));
    const fit = await stageState(page);
    expect(fit.shown, 'starts fitted, the level shown rounded').toBe(`${Math.round(fit.pct)} %`);

    await page.setViewportSize({ width: 1200, height: 800 });
    await expect.poll(async () => (await stageState(page)).pct, { message: 'a fit follows a smaller window' }).toBeLessThan(fit.pct - 1);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(async () => (await stageState(page)).pct, { message: 'and comes back with it' }).toBeCloseTo(fit.pct, 2);

    await page.locator('#zoom-in').click();
    const next = ZOOM_LEVELS.find((level) => level > fit.pct + 0.5)!;
    await expect.poll(async () => (await stageState(page)).pct, { message: `+ from ${fit.pct} goes to exactly ${next} %` }).toBeCloseTo(next, 2);
    await expect(page.locator('#zoom-level')).toHaveText(`${next} %`);

    await page.setViewportSize({ width: 1200, height: 800 });
    await expect.poll(() => page.evaluate(() => document.getElementById('stage')!.clientWidth)).toBeLessThan(1000);
    await frames(page);
    expect((await stageState(page)).pct, 'from then on the window leaves the zoom as it is').toBeCloseTo(next, 2);
  });

  test('Shift+2 fits the sheet’s width and says so; Shift+1 fits the whole sheet again', async ({ app, page }) => {
    await app.addFiles(cards(0, 2));
    const fit = (await stageState(page)).pct;
    await page.locator('#zoom-in').click();
    // + says its level 300 ms later; a fit right after doesn't cancel that (tests/state/zoom.test.ts
    // documents it), so the stale «Zoom 67 %» could replace the fit's message.
    await app.heard(new RegExp(`Zoom ${ZOOM_LEVELS.find((level) => level > fit + 0.5)}\\s%`));
    await page.keyboard.press('Shift+Digit2');
    const room = await stageRoom(page);
    await expect.poll(async () => ((await stageState(page)).pct / 100) * PX_PER_MM * 210, { message: `the sheet as wide as the stage’s room (${room} px)` }).toBeCloseTo(room, 0);
    await app.heard(/Se ve el ancho de la hoja/);
    await page.keyboard.press('Shift+Digit1');
    await expect.poll(async () => (await stageState(page)).pct, { message: 'the same fit as at the start' }).toBeCloseTo(fit, 2);
    await expect(page.locator('#zoom-level')).toHaveText(`${Math.round(fit)} %`);
    await app.heard(/Se ve la hoja entera/);
  });

  test('choosing 200 % in the menu with the keyboard zooms the sheets to 200 %', async ({ app, page }) => {
    await app.addFiles(cards(0, 1));
    await page.locator('#zoom-level').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#zoom-menu-fit')).toBeFocused();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await stageState(page)).pct).toBeCloseTo(200, 2);
    await expect(page.locator('#zoom-level')).toHaveText('200 %');
    await expect(page.locator('#zoom-level')).toBeFocused();
  });

  test('the buttons stop at 800 % and 10 % and then say they can’t go further', async ({ app, page }) => {
    await app.addFiles(cards(0, 1));
    const zoomIn = page.locator('#zoom-in');
    const zoomOut = page.locator('#zoom-out');
    await expect(zoomIn).not.toHaveAttribute('aria-disabled', 'true');
    for (let i = 0; i < 12; i++) await zoomIn.click({ force: true });
    await expect.poll(async () => (await stageState(page)).pct).toBeCloseTo(800, 2);
    await expect(zoomIn).toHaveAttribute('aria-disabled', 'true');
    await expect(zoomOut).not.toHaveAttribute('aria-disabled', 'true');
    await zoomIn.click({ force: true });
    expect((await stageState(page)).pct).toBeCloseTo(800, 2);
    for (let i = 0; i < 16; i++) await zoomOut.click({ force: true });
    await expect.poll(async () => (await stageState(page)).pct).toBeCloseTo(10, 2);
    await expect(zoomOut).toHaveAttribute('aria-disabled', 'true');
    await expect(zoomIn).not.toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('zooming with the wheel and the keys', () => {
  test('Ctrl + wheel over the canvas zooms the sheets around the pointer; over the top bar it stays the browser’s', async ({ app, page }) => {
    const ids = await cardsOnThreeSheets(app);
    await scrollPieceTo(page, ids[1], 0.5);
    await setZoom(page, 100);
    // Whether the app took each Ctrl + wheel (seen after it, on the window).
    await page.evaluate(() => {
      const w = window as unknown as { wheels: { prevented: boolean; overCanvas: boolean }[] };
      w.wheels = [];
      window.addEventListener('wheel', (e) => e.ctrlKey && w.wheels.push({ prevented: e.defaultPrevented, overCanvas: !!(e.target as Element).closest('#canvas') }));
    });
    const wheels = () => page.evaluate(() => (window as unknown as { wheels: { prevented: boolean; overCanvas: boolean }[] }).wheels.splice(0));
    const anchorOf = (x: number, y: number) =>
      page.evaluate(
        ([x, y]) => {
          for (const p of document.querySelectorAll<HTMLElement>('#sheets .page')) {
            const b = p.querySelector('.sheet-box')!.getBoundingClientRect();
            if (y >= b.top && y <= b.bottom) return { sheet: p.dataset.sheet, x: (x - b.left) / b.width, y: (y - b.top) / b.height };
          }
          return null;
        },
        [x, y] as const
      );
    const s = await stageBox(page);
    // Whole pixels: WebKit gives the pointer whole pixels, and the error would grow with the zoom.
    const at = { x: Math.round(s.x + s.width * 0.62), y: Math.round(s.y + s.height * 0.4) };
    const before = (await anchorOf(at.x, at.y))!;
    expect(before, 'a sheet under the pointer').not.toBeNull();
    await wheelZoom(page, 1.6, at);
    // Within 0.3 %: the wheel turns in whole pixels (wheelZoom).
    await expect.poll(async () => (await stageState(page)).pct).toBeCloseTo(160, 0);
    const took = await wheels();
    expect(took.length).toBeGreaterThan(0);
    expect(took.every((w) => w.prevented && w.overCanvas), 'every Ctrl + wheel over the canvas taken (never the page zoom)').toBe(true);
    const after = (await anchorOf(at.x, at.y))!;
    // The same point of the same sheet under the pointer, within a px.
    expect(after.sheet).toBe(before.sheet);
    expect(Math.abs((after.x - before.x) * 210 * PX_PER_MM * 1.6), 'across, px').toBeLessThan(1);
    expect(Math.abs((after.y - before.y) * 297 * PX_PER_MM * 1.6), 'down, px').toBeLessThan(1);

    const bar = (await page.locator('.topbar').boundingBox())!;
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    const prevented = await page.evaluate(() => {
      const e = new WheelEvent('wheel', { deltaY: -50, ctrlKey: true, bubbles: true, cancelable: true });
      document.querySelector('.topbar')!.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented, 'Ctrl + wheel over the top bar is left to the browser').toBe(false);
    await frames(page);
    expect((await stageState(page)).pct, 'and the sheets keep their zoom').toBeCloseTo(160, 0);
  });

  test('Ctrl + = and Ctrl + − with the pointer over the canvas step the sheets’ zoom', async ({ app, page }) => {
    await app.addFiles(cards(0, 1));
    await setZoom(page, 100);
    const s = await stageBox(page);
    await page.mouse.move(s.x + 300, s.y + 300);
    await page.keyboard.press('Control+Equal');
    await expect.poll(async () => (await stageState(page)).pct).toBeCloseTo(125, 2);
    await page.keyboard.press('Control+Minus');
    await expect.poll(async () => (await stageState(page)).pct).toBeCloseTo(100, 2);
  });
});

test.describe('panning', () => {
  test('Space + drag pans both ways at 200 % without selecting or moving anything; the middle button pans too', async ({ app, page }) => {
    await cardsOnThreeSheets(app);
    await setZoom(page, 200);
    await page.keyboard.press('Escape');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const s = await stageBox(page);
    const mid = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
    const st = await stageState(page);
    expect(st.wide, 'zoomed past the stage’s width').toBe(true);
    const shown = await app.snapshot();

    await page.mouse.move(mid.x, mid.y);
    await page.keyboard.down(' ');
    await page.mouse.down();
    await page.mouse.move(mid.x - 120, mid.y - 90, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up(' ');
    await settled(page);
    const st2 = await stageState(page);
    expect(Math.abs(st2.scrollTop - st.scrollTop - 90), 'down 90 px').toBeLessThanOrEqual(2);
    expect(Math.abs(st2.scrollLeft - st.scrollLeft - 120), 'across 120 px').toBeLessThanOrEqual(2);
    expect(await app.selectedIds(), 'nothing selected').toEqual([]);
    expect(await app.snapshot(), 'nothing moved').toBe(shown);

    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(mid.x + 60, mid.y + 40, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    await settled(page);
    const st3 = await stageState(page);
    expect(Math.abs(st2.scrollTop - st3.scrollTop - 40), 'the middle button, up 40 px').toBeLessThanOrEqual(2);
    expect(Math.abs(st2.scrollLeft - st3.scrollLeft - 60), 'the middle button, back 60 px').toBeLessThanOrEqual(2);
    expect(await app.snapshot(), 'nothing moved').toBe(shown);
  });

  test('a pan ends when the page loses the pointer: the window losing the focus ends a Space pan and Space no longer counts as held; the middle button let go unseen ends its pan', async ({ app, page, browserName }) => {
    await app.addFiles(cards(0, 2));
    await setZoom(page, 200);
    await page.keyboard.press('Escape');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const s = await stageBox(page);
    const mid = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
    const scroll = async () => {
      const st = await stageState(page);
      return [st.scrollLeft, st.scrollTop];
    };

    await page.mouse.move(mid.x, mid.y);
    await page.keyboard.down(' ');
    await page.mouse.down();
    await page.mouse.move(mid.x - 60, mid.y - 40, { steps: 4 });
    await expect(page.locator('#canvas')).toHaveClass(/\bis-panning\b/);
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    await expect(page.locator('#canvas')).not.toHaveClass(/\bis-(panning|pan-ready)\b/);
    let left = await scroll();
    await page.mouse.move(mid.x - 160, mid.y - 120, { steps: 4 });
    expect(await scroll(), 'moving on doesn’t pan').toEqual(left);
    await page.mouse.up();
    await page.keyboard.up(' ');

    if (browserName !== 'chromium') {
      // The moves without a button go through the Chrome DevTools Protocol (Input.dispatchMouseEvent), which only Chromium has.
      test.info().annotations.push({ type: 'only in Chromium', description: 'the middle button let go unseen' });
      return;
    }
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(mid.x + 40, mid.y + 30, { steps: 4 });
    await expect(page.locator('#canvas')).toHaveClass(/\bis-panning\b/);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mid.x + 50, y: mid.y + 35, button: 'none', buttons: 0 });
    await expect(page.locator('#canvas')).not.toHaveClass(/\bis-panning\b/);
    left = await scroll();
    await page.mouse.move(mid.x + 140, mid.y + 100, { steps: 4 });
    expect(await scroll(), 'moving on doesn’t pan').toEqual(left);
    await page.mouse.up({ button: 'middle' });
  });

  test('Space on a piece without dragging still goes to its toolbar', async ({ app, page }) => {
    await app.addFiles(cards(0, 2));
    const [id] = await app.ids();
    await app.piece(id).focus();
    const s = await stageBox(page);
    await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
    await page.keyboard.press(' ');
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#piecebar'))).toBe(true);
  });
});

// ---------- Geometry at several zooms and scroll positions ----------

// A fractional zoom, one that fits all three sheets and a big one. 116 % and
// a stage scrolled sideways («panned») are where the bug of a622c07 lived:
// the sheets' boxes measured to the whole px put drags, frames and the point
// zoomed around off on the lower sheets.
const ZOOMS = [25, 116, 400];
const POSITIONS = [
  { name: 'high', f: 0.25, panned: false },
  { name: 'panned', f: 0.5, panned: true },
];

/** A piece's frame, toolbar, the canvas and the zoom control (window px). */
const chrome = (page: import('@playwright/test').Page, id: number) =>
  page.evaluate((id) => {
    const rect = (el: Element | null) => {
      if (!el || (el as HTMLElement).hidden) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    return {
      piece: rect(document.querySelector(`#sheets .piece[data-id="${id}"]`)),
      frame: rect(document.getElementById('frame')),
      bar: rect(document.getElementById('piecebar')),
      canvas: rect(document.getElementById('canvas')),
      zoom: rect(document.querySelector('.zoom-control')),
    };
  }, id);

test.describe('geometry at several zooms', () => {
  for (const pct of ZOOMS) {
    test.describe(`at ${pct} %`, () => {
      test('a piece dragged 3 × 2 mm on each sheet, high in the stage and panned, stays on its sheet, moves that much on the grid, keeps the scroll and says nothing', async ({ app, page, browserName }) => {
        const ids = await cardsOnThreeSheets(app);
        const z = ((await setZoom(page, pct)) / 100) * PX_PER_MM;
        const bad: string[] = [];
        for (const [si, id] of [ids[0], ids[1], ids[2]].entries()) {
          for (const { name, f, panned } of POSITIONS) {
            const where = `sheet ${si + 1} ${name}`;
            await page.keyboard.press('Escape');
            await scrollPieceTo(page, id, f, panned);
            await frames(page);
            const b0 = await shownPiece(app, id);
            const s0 = await stageState(page);
            const from = await grabPoint(page, id);
            if (!from) {
              bad.push(`${where}: not visible`);
              continue;
            }
            // At 25 % that is 2.8 × 1.9 px, near the 3 px a drag needs: in whole pixels where the engine delivers them.
            const drag = wholePixelDrag(browserName, from, 3 * z, 2 * z);
            await dragPx(page, drag.from, drag.dx, drag.dy);
            const b1 = await shownPiece(app, id);
            const s1 = await stageState(page);
            const tol = 0.5 + 1.5 / z;
            const problems: string[] = [];
            if (b1.sheet !== b0.sheet) problems.push(`sheet ${b0.sheetIndex + 1} → ${b1.sheetIndex + 1}`);
            if (Math.abs(b1.x - b0.x - 3) > tol || Math.abs(b1.y - b0.y - 2) > tol) problems.push(`moved ${(b1.x - b0.x).toFixed(2)}, ${(b1.y - b0.y).toFixed(2)} mm`);
            if (!onGrid(b1.x, 1) || !onGrid(b1.y, 1)) problems.push(`off the grid ${b1.x}, ${b1.y}`);
            if (Math.abs(s1.scrollTop - s0.scrollTop) > 1 || Math.abs(s1.scrollLeft - s0.scrollLeft) > 1) problems.push(`scroll ${s0.scrollTop},${s0.scrollLeft} → ${s1.scrollTop},${s1.scrollLeft}`);
            if (s1.pill) problems.push(`notice «${s1.pill}»`);
            if (s1.dropTargets) problems.push('a sheet still marked as target');
            if (s1.sheetScroll || s1.docOverflow) problems.push('a sheet or the page scrolled');
            if (problems.length) bad.push(`${where}: ${problems.join(', ')}`);
          }
        }
        expect(bad).toEqual([]);
      });

      // The frame is drawn from the measured sheet boxes, the piece by CSS inside
      // its sheet: they match to the layout unit (1/64 px). With the boxes
      // measured to the whole px (before a622c07) the frame of a piece on a
      // lower sheet was 0.1–0.5 px off, so the tolerance is 0.05 px.
      test('the frame sits on the piece, and the toolbar inside the canvas and off the zoom control', async ({ app, page }) => {
        const ids = await cardsOnThreeSheets(app);
        await setZoom(page, pct);
        for (const id of [ids[0], ids[1], ids[2]]) {
          await app.piece(id).focus();
          await scrollPieceTo(page, id, 0.5, true);
          await frames(page);
          await expect
            .poll(async () => {
              const c = await chrome(page, id);
              const problems: string[] = [];
              if (!nearRect(c.piece, c.frame, 0.05)) problems.push(`frame ${JSON.stringify(c.frame)} vs piece ${JSON.stringify(c.piece)}`);
              if (!c.bar) problems.push('no toolbar');
              else {
                if (c.bar.x < c.canvas!.x - 1 || c.bar.x + c.bar.w > c.canvas!.x + c.canvas!.w + 1) problems.push(`toolbar outside the canvas ${JSON.stringify(c.bar)}`);
                if (hit(c.bar, c.zoom)) problems.push('toolbar over the zoom control');
              }
              return problems;
            }, { message: `piece ${id}` })
            .toEqual([]);
        }
      });

      test('a group dragged 3 × 2 mm moves together on its sheet, the scroll unchanged, no notice', async ({ app, page, browserName }) => {
        const ids = await cardsOnThreeSheets(app);
        const z = ((await setZoom(page, pct)) / 100) * PX_PER_MM;
        await app.selectIds([ids[1], ids[3]]);
        await scrollPieceTo(page, ids[1], 0.5);
        await frames(page);
        const g0 = [await shownPiece(app, ids[1]), await shownPiece(app, ids[3])];
        const s0 = await stageState(page);
        const from = await grabPoint(page, ids[1]);
        expect(from, 'the piece shows').not.toBeNull();
        const drag = wholePixelDrag(browserName, from!, 3 * z, 2 * z);
        await dragPx(page, drag.from, drag.dx, drag.dy);
        const g1 = [await shownPiece(app, ids[1]), await shownPiece(app, ids[3])];
        const s1 = await stageState(page);
        const moved = g1.map((p, i) => ({ x: p.x - g0[i].x, y: p.y - g0[i].y }));
        expect(g1.map((p) => p.sheet), 'on the same sheet').toEqual(g0.map((p) => p.sheet));
        expect(moved[1].x, 'together across').toBeCloseTo(moved[0].x, 2);
        expect(moved[1].y, 'together down').toBeCloseTo(moved[0].y, 2);
        expect(Math.abs(moved[0].x - 3), `${moved[0].x} mm across`).toBeLessThanOrEqual(0.5 + 1.5 / z);
        expect(Math.abs(moved[0].y - 2), `${moved[0].y} mm down`).toBeLessThanOrEqual(0.5 + 1.5 / z);
        expect(Math.abs(s1.scrollTop - s0.scrollTop), 'scroll unchanged').toBeLessThanOrEqual(1);
        expect(Math.abs(s1.scrollLeft - s0.scrollLeft), 'scroll unchanged').toBeLessThanOrEqual(1);
        expect(s1.pill, 'no notice').toBe('');
      });

      test('arrows move a piece 1 mm on its sheet', async ({ app, page }) => {
        const ids = await cardsOnThreeSheets(app);
        await setZoom(page, pct);
        await app.piece(ids[2]).focus();
        const k0 = await shownPiece(app, ids[2]);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowDown');
        await expect.poll(async () => (await shownPiece(app, ids[2])).y).toBeCloseTo(k0.y + 1, 2);
        const k1 = await shownPiece(app, ids[2]);
        expect(k1.sheet).toBe(k0.sheet);
        expect(k1.x).toBeCloseTo(k0.x + 1, 2);
      });

      test('a marquee touching a piece selects just it', async ({ app, page }) => {
        const ids = await cardsOnThreeSheets(app);
        await setZoom(page, pct);
        await page.keyboard.press('Escape');
        await scrollPieceTo(page, ids[2], 0.5);
        await frames(page);
        const m = await page.evaluate((id) => {
          const el = document.querySelector(`#sheets .piece[data-id="${id}"]`)!;
          const r = el.getBoundingClientRect();
          const sheet = el.closest('.sheet')!.getBoundingClientRect();
          const stage = document.getElementById('stage')!.getBoundingClientRect();
          const x0 = Math.max(sheet.left + 2, r.left - 12, stage.left + 4);
          const y0 = Math.max(sheet.top + 2, r.top - 12, stage.top + 4);
          return { x0, y0, x1: Math.min(r.left + 20, stage.right - 30), y1: Math.min(r.top + 20, stage.bottom - 30) };
        }, ids[2]);
        await page.mouse.move(m.x0, m.y0);
        await page.mouse.down();
        await page.mouse.move(m.x1, m.y1, { steps: 6 });
        await page.mouse.up();
        await settled(page);
        await expect.poll(() => app.selectedIds()).toEqual([ids[2]]);
      });
    });
  }
});

test.describe('a drag to the next sheet, autoscrolling there', () => {
  for (const pct of [25, 116, 400]) {
    test(`at ${pct} %, the piece lands on sheet 2 with the point held under the pointer, and one undo step puts it back`, async ({ app, page }) => {
      const ids = await cardsOnThreeSheets(app);
      const z = ((await setZoom(page, pct)) / 100) * PX_PER_MM;
      await page.keyboard.press('Escape');
      await scrollPieceTo(page, ids[0], 0.4);
      await frames(page);
      const from = (await grabPoint(page, ids[0]))!;
      expect(from, 'the piece shows').not.toBeNull();
      const b0 = await shownPiece(app, ids[0]);
      // Where it is held, in mm from its corner: that point lands under the pointer.
      const held = await page.evaluate(
        ([id, x, y, z]) => {
          const r = document.querySelector(`#sheets .piece[data-id="${id}"]`)!.getBoundingClientRect();
          return { x: (x - r.left) / z, y: (y - r.top) / z };
        },
        [ids[0], from.x, from.y, z] as const
      );
      const s = await stageBox(page);
      // The window point of (b0.x, 230) mm on sheet 2 plus the held offset (free there).
      const tx = b0.x + held.x;
      const ty = 230 + held.y;
      const spot = () =>
        page.evaluate(
          ([z, tx, ty]) => {
            const box = document.querySelectorAll('#sheets .page')[1].querySelector('.sheet-box')!.getBoundingClientRect();
            return { x: box.left + tx * z, y: box.top + ty * z };
          },
          [z, tx, ty] as const
        );
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x, from.y + 10, { steps: 3 });
      // Held at the stage's bottom edge it autoscrolls, a frame at a time, until the spot shows.
      let target = await spot();
      for (let i = 0; i < 1200 && target.y > s.y + s.height - 80; i++) {
        await page.mouse.move(from.x, s.y + s.height - 6);
        await frames(page, 1);
        target = await spot();
      }
      expect(target.y, 'autoscrolled down to sheet 2').toBeLessThanOrEqual(s.y + s.height - 80);
      await page.mouse.move(target.x, target.y, { steps: 8 });
      await frames(page);
      target = await spot();
      await page.mouse.move(target.x, target.y);
      await page.mouse.up();
      await settled(page);
      const b1 = await shownPiece(app, ids[0]);
      const tol = 0.5 + 2 / z;
      expect(b1.sheetIndex, 'on sheet 2').toBe(1);
      expect(Math.abs(b1.x - b0.x), `x ${b1.x} vs ${b0.x}`).toBeLessThanOrEqual(tol);
      expect(Math.abs(b1.y - 230), `y ${b1.y} vs 230`).toBeLessThanOrEqual(tol);
      await page.keyboard.press('Control+z');
      await expect.poll(async () => (await shownPiece(app, ids[0])).sheetIndex).toBe(0);
      const back = await shownPiece(app, ids[0]);
      expect(back.x).toBeCloseTo(b0.x, 3);
      expect(back.y).toBeCloseTo(b0.y, 3);
    });
  }
});

test.describe('pieces taken off the sheet', () => {
  // The piece near a corner of sheet 3: at 400 % only that corner shows, so it goes off by the left and the top.
  for (const pct of [25, 100, 400]) {
    test(`at ${pct} %, image and frame stay aligned, the center on the sheet and no stray scroll`, async ({ app, page, browserName }) => {
      const ids = await cardsOnThreeSheets(app);
      const id = ids[2];
      await app.setPosition(id, 12, 12);
      await setZoom(page, pct);
      await page.keyboard.press('Escape');
      const bad: string[] = [];
      for (const dir of pct === 400 ? ['left', 'up'] : ['right', 'left', 'up', 'down']) {
        await scrollPieceTo(page, id, 0.5);
        if (pct === 400) await page.evaluate(() => (document.getElementById('stage')!.scrollLeft = 0));
        await frames(page);
        const from = await grabPoint(page, id);
        if (!from) {
          bad.push(`${dir}: not visible`);
          continue;
        }
        const sheet = await page.evaluate((id) => {
          const r = document.querySelector(`#sheets .piece[data-id="${id}"]`)!.closest('.sheet')!.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }, id);
        const s0 = await stageState(page);
        const to = {
          right: [sheet.x + sheet.w + 200, from.y],
          left: [Math.max(sheet.x - 200, 240), from.y],
          up: [from.x, Math.max(sheet.y - 150, 70)],
          down: [from.x, Math.min(sheet.y + sheet.h + 150, 880)],
        }[dir]!;
        await dragPx(page, from, to[0] - from.x, to[1] - from.y, 14);
        const r = await page.evaluate((id) => {
          const rect = (el: Element) => {
            const b = el.getBoundingClientRect();
            return { x: b.x, y: b.y, w: b.width, h: b.height };
          };
          const el = document.querySelector(`#sheets .piece[data-id="${id}"]`)!;
          return { piece: rect(el), img: rect(el.querySelector('img')!), frame: rect(document.getElementById('frame')!), sheet: rect(el.closest('.sheet')!), parent: el.parentElement!.className };
        }, id);
        const s1 = await stageState(page);
        const cx = r.piece.x + r.piece.w / 2;
        const cy = r.piece.y + r.piece.h / 2;
        const problems: string[] = [];
        if (!nearRect(r.img, r.piece, imageOnPiece(browserName))) problems.push(`image ${JSON.stringify(r.img)} off the piece ${JSON.stringify(r.piece)}`);
        if (!nearRect(r.frame, r.piece, 0.05)) problems.push(`frame ${JSON.stringify(r.frame)} off the piece ${JSON.stringify(r.piece)}`);
        if (r.parent !== 'sheet') problems.push(`left in ${r.parent}`);
        if (cx < r.sheet.x - 1 || cx > r.sheet.x + r.sheet.w + 1 || cy < r.sheet.y - 1 || cy > r.sheet.y + r.sheet.h + 1) problems.push('center outside the sheet');
        if (s1.sheetScroll || s1.docOverflow) problems.push('a sheet or the page scrolled');
        if (!s1.wide && s1.scrollLeft !== 0) problems.push(`sideways scroll ${s1.scrollLeft}`);
        if (s1.wide && Math.abs(s1.scrollLeft - s0.scrollLeft) > 1) problems.push(`sideways scroll moved ${s0.scrollLeft} → ${s1.scrollLeft}`);
        if (problems.length) bad.push(`${dir}: ${problems.join(', ')}`);
        const moved = await shownPiece(app, id);
        await page.keyboard.press('Control+z');
        await expect.poll(async () => JSON.stringify(await shownPiece(app, id))).not.toBe(JSON.stringify(moved));
      }
      expect(bad).toEqual([]);
    });
  }
});

test('a zoom chosen by hand is kept after a reload, as a percentage, and the view starts at the top; a fit mode stays a fit mode', async ({ app, page }) => {
  await app.addFiles(cards(0, 12));
  await page.locator('#zoom-level').click();
  await page.locator('#zoom-menu-level-200').click();
  await expect(page.locator('#zoom-level')).toHaveText(/^200/);
  await page.locator('#stage').evaluate((el) => (el.scrollTop = 600));
  // Written once the zoom stops changing (or when leaving the page).
  await page.reload();
  await app.ready();
  await expect(page.locator('#zoom-level')).toHaveText(/^200/);
  expect(await page.locator('#stage').evaluate((el) => el.scrollTop)).toBe(0);
  await page.locator('#zoom-level').click();
  await page.locator('#zoom-menu-width').click();
  const width = await page.locator('#zoom-level').textContent();
  await page.reload();
  await app.ready();
  await expect(page.locator('#zoom-level')).toHaveText(width!);
});
