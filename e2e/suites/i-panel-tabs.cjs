// The properties panel's tabs (Pieza and Hoja): tab semantics, following the selection by mouse
// and keyboard, the person's choice sticking, M and H, no focus theft, collapsed sections kept,
// and the same tabs in the drawer (1024) and the bottom sheet (390).
const { open, makeChecker, helpers, addFiles, heard } = require('../lib/sheets.cjs');

const STATE = () => {
  const tab = (name) => document.getElementById(`props-tab-${name}`);
  const panel = (name) => document.getElementById(`props-${name}`);
  return {
    tablist: document.querySelector('#props-panel [role="tablist"]')?.getAttribute('aria-label'),
    selected: ['piece', 'sheet'].filter((name) => tab(name).getAttribute('aria-selected') === 'true'),
    tabStops: ['piece', 'sheet'].filter((name) => tab(name).tabIndex === 0),
    controls: ['piece', 'sheet'].map((name) => tab(name).getAttribute('aria-controls') === panel(name).id && panel(name).getAttribute('aria-labelledby') === tab(name).id),
    hidden: { piece: panel('piece').hidden, sheet: panel('sheet').hidden },
    active: document.activeElement?.id || document.activeElement?.className,
    activePiece: document.activeElement?.classList.contains('piece') ?? false,
    emptyOnly: (() => {
      const p = panel('piece');
      const shown = [...p.querySelectorAll('*')].filter((el) => el.getClientRects().length && !el.closest('[hidden]'));
      return shown.every((el) => el.closest('#piece-empty') || el.id === 'section-piece');
    })(),
  };
};

(async () => {
  const { check, report } = makeChecker('Properties panel tabs');
  const errors = [];

  // ---------- 1440: semantics, following the selection, override, M/H, focus, sections
  {
    const s = await open();
    const p = s.page;
    const h = helpers(p);
    const st = () => p.evaluate(STATE);
    await addFiles(p, ['small.jpg', 'square.webp', 'tall.png']);
    await p.keyboard.press('Escape');
    await p.mouse.click(5, 880);
    let x = await st();
    check('tablist named «Propiedades» with two tabs wired to their panels', x.tablist === 'Propiedades' && x.controls.every(Boolean), JSON.stringify(x));
    check('nothing selected: Hoja is open, one tab stop', x.selected.join() === 'sheet' && x.tabStops.join() === 'sheet' && x.hidden.piece && !x.hidden.sheet, JSON.stringify(x));
    check('Hoja says its settings apply to every sheet', (await p.textContent('#props-sheet .tab-note')) === 'Se aplica a todas las hojas');

    // Mouse: selecting a piece shows Pieza, without moving the focus away from the piece.
    await h.clickPiece(0);
    x = await st();
    check('click a piece: Pieza opens, the focus stays on the piece', x.selected.join() === 'piece' && x.activePiece && !x.hidden.piece && x.hidden.sheet, JSON.stringify(x));
    // Override: Hoja while a piece is selected sticks through edits.
    await p.click('#props-tab-sheet');
    await p.fill('#margin', '12');
    await p.keyboard.press('Enter');
    await p.keyboard.press('Control+z');
    x = await st();
    check('choosing Hoja with a piece selected sticks (edit + undo don’t switch)', x.selected.join() === 'sheet', JSON.stringify(x));
    await h.clickPiece(0);
    check('clicking the same piece again doesn’t switch back', (await st()).selected.join() === 'sheet');
    await h.clickPiece(1);
    check('selecting another piece switches to Pieza', (await st()).selected.join() === 'piece');
    // Clearing the selection by clicking an empty spot of the sheet → Hoja.
    const sheet = await p.locator('.sheet').first().boundingBox();
    await p.mouse.click(sheet.x + sheet.width - 8, sheet.y + sheet.height - 8);
    x = await st();
    check('click an empty spot of the sheet: Hoja opens', x.selected.join() === 'sheet' && x.hidden.piece, JSON.stringify(x));
    await h.clickPiece(1);
    await p.mouse.click(sheet.x - 60, sheet.y + 200);
    check('click the canvas background: Hoja opens', (await st()).selected.join() === 'sheet');
    // The sheet's title is a button to its settings (mouse: the lowest piece, so its toolbar
    // isn't over the title; keyboard: Enter and Space), and the focus stays on it.
    const lowest = await p.evaluate(() => [...document.querySelectorAll('#sheets .piece')].sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0].dataset.id);
    await p.locator(`#sheets .piece[data-id="${lowest}"]`).click();
    await p.locator('.page-label').click();
    x = await st();
    check('click the sheet’s title: Hoja, nothing selected, the focus on the title', x.selected.join() === 'sheet' && (await p.locator('#sheets .piece.is-selected').count()) === 0 && x.active === 'page-label', JSON.stringify(x));
    check('the title is a button named «Hoja 1 de 1», with the tooltip and a description', (await p.evaluate(() => {
      const b = document.querySelector('.page-label');
      return b.tagName === 'BUTTON' && b.textContent === 'Hoja 1 de 1' && b.dataset.tip === 'Configurar hoja' && document.getElementById(b.getAttribute('aria-describedby'))?.textContent.length > 0;
    })));
    for (const key of ['Enter', ' ']) {
      await p.locator('#sheets .piece').first().focus();
      await p.keyboard.press('Shift+Tab');
      while (!(await p.evaluate(() => document.activeElement.classList.contains('page-label')))) await p.keyboard.press('Shift+Tab');
      await p.keyboard.press(key === ' ' ? 'Space' : key);
      x = await st();
      check(`${key === ' ' ? 'Space' : key} on the title (reached with Shift+Tab before the pieces): Hoja, nothing selected, focus stays`, x.selected.join() === 'sheet' && (await p.locator('#sheets .piece.is-selected').count()) === 0 && x.active === 'page-label', JSON.stringify(x));
    }

    // Keyboard: Tab onto a piece selects it and switches (announced); Esc clears and switches back.
    await p.locator('#sheets .piece').first().focus();
    x = await st();
    check('focusing a piece (keyboard): Pieza, focus untouched', x.selected.join() === 'piece' && x.activePiece, JSON.stringify(x));
    await p.keyboard.press('Escape');
    x = await st();
    check('Esc on the piece: Hoja, the focus goes to the sheet as before', x.selected.join() === 'sheet' && /sheet/.test(x.active), JSON.stringify(x));
    check('the switch caused by the keyboard is announced', await heard(p, /Propiedades muestra la hoja/));

    // Tab semantics: arrows move between tabs (and show them), Home/End.
    await p.locator('#props-tab-sheet').focus();
    await p.keyboard.press('ArrowLeft');
    x = await st();
    check('← on the tabs: Pieza, with the focus on its tab', x.selected.join() === 'piece' && x.active === 'props-tab-piece' && x.tabStops.join() === 'piece');
    check('Pieza with nothing selected shows only the hint', x.emptyOnly && (await p.isVisible('#piece-empty')), JSON.stringify(x));
    await p.keyboard.press('End');
    check('End: Hoja', (await st()).selected.join() === 'sheet' && (await st()).active === 'props-tab-sheet');
    await p.keyboard.press('Home');
    check('Home: Pieza', (await st()).selected.join() === 'piece');
    await p.keyboard.press('ArrowRight');
    check('→ wraps to Hoja', (await st()).selected.join() === 'sheet');

    // Collapsed sections survive switching tabs.
    await p.click('[aria-controls="section-arrange"]');
    await p.click('#props-tab-piece');
    await p.click('#props-tab-sheet');
    check('a collapsed section stays collapsed across tab switches', (await p.getAttribute('[aria-controls="section-arrange"]', 'aria-expanded')) === 'false');
    await p.click('[aria-controls="section-arrange"]');

    // M and H.
    await p.locator('#sheets .piece').first().focus();
    await p.click('#props-tab-sheet');
    await p.locator('#sheets .piece').first().focus();
    await p.keyboard.press('m');
    x = await st();
    check('M: Pieza, with the focus on its tab', x.selected.join() === 'piece' && x.active === 'props-tab-piece', JSON.stringify(x));
    await p.keyboard.press('h');
    x = await st();
    check('H from the tab: Hoja, with the focus on its tab', x.selected.join() === 'sheet' && x.active === 'props-tab-sheet', JSON.stringify(x));
    await p.keyboard.press('Tab');
    check('Tab from the tab: its first control (the «Papel» header)', await p.evaluate(() => document.activeElement.getAttribute('aria-controls') === 'section-sheet'));
    await p.keyboard.press('Tab');
    check('…then the paper', (await st()).active === 'paper');
    await p.keyboard.press('Escape');
    check('Esc from a Hoja control: back to the selected piece', await p.evaluate(() => document.activeElement.classList.contains('piece') && document.activeElement.classList.contains('is-selected')));
    await p.keyboard.press('Escape');
    await p.keyboard.press('m');
    x = await st();
    check('M with nothing selected: Pieza with its hint, the focus on its tab', x.selected.join() === 'piece' && x.emptyOnly && x.active === 'props-tab-piece', JSON.stringify(x));
    await p.keyboard.press('Escape');
    check('Esc from the tab with nothing selected: back to the sheet', await p.evaluate(() => !!document.activeElement.closest('#sheets')));
    check('tabs show their shortcut in the tooltip and aria-keyshortcuts', (await p.getAttribute('#props-tab-piece', 'aria-keyshortcuts')) === 'M' && (await p.getAttribute('#props-tab-sheet', 'aria-keyshortcuts')) === 'H' && (await p.getAttribute('#props-tab-piece', 'data-kbd')) === 'M');

    // No focus theft: typing in a Hoja field while the selection changes keeps the field.
    await h.clickPiece(0);
    await p.click('#props-tab-sheet');
    await p.focus('#gap');
    await p.evaluate(() => document.getElementById('undo').click());
    check('a selection change while typing in Hoja doesn’t hide the field', (await st()).active === 'gap');
    // Selecting several (Ctrl+A, the marquee) shows Pieza with the group.
    await p.locator('#sheets .piece').first().focus();
    await p.keyboard.press('Control+a');
    x = await st();
    check('Ctrl+A: Pieza with «3 piezas»', x.selected.join() === 'piece' && (await p.textContent('#piece-title')) === '3 piezas');
    const history = await p.evaluate(() => [document.getElementById('undo').disabled, document.getElementById('redo').disabled].join());
    await p.click('#props-tab-sheet');
    await p.click('#props-tab-piece');
    check('switching tabs adds nothing to the history', (await p.evaluate(() => [document.getElementById('undo').disabled, document.getElementById('redo').disabled].join())) === history);
    errors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 1024 and 390: the same tabs in the drawer / bottom sheet
  for (const [w, hgt] of [[1024, 768], [390, 844]]) {
    const s = await open({ viewport: { width: w, height: hgt } });
    const p = s.page;
    const h = helpers(p);
    await addFiles(p, ['small.jpg', 'square.webp']);
    await p.keyboard.press('Escape');
    await p.locator('#sheets .piece').first().focus();
    if (w < 800) await p.click('#props-toggle');
    let x = await p.evaluate(STATE);
    check(`${w}: Propiedades opens on the contextual tab (Pieza)`, x.selected.join() === 'piece' && (await p.isVisible('#props-tab-piece')), JSON.stringify(x));
    if (w < 800) {
      await p.keyboard.press('Escape');
      await p.locator('#sheets .piece').first().focus();
      await p.locator('.page-label').first().click();
      check(`${w}: the sheet’s title opens Propiedades on Hoja, the focus stays on the title`, (await p.locator('#props-panel').isVisible()) && (await p.evaluate(STATE)).selected.join() === 'sheet' && (await p.evaluate(() => document.activeElement.className)) === 'page-label');
      await p.locator('#sheets .piece').first().focus();
      if (!(await p.locator('#props-panel').isVisible())) await p.click('#props-toggle');
      await p.click('#props-tab-piece');
    }
    await p.click('#props-tab-sheet');
    check(`${w}: switching to Hoja inside the panel`, (await p.isVisible('#paper')) && (await p.evaluate(STATE)).selected.join() === 'sheet');
    const tabBox = await p.locator('#props-tab-sheet').boundingBox();
    check(`${w}: tabs are touch-sized (≥ 40 px)`, tabBox.height >= 40 && tabBox.width >= 40, JSON.stringify(tabBox));
    check(`${w}: no horizontal scroll`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

    // H and M from the canvas open Propiedades where it is collapsed, with the focus on the tab.
    if (await p.locator('#props-panel.is-open').count()) {
      await p.locator('#props-tab-sheet').focus();
      await p.keyboard.press('Escape');
    }
    const piece = await p.locator('#sheets .piece').first().getAttribute('data-id');
    await p.locator('#sheets .piece').first().focus();
    await p.keyboard.press('h');
    x = await p.evaluate(STATE);
    check(`${w}: H shows Propiedades on Hoja with the focus on its tab`, (await p.locator('#props-panel').isVisible()) && x.selected.join() === 'sheet' && x.active === 'props-tab-sheet', JSON.stringify(x));
    await p.keyboard.press('m');
    x = await p.evaluate(STATE);
    check(`${w}: then M: Pieza, the focus on its tab`, x.selected.join() === 'piece' && x.active === 'props-tab-piece', JSON.stringify(x));
    await p.keyboard.press('Tab');
    check(`${w}: Tab: the first field`, (await p.evaluate(STATE)).active === 'pos-x');
    await p.keyboard.press('Escape');
    const back = await p.evaluate(() => document.activeElement.dataset.id ?? null);
    check(`${w}: Esc from the field goes back to the piece${w < 800 ? ' (and closes the sheet)' : ''}`, back === piece && (w >= 800 || !(await p.locator('#props-panel').isVisible())), JSON.stringify({ back, piece }));
    errors.push(...s.errors);
    await s.browser.close();
  }

  check('no console errors', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
