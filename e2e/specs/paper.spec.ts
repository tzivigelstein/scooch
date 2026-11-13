// Paper in a real browser: a preset reaches the downloaded PDF at its real
// size, also in landscape, and a custom size that matches a preset says so.
// The paper list, the custom fields' messages and limits are in
// tests/components/SheetSection.test.tsx; names and slugs of every paper in
// tests/services/measure.test.ts; page sizes of every paper in
// tests/services/pdf-page-size.test.ts.
import { expect, test } from '../support/test.ts';

test.describe('paper presets', () => {
  test('Folio downloads a 216 × 330 mm PDF named scooch-folio.pdf and titled «Scooch Folio»', async ({ app, page }) => {
    await app.openSheet();
    await page.locator('#paper').selectOption('folio');
    await expect(page.locator('#paper-label')).toHaveText('Folio · 216 × 330 mm');
    await expect(page.locator('#custom-paper')).toBeHidden();
    await app.addFiles(['small.jpg']);
    const { name, info } = await app.downloadPdf();
    expect(name).toBe('scooch-folio.pdf');
    expect(info.pages.map(({ w, h }) => [w, h])).toEqual([[216, 330]]);
    expect(info.title).toBe('Scooch Folio');
  });

  test('an A4 landscape document downloads a PDF whose page is 297 × 210 mm', async ({ app, page }) => {
    await app.addFiles(['small.jpg']);
    await app.openSheet();
    await page.locator('#landscape').check();
    await expect(page.locator('#paper-label')).toHaveText('A4 · 297 × 210 mm');
    const { name, info } = await app.downloadPdf();
    expect(name).toBe('scooch-a4.pdf');
    expect(info.pages).toHaveLength(1);
    expect([info.pages[0].w, info.pages[0].h]).toEqual([297, 210]);
    expect(info.title).toBe('Scooch A4 horizontal');
  });
});

test.describe('custom paper', () => {
  test('a custom paper that matches a preset says so: «29.7 cm» × «21 cm» is A4 landscape', async ({ app, page }) => {
    await app.openSheet();
    await page.locator('#paper').selectOption('custom');
    const width = page.locator('#paper-w');
    const height = page.locator('#paper-h');
    await expect(width).toBeVisible();
    await expect(width).toHaveValue('210');
    await expect(height).toHaveValue('297');
    await expect(page.locator('#paper-match')).toHaveText('Coincide con A4');
    await width.fill('29.7 cm');
    await width.press('Enter');
    await height.fill('21 cm');
    await height.press('Enter');
    await expect(page.locator('#paper-match')).toBeVisible();
    await expect(page.locator('#paper-match')).toHaveText('Coincide con A4 horizontal');
    await expect(page.locator('#paper-label')).toHaveText('A4 · 297 × 210 mm');
    await expect(page.locator('#paper')).toHaveValue('custom');
    await expect(page.locator('#landscape')).toBeChecked();
  });
});
