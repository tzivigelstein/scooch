// Context menus of pieces and empty sheets: by right click (at the pointer, inside the window), by
// keyboard (Shift+F10 and the Menu key, next to the focus) and by a long touch press (which doesn't
// drag). They are named menus with the focus on their first item, arrows and typing move through
// them, disabled items say why, choosing an item acts in one undo step and Esc gives the focus back.
const { open, makeChecker, addFiles, lib, cards, heard } = require('../lib/selection.cjs');

const MENU = () => {
  const menu = document.getElementById('context-menu');
  if (!menu) return null;
  const r = menu.getBoundingClientRect();
  return {
    label: menu.getAttribute('aria-label'),
    role: menu.getAttribute('role'),
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    items: [...menu.querySelectorAll('[role="menuitem"]')].map((el) => el.querySelector('.menu-label').textContent),
    active: document.activeElement.id,
  };
};

(async () => {
  const { check, report } = makeChecker('Context menus');
  const errors = [];
  const s = await open({ viewport: { width: 1440, height: 900 } });
  const p = s.page;
  const L = lib(p);
  const menu = () => p.evaluate(MENU);
  await addFiles(p, cards(0, 4));
  const ids = await L.ids();
  const box = await L.piece(ids[1]).boundingBox();

  // Right click on a piece
  await p.mouse.click(box.x + 20, box.y + 30, { button: 'right' });
  await p.waitForSelector('#context-menu');
  let m = await menu();
  check('right click on a piece: its menu, named, at the pointer, focus on the first item', m.role === 'menu' && m.label === 'Acciones de la pieza' && Math.abs(m.rect.x - (box.x + 20)) < 2 && Math.abs(m.rect.y - (box.y + 30)) < 2 && m.active === 'context-menu-rotate-left', JSON.stringify(m));
  check('…the piece is selected', JSON.stringify(await L.selectedIds()) === JSON.stringify([ids[1]]));
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('ArrowDown');
  check('arrows move through the items', (await menu()).active === 'context-menu-duplicate');
  await p.keyboard.press('s');
  check('typing jumps to the item that starts with it', (await menu()).active === 'context-menu-same');
  await p.keyboard.press('Home');
  // «Pegar» is disabled until something is copied: it says why.
  for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowDown');
  check('a disabled item stays reachable and says why', (await menu()).active === 'context-menu-paste' && (await p.getAttribute('#context-menu-paste', 'aria-disabled')) === 'true' && !!(await p.getAttribute('#context-menu-paste', 'aria-describedby')));
  await p.keyboard.press('Enter');
  check('…choosing it announces the reason and leaves it open', (await heard(p, /Primero copia piezas/)) && (await p.locator('#context-menu').count()) === 1);
  await p.keyboard.press('Escape');
  check('Esc closes it and the focus goes back to the piece', (await p.locator('#context-menu').count()) === 0 && (await p.evaluate(() => document.activeElement.dataset.id)) === String(ids[1]));

  // Choosing an item acts, in one undo step
  const before = await L.snap();
  await p.mouse.click(box.x + 20, box.y + 30, { button: 'right' });
  await p.waitForSelector('#context-menu');
  await p.click('#context-menu-duplicate');
  check('«Duplicar» from the menu adds a copy', (await L.geom()).pieces.length === 5);
  await L.undo();
  check('…undone in one step', (await L.snap()) === before);

  // Near the window's corner it stays inside
  await p.evaluate(() => (document.getElementById('stage').scrollTop = 99999));
  const sheet = await p.locator('#sheets .sheet').last().boundingBox();
  const corner = { x: Math.min(sheet.x + sheet.width - 4, 1140), y: Math.min(sheet.y + sheet.height - 4, 890) };
  await p.mouse.click(corner.x, corner.y, { button: 'right' });
  await p.waitForSelector('#context-menu');
  m = await menu();
  check('right click on an empty spot: the sheet’s menu', m.label === 'Acciones de la hoja 1' && m.items.includes('Agregar hoja'), JSON.stringify(m));
  check('…opened inside the window', m.rect.x >= 0 && m.rect.y >= 0 && m.rect.x + m.rect.w <= 1440 && m.rect.y + m.rect.h <= 900, JSON.stringify(m.rect));
  check('…with nothing selected', (await L.selectedIds()).length === 0);
  await p.keyboard.press('Escape');

  // Keyboard: Shift+F10 and the Menu key, on a piece and on a sheet
  await L.piece(ids[2]).focus();
  await p.waitForTimeout(100);
  await p.keyboard.press('Shift+F10');
  await p.waitForSelector('#context-menu');
  m = await menu();
  const pbox = await L.piece(ids[2]).boundingBox();
  check('Shift+F10 on a piece: its menu next to it, focus on the first item', m.label === 'Acciones de la pieza' && m.rect.x >= pbox.x - 1 && m.rect.x <= pbox.x + 20 && m.active === 'context-menu-rotate-left', JSON.stringify({ m, pbox }));
  await p.keyboard.press('Escape');
  check('…Esc back to the piece', (await p.evaluate(() => document.activeElement.dataset.id)) === String(ids[2]));
  await p.keyboard.press('ContextMenu');
  await p.waitForTimeout(150);
  check('the Menu key on a piece opens one menu', (await p.locator('#context-menu').count()) === 1);
  await p.keyboard.press('Escape');
  await p.keyboard.press('Escape');
  await p.locator('#sheets .sheet').first().focus();
  await p.waitForTimeout(100);
  await p.keyboard.press('Shift+F10');
  await p.waitForSelector('#context-menu');
  check('Shift+F10 on a sheet: the sheet’s menu', (await menu()).label === 'Acciones de la hoja 1');
  await p.keyboard.press('Escape');
  check('…Esc back to the sheet', await p.evaluate(() => document.activeElement.classList.contains('sheet')));

  // A long touch press: the menu, without dragging the piece
  const cdp = await s.context.newCDPSession(p);
  await L.piece(ids[3]).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const tb = await L.piece(ids[3]).boundingBox();
  const at = { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 };
  const snap = await L.snap();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1 }] });
  await p.waitForTimeout(750);
  check('a long touch press opens the piece’s menu', (await menu())?.label === 'Acciones de la pieza');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(100);
  check('…without moving anything, and it stays open', (await L.snap()) === snap && (await p.locator('#context-menu').count()) === 1);
  await p.keyboard.press('Escape');

  errors.push(...s.errors);
  await s.browser.close();
  check('no console errors', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
