// Pieces taken off the sheet (the «frame out of place» regression): while
// dragged the piece shows whole (in the unclipped drag layer) with its frame;
// dropped, image, frame and toolbar line up, its center stays on the sheet,
// the grid and the margin keep the sheet's size, and nothing scrolls sideways
// or off center. The bug showed only at some window sizes, so it runs at four.
// The same at other zooms: zoom-and-pan.spec.ts › pieces taken off the sheet.
// And a project stored with a piece far off its sheet, and the way back.
import { cardsOnThreeSheets, imageOnPiece, inside, nearRect, settled, type Rect } from '../support/canvas.ts';
import { patchStored, saved } from '../support/projects.ts';
import { cards, expect, test } from '../support/test.ts';

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1900, height: 1280 },
  { width: 2560, height: 1440 },
  { width: 3440, height: 1440 },
];

const DIRECTIONS = ['right', 'left', 'top', 'bottom'] as const;

/** What the selected piece, its frame and toolbar, the stage and each sheet's layers look like (window px). */
const readState = () => {
  const r = (el: Element | null | undefined) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  const sel = document.querySelector('#sheets .piece.is-selected');
  const sheet = sel?.closest('.sheet') ?? document.querySelector('#sheets .sheet');
  const stage = document.getElementById('stage')!;
  const bar = document.getElementById('piecebar')!;
  const style = getComputedStyle(bar);
  const shown = !bar.hidden && style.visibility !== 'hidden' && style.opacity !== '0';
  return {
    piece: r(sel),
    img: r(sel?.querySelector('img')),
    frame: r(document.getElementById('frame')),
    bar: shown ? r(bar) : null,
    canvas: r(document.getElementById('canvas'))!,
    stage: r(stage)!,
    sheet: r(sheet)!,
    layers: [...document.querySelectorAll('#sheets .sheet')].map((sh) => {
      const safe = sh.querySelector<HTMLElement>('.safe')!;
      return { sheet: r(sh)!, grid: r(sh.querySelector('.grid-layer')), safe: safe.hidden ? null : r(safe), scroll: [sh.scrollLeft, sh.scrollTop] };
    }),
    stageScrollX: stage.scrollLeft,
    docOverflow: document.documentElement.scrollWidth - innerWidth,
    parent: sel?.parentElement?.className,
    margin: parseFloat((document.getElementById('margin') as HTMLInputElement).value.replace(',', '.')),
    zoom: parseFloat(document.querySelector<HTMLElement>('#sheets .sheet-box')!.style.width) / 210,
  };
};

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    for (const multi of [false, true]) {
      test.describe(multi ? 'several sheets, scrolled halfway' : 'one sheet', () => {
        /** Adds the files and returns the piece every case drags: the first of sheet 2 (or of the only sheet). */
        const setup = async (app: import('../support/test.ts').App) => {
          await app.addFiles(multi ? cards(0, 12) : ['square.webp', 'small.jpg']);
          await app.page.keyboard.press('g'); // the grid shows
          await expect(app.page.locator('#sheets .grid-layer').first()).toBeVisible();
          return Number(await app.page.locator('#sheets .page').nth(multi ? 1 : 0).locator('.piece').first().getAttribute('data-id'));
        };

        for (const dir of DIRECTIONS) {
          test(`dragged off by the ${dir}: whole while dragged, then image, frame and toolbar aligned, its center on the sheet, the layers the sheet’s size and nothing scrolled`, async ({ app, page, browserName }) => {
            const id = await setup(app);
            const piece = app.piece(id);
            await piece.focus();
            // The piece in the middle of the view: with several sheets, the scroll stays halfway.
            await piece.evaluate((el) => el.scrollIntoView({ block: 'center' }));
            await settled(page);
            // Held by the middle of what shows of it (what is off the sheet is clipped).
            const { b, sheet } = await piece.evaluate((el) => {
              const r = el.getBoundingClientRect();
              const sh = el.closest('.sheet')!.getBoundingClientRect();
              const x0 = Math.max(r.left, sh.left);
              const x1 = Math.min(r.right, sh.right);
              const y0 = Math.max(r.top, sh.top);
              const y1 = Math.min(r.bottom, sh.bottom);
              return { b: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, sheet: { x: sh.x, y: sh.y, w: sh.width, h: sh.height } };
            });
            const sx = b.x + b.w / 2;
            const sy = b.y + b.h / 2;
            const target = {
              right: [sheet.x + sheet.w + 260, sy],
              left: [sheet.x - 260, sy],
              top: [sx, Math.max(60, sheet.y - 200)],
              bottom: [sx, Math.min(viewport.height - 60, sheet.y + sheet.h + 200)],
            }[dir];
            await page.mouse.move(sx, sy);
            await page.mouse.down();
            for (let i = 1; i <= 16; i++) await page.mouse.move(sx + ((target[0] - sx) * i) / 16, sy + ((target[1] - sy) * i) / 16);

            const during = await page.evaluate(readState);
            expect(during.parent, 'while dragged: in the unclipped drag layer').toBe('drag-layer');
            expect(nearRect(during.piece, during.frame), `while dragged: the frame ${JSON.stringify(during.frame)} on the piece ${JSON.stringify(during.piece)}`).toBe(true);
            expect(nearRect(during.img, during.piece), 'while dragged: the whole image').toBe(true);

            await page.mouse.up();
            await settled(page);
            const st = await page.evaluate(readState);
            expect(st.parent, 'back on its sheet').toBe('sheet');
            expect(nearRect(st.img, st.piece, imageOnPiece(browserName)), `image ${JSON.stringify(st.img)} on the piece ${JSON.stringify(st.piece)}`).toBe(true);
            expect(nearRect(st.frame, st.piece, 0.05), `frame ${JSON.stringify(st.frame)} on the piece ${JSON.stringify(st.piece)}`).toBe(true);

            const p = st.piece!;
            const cx = p.x + p.w / 2;
            const cy = p.y + p.h / 2;
            expect(cx >= st.sheet.x - 1 && cx <= st.sheet.x + st.sheet.w + 1 && cy >= st.sheet.y - 1 && cy <= st.sheet.y + st.sheet.h + 1, `center ${cx}, ${cy} on the sheet ${JSON.stringify(st.sheet)}`).toBe(true);

            if (st.bar) {
              expect(inside(st.bar, st.canvas), `toolbar ${JSON.stringify(st.bar)} inside the canvas`).toBe(true);
              expect(Math.abs(st.bar.y + st.bar.h / 2 - cy), 'toolbar next to the piece').toBeLessThan(p.h / 2 + st.bar.h + 30);
            }

            for (const [i, l] of st.layers.entries()) {
              expect(nearRect(l.grid, l.sheet, 0.5), `sheet ${i + 1}: the grid the sheet’s size`).toBe(true);
              expect(l.scroll, `sheet ${i + 1}: not scrolled inside`).toEqual([0, 0]);
              if (l.safe) expect(Math.abs(l.safe.x - l.sheet.x - st.margin * st.zoom), `sheet ${i + 1}: the margin where it was`).toBeLessThan(1);
            }

            // Focused again while it sticks out (the next case of the old walk started so): the
            // browser must not scroll the sheet's content to show it.
            await page.locator('#zoom-level').focus();
            await piece.focus();
            await settled(page);
            const again = await page.evaluate(readState);
            expect(again.layers.map((l) => l.scroll), 'focused again: no sheet scrolled inside').toEqual(again.layers.map(() => [0, 0]));
            expect(nearRect(again.frame, again.piece, 0.05), 'focused again: the frame on the piece').toBe(true);

            const left = st.sheet.x - st.stage.x;
            const right = st.stage.x + st.stage.w - (st.sheet.x + st.sheet.w);
            expect(st.stageScrollX, 'the stage not scrolled sideways').toBe(0);
            expect(st.docOverflow, 'the page not wider than the window').toBe(0);
            expect(Math.abs(left - right), `the sheet centered (${left} | ${right})`).toBeLessThan(20);
          });
        }

        test('Shift+→ repeated never takes the center past the edge, and everything stays aligned', async ({ app, page }) => {
          const id = await setup(app);
          await app.piece(id).focus();
          await expect(app.piece(id)).toHaveClass(/\bis-selected\b/);
          for (let i = 0; i < 30; i++) await page.keyboard.press('Shift+ArrowRight');
          await settled(page);
          const st = await page.evaluate(readState);
          const cx = st.piece!.x + st.piece!.w / 2;
          const edge = st.sheet.x + st.sheet.w;
          // With one sheet the way is free: it stops with its center on the edge. With several the
          // row may be full (it jumps over the others) and then it stays; it never passes the edge.
          if (multi) expect(cx, 'not past the edge').toBeLessThanOrEqual(edge + 2);
          else expect(Math.abs(cx - edge), `center ${cx} on the edge ${edge}`).toBeLessThan(2);
          expect(nearRect(st.frame, st.piece as Rect, 0.05), 'the frame on the piece').toBe(true);
          expect(st.layers.every((l) => l.scroll[0] === 0), 'no sheet scrolled').toBe(true);
          expect(st.stageScrollX, 'the stage not scrolled sideways').toBe(0);
        });
      });
    }
  });
}

test('a project with a piece stored thousands of mm off its sheet opens as it is: the canvas keeps the size of its sheets, even with the piece selected, the notice says which sheet, and from the list «Centrar en la hoja» brings it back', async ({ app, page }) => {
  const ids = await cardsOnThreeSheets(app);
  const extent = () => page.locator('#stage').evaluate((el) => el.scrollHeight);
  const sized = await extent();
  await saved(page);
  // The card of the third sheet, 9784,9 mm down a 297 mm sheet (what a drag that never ended showed).
  await patchStored(page, (doc) => {
    const third = (doc.sheets as { id: number }[])[2].id;
    return { ...doc, items: (doc.items as { sheet: number; y: number }[]).map((item) => (item.sheet === third ? { ...item, y: 9784.9 } : item)) };
  });
  await page.reload();
  await app.ready();

  const stray = (await app.sheets())[2].pieces[0];
  expect(Number(stray.id)).toBe(ids[2]);
  expect(stray.y, 'opened as stored, nothing moved').toBeCloseTo(9784.9, 1);
  await expect.poll(() => app.notice()).toMatchObject({ text: 'Hoja 3: 1 pieza se sale de la hoja y se corta al imprimir', warn: true });
  expect(await extent(), 'the canvas the size of its sheets').toBe(sized);

  await app.row(ids[2]).click();
  await expect.poll(() => app.selectedIds()).toEqual([ids[2]]);
  await app.openMeasures();
  await expect(page.locator('#pos-y')).toHaveValue(/^9784,9/);
  await settled(page);
  expect(await extent(), 'selected, its frame doesn’t stretch the canvas').toBe(sized);

  await page.locator('#piece-center').click();
  await expect.poll(async () => (await app.sheets())[2].pieces[0].y).toBeLessThan(297);
  await expect.poll(async () => (await app.notice()).text).toBe('');
  expect(await extent()).toBe(sized);
});
