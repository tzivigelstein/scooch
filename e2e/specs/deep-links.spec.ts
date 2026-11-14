// A deep link in a real browser, with the real IndexedDB (the rules are in
// tests/core/deeplink.test.js and tests/services/deep-link-start.test.ts):
// it opens a new project set up, the saved project stays as it was, and a
// reload doesn't create another one.
import { expect, norm, test } from '../support/test.ts';
import { cards, openProjects, saved } from '../support/projects.ts';

test('a deep link opens a new project set up, leaves the saved one as it was, and a reload keeps the new one', async ({ app, page }) => {
  await app.open();
  await app.addFiles(['small.jpg']);
  await saved(page);
  await openProjects(page);
  const before = await cards(page);
  expect(before).toHaveLength(1);
  await page.keyboard.press('Escape');

  await app.open('?paper=letter&orientation=landscape&margin=5&gap=2&photo=10x15&cuts=outline&utm_source=guide');
  await expect(page).toHaveURL(/\/\?utm_source=guide$/);
  expect(norm((await app.notice()).text)).toBe('Se creó un proyecto nuevo con papel Carta horizontal. Las fotos que agregues se recortan a 10 × 15: 101,6 × 152,4 mm.');
  await expect(app.pieces()).toHaveCount(0);
  await app.showTab('sheet');
  await expect(page.locator('#paper')).toHaveValue('letter');
  await expect(page.locator('#landscape')).toBeChecked();
  await expect(page.locator('#margin')).toHaveValue('5');
  await expect(page.locator('#gap')).toHaveValue('2');

  // An image added to this project takes the link's photo size.
  await app.addFiles(['small.jpg']);
  const [piece] = (await app.geometry()).pieces;
  expect([piece.w, piece.h].map((v) => Math.round(v * 10) / 10).sort((a, b) => a - b)).toEqual([101.6, 152.4]);
  await saved(page);

  await openProjects(page);
  const after = await cards(page);
  expect(after).toHaveLength(2);
  const { id, name, meta } = before[0];
  expect(after.find((c) => c.id === id)).toMatchObject({ name, meta, current: false });
  await page.keyboard.press('Escape');

  await page.reload();
  await app.ready();
  await expect(app.pieces()).toHaveCount(1);
  await openProjects(page);
  expect(await cards(page)).toHaveLength(2);
});
