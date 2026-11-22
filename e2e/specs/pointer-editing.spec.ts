// Editing with the pointer, where only a real browser tells: dragging a piece
// onto the grid («Imán»), dropping it on another piece (and the way it goes
// from where it was let go, frame by frame), a drag started while the last
// change still animates (frame by frame too), the resize handle, the
// scale slider, G and the grid layer, files dropped on the canvas, the
// overlap and grid preferences after a reload, and a drag the page loses the
// pointer of. What the actions compute is in tests/state (overlap-and-snap,
// placing-and-arranging).
import type { Page } from '@playwright/test';
import { frames, setZoom, stageBox } from '../support/canvas.ts';
import { closerThan, near, onGrid, overlapping } from '../support/geometry.ts';
import { dragPieceTo, dropFile, pieceOf, setGrid } from '../support/editing.ts';
import { animationsOver, dropNoted, expectFrameOnPiece, expectGlide, expectGroupFrameOnPieces, noteDrop, notePress, noteToolbar, TOL, toolbarNoted, wayOf } from '../support/motion.ts';
import { saved } from '../support/projects.ts';
import { counts, holdPiece, pieceIds, placeholders, scrollOf, scrollStops } from '../support/sheets.ts';
import { cards, expect, test, type App } from '../support/test.ts';

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
      // Within what a pixel of the pointer is worth (WebKit gives the pointer whole pixels), plus half a step.
      const tol = (step ? step / 2 : 0) + 1 / p0.zoom;
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

  // What the pieces do on screen after the drop, frame by frame (support/motion.ts):
  // from where they were let go straight to where they end, never back
  // towards where they started (they used to show up there first and glide
  // from there).

  test.describe('with motion', () => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });

    test('moved aside to a free spot of its sheet it glides straight there and never back towards where it started; its frame with it', async ({ app, page }) => {
      await app.addFiles(['card00.png', 'card01.png']);
      await page.locator('#arrange').click();
      await page.keyboard.press('Escape');
      const [a, b] = await app.ids();
      const pa = await pieceOf(app, a);
      const pb = await pieceOf(app, b);
      await animationsOver(page);
      await noteDrop(page, [a]);
      await dragPieceTo(app, a, pb.x, pb.y);
      const noted = await dropNoted(page);
      const moved = await pieceOf(app, a);
      expect(overlapping((await app.geometry()).pieces)).toEqual([]);
      expect(near(moved.x, pa.x, 1) && near(moved.y, pa.y, 1), 'not back where it was').toBe(false);
      expectGlide(noted, 0);
      expectFrameOnPiece(noted);
    });

    test('two selected and moved aside together glide straight there; their dashed frame with them', async ({ app, page }) => {
      await app.addFiles(cards(0, 3));
      await page.locator('#arrange').click();
      const [a, b, c] = await app.ids();
      await app.selectIds([a, c]);
      const pb = await pieceOf(app, b);
      await animationsOver(page);
      await noteDrop(page, [a, c]);
      await dragPieceTo(app, a, pb.x + 4, pb.y + 4);
      const noted = await dropNoted(page);
      expect(overlapping((await app.geometry()).pieces)).toEqual([]);
      expectGlide(noted, 0);
      expectGlide(noted, 1);
      expectGroupFrameOnPieces(noted);
    });

    test('with no free spot nearby it glides straight back to its place; its frame with it', async ({ app, page }) => {
      // A 45 × 50 mm tile: the sheet fills with 15 copies and no gap near any of them.
      await app.addFiles(['tile000.png']);
      const [first] = await app.ids();
      await app.selectIds([first]);
      await app.openMeasures();
      await page.locator('#fill-details summary').click();
      await page.locator('#fill').click();
      await expect.poll(() => app.pieces().count()).toBeGreaterThan(10);
      await app.closePopover();
      const g = await app.geometry();
      const d = (p: (typeof g.pieces)[number]) => Math.hypot(p.x + p.w / 2 - g.W / 2, p.y + p.h / 2 - g.H / 2);
      const mid = g.pieces.reduce((m, p) => (d(p) < d(m) ? p : m));
      const corner = g.pieces.reduce((m, p) => (p.x + p.y < m.x + m.y ? p : m));
      await animationsOver(page);
      await noteDrop(page, [corner.id]);
      await dragPieceTo(app, corner.id, mid.x + 1, mid.y + 1);
      const noted = await dropNoted(page);
      await app.heard(/No hay espacio ahí\. La pieza volvió a su lugar/);
      const back = await pieceOf(app, corner.id);
      expect(near(back.x, corner.x) && near(back.y, corner.y), 'back in its place').toBe(true);
      expectGlide(noted, 0);
      expectFrameOnPiece(noted);
    });

    test('moved aside on another sheet it shows up there at once with its frame which never flies from its old place', async ({ app, page }) => {
      await app.addFiles(cards(0, 12));
      await setZoom(page, 25);
      await page.locator('#stage').evaluate((el) => el.scrollTo(0, 0));
      const [[a], [b]] = await pieceIds(app);
      await animationsOver(page);
      const from = (await app.piece(a).boundingBox())!;
      const onto = (await app.piece(b).boundingBox())!;
      await noteDrop(page, [a]);
      await app.drag(app.piece(a), onto.x - from.x + 3, onto.y - from.y + 3, 16);
      const noted = await dropNoted(page);
      await expect.poll(() => counts(app)).toEqual([8, 4]);
      expect(overlapping((await app.geometry()).pieces)).toEqual([]);
      expect(noted.transitions[0], 'nothing glides: the piece is drawn anew on that sheet').toEqual([]);
      const to = noted.frames.at(-1)!.pieces[0];
      expect(noted.frames.every((f) => Math.abs(f.pieces[0].x - to.x) <= TOL && Math.abs(f.pieces[0].y - to.y) <= TOL), 'there from the first frame').toBe(true);
      expectFrameOnPiece(noted);
    });
  });

  test('with reduced motion a piece moved aside is in its free spot from the first frame after the drop', async ({ app, page }) => {
    await app.addFiles(['card00.png', 'card01.png']);
    await page.locator('#arrange').click();
    await page.keyboard.press('Escape');
    const [a, b] = await app.ids();
    const pb = await pieceOf(app, b);
    await animationsOver(page);
    await noteDrop(page, [a]);
    await dragPieceTo(app, a, pb.x, pb.y);
    const noted = await dropNoted(page);
    const to = noted.frames.at(-1)!.pieces[0];
    expect(wayOf(noted, 0).travel, 'it was moved aside').toBeGreaterThan(10 * TOL);
    expect(noted.transitions[0]).toEqual([]);
    expect(noted.frames.every((f) => Math.abs(f.pieces[0].x - to.x) <= TOL && Math.abs(f.pieces[0].y - to.y) <= TOL), 'there from the first frame').toBe(true);
    expectFrameOnPiece(noted);
  });
});

test.describe('with motion, a drag started while the last change still animates', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('right after Undo the piece follows the pointer from the first move and stays where it is let go; its frame with it', async ({ app, page }) => {
    await app.addFiles(['card00.png', 'card01.png']);
    await page.locator('#arrange').click();
    await page.keyboard.press('Escape');
    // Without «Imán», the piece is exactly as far from the pointer all along.
    await setGrid(app, { snap: false });
    const [a, b] = await app.ids();
    // The other one away first, so that undoing that animates.
    const pb = await pieceOf(app, b);
    await dragPieceTo(app, b, pb.x, pb.y + 100);
    await expect.poll(async () => (await pieceOf(app, b)).y).not.toBe(pb.y);
    await animationsOver(page);
    const box = (await app.piece(a).boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(at.x, at.y);
    await notePress(page, [a]);
    await page.keyboard.press('Control+z');
    // As a person's press comes: after the undone piece and its frame have started gliding back.
    await frames(page, 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(at.x + 5 * i, at.y + 15 * i);
    await page.mouse.up();
    const noted = await dropNoted(page);
    await expect.poll(async () => (await pieceOf(app, b)).y, 'undone').toBe(pb.y);
    // Pressed within the 320 ms the animation lasts: only a machine slower than that between two keystrokes misses it.
    if (!noted.animating) test.info().annotations.push({ type: 'note', description: 'pressed after the animation was over: this run could not have seen the bug' });
    const offset = { x: noted.from[0].x - noted.pointer.x, y: noted.from[0].y - noted.pointer.y };
    const dragged = noted.frames.filter((f) => f.held && Math.hypot(f.pointer.x - noted.pointer.x, f.pointer.y - noted.pointer.y) > 3);
    const behind = dragged.map((f) => Math.max(Math.abs(f.pieces[0].x - f.pointer.x - offset.x), Math.abs(f.pieces[0].y - f.pointer.y - offset.y)));
    expect(dragged.length, 'frames while it was dragged').toBeGreaterThan(0);
    expect(Math.max(...behind), `under the pointer from the first move (px off at each frame: ${behind.map((d) => Math.round(d)).join(', ')})`).toBeLessThanOrEqual(TOL);
    const letGo = noted.released![0];
    const after = noted.frames.filter((f) => !f.held).map((f) => Math.max(Math.abs(f.pieces[0].x - letGo.x), Math.abs(f.pieces[0].y - letGo.y)));
    expect(Math.max(...after), `where it was let go from then on (px off at each frame: ${after.map((d) => Math.round(d)).join(', ')})`).toBeLessThanOrEqual(TOL);
    expect(noted.transitions[0], 'the piece never glides').toEqual([]);
    expect(noted.frameTransitions, 'nor its frame').toEqual([]);
    expectFrameOnPiece(noted);
  });
});

test.describe('with motion, after a drag', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('the piece toolbar shows up next to where the piece was let go, never sliding there from where it was', async ({ app, page }) => {
    await app.addFiles(['card00.png']);
    const [id] = await app.ids();
    await app.clickPiece(app.piece(id));
    const bar = page.locator('#piecebar');
    await expect(bar).toHaveCSS('opacity', '1');
    const before = (await bar.boundingBox())!;
    const box = (await app.piece(id).boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(at.x + 15 * i, at.y + 25 * i);
    await expect(bar).toHaveCSS('opacity', '0');
    await noteToolbar(page);
    await page.mouse.up();
    await expect(bar).toHaveCSS('opacity', '1');
    const noted = await toolbarNoted(page);
    const shown = noted.frames.filter((f) => f.opacity > 0).map((f) => f.box);
    const to = shown.at(-1)!;
    expect(Math.hypot(to.x - before.x, to.y - before.y), 'it moved with the piece').toBeGreaterThan(50);
    const off = shown.map((b) => Math.max(Math.abs(b.x - to.x), Math.abs(b.y - to.y)));
    expect(Math.max(...off), `where it ends whenever it shows (px off at each frame: ${off.map((d) => Math.round(d)).join(', ')})`).toBeLessThanOrEqual(TOL);
    expect(noted.transitions.map((t) => t.property), 'it only fades in').toEqual(['opacity']);
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

test.describe('a drag never outlives its button: when the page loses the pointer it is cancelled, not dropped where the pointer was', () => {
  type Lose = (page: Page, pointer: { id: number; x: number; y: number }) => Promise<unknown>;
  // The third: the case needs the Chrome DevTools Protocol.
  const LOSSES: [string, Lose, 'cdp'?][] = [
    ['the window loses the focus (another window or a screenshot tool takes it)', (page) => page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')))],
    [
      'the page is hidden',
      (page) =>
        page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
          delete (document as { visibilityState?: unknown }).visibilityState;
        }),
    ],
    [
      'the browser cancels the pointer',
      (page, { id }) => page.evaluate((id) => document.getElementById('sheets')!.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: id, pointerType: 'mouse', isPrimary: true })), id),
    ],
    [
      'a move of it comes with its button up',
      (page, { id, x, y }) =>
        page.evaluate(
          ([id, x, y]) => document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: id, pointerType: 'mouse', isPrimary: true, buttons: 0, clientX: x, clientY: y })),
          [id, x, y]
        ),
    ],
    [
      'the button is let go where the page can’t hear it (the browser drops the capture, then moves come with no button)',
      async (page, { x, y }) => {
        const cdp = await page.context().newCDPSession(page);
        for (let i = 1; i <= 3; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x - i * 10, y: y - i * 5, button: 'none', buttons: 0 });
      },
      'cdp',
    ],
  ];

  /** The first card of the only sheet dragged below it, held at the stage's bottom edge until it scrolls and the new sheet's placeholder shows. */
  async function holdBelow(app: App) {
    const page = app.page;
    const [[id]] = await pieceIds(app);
    const pressed = page.evaluate(() => new Promise<number>((resolve) => addEventListener('pointerdown', (e) => resolve(e.pointerId), { once: true, capture: true })));
    const from = await holdPiece(app, id);
    const stage = await stageBox(page);
    const at = { x: from.x, y: stage.y + stage.height - 4 };
    await page.mouse.move(at.x, at.y, { steps: 8 });
    await expect.poll(async () => (await placeholders(page)).endActive).toBe(true);
    await expect.poll(async () => (await scrollOf(page)).top, 'it scrolls by itself').toBeGreaterThan(0);
    return { id: await pressed, ...at };
  }

  for (const [name, lose, needs] of LOSSES) {
    test(`${name}: the piece goes back, the placeholder goes, the scroll stops, moving on does nothing and there is no undo step`, async ({ app, page, browserName }) => {
      test.skip(needs === 'cdp' && browserName !== 'chromium', 'the moves without a button go through the Chrome DevTools Protocol (Input.dispatchMouseEvent), which only Chromium has');
      await app.addFiles(['card00.png', 'card01.png']);
      const before = await app.sheets();
      const extent = (await scrollOf(page)).height;
      const pointer = await holdBelow(app);
      await lose(page, pointer);

      await expect(page.locator('#canvas')).not.toHaveClass(/\bis-dragging\b/);
      expect(await placeholders(page)).toMatchObject({ end: false, bar: false });
      expect((await scrollStops(page)).height, 'the scroll stops, the extent the one it had').toBe(extent);
      expect(await app.sheets(), 'the piece where it was').toEqual(before);
      // Whatever the pointer does next doesn't take the piece again, nor drop it.
      await page.mouse.move(pointer.x - 80, pointer.y - 200, { steps: 4 });
      await page.mouse.up();
      await frames(page);
      expect(await app.sheets()).toEqual(before);
      await expect(page.locator('#canvas')).not.toHaveClass(/\bis-dragging\b/);
      // The last step is still adding the cards: the drag left none.
      await page.keyboard.press('Control+z');
      await expect(app.pieces()).toHaveCount(0);
    });
  }

  test('let go normally there, the piece goes to a new sheet', async ({ app, page }) => {
    await app.addFiles(['card00.png', 'card01.png']);
    await holdBelow(app);
    await page.mouse.up();
    await expect.poll(() => counts(app)).toEqual([1, 1]);
  });
});
