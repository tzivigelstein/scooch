// Loading files in a real browser: images decoded (EXIF orientation applied),
// PDFs read with pdf.js, the errors of files that can't be read, the name of
// the downloaded PDF, and the narrow layout. Where new pieces go and their
// sizes are in tests/state/placing-and-arranging.test.ts.
import { outsideMargin } from '../support/geometry.ts';
import { expect, norm, test } from '../support/test.ts';

const num = (s: string) => parseFloat(s.replace(',', '.'));

test('an empty sheet: nothing to say, nothing to download or arrange, no piece toolbar; margin 10 and gap 5', async ({ app, page }) => {
  await expect(page.locator('#empty')).toBeVisible();
  expect((await app.notice()).text).toBe('');
  await expect(page.locator('#export')).toBeDisabled();
  await expect(page.locator('#arrange')).toBeDisabled();
  await expect(page.locator('#piecebar')).toBeHidden();
  await app.openSetting('#margin');
  await expect(page.locator('#margin')).toHaveValue('10');
  await expect(page.locator('#gap')).toHaveValue('5');
});

test('a big image fits inside the printable area, without a notice', async ({ app }) => {
  await app.addFiles(['big.png']);
  const g = await app.geometry();
  expect(g.pieces).toHaveLength(1);
  expect(g.pieces[0].w).toBeCloseTo(190, 1);
  expect(outsideMargin(g)).toEqual([]);
  expect((await app.notice()).text).toBe('');
});

test('a JPEG turned by its EXIF orientation (6) shows upright', async ({ app, page }) => {
  // exif6.jpg is stored 1200 × 800 with a red band on its left: turned, the band is on top.
  await app.addFiles(['exif6.jpg']);
  // Upright it is portrait (on the sheet it may be turned 90° to fit better).
  const [piece] = (await app.geometry()).pieces;
  expect(piece.r % 180 ? piece.w > piece.h : piece.h > piece.w, JSON.stringify(piece)).toBe(true);
  const shown = await page.locator('#sheets .piece[aria-label^="exif6.jpg"] img').evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const at = (y: number) => [...ctx.getImageData(c.width / 2, y, 1, 1).data].slice(0, 3);
    return { size: [img.naturalWidth, img.naturalHeight], top: at(60), bottom: at(c.height - 60) };
  });
  expect(shown.size[1]).toBeGreaterThan(shown.size[0]);
  expect(shown.top[0], `top ${shown.top}`).toBeGreaterThan(150);
  expect(shown.top[1], `top ${shown.top}`).toBeLessThan(80);
  expect(shown.bottom[1], `bottom ${shown.bottom}`).toBeGreaterThan(200);
});

test('files that can’t be read: one warning names each problem, and nothing is added', async ({ app, page }) => {
  await app.addFilesSettled(['notanimage.png', 'password.pdf']);
  await expect.poll(async () => (await app.notice()).warn).toBe(true);
  const notice = await app.notice();
  expect(notice.text).toMatch(/notanimage\.png/);
  expect(notice.text).toMatch(/contraseña/);
  await expect(app.pieces()).toHaveCount(0);
  await expect(page.locator('#pill-close')).toBeVisible();
});

test('a two-page PDF: page 1 keeps A5’s proportion, page 2 is 2:1, and changing the page is one undo step', async ({ app, page }) => {
  await app.addFiles(['twopage.pdf', 'rotated.pdf']);
  await app.clickPiece(app.pieceNamed('twopage.pdf'));
  await app.openMeasures();
  await expect(page.locator('#page-row')).toBeVisible();
  const size = async () => [num(await page.locator('#width').inputValue()), num(await page.locator('#height').inputValue())];
  const [w1, h1] = await size();
  expect(w1 / h1).toBeCloseTo(148 / 210, 2);
  await page.locator('#page').selectOption('2');
  await expect(page.locator('#page')).toHaveValue('2');
  await expect(page.locator('#page')).toBeEnabled();
  await app.idle();
  const [w2, h2] = await size();
  expect(w2 / h2).toBeCloseTo(2, 1);
  await app.undo();
  await expect(page.locator('#page')).toHaveValue('1');
  expect((await size())[0]).toBeCloseTo(w1, 1);
  await app.redo();
  await expect(page.locator('#page')).toHaveValue('2');
});

test('the downloaded PDF is named after the app and the paper, and the notice names the file', async ({ app, page }) => {
  await app.addFiles(['small.jpg']);
  await expect(page.locator('#paper-label')).toHaveText('A4 · 210 × 297 mm', { useInnerText: true });
  const a4 = await app.download();
  expect(a4.name).toBe('scooch-a4.pdf');
  // How to print it is the advice before downloading (print-and-download.spec, turned off here).
  expect((await app.notice()).text).toBe('Se descargó scooch-a4.pdf');
  await app.openSheet();
  await page.locator('#landscape').check();
  await page.locator('#paper').selectOption('A3');
  await expect.poll(async () => norm(await page.locator('#paper-label').textContent())).toBe('A3 · 420 × 297 mm');
  await app.closePopover();
  const a3 = await app.download();
  expect(a3.name).toBe('scooch-a3.pdf');
});

test.describe('at 360 px wide', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('the page doesn’t scroll sideways', async ({ app, page }) => {
    await app.addFiles(['wide.png', 'tall.png']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
