// Editing with the pointer, where only a real browser tells: dragging a piece
// onto the grid («Imán»), dropping it on another piece, the resize handle, the
// scale slider, G and the grid layer, files dropped on the canvas, and the
// overlap and grid preferences after a reload. What the actions compute is in
// tests/state (overlap-and-snap, placing-and-arranging).
import { closerThan, near, onGrid, overlapping } from '../support/geometry.ts';
import { dragPieceTo, dropFile, pieceOf, saved, setGrid } from '../support/editing.ts';
import { expect, test } from '../support/test.ts';

test.describe('dragging a piece lands where the pointer leaves it, on the grid with «Imán»', () => {
  const CASES = [
    { name: '1 mm by default', step: 1, setup: {} },
    { name: '5 mm', step: 5, setup: { size: '5' } },
    { name: '2,5 mm, a size of its own', step: 2.5, setup: { size: '2,5' } },
    { name: 'without «Imán»', step: 0, setup: { size: '2,5', snap: false } },
  ];
  for (const { name, step, setup } of CASES) {
    test(name, async ({ app, page }) => {
      await app.addFiles(['small.jpg']);
      const [id] = await app.ids();
      await setGrid(app, setup);
      if (setup.size === '2,5') await expect(page.locator('#grid-chips input:checked')).toHaveCount(0);
      const p0 = await pieceOf(app, id);
      // Off the grid on purpose: 0.4 of a step past a grid line (without «Imán», 1.2 mm past a 2.5 mm line).
      const s = step || 2.5;
      const spot = (v: number) => Math.round((v + 30) / s) * s + (step ? 0.4 * s : 1.2);
      const target = await dragPieceTo(app, id, spot(p0.x), spot(p0.y));
      await expect.poll(async () => (await pieceOf(app, id)).x).not.toBe(p0.x);
      const p1 = await pieceOf(app, id);
      // Within what a pixel of the pointer is worth, plus half a step.
      const tol = (step ? step / 2 : 0) + 0.3;
      expect(Math.abs(p1.x - target.x), `x ${p1.x} vs ${target.x}`).toBeLessThanOrEqual(tol);
      expect(Math.abs(p1.y - target.y), `y ${p1.y} vs ${target.y}`).toBeLessThanOrEqual(tol);
      if (step) {
        expect(onGrid(p1.x, step) && onGrid(p1.y, step), `${p1.x}, ${p1.y} on the ${step} mm grid`).toBe(true);
      } else {
        expect(onGrid(p1.x, 2.5) && onGrid(p1.y, 2.5), `${p1.x}, ${p1.y} not snapped`).toBe(false);
      }
      // One drag, one undo step.
      await app.undo();
      await expect.poll(async () => (await pieceOf(app, id)).x).toBe(p0.x);
      expect((await pieceOf(app, id)).y).toBe(p0.y);
    });
  }
});

test.describe('dropping a piece on another one', () => {
  test('it moves to the nearest free spot, on the 5 mm grid, in one undo step', async ({ app, page }) => {
    await app.addFiles(['card00.png', 'card01.png']);
    await page.locator('#arrange').click();
    await page.keyboard.press('Escape');
    await setGrid(app, { size: '5' });
    const [a, b] = await app.ids();
    const pa = await pieceOf(app, a);
    const pb = await pieceOf(app, b);
    await dragPieceTo(app, a, pb.x + 7, pb.y + 9);
    await expect.poll(async () => (await pieceOf(app, a)).x).not.toBe(pa.x);
    const g = await app.geometry();
    const moved = g.pieces.find((p) => p.id === a)!;
    expect(overlapping(g.pieces)).toEqual([]);
    expect(onGrid(moved.x, 5) && onGrid(moved.y, 5), `${moved.x}, ${moved.y} on the 5 mm grid`).toBe(true);
    // Next to the one it covered, not back where it was.
    const dist = Math.hypot(moved.x + moved.w / 2 - (pb.x + pb.w / 2), moved.y + moved.h / 2 - (pb.y + pb.h / 2));
    expect(dist).toBeLessThan(Math.max(moved.w, moved.h) + Math.max(pb.w, pb.h));
    expect(near(moved.x, pa.x, 1) && near(moved.y, pa.y, 1)).toBe(false);
    expect((await app.notice()).text).not.toMatch(/volvió a su lugar/);
    await app.undo();
    await expect.poll(async () => (await pieceOf(app, a)).x).toBe(pa.x);
    expect((await pieceOf(app, a)).y).toBe(pa.y);
  });

  test('on a full sheet it goes back to its place, says so only to screen readers, and takes no undo step', async ({ app, page }) => {
    // A 45 × 50 mm tile: the sheet fills with 15 copies and no gap near any of them.
    await app.addFiles(['tile000.png']);
    const [first] = await app.ids();
    await app.selectIds([first]);
    await app.openMeasures();
    await page.locator('#fill-details summary').click();
    await page.locator('#fill').click();
    await expect.poll(() => app.pieces().count()).toBeGreaterThan(10);
    const g = await app.geometry();
    const n = g.pieces.length;
    expect(overlapping(g.pieces)).toEqual([]);
    await app.closePopover();
    // The piece closest to the sheet's center, and the top-left one.
    const d = (p: (typeof g.pieces)[number]) => Math.hypot(p.x + p.w / 2 - g.W / 2, p.y + p.h / 2 - g.H / 2);
    const mid = g.pieces.reduce((m, p) => (d(p) < d(m) ? p : m));
    const corner = g.pieces.reduce((m, p) => (p.x + p.y < m.x + m.y ? p : m));
    await dragPieceTo(app, corner.id, mid.x + 1, mid.y + 1);
    await app.heard(/No hay espacio ahí\. La pieza volvió a su lugar/);
    const back = await pieceOf(app, corner.id);
    expect(near(back.x, corner.x) && near(back.y, corner.y), JSON.stringify({ corner, back })).toBe(true);
    expect(overlapping((await app.geometry()).pieces)).toEqual([]);
    // The blocked look and the piece going back show it: no notice.
    expect((await app.notice()).text).not.toMatch(/volvió a su lugar/);
    // Undo takes back the filling: the failed drop added no step.
    await app.undo();
    await expect.poll(() => app.pieces().count()).toBeLessThan(n);
  });

  test('with «Permitir superposición» it stays on top, and that is not a problem until it is turned off', async ({ app, page }) => {
    await app.addFiles(['small.jpg', 'square.webp']);
    await app.openSetting('#allow-overlap');
    await page.locator('#allow-overlap').check();
    await expect(page.locator('#allow-overlap')).toBeChecked();
    const [a, b] = await app.ids();
    const pa = await pieceOf(app, a);
    await dragPieceTo(app, b, pa.x + 5, pa.y + 5);
    await expect.poll(async () => overlapping((await app.geometry()).pieces).length).toBe(1);
    const badges = page.locator('#piece-list .row-badge[data-kind="overlap"]');
    expect((await app.notice()).text).not.toMatch(/superpuest/i);
    await expect(badges).toHaveCount(0);
    // Turned off, the same pieces are a problem: the notice offers «Acomodar» and the list marks both.
    await page.locator('#allow-overlap').uncheck();
    await expect.poll(() => app.notice()).toMatchObject({ text: 'Hay piezas superpuestas', action: 'Acomodar' });
    await expect(badges).toHaveCount(2);
  });
});

test('the resize handle scales the piece in proportion, in one undo step', async ({ app, page }) => {
  await app.addFiles(['small.jpg']);
  const [id] = await app.ids();
  await app.selectIds([id]);
  const p1 = await pieceOf(app, id);
  const handle = (await page.locator('#handle').boundingBox())!;
  const [hx, hy] = [handle.x + handle.width / 2, handle.y + handle.height / 2];
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(hx + i * 6, hy + i * 4.5);
  await page.mouse.up();
  await expect.poll(async () => (await pieceOf(app, id)).w).toBeGreaterThan(p1.w);
  const p2 = await pieceOf(app, id);
  expect(p2.w / p2.h).toBeCloseTo(p1.w / p1.h, 2);
  await app.undo();
  await expect.poll(async () => (await pieceOf(app, id)).w).toBe(p1.w);
});

test('one drag of the scale slider is one undo step', async ({ app, page }) => {
  await app.addFiles(['small.jpg']);
  const [id] = await app.ids();
  await app.selectIds([id]);
  await app.openMeasures();
  await page.locator('#actual').click();
  await expect(page.locator('#scale')).toHaveValue('100');
  const slider = (await page.locator('#slider').boundingBox())!;
  const y = slider.y + slider.height / 2;
  await page.mouse.move(slider.x + slider.width * 0.5, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(slider.x + slider.width * (0.5 - i * 0.06), y);
  await page.mouse.up();
  await expect.poll(async () => parseFloat((await page.locator('#scale').inputValue()).replace(',', '.'))).toBeLessThan(80);
  await app.undo();
  await expect(page.locator('#scale')).toHaveValue('100');
});

test('G shows and hides the grid, which starts at the sheet’s corner', async ({ app, page }) => {
  await app.addFiles(['small.jpg']);
  const [id] = await app.ids();
  const layer = page.locator('#sheets .grid-layer').first();
  await expect(layer).toBeHidden();
  await app.piece(id).focus();
  await page.keyboard.press('g');
  await expect(layer).toBeVisible();
  await app.heard(/Grilla visible, cada 1\s?mm/);
  const bg = await layer.evaluate((el) => {
    const sheet = el.closest('.sheet')!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { dx: r.left - sheet.left, dy: r.top - sheet.top, pos: getComputedStyle(el).backgroundPosition };
  });
  expect(Math.abs(bg.dx)).toBeLessThan(1.5);
  expect(Math.abs(bg.dy)).toBeLessThan(1.5);
  expect(bg.pos.split(',')[0].trim()).toMatch(/^0(px|%)? 0(px|%)?$/);
  await app.openSetting('#grid-show');
  await expect(page.locator('#grid-show')).toBeChecked();
  await app.piece(id).focus();
  await page.keyboard.press('g');
  await expect(layer).toBeHidden();
  await app.heard(/Grilla oculta/);
  await expect(page.locator('#grid-show')).not.toBeChecked();
});

test('a file dropped on the canvas becomes a piece; the canvas shows it is a drop target meanwhile, and Supr removes it', async ({ app, page }) => {
  await app.addFiles(['small.jpg']);
  const workspace = page.locator('#workspace');
  await dropFile(page, '#canvas', 'square.webp', 'image/webp', async () => {
    await expect(workspace).toHaveClass(/\bis-drop-target\b/);
  });
  await expect(workspace).not.toHaveClass(/\bis-drop-target\b/);
  await expect(app.pieces()).toHaveCount(2);
  await app.idle();
  const g = await app.geometry();
  expect(closerThan(g.pieces, g.gap)).toEqual([]);
  const dropped = g.pieces.find((p) => p.name === 'square.webp')!;
  expect(await app.selectedIds()).toEqual([dropped.id]);
  await app.piece(dropped.id).focus();
  await page.keyboard.press('Delete');
  await expect(app.pieces()).toHaveCount(1);
});

test('«Permitir superposición» and the grid settings are still there after a reload, and so is the overlap', async ({ app, page }) => {
  await app.addFiles(['small.jpg', 'square.webp']);
  await app.openSetting('#allow-overlap');
  await page.locator('#allow-overlap').check();
  const [a, b] = await app.ids();
  const pa = await pieceOf(app, a);
  await dragPieceTo(app, b, pa.x + 5, pa.y + 5);
  await expect.poll(async () => overlapping((await app.geometry()).pieces).length).toBe(1);
  await app.openSetting('#grid-show');
  await page.locator('#grid-show').check();
  await setGrid(app, { size: '2,5', snap: false });
  await saved(page);
  await page.reload();
  await app.ready();
  await app.openSetting('#allow-overlap');
  await expect(page.locator('#allow-overlap')).toBeChecked();
  await app.openSetting('#grid-show');
  await expect(page.locator('#grid-show')).toBeChecked();
  await expect(page.locator('#grid-snap')).not.toBeChecked();
  await expect(page.locator('#grid-size')).toHaveValue(/^2,5/);
  await expect(page.locator('#sheets .grid-layer').first()).toBeVisible();
  expect(overlapping((await app.geometry()).pieces)).toHaveLength(1);
});
