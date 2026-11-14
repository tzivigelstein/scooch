// Crop with a real pointer and keyboard: crop mode by mouse (wheel, drag, an
// edge, a click outside) and by keyboard (K, +, an arrow, Enter, Ctrl+Z, Esc),
// the locked proportion of a standard size while dragging a corner, the PDF
// started while cropping, the handle scaling a cropped piece, the list
// thumbnail, and one photo size from the select. The math and the actions are
// tested in Vitest (tests/core/crop*.test.js, tests/state/crop.test.ts,
// tests/state/photo-sizes.test.ts, tests/components/CropMode.test.tsx,
// tests/state/printing-flow.test.ts).
import type { Page } from '@playwright/test';
import { pdfInfo } from '../support/pdf.ts';
import { expect, test, type App } from '../support/test.ts';

const TOL = 0.05;

/** The crop overlay in px: the frame, the whole image under it, what has the focus and the instructions. */
const overlay = (page: Page) =>
  page.evaluate(() => {
    const rect = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    return { frame: rect('#crop-frame')!, ghost: rect('.crop-ghost')!, active: document.activeElement?.id ?? '' };
  });

/** How the whole image sits in a piece's box: image size over box size (a crop shows as more than 1). */
const cropRatio = (page: Page, id: number) =>
  page.evaluate((pid) => {
    const node = document.querySelector<HTMLElement>(`#sheets .piece[data-id="${pid}"]`)!;
    const img = node.querySelector('img')!;
    return [parseFloat(img.style.width) / parseFloat(node.style.width), parseFloat(img.style.height) / parseFloat(node.style.height)].map((v) => Math.round(v * 1000) / 1000);
  }, id);

const pieceOf = async (app: App, id: number) => (await app.geometry()).pieces.find((p) => p.id === id)!;

async function photoSize(app: App, id: number, size: string) {
  await app.piece(id).focus();
  await app.openMeasures();
  await app.page.locator('#photo-size').selectOption(size);
  await expect(app.page.locator('#photo-size')).toHaveValue(size);
}

test.describe('crop mode', () => {
  test('with the mouse: the wheel zooms, a drag pans, an edge resizes, a click outside applies, one undo step', async ({ app, page }) => {
    await app.addFiles(['wide.png']);
    const [id] = await app.ids();
    await app.piece(id).click();
    const before = await app.snapshot();

    await app.piece(id).dblclick();
    await expect(page.locator('#crop-frame')).toBeFocused();
    const start = await overlay(page);
    expect(Math.abs(start.ghost.w - start.frame.w)).toBeLessThan(1); // the whole image is the frame
    await expect(page.locator('#piecebar')).toBeHidden();
    await expect(page.locator('#cropbar')).toBeVisible();

    await test.step('the wheel zooms the image under the frame; the scale field follows live', async () => {
      await page.mouse.move(start.frame.x + start.frame.w / 2, start.frame.y + start.frame.h / 2);
      await page.mouse.wheel(0, -300);
      await expect.poll(async () => (await overlay(page)).ghost.w).toBeGreaterThan(start.frame.w * 1.3);
      expect(Math.abs((await overlay(page)).frame.w - start.frame.w)).toBeLessThan(0.5);
      await expect.poll(async () => Number((await page.locator('#scale').inputValue()).replace(',', '.'))).toBeGreaterThan(101);
    });

    await test.step('dragging pans the image, the frame stays', async () => {
      const o = await overlay(page);
      await page.mouse.move(o.frame.x + o.frame.w / 2, o.frame.y + o.frame.h / 2);
      await page.mouse.down();
      await page.mouse.move(o.frame.x + o.frame.w / 2 + 25, o.frame.y + o.frame.h / 2, { steps: 5 });
      await page.mouse.up();
      const after = await overlay(page);
      expect(after.ghost.x - o.ghost.x).toBeCloseTo(25, 0);
      expect(Math.abs(after.frame.x - o.frame.x)).toBeLessThan(0.5);
    });

    let frame = start.frame;
    await test.step('the east edge narrows the frame freely', async () => {
      const f = (await overlay(page)).frame;
      await page.mouse.move(f.x + f.w, f.y + f.h / 2);
      await page.mouse.down();
      await page.mouse.move(f.x + f.w - 40, f.y + f.h / 2, { steps: 5 });
      await page.mouse.up();
      frame = (await overlay(page)).frame;
      expect(frame.w).toBeCloseTo(f.w - 40, 0);
      expect(Math.abs(frame.h - f.h)).toBeLessThan(0.5);
    });

    await test.step('a click outside applies it: the piece is what the frame showed; one undo step brings back the piece', async () => {
      const sheet = (await page.locator('.sheet').first().boundingBox())!;
      await page.mouse.click(sheet.x + sheet.width - 6, sheet.y + sheet.height - 6);
      await expect(page.locator('#crop-frame')).toHaveCount(0);
      const g = await app.geometry();
      expect(Math.abs(g.pieces[0].w * g.zoom - frame.w)).toBeLessThan(1);
      expect(await app.snapshot()).not.toBe(before);
      await app.undo();
      expect(await app.snapshot()).toBe(before);
    });
  });

  test('with the keyboard: K, + and an arrow, Esc changes nothing; Enter applies, Ctrl+Z brings back the exact piece', async ({ app, page }) => {
    await app.addFiles(['wide.png', 'tall.png']);
    const [id] = await app.ids();
    await app.piece(id).focus();
    const before = await app.snapshot();

    await test.step('K: crop mode with the focus on the frame; + zooms, an arrow pans; Esc: as before, no undo step, focus back on the piece', async () => {
      await page.keyboard.press('k');
      await expect(page.locator('#crop-frame')).toBeFocused();
      await page.keyboard.press('+');
      await page.keyboard.press('+');
      await expect.poll(async () => (await overlay(page)).ghost.w / (await overlay(page)).frame.w).toBeGreaterThan(1.15);
      const zoomed = (await overlay(page)).ghost;
      await page.keyboard.press('ArrowRight');
      await expect.poll(async () => (await overlay(page)).ghost.x).toBeGreaterThan(zoomed.x);
      await page.keyboard.press('Escape');
      await expect(page.locator('#crop-frame')).toHaveCount(0);
      await expect(app.piece(id)).toBeFocused();
      expect(await app.snapshot()).toBe(before);
      // No undo step: the last one is still adding the files.
      await app.undo();
      await expect(app.pieces()).toHaveCount(0);
      await app.redo();
      await expect.poll(() => app.snapshot()).toBe(before);
      await app.piece(id).focus();
    });

    await test.step('Enter applies it and the focus returns to the piece; Ctrl+Z: exactly the piece before', async () => {
      await page.keyboard.press('k');
      await expect(page.locator('#crop-frame')).toBeFocused();
      await page.keyboard.press('+');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Enter');
      await expect(page.locator('#crop-frame')).toHaveCount(0);
      await expect(app.piece(id)).toBeFocused();
      await app.heard(/Se recortó wide\.png/);
      expect(await app.snapshot()).not.toBe(before);
      await page.keyboard.press('Control+z');
      await expect.poll(() => app.snapshot()).toBe(before);
    });
  });

  test('with a standard size, dragging a corner keeps the 10 × 15 proportion; applied, it is still exactly 10 × 15', async ({ app, page }) => {
    await app.addFiles(['wide.png']);
    const [id] = await app.ids();
    await photoSize(app, id, '10x15');
    await app.piece(id).focus();
    await page.keyboard.press('k');
    await expect(page.locator('#crop-frame')).toBeFocused();
    const f = (await overlay(page)).frame;
    expect(f.w / f.h).toBeCloseTo(152.4 / 101.6, 2);
    await page.mouse.move(f.x + f.w, f.y + f.h);
    await page.mouse.down();
    await page.mouse.move(f.x + f.w - 50, f.y + f.h - 10, { steps: 6 });
    const during = (await overlay(page)).frame;
    expect(during.w).toBeLessThan(f.w - 10);
    expect(Math.abs(during.w / during.h - 152.4 / 101.6)).toBeLessThan(0.01);
    await page.mouse.up();
    await page.keyboard.press('Enter');
    await expect(page.locator('#crop-frame')).toHaveCount(0);
    const piece = await pieceOf(app, id);
    expect(Math.abs(piece.w - 152.4)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(piece.h - 101.6)).toBeLessThanOrEqual(TOL);
    // A tighter crop: the whole image is now clearly wider than the piece.
    expect((await cropRatio(page, id))[0]).toBeGreaterThan(1.05);
    await expect(page.locator('#photo-size')).toHaveValue('10x15');
  });

  test('Ctrl+E while cropping applies the crop first: that PDF has it, the same as downloading again afterwards', async ({ app, page }) => {
    await app.addFiles(['wide.png']);
    const [id] = await app.ids();
    const uncropped = (await app.downloadPdf()).info.pages[0].content;
    await app.piece(id).focus();
    await page.keyboard.press('k');
    await expect(page.locator('#crop-frame')).toBeFocused();
    await page.keyboard.press('+');
    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+e')]);
    const file = test.info().outputPath(`cropping-${download.suggestedFilename()}`);
    await download.saveAs(file);
    await expect(page.locator('#crop-frame')).toHaveCount(0);
    await expect(app.piece(id)).toBeFocused();
    const during = (await pdfInfo(file)).pages[0].content;
    expect(during).not.toBe(uncropped);
    expect((await app.downloadPdf()).info.pages[0].content).toBe(during);
  });
});

test.describe('a cropped piece', () => {
  test('the handle scales it and keeps the crop', async ({ app, page }) => {
    await app.addFiles(['wide.png']);
    const [id] = await app.ids();
    await photoSize(app, id, 'id-4x4');
    const ratio = await cropRatio(page, id);
    expect(ratio[0]).toBeGreaterThan(1.4); // the 4 × 4 crop of a landscape image
    await app.piece(id).focus();
    await app.drag(page.locator('#handle'), 30, 30);
    const q = await pieceOf(app, id);
    expect(q.w).toBeGreaterThan(41);
    expect(Math.abs(q.w - q.h)).toBeLessThan(0.01);
    expect(await cropRatio(page, id)).toEqual(ratio);
  });

  test('the list thumbnail shows the crop (square for 4 × 4)', async ({ app, page }) => {
    await app.addFiles(['wide.png']);
    const [id] = await app.ids();
    const thumbRatio = () =>
      page.evaluate((pid) => {
        const t = document.querySelector(`#piece-list [role="option"][data-id="${pid}"] .thumb-piece`)!.getBoundingClientRect();
        return t.width / t.height;
      }, id);
    expect(await thumbRatio()).toBeGreaterThan(1.3);
    await photoSize(app, id, 'id-4x4');
    await expect.poll(thumbRatio).toBeCloseTo(1, 1);
  });
});

test('a photo size from the select on a rotated piece: the size and the select agree', async ({ app, page }) => {
  // A square image: its rotation alone decides how the size is turned (10 × 15 stays upright, as listed, at any angle).
  await app.addFiles(['square.webp']);
  const [id] = await app.ids();
  const r0 = (await pieceOf(app, id)).r;
  await app.piece(id).focus();
  await page.keyboard.press('r');
  await expect.poll(async () => (await pieceOf(app, id)).r).toBe((r0 + 90) % 360);
  const { r } = await pieceOf(app, id);
  await photoSize(app, id, '10x15');
  const piece = await pieceOf(app, id);
  expect(piece.r).toBe(r);
  expect(Math.abs(piece.w - 101.6)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(piece.h - 152.4)).toBeLessThanOrEqual(TOL);
  await expect(page.locator('#photo-size')).toHaveValue('10x15');
});
