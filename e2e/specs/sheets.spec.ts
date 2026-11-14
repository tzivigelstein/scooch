// Several sheets in the browser: «Acomodar» across sheets, the sheets as named
// groups, removing a sheet (at once, with «Deshacer» in the notice, and where the
// focus goes), dragging a piece to another sheet (the stage scrolls by itself, the
// target sheet is marked, dropping onto a piece there), which sheet is the
// current one, dragging pieces out of the sheets onto a new one (the
// placeholders, by mouse, touch and zoomed in, and the context menu's
// keyboard path), and how far something held at an edge scrolls the stage.
// What these actions do exactly is in tests/state/sheets.test.ts.
import { expect, test, cards } from '../support/test.ts';
import { frames, setZoom } from '../support/canvas.ts';
import { outsideMargin, overlapping } from '../support/geometry.ts';
import { counts, holdPiece, lastSheetBottom, pageAt, pieceIds, placeholders, scrollOf, scrollStops, sheetIds, stageBox, toBelowLastSheet } from '../support/sheets.ts';

test('«Acomodar» puts 20 equal cards back on 3 sheets, 9 + 9 + 2, and says so; each sheet is a group named after its visible label', async ({ app, page }) => {
  await app.addFiles(cards(0, 20));
  // What doesn't fit goes on to new sheets, without overlaps and inside the margin.
  expect(await counts(app)).toEqual([9, 9, 2]);
  let g = await app.geometry();
  expect(overlapping(g.pieces)).toEqual([]);
  expect(outsideMargin(g)).toEqual([]);

  await expect(page.locator('#sheets .page-label')).toHaveText(['Hoja 1 de 3', 'Hoja 2 de 3', 'Hoja 3 de 3']);
  for (const name of ['Hoja 1 de 3, 9 piezas', 'Hoja 2 de 3, 9 piezas', 'Hoja 3 de 3, 2 piezas']) {
    await expect(page.locator('#sheets').getByRole('group', { name, exact: true })).toBeVisible();
  }

  // Messed up with Shift+Page Down: three pieces of the first sheet go on.
  for (let i = 0; i < 3; i++) {
    await pageAt(page, 0).locator('.piece').first().focus();
    await page.keyboard.press('Shift+PageDown');
  }
  await expect.poll(async () => (await counts(app))[0]).toBe(6);

  await page.locator('#arrange').click();
  await expect.poll(() => counts(app)).toEqual([9, 9, 2]);
  // Still three sheets: the canvas shows it, and it is announced.
  await app.heard(/Se acomodaron 20 piezas en 3 hojas/);
  g = await app.geometry();
  expect(overlapping(g.pieces)).toEqual([]);
  expect(outsideMargin(g)).toEqual([]);

  // Another paper changes every sheet.
  await app.openSheet();
  await page.locator('#paper').selectOption('A5');
  await expect(page.locator('#paper-label')).toContainText('148 × 210 mm');
  const boxes = await page.locator('#sheets .sheet-box').evaluateAll((list) => list.map((b) => (b as HTMLElement).style.width + ' × ' + (b as HTMLElement).style.height));
  expect(boxes).toHaveLength(3);
  expect(new Set(boxes).size).toBe(1);
});

test('removing a sheet: an empty one goes at once and its place takes the focus; one with pieces too, with «Deshacer» in the notice; the last one has no remove button', async ({ app, page }) => {
  await app.addFiles(cards(0, 12));
  await page.locator('#add-sheet').click();
  // The second sheet's pieces go on to the third: it is left empty, in the middle.
  for (let i = 0; i < 3; i++) {
    await pageAt(page, 1).locator('.piece').first().focus();
    await page.keyboard.press('Shift+PageDown');
  }
  await expect.poll(() => counts(app)).toEqual([9, 0, 3]);
  const ids = await sheetIds(app);

  await pageAt(page, 1).locator('.page-remove').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => counts(app)).toEqual([9, 3]);
  await expect(page.locator('#confirm')).not.toHaveAttribute('open');
  await app.heard(/Se quitó la hoja 2/);
  await expect(page.locator(`#sheets .page[data-sheet="${ids[2]}"] .sheet`)).toBeFocused();

  const removeFirst = pageAt(page, 0).locator('.page-remove');
  await removeFirst.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => counts(app)).toEqual([3]);
  await expect(page.locator('#confirm')).not.toHaveAttribute('open');
  await expect(app.pieces()).toHaveCount(3);
  await expect(page.locator('#sheets .page-remove')).toBeHidden();
  await expect(page.locator(`#sheets .page[data-sheet="${ids[2]}"] .sheet`)).toBeFocused();
  expect(await app.notice()).toMatchObject({ text: 'Se quitó la hoja 1 con 9 piezas', action: 'Deshacer' });
  await page.locator('#pill-action').click();
  await expect.poll(() => counts(app)).toEqual([9, 3]);
});

test('dragging a piece down to the next sheet: the stage scrolls by itself, that sheet is marked, and the piece moves there, announced, keeping the focus', async ({ app, page }) => {
  await app.addFiles(cards(0, 12));
  const [first9] = await pieceIds(app);
  const piece = pageAt(page, 0).locator('.piece').first();
  const id = Number(await piece.getAttribute('data-id'));
  const box = (await piece.boundingBox())!;
  const stage = await stageBox(page);
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.move(x, stage.y + stage.height - 15, { steps: 10 });
  // Held near the bottom edge until the second sheet shows.
  const sheet2 = pageAt(page, 1).locator('.sheet');
  await expect.poll(async () => (await sheet2.boundingBox())!.y, { intervals: [16] }).toBeLessThan(300);
  expect(await page.locator('#stage').evaluate((el) => el.scrollTop)).toBeGreaterThan(200);

  const s2 = (await sheet2.boundingBox())!;
  await page.mouse.move(s2.x + s2.width * 0.7, Math.min(stage.y + stage.height - 60, s2.y + s2.height * 0.7), { steps: 8 });
  await expect(pageAt(page, 1)).toHaveClass(/\bis-drop-target\b/);
  await page.mouse.up();

  await expect.poll(() => counts(app)).toEqual([8, 4]);
  const ids = await pieceIds(app);
  expect(ids[1]).toContain(id);
  expect(first9).toContain(id);
  expect(overlapping((await app.geometry()).pieces)).toEqual([]);
  await app.heard(/Se movió a la hoja 2 de 2/);
  await expect(app.piece(id)).toBeFocused();
  await expect(pageAt(page, 1)).toHaveClass(/\bis-current\b/);
  await expect(pageAt(page, 1)).not.toHaveClass(/\bis-drop-target\b/);

  // The drag is one undo step.
  await page.keyboard.press('Control+z');
  await expect.poll(() => counts(app)).toEqual([9, 3]);
});

test('a piece dropped onto another one on the next sheet shows it is blocked meanwhile, then lands in a free spot of that sheet', async ({ app, page }) => {
  await app.addFiles(cards(0, 12));
  const [, last3] = await pieceIds(app);
  await page.locator('#stage').evaluate((el) => el.scrollTo(0, 0));
  const piece = pageAt(page, 0).locator('.piece').first();
  const id = Number(await piece.getAttribute('data-id'));
  const b = (await piece.boundingBox())!;
  const stage = await stageBox(page);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, stage.y + stage.height - 8, { steps: 8 });
  // Held at the bottom edge until a piece of the second sheet is well in view.
  const target = app.piece(last3[0]);
  await expect
    .poll(
      async () => {
        const t = (await target.boundingBox())!;
        return t.y + t.height / 2;
      },
      { intervals: [16] }
    )
    .toBeLessThan(stage.y + stage.height - 150);
  for (let i = 0; i < 2; i++) {
    const t = (await target.boundingBox())!;
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 8 });
  }
  await expect(page.locator('#frame')).toHaveClass(/\bis-blocked\b/);
  await page.mouse.up();

  await expect.poll(() => counts(app)).toEqual([8, 4]);
  expect((await pieceIds(app))[1]).toContain(id);
  expect(overlapping((await app.geometry()).pieces)).toEqual([]);
  await expect(page.locator('#frame')).not.toHaveClass(/\bis-blocked\b/);
});

test('without a selection, the current sheet is the one most in view', async ({ app, page }) => {
  await app.addFiles(cards(0, 12));
  await app.pieces().first().focus();
  await page.keyboard.press('Escape');
  await expect(pageAt(page, 0)).toHaveClass(/\bis-current\b/);
  await page.locator('#stage').evaluate((el) => el.scrollTo(0, 99999));
  await expect(pageAt(page, 1)).toHaveClass(/\bis-current\b/);
  await expect(pageAt(page, 0)).not.toHaveClass(/\bis-current\b/);
});

test.describe('dragging pieces out of the sheets onto a new sheet', () => {
  test.beforeEach(async ({ app }) => {
    // Two sheets: 9 cards and 3.
    await app.addFiles(cards(0, 12));
    expect(await counts(app)).toEqual([9, 3]);
  });

  test('below the last sheet: a dashed sheet-sized placeholder in the sheets’ column; dropped there, a third sheet with the piece inside the printable area, announced, in one undo step', async ({ app, page }) => {
    const [first9, last3] = await pieceIds(app);

    await test.step('a drag that stays inside its sheet shows no placeholder', async () => {
      const from = await holdPiece(app, first9[4]);
      await page.mouse.move(from.x + 30, from.y + 20, { steps: 4 });
      const state = await placeholders(page);
      expect([state.end, state.bar]).toEqual([false, false]);
      await page.keyboard.press('Escape');
      await page.mouse.up();
    });

    const before = await app.sheets();
    const pagesBefore = (await placeholders(page)).pages;
    const from = await holdPiece(app, last3[0]);
    await toBelowLastSheet(page, from.x);
    await expect.poll(async () => (await placeholders(page)).endActive).toBe(true);
    const state = await placeholders(page);
    expect(state).toMatchObject({ end: true, endActive: true, bar: false, hidden: true });
    expect(Math.abs(state.endRect!.w - state.sheetBox.w)).toBeLessThan(1);
    expect(Math.abs(state.endRect!.h - state.sheetBox.h)).toBeLessThan(1);
    expect(Math.abs(state.endRect!.x - state.sheetBox.x)).toBeLessThan(1);
    // Nothing moved under the pointer.
    expect(state.pages).toEqual(pagesBefore);
    await page.mouse.up();

    await expect.poll(() => counts(app)).toEqual([9, 2, 1]);
    const after = await app.sheets();
    const moved = after[2].pieces.find((p) => Number(p.id) === last3[0])!;
    expect(moved.x).toBeGreaterThanOrEqual(10 - 0.01);
    expect(moved.y).toBeGreaterThanOrEqual(10 - 0.01);
    expect(moved.x + moved.w).toBeLessThanOrEqual(200.01);
    expect(moved.y + moved.h).toBeLessThanOrEqual(287.01);
    await app.heard(/Se creó la hoja 3 y se movió 1 pieza/);
    expect((await app.notice()).text).toBe('');
    expect(await placeholders(page)).toMatchObject({ end: false, bar: false });

    await app.undo();
    await expect.poll(() => app.sheets()).toEqual(before);
    await app.redo();
    await expect.poll(() => app.sheets()).toEqual(after);
  });

  test('between two sheets: a bar shows in the gap (the dashed sheet stays, not active) and the new sheet goes between them', async ({ app, page }) => {
    const [, last3] = await pieceIds(app);
    const before = await app.sheets();
    const from = await holdPiece(app, last3[1]);
    const gapY = await page.evaluate(() => {
      const pages = [...document.querySelectorAll('#sheets .page')];
      const a = pages[0].querySelector('.sheet-box')!.getBoundingClientRect();
      const b = pages[1].getBoundingClientRect();
      return (a.bottom + b.top) / 2;
    });
    await page.mouse.move(from.x, gapY, { steps: 10 });
    await expect.poll(async () => (await placeholders(page)).bar).toBe(true);
    const state = await placeholders(page);
    expect(state).toMatchObject({ bar: true, end: true, endActive: false });
    expect(Math.abs(state.barRect!.y - gapY)).toBeLessThan(30);
    await page.mouse.up();

    await expect.poll(async () => (await app.sheets()).length).toBe(3);
    const after = await app.sheets();
    expect([after[0].id, after[2].id]).toEqual([before[0].id, before[1].id]);
    expect(after[1].pieces.map((p) => Number(p.id))).toEqual([last3[1]]);
    expect(after[1].label).toBe('Hoja 2 de 3');
  });

  test('above the first sheet: the bar shows and the new sheet goes first', async ({ app, page }) => {
    const [first9] = await pieceIds(app);
    const before = await app.sheets();
    await page.locator('#stage').evaluate((el) => el.scrollTo(0, 0));
    const from = await holdPiece(app, first9[0]);
    const aboveY = await page.evaluate(() => document.querySelector('#sheets .page')!.getBoundingClientRect().top - 2);
    await page.mouse.move(from.x, Math.max(aboveY, 60), { steps: 10 });
    await expect.poll(async () => (await placeholders(page)).bar).toBe(true);
    await page.mouse.up();

    await expect.poll(async () => (await app.sheets()).length).toBe(3);
    const after = await app.sheets();
    expect(after[0].pieces.map((p) => Number(p.id))).toEqual([first9[0]]);
    expect(after[1].id).toBe(before[0].id);
  });

  test('Esc cancels: the placeholder goes, no new sheet, nothing moved', async ({ app, page }) => {
    const [, last3] = await pieceIds(app);
    const before = await app.sheets();
    const from = await holdPiece(app, last3[2]);
    await toBelowLastSheet(page, from.x);
    await expect.poll(async () => (await placeholders(page)).endActive).toBe(true);
    await page.keyboard.press('Escape');
    expect((await placeholders(page)).end).toBe(false);
    await page.mouse.up();
    expect(await app.sheets()).toEqual(before);
  });

  test('a group from one sheet keeps its arrangement on the new sheet; the sheet it emptied stays, with a notice whose «Quitar hoja» removes it', async ({ app, page }) => {
    const [, last3] = await pieceIds(app);
    await app.selectIds(last3);
    const offsets = (list: { x: number; y: number }[]) => list.map((p) => [Math.round((p.x - list[0].x) * 100) / 100, Math.round((p.y - list[0].y) * 100) / 100]);
    const g0 = offsets((await app.sheets())[1].pieces);
    await page.mouse.move(0, 0);
    const from = await holdPiece(app, last3[0]);
    await toBelowLastSheet(page, from.x);
    await expect.poll(async () => (await placeholders(page)).endActive).toBe(true);
    await page.mouse.up();

    await expect.poll(() => counts(app)).toEqual([9, 0, 3]);
    expect(offsets((await app.sheets())[2].pieces)).toEqual(g0);
    await expect.poll(() => app.notice()).toMatchObject({ text: 'La hoja 2 quedó vacía', action: 'Quitar hoja' });
    await page.locator('#pill-action').click();
    await expect.poll(() => counts(app)).toEqual([9, 3]);
  });

  test('a selection on two sheets shows no placeholder', async ({ app, page }) => {
    const [first9, last3] = await pieceIds(app);
    await app.selectIds([first9[8], last3[0]]);
    const from = await holdPiece(app, last3[0]);
    // Held at the bottom edge until the last sheet's bottom shows (no room is made past it for
    // them, so not as far up as for one sheet's pieces)…
    const stage = await stageBox(page);
    await page.mouse.move(from.x, stage.y + stage.height - 8, { steps: 6 });
    await expect.poll(() => lastSheetBottom(page), { intervals: [16] }).toBeLessThan(stage.y + stage.height - 60);
    // …then below it, outside every sheet.
    await page.mouse.move(from.x, (await lastSheetBottom(page)) + 30, { steps: 4 });
    expect(await placeholders(page)).toMatchObject({ end: false, bar: false });
    await page.keyboard.press('Escape');
    await page.mouse.up();
  });

  test('by touch: the placeholder shows and dropping creates the sheet (no context menu)', async ({ app, page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the touch goes through the Chrome DevTools Protocol (Input.dispatchTouchEvent), which only Chromium has');
    const [, last3] = await pieceIds(app);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await page.keyboard.press('Escape');
    await app.piece(last3[0]).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const b = (await app.piece(last3[0]).boundingBox())!;
    const t0 = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await touch('touchStart', t0.x, t0.y);
    for (let i = 1; i <= 6; i++) await touch('touchMove', t0.x, t0.y + i * 6);
    await toBelowLastSheet(page, t0.x, (x, y) => touch('touchMove', x, y));
    await expect.poll(async () => (await placeholders(page)).endActive).toBe(true);
    await touch('touchEnd');

    await expect.poll(async () => (await app.sheets()).length).toBe(3);
    expect((await pieceIds(app))[2]).toContain(last3[0]);
    await expect(page.locator('#context-menu')).toHaveCount(0);
  });

  test('at 200 %: the placeholder is sheet-sized and in the column, and the drop makes the sheet', async ({ app, page }) => {
    const [, last3] = await pieceIds(app);
    await page.locator('#zoom-level').click();
    await page.locator('#zoom-menu-level-200').click();
    await expect(page.locator('#zoom-level')).toContainText('200');
    const from = await holdPiece(app, last3[1]);
    await toBelowLastSheet(page, from.x);
    await expect.poll(async () => (await placeholders(page)).endActive).toBe(true);
    const state = await placeholders(page);
    expect(Math.abs(state.endRect!.w - state.sheetBox.w)).toBeLessThan(1);
    expect(Math.abs(state.endRect!.x - state.sheetBox.x)).toBeLessThan(1);
    await page.mouse.up();

    await expect.poll(async () => (await app.sheets()).length).toBe(3);
    expect((await pieceIds(app))[2]).toContain(last3[1]);
  });

  test('from the keyboard, the context menu’s «Mover a una hoja nueva» makes a sheet right after, announced', async ({ app, page }) => {
    const [, last3] = await pieceIds(app);
    await app.piece(last3[2]).focus();
    // Focusing it may scroll the stage, which closes menus: let that scroll happen first.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.keyboard.press('Shift+F10');
    await expect(page.locator('#context-menu')).toBeVisible();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#context-menu-new-sheet')).toBeFocused();
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await app.sheets()).length).toBe(3);
    expect((await pieceIds(app))[2]).toContain(last3[2]);
    await app.heard(/Se creó la hoja 3 y se movió 1 pieza/);
  });
});

test.describe('something held at an edge of the stage scrolls it only as far as there is something to show', () => {
  test('a piece held below the bottom edge with one sheet: the stage scrolls until the new sheet’s placeholder shows whole and stops there for good, past the window too; with Esc the extent is the one it had, dropped it is the new document’s', async ({ app, page }) => {
    await app.addFiles(cards(0, 2));
    const [[id]] = await pieceIds(app);
    const stage = await stageBox(page);
    const before = await scrollOf(page);

    for (const end of ['cancel', 'drop'] as const) {
      await test.step(`held, then ${end === 'cancel' ? 'Esc' : 'dropped'}`, async () => {
        const from = await holdPiece(app, id);
        await page.mouse.move(from.x, stage.y + stage.height - 4, { steps: 8 });
        const held = await scrollStops(page);
        expect(held.top, 'it scrolled down').toBeGreaterThan(0);
        expect(held.top, 'to the end of what it shows').toBe(held.maxTop);
        const { endRect } = await placeholders(page);
        const endBottom = held.top + endRect!.y + endRect!.h - stage.y;
        expect(endBottom, 'the placeholder shows whole').toBeLessThanOrEqual(held.top + stage.height);
        // No further than the stage's bottom padding (4rem) below it.
        expect(held.height, 'the extent ends just below the placeholder').toBeLessThanOrEqual(Math.ceil(endBottom) + 64 + 1);

        await frames(page, 120);
        expect(await scrollOf(page), 'held on, nothing grows').toEqual(held);
        await page.mouse.move(from.x, 900 + 300, { steps: 4 });
        await frames(page, 120);
        expect(await scrollOf(page), 'held past the window’s bottom, nothing grows either').toEqual(held);

        if (end === 'cancel') {
          // React renders #sheets' classes anew when an animation ends, whatever the drag added.
          await page.evaluate(() => (document.getElementById('sheets')!.className = 'sheets'));
          await page.keyboard.press('Escape');
          await page.mouse.up();
          await frames(page);
          expect((await scrollOf(page)).height, 'the extent it had before').toBe(before.height);
          expect(await counts(app)).toEqual([2]);
        } else {
          await page.mouse.up();
          await expect.poll(() => counts(app)).toEqual([1, 1]);
        }
      });
    }

    // The same document without a drag (undone and redone): the same extent.
    const dropped = (await scrollOf(page)).height;
    await app.undo();
    await expect.poll(() => counts(app)).toEqual([2]);
    await app.redo();
    await expect.poll(() => counts(app)).toEqual([1, 1]);
    await frames(page);
    expect(dropped, 'after the drop, the extent of the new document').toBe((await scrollOf(page)).height);
  });

  test('at 400 %, a piece held at the right edge scrolls sideways only to the sheets’ edge, and at the left edge back to the start; with Esc nothing is left', async ({ app, page }) => {
    await app.addFiles(cards(0, 2));
    const [[id]] = await pieceIds(app);
    await setZoom(page, 400);
    const stage = await stageBox(page);
    // Where the right end is (Chrome stops short of scrollWidth − clientWidth by the scrollbar's gutter).
    const end = await page.locator('#stage').evaluate((el) => {
      el.scrollTo(1e6, 0);
      const left = el.scrollLeft;
      el.scrollTo(0, 0);
      return left;
    });
    const before = await scrollOf(page);
    expect(end, 'zoomed in past the stage’s width').toBeGreaterThan(0);

    const from = await holdPiece(app, id);
    await page.mouse.move(stage.x + stage.width - 4, from.y, { steps: 8 });
    let held = await scrollStops(page);
    expect(held.left, 'to the right end').toBe(end);
    expect(held.width, 'the sheets’ width, not one pixel more').toBe(before.width);
    await page.mouse.move(1440 + 300, from.y, { steps: 4 });
    await frames(page, 120);
    expect(await scrollOf(page), 'held past the window’s right edge, nothing grows').toEqual(held);

    await page.mouse.move(stage.x + 4, from.y, { steps: 8 });
    held = await scrollStops(page);
    expect(held.left, 'back to the left end').toBe(0);
    expect(held.width).toBe(before.width);

    await page.keyboard.press('Escape');
    await page.mouse.up();
    await frames(page);
    const after = await scrollOf(page);
    expect([after.width, after.height], 'the extent it had before').toEqual([before.width, before.height]);
  });

  test('a marquee held past the bottom edge scrolls to the end of the sheet and no further', async ({ app, page }) => {
    await app.addFiles(cards(0, 2));
    await setZoom(page, 100);
    await page.locator('#stage').evaluate((el) => el.scrollTo(0, 0));
    const before = await scrollOf(page);
    expect(before.maxTop, 'the sheet is taller than the stage').toBeGreaterThan(0);
    const sheet = (await pageAt(page, 0).locator('.sheet').boundingBox())!;
    await page.mouse.move(sheet.x - 12, sheet.y + 10);
    await page.mouse.down();
    await page.mouse.move(sheet.x + sheet.width - 20, sheet.y + 80, { steps: 4 });
    await page.mouse.move(sheet.x + sheet.width - 20, 900 + 300, { steps: 8 });
    const held = await scrollStops(page);
    expect(held.top, 'to the end').toBe(before.maxTop);
    expect(held.height, 'and no further').toBe(before.height);
    await frames(page, 120);
    expect(await scrollOf(page), 'held on, nothing grows').toEqual(held);
    await page.mouse.up();
    await frames(page);
    expect((await scrollOf(page)).height).toBe(before.height);
    expect(await app.selectedIds(), 'the marquee selected both cards').toHaveLength(2);
  });
});

test('«Quitar todas» asks first, focused on «Cancelar»; confirmed, one empty sheet is left with the focus on it and a notice that offers «Deshacer»', async ({ app, page }) => {
  await app.addFiles(cards(0, 12));
  const before = await app.snapshot();
  await page.locator('#clear').click();
  await expect(page.locator('#confirm')).toHaveAttribute('open', '');
  await expect(page.locator('#confirm-title')).toHaveText('¿Quitar las 12 piezas de las 2 hojas?');
  await expect(page.locator('#confirm-cancel')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#confirm')).not.toHaveAttribute('open');
  await expect(app.pieces()).toHaveCount(12);
  await expect(page.locator('#clear')).toBeFocused();

  await page.locator('#clear').click();
  await page.locator('#confirm-ok').click();
  await expect(app.pieces()).toHaveCount(0);
  await expect(page.locator('#sheets .page')).toHaveCount(1);
  await expect(page.locator('#clear')).toBeDisabled();
  await expect(page.locator('#empty')).toBeFocused();
  await expect.poll(() => app.notice()).toEqual({ text: 'Se quitaron las 12 piezas', action: 'Deshacer', warn: false });
  await page.locator('#pill-action').click();
  await expect.poll(() => app.snapshot()).toBe(before);
});
