// Units in a real browser: the unit chosen in «Preferencias» reaches every
// length the page shows (and its accessible names), a field reads lengths in
// any unit, and the choice survives a reload. Parsing, steps and formatting
// per unit are in tests/core/units.test.js and tests/components/LengthField.test.tsx;
// that switching changes no document, undo step, saved project or PDF, in
// tests/state/units-and-fields.test.ts.
import type { Page } from '@playwright/test';
import { expect, norm, test } from '../support/test.ts';

/** Chooses a unit in «Preferencias» (opened with the gear) and closes it with Esc. */
async function chooseUnit(page: Page, unit: 'mm' | 'cm' | 'in') {
  await page.locator('#prefs-open').click();
  await expect(page.locator('#prefs')).toHaveAttribute('open');
  await page.locator(`#prefs input[name="unit"][value="${unit}"]`).check();
  await page.keyboard.press('Escape');
  await expect(page.locator('#prefs')).not.toHaveAttribute('open');
}

test('choosing cm in Preferences changes every length shown: the sheet label, the fields, the paper options, the list, the accessible names', async ({ app, page }) => {
  await app.addFiles(['small.jpg']);
  await app.clickPiece(app.pieceNamed('small.jpg'));
  await app.setMeasure('pos-x', '10');
  await app.setMeasure('pos-y', '10');
  await expect(page.locator('#width')).toHaveValue('67,7');
  await expect(page.locator('#prefs-open')).toHaveAttribute('data-tip', 'Preferencias');

  await chooseUnit(page, 'cm');
  await app.heard(/Medidas en centímetros/);
  await expect(page.locator('#prefs-open')).toBeFocused();
  await expect(page.locator('#paper-label')).toHaveText('A4 · 21 × 29,7 cm');
  await expect(page.locator('#paper option[value="A4"]')).toHaveText('A4 (21 × 29,7 cm)');
  for (const [id, value] of [
    ['#pos-x', '1'],
    ['#pos-y', '1'],
    ['#width', '6,77'],
    ['#height', '5,08'],
  ]) {
    await expect(page.locator(id)).toHaveValue(value);
  }
  await expect(page.locator('#pos-x')).toHaveAttribute('aria-label', 'X: distancia desde el borde izquierdo, en centímetros');
  await expect(page.locator('#piece-list .row-dims').first()).toHaveText('6,77 × 5,08 cm');
  await expect(page.locator('#piece-size')).toHaveText('6,77 × 5,08 cm');
  expect(norm(await app.pieceNamed('small.jpg').getAttribute('aria-label'))).toBe('small.jpg, 6,77 × 5,08 cm, a 1 cm del borde izquierdo y 1 cm del superior');
  expect(norm(await page.locator('#piece-hint').textContent())).toMatch(/Shift: 1 cm; Alt: 0,01 cm/);
  // Every unit symbol next to a field, shown or not: cm, or % for the scale; no mm left.
  const symbols = await page.locator('.num-unit').allTextContents();
  expect(symbols.filter((s) => s === 'cm').length).toBeGreaterThan(4);
  expect(new Set(symbols)).toEqual(new Set(['cm', '%']));
  // What isn't a length stays as it was.
  await expect(page.locator('#scale')).toHaveValue('100');
});

test('a field accepts «1/2 in» while the unit is mm', async ({ app, page }) => {
  await app.addFiles(['small.jpg']);
  await app.clickPiece(app.pieceNamed('small.jpg'));
  await app.openMeasures();
  const x = page.locator('#pos-x');
  await x.fill('1/2 in');
  await x.press('Enter');
  await expect(x).toHaveValue('12,7');
  await expect.poll(async () => norm(await app.pieceNamed('small.jpg').getAttribute('aria-label'))).toMatch(/a 12,7 mm del borde izquierdo/);
});

test('after a reload the unit is still inches', async ({ app, page }) => {
  await chooseUnit(page, 'in');
  await expect(page.locator('#paper-label')).toHaveText('A4 · 8,268 × 11,693 in');
  await page.reload();
  await app.ready();
  await expect(page.locator('#paper-label')).toHaveText('A4 · 8,268 × 11,693 in');
  await app.openSetting('#margin');
  await expect(page.locator('#margin')).toHaveValue('0,394');
});
