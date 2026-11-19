// The modal dialogs as such: the focus going in when one opens and coming
// back when it closes, also while a stylesheet is still loading (WebKit
// doesn't restyle the page until it arrives); and what scrolls over the page
// (dialogs, menus, lists) keeping its scroll to itself. What each dialog holds and
// does: its own spec (command-palette, projects, print-and-download…).
import type { Page } from '@playwright/test';
import { expect, test } from '../support/test.ts';

/**
 * In one step: a stylesheet starts loading, as the CSS of the lazy parts does
 * when the app fetches it while idle (without requestIdleCallback, as in
 * WebKit, 1.5 s after it starts); `id` is clicked; two frames go by. One step,
 * because a trace takes a snapshot of the page after each one, and reading
 * every element's scroll position styles the page before WebKit's next frame.
 * The stylesheet keeps loading until the returned function is called.
 */
async function clickWhileAStylesheetLoads(page: Page, id: string) {
  let arrive!: () => void;
  const arrived = new Promise<void>((resolve) => (arrive = resolve));
  await page.route('**/late.css', async (route) => {
    await arrived;
    await route.fulfill({ contentType: 'text/css', body: '' });
  });
  await page.evaluate(
    (id) =>
      new Promise<void>((done) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'late.css';
        document.head.append(link);
        document.getElementById(id)!.click();
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
    id
  );
  return arrive;
}

test('a dialog opened again while a stylesheet is loading keeps the focus on its first element', async ({ app }) => {
  const page = app.page;
  await page.locator('#palette-open').click();
  await expect(page.locator('#palette-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#palette-open')).toBeFocused();
  const arrive = await clickWhileAStylesheetLoads(page, 'palette-open');
  await expect(page.locator('#palette')).toHaveAttribute('open', '');
  await expect(page.locator('#palette-input')).toBeFocused();
  await page.keyboard.type('girar');
  await expect(page.locator('#palette-input')).toHaveValue('girar');
  arrive();
});

test('a dialog closed while a stylesheet is loading gives the focus back to its opener', async ({ app }) => {
  const page = app.page;
  await app.addFiles(['card01.png']);
  await page.locator('#clear').click();
  await expect(page.locator('#confirm-cancel')).toBeFocused();
  const arrive = await clickWhileAStylesheetLoads(page, 'confirm-cancel');
  await expect(page.locator('#confirm')).not.toHaveAttribute('open');
  await expect(page.locator('#clear')).toBeFocused();
  await expect(app.pieces()).toHaveCount(1);
  arrive();
});

test('what scrolls over the page keeps its scroll to itself: a dialog’s body, a menu, a select’s list, the panels and the palette’s list', async ({ app }) => {
  const page = app.page;
  /** How `selector` (shown) lets a scroll that reaches its end go on to what is behind it. */
  const overscroll = (selector: string) => page.locator(selector).evaluate((el) => getComputedStyle(el).overscrollBehaviorY);
  await app.addFiles(['card01.png']);
  await app.clickPiece(app.pieces().first());
  await app.openMeasures();
  expect(await overscroll('#props-panel'), 'Propiedades').toBe('contain');
  expect(await overscroll('#pieces-panel'), 'Piezas (its list scrolls on to it)').toBe('contain');

  await page.locator('#photo-size').click();
  expect(await overscroll('#photo-size-list'), 'a select’s list').toBe('contain');
  await page.keyboard.press('Escape');

  await page.locator('#zoom-level').click();
  expect(await overscroll('[role="menu"]'), 'a menu').toBe('contain');
  await page.keyboard.press('Escape');

  await page.locator('#prefs-open').click();
  expect(await overscroll('#prefs .dialog-body'), 'a dialog’s body').toBe('contain');
  await page.keyboard.press('Escape');

  await page.locator('#palette-open').click();
  expect(await overscroll('#palette-list'), 'the palette’s list').toBe('contain');
});
