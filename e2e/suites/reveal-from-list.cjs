// Selecting from the pieces list shows the piece on the canvas: a click or the arrows scroll the
// stage so the piece is fully visible (the focus stays in the list); Enter or a double click also
// move the focus to the piece (closing the list when it is an overlay); selecting on the canvas
// scrolls the row into the list. Never a horizontal scroll or a scrolled sheet.
const { open, makeChecker, addFiles } = require('../lib/sheets.cjs');

const cards = (from, n) => Array.from({ length: n }, (_, i) => `card${String(from + i).padStart(2, '0')}.png`);

// Where a piece is against what can be seen of the stage (without a panel open over it).
const SEEN = (id) => {
  const piece = document.querySelector(`#sheets .piece[data-id="${id}"]`).getBoundingClientRect();
  const stage = document.getElementById('stage');
  const s = stage.getBoundingClientRect();
  let left = s.left;
  const drawer = document.querySelector('.panel.is-drawer.is-open');
  if (drawer) {
    const r = drawer.getBoundingClientRect();
    if (r.left <= s.left + 4 && r.right < s.right - 48) left = Math.max(left, r.right);
  }
  const inside = piece.left >= left - 0.5 && piece.top >= s.top - 0.5 && piece.right <= s.left + stage.clientWidth + 0.5 && piece.bottom <= s.top + stage.clientHeight + 0.5;
  const active = document.activeElement;
  return {
    inside,
    scrollTop: stage.scrollTop,
    scrollLeft: stage.scrollLeft,
    docOverflow: document.documentElement.scrollWidth - innerWidth,
    sheetScroll: [...document.querySelectorAll('#sheets .sheet')].some((sh) => sh.scrollTop || sh.scrollLeft),
    focusRow: active?.getAttribute('role') === 'option' ? active.dataset.id : null,
    focusPiece: active?.classList.contains('piece') ? active.dataset.id : null,
    selected: [...document.querySelectorAll('#sheets .piece.is-selected')].map((p) => p.dataset.id),
  };
};

const ROW_SEEN = (id) => {
  const list = document.getElementById('piece-list').getBoundingClientRect();
  const row = document.querySelector(`#piece-list [role="option"][data-id="${id}"]`).getBoundingClientRect();
  return row.top >= list.top - 0.5 && row.bottom <= list.bottom + 0.5;
};

(async () => {
  const { check, report } = makeChecker('Pieces list reveals the piece');
  const errors = [];

  for (const [w, hgt] of [[1440, 900], [1024, 768], [390, 844]]) {
    const tag = `${w}`;
    const s = await open({ viewport: { width: w, height: hgt } });
    const p = s.page;
    await addFiles(p, cards(0, 20));
    await p.keyboard.press('Escape');
    const sheetIds = await p.evaluate(() => [...document.querySelectorAll('#sheets .page')].map((page) => page.dataset.sheet));
    check(`${tag}: 3 sheets`, sheetIds.length === 3, String(sheetIds.length));
    const last = await p.evaluate((sheet) => document.querySelector(`#sheets .page[data-sheet="${sheet}"] .piece`).dataset.id, sheetIds[2]);
    const openList = async () => {
      if (w >= 1100) return;
      if (!(await p.locator('#pieces-panel').isVisible())) await p.click(w < 800 ? '#pieces-dock' : '#pieces-toggle');
    };
    const row = (id) => p.locator(`#piece-list [role="option"][data-id="${id}"]`);
    await p.evaluate(() => document.getElementById('stage').scrollTo(0, 0));

    // A click on the row of a piece on sheet 3, with the stage at the top.
    await openList();
    if (w >= 800) {
      await row(last).click();
      let x = await p.evaluate(SEEN, last);
      check(`${tag}: click its row → the piece is fully visible`, x.inside && x.scrollTop > 0, JSON.stringify(x));
      check(`${tag}: …selected, with the focus still on the row`, x.focusRow === last && x.selected.join() === last, JSON.stringify(x));
      check(`${tag}: …no horizontal scroll, no scrolled sheet`, x.scrollLeft === 0 && x.docOverflow <= 0 && !x.sheetScroll, JSON.stringify(x));
      if (w < 1100) check(`${tag}: …and the list overlay stays open`, await p.locator('#pieces-panel').isVisible());
      // Already visible: no jump.
      const before = x.scrollTop;
      const neighbor = await p.evaluate((sheet) => [...document.querySelectorAll(`#sheets .page[data-sheet="${sheet}"] .piece`)][1].dataset.id, sheetIds[2]);
      await row(neighbor).click();
      x = await p.evaluate(SEEN, neighbor);
      check(`${tag}: a piece already in view doesn’t scroll`, x.inside && x.scrollTop === before, JSON.stringify({ before, after: x.scrollTop }));
      // Arrows: the canvas follows, the focus stays in the list.
      await p.evaluate(() => document.getElementById('stage').scrollTo(0, 0));
      await p.keyboard.press('ArrowUp');
      x = await p.evaluate(SEEN, last);
      check(`${tag}: ↑ in the list selects the previous one and shows it`, x.inside && x.focusRow === last && x.selected.join() === last, JSON.stringify(x));
      // Shift+click from the first piece: the box of what was added (spans sheets → the primary).
      const first = await p.evaluate(() => document.querySelector('#sheets .piece').dataset.id);
      await p.evaluate(() => document.getElementById('stage').scrollTo(0, 99999));
      await row(first).click({ modifiers: ['Shift'] });
      x = await p.evaluate(SEEN, first);
      check(`${tag}: Shift+click across sheets shows the primary piece`, x.inside && x.selected.length > 2, JSON.stringify(x));
      await row(last).click();
    }
    // Enter on the row: the focus goes to the piece, shown (the overlay closes).
    await p.evaluate(() => document.getElementById('stage').scrollTo(0, 0));
    await openList();
    await row(last).focus();
    await p.keyboard.press('Enter');
    await p.waitForTimeout(60);
    let x = await p.evaluate(SEEN, last);
    check(`${tag}: Enter on the row → focus on the piece, fully visible`, x.focusPiece === last && x.inside, JSON.stringify(x));
    if (w < 1100) check(`${tag}: …and the list overlay closes`, !(await p.locator('#pieces-panel').isVisible()));
    check(`${tag}: …no horizontal scroll, no scrolled sheet`, x.scrollLeft === 0 && x.docOverflow <= 0 && !x.sheetScroll, JSON.stringify(x));
    if (w >= 1100) {
      // Double click: the same as Enter.
      await p.evaluate(() => document.getElementById('stage').scrollTo(0, 99999));
      const first = await p.evaluate(() => document.querySelector('#sheets .piece').dataset.id);
      await row(first).dblclick();
      x = await p.evaluate(SEEN, first);
      check(`${tag}: double click on a row → focus on the piece, visible`, x.focusPiece === first && x.inside, JSON.stringify(x));
      // The reverse: selecting on the canvas scrolls the row into the list, without the focus.
      await p.evaluate(() => (document.getElementById('piece-list').scrollTop = 0));
      await p.evaluate(() => document.getElementById('stage').scrollTo(0, 99999));
      await p.locator(`#sheets .piece[data-id="${last}"]`).click();
      check(`${tag}: selecting on the canvas scrolls its row into the list and marks it`, (await p.evaluate(ROW_SEEN, last)) && (await row(last).getAttribute('aria-selected')) === 'true');
      check(`${tag}: …the focus stays on the piece`, (await p.evaluate(SEEN, last)).focusPiece === last);
    }
    errors.push(...s.errors);
    await s.browser.close();
  }

  check('no console errors', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
