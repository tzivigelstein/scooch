// The exported PDF against the screen (rasterized by pdf.js in the page) for
// what only a browser draws on both sides: a cropped and rotated image, a
// cropped vector PDF page, a PDF page with its own /Rotate, a styled QR code
// (read back by jsQR on both) and the cut lines (marks and a transparent
// shape's contour);
// and against a committed reference, so any change to what the exporter writes
// shows up (refresh it with --update-snapshots when the change is on purpose).
import { expect, fixture, test, type App } from '../support/test.ts';
import { embeddedFixtures, exportSummary, inkParity, rasterParity, xobjectKinds } from '../support/export-parity.ts';
import { readQr } from '../support/qr.ts';

/** The PDF looks like the sheet: a small mean difference and almost no very different pixels. */
const MEAN = 3;
const BIG = 0.01;

/** K, the keys, Enter: a crop made with the keyboard. */
async function cropWithKeys(app: App, id: number, keys: readonly string[]) {
  await app.piece(id).focus();
  await app.page.keyboard.press('k');
  await expect(app.page.locator('#crop-frame')).toBeFocused();
  for (const key of keys) await app.page.keyboard.press(key);
  await app.page.keyboard.press('Enter');
  await expect(app.page.locator('#crop-frame')).toHaveCount(0);
}

/** How much of the whole image a piece shows: box size over image size (below 1 when cropped). */
const shown = (app: App, id: number) =>
  app.page.evaluate((pid) => {
    const node = document.querySelector<HTMLElement>(`#sheets .piece[data-id="${pid}"]`)!;
    const img = node.querySelector('img')!;
    return Math.min(parseFloat(node.style.width) / parseFloat(img.style.width), parseFloat(node.style.height) / parseFloat(img.style.height));
  }, id);

async function arrange(app: App) {
  await app.page.locator('#arrange').click();
  await app.idle();
}

test.describe('the PDF matches the sheet on screen', () => {
  test('a cropped and rotated image', async ({ app, page }, info) => {
    await app.addFiles(['big.png']);
    const [id] = await app.ids();
    await app.piece(id).focus();
    await app.choosePhotoSize('10x15');
    await app.piece(id).focus();
    await page.keyboard.press('r');
    await cropWithKeys(app, id, ['+', '+', 'Shift+ArrowLeft']);
    expect(await shown(app, id)).toBeLessThan(0.9);
    expect((await app.geometry()).pieces[0].r % 180).toBe(90);
    const parity = await rasterParity(app, info, 'cropped-image');
    expect(parity.mean, 'mean luma difference').toBeLessThan(MEAN);
    expect(parity.big, 'share of very different pixels').toBeLessThan(BIG);
    expect(await xobjectKinds(parity.file)).toEqual(['/Image']);
  });

  test('a cropped and rotated PDF page, which stays vector (a form XObject)', async ({ app, page }, info) => {
    await app.addFiles(['twopage.pdf']);
    const [id] = await app.ids();
    await cropWithKeys(app, id, ['+', '+', '+', 'Shift+ArrowUp', 'Alt+ArrowLeft']);
    await app.piece(id).focus();
    await page.keyboard.press('Shift+r');
    expect(await shown(app, id)).toBeLessThan(0.8);
    expect((await app.geometry()).pieces[0].r).toBe(270);
    const parity = await rasterParity(app, info, 'cropped-vector');
    expect(parity.mean, 'mean luma difference').toBeLessThan(MEAN);
    expect(parity.big, 'share of very different pixels').toBeLessThan(BIG);
    expect(await xobjectKinds(parity.file)).toEqual(['/Form']);
  });

  test('a PDF page with its own /Rotate, also turned on the sheet (exported as its image)', async ({ app, page }, info) => {
    await app.addFiles(['rotated.pdf', 'small.jpg']);
    await arrange(app);
    const [id] = await app.ids();
    // rotated.pdf is A5 landscape with /Rotate 90: it shows standing; turned once more on the sheet, it lies.
    const before = (await app.geometry()).pieces.find((p) => p.id === id)!;
    await app.piece(id).focus();
    await page.keyboard.press('r');
    await expect.poll(async () => (await app.geometry()).pieces.find((p) => p.id === id)!.r).toBe((before.r + 90) % 360);
    const piece = (await app.geometry()).pieces.find((p) => p.id === id)!;
    expect([piece.w, piece.h]).toEqual([before.h, before.w]);
    const parity = await rasterParity(app, info, 'rotate-attribute');
    expect(parity.mean, 'mean luma difference').toBeLessThan(MEAN);
    expect(parity.big, 'share of very different pixels').toBeLessThan(BIG);
    expect(await xobjectKinds(parity.file)).toEqual(['/Image', '/Image']);
  });

  test('a QR code with rounded dots and eyes a logo a caption and its own colors turned on the sheet: the same code on both and both read back', async ({ app, page }, info) => {
    const text = 'https://scooch.app/es/hacer-stickers-en-casa';
    await page.locator('#add-qr').click();
    await expect(page.locator('#qr-text')).toBeFocused();
    await page.keyboard.type(text);
    await page.locator('#qr-dots').getByRole('radio', { name: 'Redondeados' }).check();
    await page.locator('#qr-eyes').getByRole('radio', { name: 'Redondeados' }).check();
    await page.locator('#qr-color-hex').fill('#1F3A93');
    await page.locator('#qr-color-hex').press('Enter');
    await page.locator('#qr-background-hex').fill('#FFF8E7');
    await page.locator('#qr-background-hex').press('Enter');
    await page.locator('#qr-caption').fill('Escanea el menú');
    await page.locator('#qr-logo-file').setInputFiles(fixture('sticker.png'));
    await expect(page.locator('#qr-logo-remove')).toBeVisible();
    await app.setMeasure('scale', 250);
    const [id] = await app.ids();
    await app.piece(id).focus();
    await page.keyboard.press('r');
    await expect.poll(async () => (await app.geometry()).pieces[0].r).toBe(90);
    const parity = await rasterParity(app, info, 'qr-code');
    expect(parity.mean, 'mean luma difference').toBeLessThan(MEAN);
    expect(parity.big, 'share of very different pixels').toBeLessThan(BIG);
    // Its modules and eyes are paths: the only images are its logo and its caption.
    expect(await xobjectKinds(parity.file)).toEqual(['/Image', '/Image']);
    expect(await readQr(page, parity.screen), 'the sheet reads back').toBe(text);
    expect(await readQr(page, parity.pdf), 'the PDF reads back').toBe(text);
  });

  test.describe('with cut lines on', () => {
    // Twice the pixels, so the dotted marks resolve on both sides.
    test.use({ deviceScaleFactor: 2 });

    test('corner marks, thick, dotted, in a custom color, around a 2 mm cut margin: the same marks in the same places', async ({ app, page }, info) => {
      await app.addFiles(['big.png', 'small.jpg', 'tall.png', 'wide.png']);
      await page.keyboard.press('Escape');
      await app.openSetting('#cut-mode');
      await page.locator('#cut-mode input[value="corners"]').click();
      await page.locator('#cut-options summary').click();
      await page.locator('#cut-weight input[value="thick"]').click();
      await page.locator('#cut-colors input[value="custom"]').click();
      await page.locator('#cut-hex').fill('12a0ff');
      await page.locator('#cut-hex').press('Enter');
      await page.locator('#cut-dash input[value="dotted"]').click();
      await page.locator('#cut-margin').fill('2');
      await page.locator('#cut-margin').press('Enter');
      await arrange(app);
      await expect(page.locator('#sheets .cut-layer').first()).toHaveAttribute('data-dash', /\d \d/);
      await expect(page.locator('#sheets .cut-layer').first()).toHaveAttribute('data-color', '#12a0ff');
      const parity = await rasterParity(app, info, 'cut-lines');
      expect(parity.mean, 'mean luma difference').toBeLessThan(MEAN);
      expect(parity.big, 'share of very different pixels').toBeLessThan(BIG);
      // The marks are a tiny share of the sheet: compared on their own, by their color.
      const ink = await inkParity(page, parity.screen, parity.pdf, '#12a0ff');
      info.annotations.push({ type: 'ink', description: JSON.stringify(ink) });
      expect(ink.pdf, 'the PDF has marks').toBeGreaterThan(300);
      expect(ink.screen / ink.pdf, 'as many mark pixels on screen as in the PDF').toBeGreaterThan(0.75);
      expect(ink.screen / ink.pdf).toBeLessThan(1.33);
      expect(ink.screenMatched, 'the screen’s marks are where the PDF has them').toBeGreaterThan(0.95);
      expect(ink.pdfMatched, 'the PDF’s marks are where the screen has them').toBeGreaterThan(0.95);
    });

    test('«Silueta» around a transparent shape, rotated and cropped, with a 3 mm margin, thick, in a custom color: the same line in the same places', async ({ app, page }, info) => {
      await app.addFiles(['sticker.png', 'small.jpg']);
      const [id] = await app.ids();
      await app.piece(id).focus();
      await page.keyboard.press('r');
      await cropWithKeys(app, id, ['+', 'Shift+ArrowLeft']);
      expect(await shown(app, id)).toBeLessThan(0.9);
      await arrange(app);
      await page.keyboard.press('Escape');
      await app.openSetting('#cut-mode');
      await page.locator('#cut-mode input[value="contour"]').click();
      await page.locator('#cut-options summary').click();
      await page.locator('#cut-weight input[value="thick"]').click();
      await page.locator('#cut-colors input[value="custom"]').click();
      await page.locator('#cut-hex').fill('12a0ff');
      await page.locator('#cut-hex').press('Enter');
      await page.locator('#cut-margin').fill('3');
      await page.locator('#cut-margin').press('Enter');
      // Off the cut settings, whose focus or hover highlights the lines on the sheet.
      await page.locator('#cut-margin').blur();
      await page.mouse.move(0, 0);
      await expect(page.locator('#sheets .cut-emphasis')).toHaveCount(0);
      // The shape's loops (not its rectangle) and the photo's outline.
      await expect.poll(() => page.locator('#sheets .cut-layer path').count()).toBeGreaterThanOrEqual(2);
      const points = await page.locator('#sheets .cut-layer path').evaluateAll((paths) => paths.map((p) => p.getAttribute('d')!.split('L').length));
      expect(Math.min(...points), 'curves, not rectangles').toBeGreaterThan(8);
      await expect(page.locator('#sheets .cut-layer line')).toHaveCount(4);
      const parity = await rasterParity(app, info, 'contour');
      expect(parity.mean, 'mean luma difference').toBeLessThan(MEAN);
      expect(parity.big, 'share of very different pixels').toBeLessThan(BIG);
      const ink = await inkParity(page, parity.screen, parity.pdf, '#12a0ff');
      info.annotations.push({ type: 'ink', description: JSON.stringify(ink) });
      expect(ink.pdf, 'the PDF has the line').toBeGreaterThan(300);
      expect(ink.screen / ink.pdf, 'as many line pixels on screen as in the PDF').toBeGreaterThan(0.75);
      expect(ink.screen / ink.pdf).toBeLessThan(1.33);
      expect(ink.screenMatched, 'the screen’s line is where the PDF has it').toBeGreaterThan(0.95);
      expect(ink.pdfMatched, 'the PDF’s line is where the screen has it').toBeGreaterThan(0.95);
    });
  });
});

test.describe('the exported PDF against the committed reference', () => {
  // One reference for every browser and platform (playwright.config.ts names
  // snapshots without them): what is compared doesn't depend on either.
  test('images, a vector page, a page with /Rotate, rotated pieces and 3 sheets: the same pages, content and embedded objects', async ({ app, page }) => {
    await app.addFiles(['big.png', 'small.jpg', 'square.webp', 'tall.png', 'twopage.pdf', 'rotated.pdf', 'exif6.jpg']);
    await arrange(app);
    const ids = await app.ids();
    await app.piece(ids[1]).focus();
    await page.keyboard.press('r');
    await app.piece(ids[2]).focus();
    await page.keyboard.press('Shift+r');
    const sheetOf = async (id: number) => (await app.geometry()).pieces.find((p) => p.id === id)!.sheetIndex;
    const from = await sheetOf(ids[3]);
    await app.piece(ids[3]).focus();
    await page.keyboard.press('Shift+PageDown');
    await expect.poll(() => sheetOf(ids[3])).toBe(from + 1);
    await page.keyboard.press('Escape');
    const { file } = await app.download();
    const summary = await exportSummary(file, await embeddedFixtures(['big.png', 'small.jpg', 'tall.png']));
    expect(summary).toHaveLength(3);
    expect(JSON.stringify(summary, null, 2) + '\n').toMatchSnapshot('export.json');
  });
});
