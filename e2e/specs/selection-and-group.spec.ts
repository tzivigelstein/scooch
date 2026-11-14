// Selecting several pieces and working on them as a group, with a real pointer
// and keyboard: what only the browser shows (clicks with modifiers on the
// sheet, the marquee, the focus ring, dragging, the group's handle) and one
// wiring case per feature. The exact results of each operation, the settings
// matrix and the copies are tested on the stores (tests/state/align-and-
// distribute, group-transforms, group-operations-matrix, duplicate-and-
// select-same) and the panel's controls in tests/components.
import { frames } from '../support/canvas.ts';
import { boundsOf, centersOutside, onGrid, overlapping } from '../support/geometry.ts';
import { placeThree, positions } from '../support/selection.ts';
import { expect, norm, test, tiles } from '../support/test.ts';

test.describe('selecting pieces', () => {
  test('click, Shift+click and Ctrl+click on the sheet select, and the frame, the toolbar, the names and the list follow', async ({ app, page }) => {
    await app.addFiles(tiles(0, 6));
    const all = await app.ids();
    await app.piece(all[0]).click();
    await expect.poll(() => app.selectedIds()).toEqual([all[0]]);
    await app.piece(all[1]).click({ modifiers: ['Shift'] });
    await expect.poll(() => app.selectedIds()).toEqual([all[0], all[1]]);
    await app.piece(all[2]).click({ modifiers: ['Control'] });
    await expect.poll(() => app.selectedIds()).toEqual([all[0], all[1], all[2]]);
    await expect(page.locator('#sheets .piece.is-grouped')).toHaveCount(3);
    await expect(page.locator('.group-frame')).toHaveCount(1);
    await expect(page.locator('#frame')).toBeHidden();
    expect(norm(await page.textContent('#piece-size'))).toBe('3 piezas');
    await expect(page.locator('#piecebar')).toHaveAttribute('aria-label', 'Acciones de 3 piezas');
    await app.heard(/3 piezas seleccionadas/);

    await app.piece(all[1]).click({ modifiers: ['Shift'] });
    await expect.poll(() => app.selectedIds()).toEqual([all[0], all[2]]);
    const named = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#sheets .piece')].filter((p) => p.getAttribute('aria-label')?.endsWith(', seleccionada')).map((p) => Number(p.dataset.id)));
    expect(named.sort((a, b) => a - b)).toEqual([all[0], all[2]]);
    const rows = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#piece-list [role="option"][aria-selected="true"]')].map((r) => Number(r.dataset.id)).sort((a, b) => a - b));
    expect(rows).toEqual([all[0], all[2]]);
  });

  test('a click on empty space selects none; the marquee previews and selects what it touches, and adds with Shift', async ({ app, page }) => {
    await app.addFiles(tiles(0, 6));
    const all = await app.ids();
    await app.piece(all[0]).click();
    const sheet = (await page.locator('.sheet').first().boundingBox())!;
    await page.mouse.click(sheet.x + sheet.width - 6, sheet.y + sheet.height - 6);
    await expect.poll(() => app.selectedIds()).toEqual([]);

    const g = await app.geometry();
    const [a, b, , , c] = g.pieces;
    const px = (mm: number) => mm * g.zoom;
    await page.mouse.move(sheet.x + px(a.x) - 4, sheet.y + px(a.y) - 4);
    await page.mouse.down();
    await page.mouse.move(sheet.x + px(b.x) + 6, sheet.y + px(b.y) + 6, { steps: 6 });
    await expect(page.locator('#sheets .piece.is-marked')).toHaveCount(2);
    await page.mouse.up();
    await expect.poll(() => app.selectedIds()).toEqual([a.id, b.id]);

    // From the empty space under c, up into it, with Shift.
    await page.keyboard.down('Shift');
    await page.mouse.move(sheet.x + px(c.x + c.w / 2), sheet.y + px(c.y + c.h) + 3);
    await page.mouse.down();
    await page.mouse.move(sheet.x + px(c.x + c.w / 2) + 10, sheet.y + px(c.y + c.h) - 8, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect.poll(() => app.selectedIds()).toEqual([a.id, b.id, c.id]);
  });

  test('Ctrl+A selects the current sheet, then the whole document, with a frame per sheet', async ({ app, page }) => {
    await app.addFiles(tiles(0, 6));
    const all = await app.ids();
    await page.click('#add-sheet');
    await app.addFiles(tiles(6, 2));
    await app.piece(all[0]).focus();
    await page.keyboard.press('Control+a');
    await expect.poll(async () => (await app.selectedIds()).length).toBe(6);
    await page.keyboard.press('Control+a');
    await expect.poll(async () => (await app.selectedIds()).length).toBe(8);
    await expect(page.locator('.group-frame')).toHaveCount(2);
  });

  test('on the sheet, Shift+Space pins the focused piece; Tab to another keeps the selection and shows the focus ring; Shift+Enter and Shift+Space add and remove it', async ({ app, page }) => {
    await app.addFiles(tiles(0, 3));
    const all = await app.ids();
    await app.piece(all[0]).focus();
    await page.keyboard.press('Shift+Space');
    await expect.poll(() => app.selectedIds()).toEqual([all[0]]);
    await page.keyboard.press('Tab');
    const focused = (await app.active()).piece!;
    expect(focused).not.toBe(all[0]);
    expect(await app.selectedIds()).toEqual([all[0]]);
    // Focused but not selected: a dashed ring on the piece's ::after.
    expect(await page.evaluate(() => getComputedStyle(document.activeElement!, '::after').outlineStyle)).toBe('dashed');
    await page.keyboard.press('Shift+Enter');
    await expect.poll(() => app.selectedIds()).toEqual([all[0], focused].sort((x, y) => x - y));
    await page.keyboard.press('Shift+Space');
    await expect.poll(() => app.selectedIds()).toEqual([all[0]]);
  });
});

test.describe('pieces on several sheets', () => {
  const OFF = 'Disponible cuando las piezas están en una misma hoja';
  const MEASURES = ['#pos-x', '#pos-y', '#width', '#height'];

  test('by click and Shift+click, then by Ctrl+A: the title names the spread, the measures are off in place with the reason and show nothing on the canvas, the scale changes them all; back on one sheet the measures come back', async ({ app, page }) => {
    await app.addFiles(tiles(0, 3));
    await page.click('#add-sheet');
    await app.addFiles(tiles(3, 2));
    const g = await app.geometry();
    const [a, b, c] = g.pieces.filter((p) => p.sheetIndex === 0).map((p) => p.id);
    const [d] = g.pieces.filter((p) => p.sheetIndex === 1).map((p) => p.id);
    const width = g.pieces[0].w;

    await app.piece(a).click();
    await app.piece(b).click({ modifiers: ['Shift'] });
    await app.openMeasures();
    await expect(page.locator('#piece-title')).toHaveText('2 piezas en la hoja 1');
    const field = await page.locator('#pos-x').boundingBox();

    await app.piece(d).click({ modifiers: ['Shift'] });
    await expect.poll(() => app.selectedIds()).toEqual([a, b, d].sort((x, y) => x - y));
    await expect(page.locator('#piece-title')).toHaveText('3 piezas en 2 hojas');
    for (const id of MEASURES) {
      const input = page.locator(id);
      await expect(input, id).toBeVisible();
      await expect(input, id).toHaveValue('');
      await expect(input, id).toBeDisabled();
      await expect(input, id).toHaveAccessibleDescription(OFF);
    }
    expect(await page.locator('#pos-x').boundingBox(), 'the fields stay where they were').toEqual(field);
    await page.locator('#pos-x').hover();
    await expect(page.locator('#tooltip .tip-note')).toHaveText(OFF);
    await frames(page);
    await expect(page.locator('.preview-dimension')).toHaveCount(0);

    await app.setMeasure('scale', '50');
    await expect.poll(async () => (await app.geometry()).pieces.filter((p) => p.selected).map((p) => Math.round((p.w / width) * 100))).toEqual([50, 50, 50]);
    expect((await app.geometry()).pieces.find((p) => p.id === c)!.w).toBeCloseTo(width, 3);

    await app.piece(a).focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+a');
    await expect.poll(async () => (await app.selectedIds()).length).toBe(5);
    await expect(page.locator('#piece-title')).toHaveText('5 piezas en 2 hojas');
    for (const id of MEASURES) await expect(page.locator(id), id).toHaveValue('');

    await app.selectIds([a, c]);
    await expect(page.locator('#piece-title')).toHaveText('2 piezas en la hoja 1');
    for (const id of MEASURES) {
      await expect(page.locator(id), id).toBeEnabled();
      await expect(page.locator(id), id).not.toHaveValue('');
    }
    await page.locator('label:has(#width)').hover();
    await expect(page.locator('.preview-dimension')).toHaveCount(1);
  });
});

test.describe('align', () => {
  test('an align button moves the selected pieces, in one undo step', async ({ app }) => {
    const ids = await placeThree(app, [
      [20, 20],
      [90, 80],
      [150, 150],
    ]);
    await app.selectIds(ids);
    const before = await app.snapshot();
    await app.openMeasures();
    await app.page.click('[data-align="left"]');
    await expect.poll(() => positions(app, 'x')).toEqual([20, 20, 20]);
    expect(await positions(app, 'y')).toEqual([20, 80, 150]);
    await app.undo();
    await expect.poll(() => app.snapshot()).toBe(before);
  });

  test('a refused align offers «Permitir superposición»: its button allows overlaps and aligns, in one undo step', async ({ app, page }) => {
    // Aligned left, the second piece would land on the first.
    const ids = await placeThree(app, [
      [20, 20],
      [80, 40],
      [150, 150],
    ]);
    await app.selectIds(ids);
    const before = await app.snapshot();
    await app.openMeasures();
    await page.click('[data-align="left"]');
    await expect.poll(() => app.notice()).toEqual({ text: 'No se puede alinear: las piezas se superpondrían', action: 'Permitir superposición', warn: true });
    expect(await app.snapshot()).toBe(before);
    await page.click('#pill-action');
    await expect.poll(() => positions(app, 'x')).toEqual([20, 20, 20]);
    await expect(page.locator('#allow-overlap')).toBeChecked();
    await app.undo();
    await expect.poll(() => app.snapshot()).toBe(before);
  });
});

test.describe('a group with the pointer', () => {
  // Pieces 1 and 2 side by side and selected; piece 3 below the first.
  const layout: [number, number][] = [
    [20, 20],
    [90, 20],
    [20, 100],
  ];

  test('dragging one piece of the group moves them all (30 mm, on the 1 mm grid), in one undo step', async ({ app }) => {
    const ids = await placeThree(app, layout);
    await app.selectIds(ids.slice(0, 2));
    const before = await app.snapshot();
    const { zoom } = await app.geometry();
    await app.drag(app.piece(ids[1]), 30 * zoom, 0);
    await expect.poll(() => positions(app, 'x')).toEqual([50, 120, 20]);
    await app.undo();
    await expect.poll(() => app.snapshot()).toBe(before);
  });

  test('a click without dragging on one of the group selects only that one', async ({ app }) => {
    const ids = await placeThree(app, layout);
    await app.selectIds(ids.slice(0, 2));
    await app.piece(ids[1]).click();
    await expect.poll(() => app.selectedIds()).toEqual([ids[1]]);
  });

  test('dropping the group on another piece leaves no overlap', async ({ app }) => {
    const ids = await placeThree(app, layout);
    await app.selectIds(ids.slice(0, 2));
    const before = await app.snapshot();
    const { zoom } = await app.geometry();
    await app.drag(app.piece(ids[0]), 0, 70 * zoom);
    await expect.poll(() => app.snapshot()).not.toBe(before);
    expect(overlapping((await app.geometry()).pieces)).toEqual([]);
  });

  test('the group’s handle scales the group from its top left corner, in one undo step', async ({ app, page }) => {
    const ids = await placeThree(app, layout);
    const { w: W0 } = (await app.geometry()).pieces[0];
    await app.selectIds(ids.slice(0, 2));
    const before = await app.snapshot();
    const handle = (await page.locator('.group-frame .handle').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 - 40, handle.y + handle.height / 2 - 10, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => app.snapshot()).not.toBe(before);
    const g = await app.geometry();
    const k = g.pieces[0].w / W0;
    expect(k).toBeLessThan(1);
    expect(g.pieces[1].w / W0).toBeCloseTo(k, 4);
    expect(g.pieces[0].x).toBeCloseTo(20, 2);
    expect(g.pieces[1].x).toBeCloseTo(20 + 70 * k, 2);
    await app.undo();
    await expect.poll(() => app.snapshot()).toBe(before);
  });

  test('in inches, with the grid and two sheets, dragging keeps each sheet’s part on the grid without overlaps, and undo/redo are exact', async ({ app, page }) => {
    await page.evaluate(() => localStorage.setItem('scooch:unit-preference', 'in'));
    await page.reload();
    await app.ready();
    await app.addFiles(tiles(20, 4));
    await page.click('#add-sheet');
    await app.addFiles(tiles(24, 3));
    // The grid's first chip in inches: 1/8 in (3.175 mm). «Imán» is on by default.
    await app.openSetting('#grid-chips');
    await page.locator('#grid-chips input').first().check({ force: true });
    await expect(page.locator('#grid-snap')).toBeChecked();
    const step = 3.175;
    const all = await app.ids();
    const chosen = [all[0], all[1], all[4], all[5]];
    await app.selectIds(chosen);
    const before = await app.snapshot();
    // Down into the free half of each sheet, by an amount off the grid (a drop on
    // another piece would go back to the nearest free spot: where it was).
    // The second sheet is the one in view (it was added last): drag its part.
    const { zoom } = await app.geometry(210);
    await app.piece(chosen[2]).scrollIntoViewIfNeeded();
    await app.drag(app.piece(chosen[2]), 13.3 * zoom, 130.7 * zoom);
    await expect.poll(() => app.snapshot()).not.toBe(before);
    const after = await app.snapshot();
    const g = await app.geometry(210);
    expect(overlapping(g.pieces)).toEqual([]);
    expect(centersOutside(g)).toEqual([]);
    for (const sheet of new Set(g.pieces.filter((p) => chosen.includes(p.id)).map((p) => p.sheet!))) {
      const box = boundsOf(g.pieces, chosen, sheet)!;
      expect(onGrid(box.x, step) && onGrid(box.y, step), `sheet ${sheet}: ${box.x}, ${box.y} on the ${step} mm grid`).toBe(true);
    }
    await app.undo();
    await expect.poll(() => app.snapshot()).toBe(before);
    await app.redo();
    await expect.poll(() => app.snapshot()).toBe(after);
  });
});

test.describe('copies', () => {
  test('D adds one copy whatever the field says; «Duplicar ×N» fills up to 200 pieces without overlaps; at 200 D warns and adds nothing; I selects every piece of the file', async ({ app, page }) => {
    test.slow();
    await app.addFiles(tiles(40, 1));
    const [id] = await app.ids();
    await app.selectIds([id]);
    await app.setMeasure('scale', '15'); // small: many fit on a sheet
    await app.setMeasure('dup-count', '5');
    await app.piece(id).focus();
    await page.keyboard.press('d');
    await expect(app.pieces()).toHaveCount(2);

    // The copy is selected: 198 more fit.
    await app.setMeasure('dup-count', '250');
    await expect(page.locator('#dup-count')).toHaveValue('198');
    await page.click('#dup-many');
    await expect(app.pieces()).toHaveCount(200, { timeout: 60_000 });
    expect(overlapping((await app.geometry()).pieces)).toEqual([]);

    await app.piece(id).click();
    await page.keyboard.press('d');
    await expect.poll(() => app.notice()).toMatchObject({ warn: true, text: 'Se admiten hasta 200 piezas en total. Quita alguna para duplicar esta.' });
    await expect(app.pieces()).toHaveCount(200);

    await page.keyboard.press('i');
    await expect(page.locator('#sheets .piece.is-selected')).toHaveCount(200);
  });
});
