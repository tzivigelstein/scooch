// The context menus of a piece and of an empty sheet, opened the real ways:
// a right click (at the pointer, inside the window), Shift+F10 and the Menu key
// (next to the focus) and a long touch press (which doesn't drag); Esc gives the
// focus back. (Moving through the items, typing to jump, disabled items and an
// item acting in one undo step are in tests/components/Menu.test.tsx.)
import type { Page } from '@playwright/test';
import { frames } from '../support/canvas.ts';
import { cards, expect, test, type App } from '../support/test.ts';

/** The open menu (null if none): its name, role, box, item labels and the focused element. */
const MENU = () => {
  const menu = document.getElementById('context-menu');
  if (!menu) return null;
  const r = menu.getBoundingClientRect();
  return {
    label: menu.getAttribute('aria-label'),
    role: menu.getAttribute('role'),
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    items: [...menu.querySelectorAll('[role="menuitem"]')].map((el) => el.querySelector('.menu-label')!.textContent),
    active: document.activeElement?.id ?? '',
  };
};

const openMenu = async (page: Page) => {
  await expect(page.locator('#context-menu')).toBeVisible();
  return (await page.evaluate(MENU))!;
};

const focusedPiece = (app: App) => app.active().then((a) => a.piece);

test.describe('context menus', () => {
  test('a right click on a piece: its named menu at the pointer, the piece selected, the focus on the first item; Esc closes it and the focus goes back', async ({ app, page }) => {
    await app.addFiles(cards(0, 4));
    const ids = await app.ids();
    const box = (await app.piece(ids[1]).boundingBox())!;
    await page.mouse.click(box.x + 20, box.y + 30, { button: 'right' });
    const m = await openMenu(page);
    expect(m).toMatchObject({ role: 'menu', label: 'Acciones de la pieza', active: 'context-menu-rotate-left' });
    expect(Math.abs(m.rect.x - (box.x + 20))).toBeLessThan(2);
    expect(Math.abs(m.rect.y - (box.y + 30))).toBeLessThan(2);
    expect(await app.selectedIds()).toEqual([ids[1]]);
    await page.keyboard.press('Escape');
    await expect(page.locator('#context-menu')).toHaveCount(0);
    await expect(app.piece(ids[1])).toBeFocused();
  });

  test('a right click on an empty spot near the window’s corner: the sheet’s menu, inside the window, with nothing selected', async ({ app, page }) => {
    await app.addFiles(cards(0, 4));
    await app.piece((await app.ids())[0]).click();
    await expect.poll(async () => (await app.selectedIds()).length).toBe(1);
    await page.evaluate(() => (document.getElementById('stage')!.scrollTop = 99999));
    const sheet = (await page.locator('#sheets .sheet').last().boundingBox())!;
    const viewport = page.viewportSize()!;
    await page.mouse.click(Math.min(sheet.x + sheet.width - 4, 1140), Math.min(sheet.y + sheet.height - 4, viewport.height - 10), { button: 'right' });
    const m = await openMenu(page);
    expect(m.label).toBe('Acciones de la hoja 1');
    expect(m.items).toContain('Agregar hoja');
    expect(m.rect.x).toBeGreaterThanOrEqual(0);
    expect(m.rect.y).toBeGreaterThanOrEqual(0);
    expect(m.rect.x + m.rect.w).toBeLessThanOrEqual(viewport.width);
    expect(m.rect.y + m.rect.h).toBeLessThanOrEqual(viewport.height);
    expect(await app.selectedIds()).toEqual([]);
  });

  test('Shift+F10 on a piece opens its menu next to it, the focus on the first item, and Esc gives the focus back; the Menu key opens one menu there too', async ({ app, page }) => {
    await app.addFiles(cards(0, 4));
    const ids = await app.ids();
    await app.piece(ids[2]).focus();
    await expect.poll(() => app.selectedIds()).toEqual([ids[2]]);
    const pbox = (await app.piece(ids[2]).boundingBox())!;
    const nextToPiece = (m: { rect: { x: number; y: number } }) => {
      expect(m.rect.x).toBeGreaterThanOrEqual(pbox.x - 1);
      expect(m.rect.x).toBeLessThanOrEqual(pbox.x + 20);
      expect(m.rect.y).toBeGreaterThanOrEqual(pbox.y - 1);
      expect(m.rect.y).toBeLessThanOrEqual(pbox.y + 20);
    };

    await page.keyboard.press('Shift+F10');
    let m = await openMenu(page);
    expect(m).toMatchObject({ label: 'Acciones de la pieza', active: 'context-menu-rotate-left' });
    nextToPiece(m);
    await page.keyboard.press('Escape');
    await expect(page.locator('#context-menu')).toHaveCount(0);
    expect(await focusedPiece(app)).toBe(ids[2]);

    // The key fires a keydown and then a contextmenu event: still one menu, where the keydown put it.
    await page.keyboard.press('ContextMenu');
    await openMenu(page);
    await frames(page);
    m = (await page.evaluate(MENU))!;
    expect(m).toMatchObject({ label: 'Acciones de la pieza', active: 'context-menu-rotate-left' });
    nextToPiece(m);
    await expect(page.locator('[role="menu"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#context-menu')).toHaveCount(0);
    expect(await focusedPiece(app)).toBe(ids[2]);
  });

  test('Shift+F10 on a sheet opens the sheet’s menu; Esc gives the focus back to the sheet', async ({ app, page }) => {
    await app.addFiles(cards(0, 4));
    const sheet = page.locator('#sheets .sheet').first();
    await sheet.focus();
    await page.keyboard.press('Shift+F10');
    expect((await openMenu(page)).label).toBe('Acciones de la hoja 1');
    await page.keyboard.press('Escape');
    await expect(page.locator('#context-menu')).toHaveCount(0);
    await expect(sheet).toBeFocused();
  });

  test('a long touch press on a piece opens its menu without moving anything, and it stays open when the finger lifts', async ({ app, page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the touch goes through the Chrome DevTools Protocol (Input.dispatchTouchEvent), which only Chromium has');
    await app.addFiles(cards(0, 4));
    const ids = await app.ids();
    const target = app.piece(ids[3]);
    await target.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const box = (await target.boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const before = await app.snapshot();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1 }] });
    // The menu comes once the press has lasted long enough (550 ms).
    await expect.poll(async () => (await page.evaluate(MENU))?.label ?? null).toBe('Acciones de la pieza');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await frames(page, 3);
    await expect(page.locator('#context-menu')).toHaveCount(1);
    expect(await app.snapshot()).toBe(before);
    expect(await app.selectedIds()).toEqual([ids[3]]);
    await page.keyboard.press('Escape');
    await expect(page.locator('#context-menu')).toHaveCount(0);
  });
});
