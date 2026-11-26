// QR code pieces in a real browser: adding one where things are added, its
// fields in the Item tab drawing it on the sheet as they change, the sheet
// read back by a QR reader (jsQR), a reload, undo and redo, cropping refused,
// Contour cut lines, and a phone. The rules underneath (the encoder, its
// drawing, the document format, each action) have their unit tests.
import { expect, fixture, test, type App } from '../support/test.ts';
import { readQr } from '../support/qr.ts';
import { bareSheet } from '../support/raster.ts';

const TEXT = 'https://scooch.app/es/';

/** «Agregar código QR» in the top bar: a new code on the sheet, its content field focused. */
async function addQr(app: App) {
  const before = await app.pieces().count();
  await app.page.locator('#add-qr').click();
  await expect(app.pieces()).toHaveCount(before + 1);
  await expect(app.page.locator('#qr-text')).toBeFocused();
  return (await app.selectedIds())[0];
}

/** The picture the piece shows: it changes with every change to the code. */
const picture = (app: App, id: number) => app.piece(id).locator('img').getAttribute('src');

/** What a QR reader reads off the piece on screen, large enough and with nothing over it (the selection's frame, the toolbar). */
async function readPiece(app: App, id: number) {
  await bareSheet(app.page);
  return readQr(app.page, await app.piece(id).screenshot());
}

test.describe('adding and editing a QR code', () => {
  test('Agregar código QR in the top bar adds an empty code to the sheet that its row says is empty and focuses its content', async ({ app, page }) => {
    const id = await addQr(app);
    await expect(app.row(id).locator('.row-name')).toHaveText('Código QR');
    await expect(app.row(id).locator('.row-badge[data-kind="qr"]')).toHaveAttribute('data-tip', 'El código QR está vacío');
    await expect(page.locator('#resolution-text')).toHaveText('El código QR está vacío');
    await app.heard(/Se agregó un código QR a la hoja 1/);
    const { w, h } = (await app.geometry()).pieces[0];
    expect([w, h].map((v) => Math.round(v * 100) / 100)).toEqual([40, 40]);
  });

  test('typing its content redraws the code on the sheet as it is typed and the sheet reads back as that text', async ({ app, page }) => {
    const id = await addQr(app);
    const empty = await picture(app, id);
    await page.keyboard.type(TEXT);
    await expect.poll(() => picture(app, id)).not.toBe(empty);
    await expect(app.row(id).locator('.row-name')).toHaveText(TEXT);
    await expect(app.row(id).locator('.row-badge')).toHaveCount(0);
    await app.setMeasure('scale', 300);
    expect(await readPiece(app, id)).toBe(TEXT);
  });

  test('each of its options shows on the sheet as it is chosen and the code still reads back', async ({ app, page }) => {
    const id = await addQr(app);
    await page.keyboard.type(TEXT);
    const changes: [string, () => Promise<unknown>][] = [
      ['dots', () => page.locator('#qr-dots').getByRole('radio', { name: 'Círculos' }).check()],
      ['eyes', () => page.locator('#qr-eyes').getByRole('radio', { name: 'Redondeados' }).check()],
      ['color', async () => (await page.locator('#qr-color-hex').fill('#1F3A93'), page.locator('#qr-color-hex').press('Enter'))],
      ['background', () => page.getByRole('switch', { name: 'Transparente' }).check()],
      ['logo', () => page.locator('#qr-logo-file').setInputFiles(fixture('sticker.png'))],
    ];
    for (const [name, change] of changes) {
      const before = await picture(app, id);
      await change();
      await expect.poll(() => picture(app, id), name).not.toBe(before);
    }
    await expect(page.locator('#qr-logo-remove')).toBeVisible();
    // The caption goes under the code: the piece gets taller.
    await page.locator('#qr-caption').fill('Escanea el menú');
    await expect.poll(async () => (await app.geometry()).pieces[0].h).toBeCloseTo(46.4, 1);
    expect((await app.geometry()).pieces[0].w).toBeCloseTo(40, 1);
    await app.setMeasure('scale', 300);
    expect(await readPiece(app, id)).toBe(TEXT);
  });

  test('a QR code with a logo survives a reload and undo and redo walk back through its changes', async ({ app, page }) => {
    const id = await addQr(app);
    await page.keyboard.type(TEXT);
    await page.locator('#qr-logo-file').setInputFiles(fixture('sticker.png'));
    await expect(page.locator('#qr-logo-remove')).toBeVisible();
    await page.locator('#qr-dots').getByRole('radio', { name: 'Redondeados' }).check();
    await expect(page.locator('#project')).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });
    await page.reload();
    await app.ready();
    await expect(app.pieces()).toHaveCount(1);
    await app.piece(id).click();
    await expect(page.locator('#qr-text')).toHaveValue(TEXT);
    await expect(page.locator('#qr-dots').getByRole('radio', { name: 'Redondeados' })).toBeChecked();
    await expect(page.locator('#qr-logo-remove')).toBeVisible();
    await expect.poll(() => page.locator('#undo').isEnabled()).toBe(true);
    await app.undo();
    await expect(page.locator('#qr-dots').getByRole('radio', { name: 'Cuadrados' })).toBeChecked();
    await app.undo();
    await expect(page.locator('#qr-logo-add')).toBeVisible();
    await app.undo();
    await expect(page.locator('#qr-text')).toHaveValue('');
    await app.redo();
    await app.redo();
    await app.redo();
    await expect(page.locator('#qr-dots').getByRole('radio', { name: 'Redondeados' })).toBeChecked();
    await expect(page.locator('#qr-text')).toHaveValue(TEXT);
  });

  test('a QR code is never cropped: the toolbar has no Recortar and K says why', async ({ app, page }) => {
    const id = await addQr(app);
    await app.piece(id).focus();
    await expect(page.locator('#piecebar [data-action="crop"]')).toHaveCount(0);
    await expect(page.locator('#crop-start')).toBeHidden();
    await page.keyboard.press('k');
    await app.heard(/Un código QR no se recorta/);
    await expect(page.locator('#crop-frame')).toHaveCount(0);
  });

  test('with Contour cut lines a QR code keeps its rectangle without the note about a transparent background', async ({ app, page }) => {
    const id = await addQr(app);
    await page.keyboard.type(TEXT);
    await page.getByRole('switch', { name: 'Transparente' }).check();
    await page.keyboard.press('Escape');
    await app.openSetting('#cut-mode');
    await page.locator('#cut-mode input[value="contour"]').check({ force: true });
    // Off the cut settings, whose focus or hover highlights the lines on the sheet.
    await page.locator('#cut-mode input[value="contour"]').blur();
    await page.mouse.move(0, 0);
    await expect(page.locator('#sheets .cut-emphasis')).toHaveCount(0);
    await expect(page.locator('#sheets .cut-layer line')).toHaveCount(4);
    await expect(app.row(id).locator('.row-badge[data-kind="opaque"]')).toHaveCount(0);
    await app.piece(id).click();
    await app.showTab('piece');
    await expect(page.locator('#opaque-note')).toBeHidden();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the Piezas panel adds a QR code and the properties panel opens on its fields without bringing up the keyboard', async ({ app, page }) => {
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    await expect(page.locator('#add-qr')).toBeHidden();
    await page.locator('#pieces-dock').click();
    await page.locator('#add-qr-zone').click();
    await expect(app.pieces()).toHaveCount(1);
    await expect(page.locator('#props-panel')).toHaveClass(/\bis-open\b/);
    await expect(page.locator('#qr-text')).toBeVisible();
    // With a finger the on-screen keyboard would cover the fields: the focus waits for a tap.
    if (coarse) {
      await expect(page.locator('#qr-text')).not.toBeFocused();
      expect(await page.locator('#qr-text').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), 'at least 16 px or iOS zooms in').toBeGreaterThanOrEqual(16);
    }
    await page.locator('#qr-text').click();
    await page.keyboard.type(TEXT);
    await expect(app.row((await app.ids())[0]).locator('.row-name')).toHaveText(TEXT);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});
