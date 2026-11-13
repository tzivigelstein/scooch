// Dragging pieces out of their sheet onto a new one: placeholders only once the dragged center is
// outside every sheet, out of the layout (nothing moves) and hidden from screen readers; dropping
// below the last sheet, between two sheets or above the first creates the sheet there with the
// pieces where they were let go, in one undo step; groups keep their arrangement; Esc cancels; an
// emptied sheet stays with a notice that removes it; it works by touch and zoomed in; the keyboard
// path (the context menu's «Mover a una hoja nueva») announces its result.
const { open, makeChecker, addFiles, lib, sheets, heard, cards } = require('../lib/selection.cjs');

const PLACEHOLDERS = () => {
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  const end = document.getElementById('new-sheet-end');
  const bar = document.getElementById('new-sheet-gap');
  return {
    end: !end.hidden,
    endActive: end.classList.contains('is-active'),
    bar: !bar.hidden,
    hidden: end.getAttribute('aria-hidden') === 'true' && bar.getAttribute('aria-hidden') === 'true',
    endRect: end.hidden ? null : r(end),
    barRect: bar.hidden ? null : r(bar),
    // The sheets in #sheets coordinates: they must not move while the placeholders show.
    pages: [...document.querySelectorAll('#sheets .page')].map((p) => {
      const o = document.getElementById('sheets').getBoundingClientRect();
      const b = p.querySelector('.sheet-box').getBoundingClientRect();
      return [Math.round((b.x - o.x) * 10) / 10, Math.round((b.y - o.y) * 10) / 10];
    }),
    sheetBox: r(document.querySelector('#sheets .sheet-box')),
  };
};

(async () => {
  const { check, report } = makeChecker('New sheet by dragging');
  const errors = [];
  const s = await open({ viewport: { width: 1440, height: 900 } });
  const p = s.page;
  const L = lib(p);
  const ph = () => p.evaluate(PLACEHOLDERS);
  const counts = async () => (await sheets(p)).map((sh) => sh.pieces.length);
  const pieceIds = async () => (await sheets(p)).map((sh) => sh.pieces.map((x) => x.id));

  await addFiles(p, cards(0, 12));
  check('setup: 2 sheets, 9 and 3 pieces', JSON.stringify(await counts()) === '[9,3]', JSON.stringify(await counts()));

  // Holds a piece and moves it in steps to window points returned by `to()` (recomputed, for autoscroll).
  const hold = async (id) => {
    await p.keyboard.press('Escape');
    await L.piece(id).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const b = await L.piece(id).boundingBox();
    const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await p.mouse.move(from.x, from.y);
    await p.mouse.down();
    await p.mouse.move(from.x + 4, from.y + 4, { steps: 2 });
    return from;
  };
  const stage = await p.locator('#stage').boundingBox();
  // Moves the pointer to the bottom edge until the last sheet's bottom shows, then below it.
  const belowLast = async (x) => {
    for (let i = 0; i < 300; i++) {
      const bottom = await p.evaluate(() => [...document.querySelectorAll('#sheets .sheet-box')].at(-1).getBoundingClientRect().bottom);
      if (bottom < stage.y + stage.height - 160) break;
      await p.mouse.move(x, stage.y + stage.height - 8);
      await p.waitForTimeout(16);
    }
    const bottom = await p.evaluate(() => [...document.querySelectorAll('#sheets .sheet-box')].at(-1).getBoundingClientRect().bottom);
    await p.mouse.move(x, bottom + 120, { steps: 6 });
    await p.waitForTimeout(50);
  };

  // ---------- A drag that stays inside its sheet shows nothing
  const [first9, last3] = await pieceIds();
  let from = await hold(first9[4]);
  await p.mouse.move(from.x + 30, from.y + 20, { steps: 4 });
  let state = await ph();
  check('a drag inside its sheet shows no placeholder', !state.end && !state.bar, JSON.stringify(state));
  await p.keyboard.press('Escape');
  await p.mouse.up();

  // ---------- Below the last sheet
  const before = await sheets(p);
  const pagesBefore = (await ph()).pages;
  from = await hold(last3[0]);
  await belowLast(from.x);
  state = await ph();
  check('below the last sheet: the dashed sheet shows, active, hidden from screen readers', state.end && state.endActive && !state.bar && state.hidden, JSON.stringify(state));
  check('…sheet-sized, in the sheets’ column', state.endRect && Math.abs(state.endRect.w - state.sheetBox.w) < 1 && Math.abs(state.endRect.h - state.sheetBox.h) < 1 && Math.abs(state.endRect.x - state.sheetBox.x) < 1, JSON.stringify(state));
  check('…and nothing moved under the pointer', JSON.stringify(state.pages) === JSON.stringify(pagesBefore), JSON.stringify({ before: pagesBefore, now: state.pages }));
  await p.mouse.up();
  await p.waitForTimeout(150);
  let after = await sheets(p);
  const moved = after[2]?.pieces.find((x) => x.id === last3[0]);
  check('dropped there: a 3rd sheet with that piece, inside the printable area', after.length === 3 && !!moved && moved.x >= 10 - 0.01 && moved.y >= 10 - 0.01 && moved.x + moved.w <= 200.01 && moved.y + moved.h <= 287.01, JSON.stringify(after.map((sh) => sh.pieces.length)));
  check('…announced, without a notice', (await heard(p, /Se creó la hoja 3 y se movió 1 pieza/)) && !(await L.pill()).text, JSON.stringify(await L.pill()));
  state = await ph();
  check('…and the placeholders are gone', !state.end && !state.bar);
  await L.undo();
  check('one undo step: no 3rd sheet, the piece back where it was', JSON.stringify(await sheets(p)) === JSON.stringify(before));
  await L.redo();
  check('redo: the 3rd sheet again', JSON.stringify(await sheets(p)) === JSON.stringify(after));
  await L.undo();

  // ---------- Between two sheets
  from = await hold(last3[1]);
  const gapY = await p.evaluate(() => {
    const boxes = [...document.querySelectorAll('#sheets .page')];
    const a = boxes[0].querySelector('.sheet-box').getBoundingClientRect();
    const b = boxes[1].getBoundingClientRect();
    return (a.bottom + b.top) / 2;
  });
  await p.mouse.move(from.x, gapY, { steps: 10 });
  await p.waitForTimeout(40);
  state = await ph();
  check('in the gap between two sheets: the bar shows there; the dashed sheet stays, not active', state.bar && state.end && !state.endActive && state.barRect && Math.abs(state.barRect.y - gapY) < 30, JSON.stringify(state));
  await p.mouse.up();
  await p.waitForTimeout(150);
  after = await sheets(p);
  check('dropped: a new sheet between them, with the piece', after.length === 3 && after[0].id === before[0].id && after[2].id === before[1].id && after[1].pieces.length === 1 && after[1].pieces[0].id === last3[1], JSON.stringify(after.map((sh) => [sh.id, sh.pieces.map((x) => x.id)])));
  check('…its title says «Hoja 2 de 3»', after[1].label === 'Hoja 2 de 3');
  await L.undo();

  // ---------- Above the first sheet
  await p.evaluate(() => (document.getElementById('stage').scrollTop = 0));
  from = await hold(first9[0]);
  const aboveY = await p.evaluate(() => document.querySelector('#sheets .page').getBoundingClientRect().top - 2);
  await p.mouse.move(from.x, Math.max(aboveY, 60), { steps: 10 });
  await p.waitForTimeout(40);
  state = await ph();
  check('above the first sheet: the bar shows', state.bar, JSON.stringify(state));
  await p.mouse.up();
  await p.waitForTimeout(150);
  after = await sheets(p);
  check('dropped: a new first sheet with the piece', after.length === 3 && after[0].pieces.length === 1 && after[0].pieces[0].id === first9[0] && after[1].id === before[0].id, JSON.stringify(after.map((sh) => [sh.id, sh.pieces.map((x) => x.id)])));
  await L.undo();

  // ---------- Esc cancels
  from = await hold(last3[2]);
  await belowLast(from.x);
  check('(the placeholder shows)', (await ph()).endActive);
  await p.keyboard.press('Escape');
  state = await ph();
  await p.mouse.up();
  await p.waitForTimeout(100);
  check('Esc cancels: no placeholder, no new sheet, nothing moved', !state.end && JSON.stringify(await sheets(p)) === JSON.stringify(before), JSON.stringify(state));

  // ---------- A group keeps its arrangement; the emptied sheet stays, with a notice that removes it
  await L.selectIds(last3);
  const g0 = (await sheets(p))[1].pieces;
  await p.mouse.move(0, 0);
  from = await (async () => {
    await L.piece(last3[0]).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const b = await L.piece(last3[0]).boundingBox();
    const f = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await p.mouse.move(f.x, f.y);
    await p.mouse.down();
    await p.mouse.move(f.x + 4, f.y + 4, { steps: 2 });
    return f;
  })();
  await belowLast(from.x);
  check('a group from one sheet shows the placeholder too', (await ph()).endActive);
  await p.mouse.up();
  await p.waitForTimeout(150);
  after = await sheets(p);
  const g1 = after[2]?.pieces ?? [];
  const offsets = (list) => list.map((x) => [Math.round((x.x - list[0].x) * 100) / 100, Math.round((x.y - list[0].y) * 100) / 100]);
  check('dropped: all 3 on the new sheet, arranged as they were', after.length === 3 && g1.length === 3 && JSON.stringify(offsets(g1)) === JSON.stringify(offsets(g0)), JSON.stringify({ g0: offsets(g0), g1: offsets(g1) }));
  const notice = await L.pill();
  check('the emptied sheet stays, with a notice that offers to remove it', after[1].pieces.length === 0 && /La hoja 2 quedó vacía/.test(notice.text) && notice.action === 'Quitar hoja', JSON.stringify(notice));
  await p.click('#pill-action');
  await p.waitForTimeout(150);
  after = await sheets(p);
  check('…and «Quitar hoja» removes it', after.length === 2 && after[1].pieces.length === 3, JSON.stringify(after.map((sh) => sh.pieces.length)));
  await L.undo();
  await L.undo();
  check('two undo steps: back to how it was', JSON.stringify(await sheets(p)) === JSON.stringify(before));

  // ---------- A selection on two sheets never shows it
  await L.selectIds([first9[8], last3[0]]);
  from = await (async () => {
    await L.piece(last3[0]).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const b = await L.piece(last3[0]).boundingBox();
    const f = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await p.mouse.move(f.x, f.y);
    await p.mouse.down();
    await p.mouse.move(f.x + 4, f.y + 4, { steps: 2 });
    return f;
  })();
  await belowLast(from.x);
  check('pieces of two sheets show no placeholder', !(await ph()).end);
  await p.keyboard.press('Escape');
  await p.mouse.up();

  // ---------- By touch
  const cdp = await s.context.newCDPSession(p);
  await p.keyboard.press('Escape');
  await L.piece(last3[0]).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const tb = await L.piece(last3[0]).boundingBox();
  const t0 = { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 };
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', t0.x, t0.y);
  for (let i = 1; i <= 6; i++) await touch('touchMove', t0.x, t0.y + i * 6);
  for (let i = 0; i < 300; i++) {
    const bottom = await p.evaluate(() => [...document.querySelectorAll('#sheets .sheet-box')].at(-1).getBoundingClientRect().bottom);
    if (bottom < stage.y + stage.height - 160) break;
    await touch('touchMove', t0.x, stage.y + stage.height - 8);
    await p.waitForTimeout(16);
  }
  const tBottom = await p.evaluate(() => [...document.querySelectorAll('#sheets .sheet-box')].at(-1).getBoundingClientRect().bottom);
  for (let i = 1; i <= 6; i++) await touch('touchMove', t0.x, tBottom + i * 20);
  check('by touch: the placeholder shows', (await ph()).endActive);
  await touch('touchEnd', 0, 0);
  await p.waitForTimeout(150);
  after = await sheets(p);
  check('…and dropping creates the sheet', after.length === 3 && after[2].pieces.some((x) => x.id === last3[0]) && (await p.locator('#context-menu').count()) === 0, JSON.stringify(after.map((sh) => sh.pieces.length)));
  await L.undo();

  // ---------- Zoomed in (200 %): the placeholder in the column, the drop still where it was let go
  await p.click('#zoom-level');
  await p.click('#zoom-menu-level-200');
  await p.waitForTimeout(80);
  from = await hold(last3[1]);
  await belowLast(from.x);
  state = await ph();
  check('200 %: the placeholder shows, sheet-sized and in the column', state.endActive && Math.abs(state.endRect.w - state.sheetBox.w) < 1 && Math.abs(state.endRect.x - state.sheetBox.x) < 1, JSON.stringify(state));
  await p.mouse.up();
  await p.waitForTimeout(150);
  after = await sheets(p);
  check('200 %: dropped onto a new sheet', after.length === 3 && after[2].pieces.some((x) => x.id === last3[1]), JSON.stringify(after.map((sh) => sh.pieces.length)));
  await L.undo();
  await p.click('#zoom-level');
  await p.click('#zoom-menu-fit');

  // ---------- The keyboard path: the context menu
  await L.piece(last3[2]).focus();
  await p.waitForTimeout(100); // (focusing it may scroll the stage, which closes menus)
  await p.keyboard.press('Shift+F10');
  await p.waitForSelector('#context-menu');
  await p.keyboard.press('End');
  await p.keyboard.press('ArrowUp');
  check('(the menu item has the focus)', (await p.evaluate(() => document.activeElement.id)) === 'context-menu-new-sheet');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  after = await sheets(p);
  check('«Mover a una hoja nueva» from the context menu: a sheet right after, announced', after.length === 3 && after[2].pieces.some((x) => x.id === last3[2]) && (await heard(p, /Se creó la hoja 3 y se movió 1 pieza/)), JSON.stringify(after.map((sh) => sh.pieces.length)));
  await L.undo();

  errors.push(...s.errors);
  await s.browser.close();
  check('no console errors', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
