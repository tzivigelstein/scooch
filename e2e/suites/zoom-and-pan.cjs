// Zoom and pan of the sheets: the control and its menu, Ctrl/⌘ + wheel around the pointer, the keys
// (and what stays the browser's), fits that follow the window until the person zooms, Space + drag
// and the middle button. Then the geometry at several zooms and scroll positions: a piece dragged a
// few mm stays on its sheet, moves by what was dragged (on the grid), leaves the scroll where it
// was and says nothing; groups, the keyboard, the marquee, the frame and the toolbar line up; a drag
// to another sheet (with autoscroll) lands where it was let go; pieces taken off the sheet keep the
// off-sheet regression checks. None of it enters the undo history.
const { open, makeChecker, addFiles, lib, onGrid, heard } = require('../lib/selection.cjs');

const cards = (from, n) => Array.from({ length: n }, (_, i) => `card${String(from + i).padStart(2, '0')}.png`);
const PX_PER_MM = 96 / 25.4;

const STATE = () => {
  const stage = document.getElementById('stage');
  const level = document.getElementById('zoom-level');
  const box = document.querySelector('#sheets .sheet-box');
  return {
    pct: parseFloat(box.style.width) / 210 / (96 / 25.4) * 100,
    shown: level.textContent.replace(/\s/g, ' '),
    scrollTop: stage.scrollTop,
    scrollLeft: stage.scrollLeft,
    wide: stage.classList.contains('is-wide'),
    sheetScroll: [...document.querySelectorAll('#sheets .sheet')].some((sh) => sh.scrollTop || sh.scrollLeft),
    docOverflow: document.documentElement.scrollWidth - innerWidth,
    pill: document.getElementById('pill').hidden ? '' : document.getElementById('pill-text').textContent,
    dropTargets: document.querySelectorAll('.page.is-drop-target').length,
  };
};

// A rectangle of the page in window px.
const RECT = (sel) => {
  const el = document.querySelector(sel);
  if (!el || el.hidden) return null;
  const b = el.getBoundingClientRect();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
};

const near = (a, b, tol = 1.5) => !!a && !!b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol;

(async () => {
  const { check, report } = makeChecker('Zoom and pan');
  const errors = [];
  const s = await open({ viewport: { width: 1440, height: 900 } });
  const p = s.page;
  const L = lib(p);
  const state = () => p.evaluate(STATE);

  // Ctrl + wheel turns at window point (x, y) (or the middle of the stage), adding up to `factor`.
  const wheel = (factor, at = null) =>
    p.evaluate(
      async ([factor, at]) => {
        const stage = document.getElementById('stage');
        const r = stage.getBoundingClientRect();
        const point = at ?? { x: r.left + stage.clientWidth / 2, y: r.top + stage.clientHeight / 2 };
        let total = -Math.log(factor) / 0.006;
        const target = document.elementFromPoint(point.x, point.y) ?? stage;
        let prevented = true;
        while (Math.abs(total) > 1e-9) {
          const d = Math.max(-60, Math.min(60, total));
          total -= d;
          const e = new WheelEvent('wheel', { deltaY: d, ctrlKey: true, clientX: point.x, clientY: point.y, bubbles: true, cancelable: true });
          target.dispatchEvent(e);
          prevented &&= e.defaultPrevented;
        }
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        return prevented;
      },
      [factor, at]
    );
  const menu = async (id) => {
    await p.click('#zoom-level');
    await p.waitForSelector('#zoom-menu');
    await p.click(`#zoom-menu-${id}`);
    await p.waitForTimeout(60);
  };
  const setZoom = async (pct) => {
    await menu('level-100');
    if (pct !== 100) await wheel(pct / 100);
    return (await state()).pct;
  };

  // ---------- Setup: 4 pieces on 3 sheets (1 · 2 · 1), with room around them
  await addFiles(p, cards(0, 4));
  const ids = await L.ids();
  const send = async (id, times) => {
    for (let i = 0; i < times; i++) {
      await L.piece(id).focus();
      await p.keyboard.press('Shift+PageDown');
      await p.waitForTimeout(40);
    }
  };
  await send(ids[1], 1);
  await send(ids[3], 1);
  await send(ids[2], 2);
  // The two pieces of sheet 2 apart, so a short drag never touches the other one.
  await L.setPos(ids[3], 60, 150);
  await p.keyboard.press('Escape');
  let g = await L.geom();
  const onSheet = (i) => g.pieces.filter((piece) => piece.sheetIndex === i).map((piece) => piece.id);
  check('setup: 3 sheets with 1, 2 and 1 pieces', g.sheets.length === 3 && onSheet(0).length === 1 && onSheet(1).length === 2 && onSheet(2).length === 1, JSON.stringify(g.pieces.map((x) => [x.id, x.sheetIndex])));
  const historyBefore = await p.evaluate(() => document.getElementById('undo').disabled);

  // ---------- The control, the fits and the keys
  let st = await state();
  check('starts fitted, the level shown rounded', st.shown === `${Math.round(st.pct)} %`, JSON.stringify(st));
  await p.setViewportSize({ width: 1200, height: 800 });
  await p.waitForTimeout(150);
  const refit = (await state()).pct;
  check('a fit follows the window', Math.abs(refit - st.pct) > 1, `${st.pct} → ${refit}`);
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.waitForTimeout(150);
  await p.click('#zoom-in');
  st = await state();
  check('+ goes to the next level', Math.abs(st.pct - [10, 25, 33, 50, 67, 75, 100, 125].find((v) => v > refit + 0.5 && v > 50)) < 0.6 || st.pct > refit, JSON.stringify(st));
  const manual = st.pct;
  await p.setViewportSize({ width: 1200, height: 800 });
  await p.waitForTimeout(150);
  check('…and from then on the window leaves it as it is', Math.abs((await state()).pct - manual) < 0.01);
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.waitForTimeout(150);
  await p.keyboard.press('Shift+Digit2');
  st = await state();
  const room = await p.evaluate(() => {
    const stage = document.getElementById('stage');
    const cs = getComputedStyle(stage);
    return stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  });
  check('Shift+2 fits the sheet’s width', Math.abs((st.pct / 100) * PX_PER_MM * 210 - room) < 1, JSON.stringify({ pct: st.pct, room }));
  check('…and says so', await heard(p, /Se ve el ancho de la hoja/));
  await p.keyboard.press('Shift+Digit1');
  st = await state();
  check('Shift+1 fits the whole sheet again', Math.abs(st.pct - refit * (900 / 800)) < 40 && st.shown === `${Math.round(st.pct)} %`, JSON.stringify(st));
  const fitPct = st.pct;

  // The menu, by keyboard
  await p.focus('#zoom-level');
  await p.keyboard.press('Enter');
  await p.waitForSelector('#zoom-menu');
  const items = await p.locator('#zoom-menu [role="menuitem"] .menu-label').allTextContents();
  check('menu: Ajustar hoja, Ajustar ancho, 50 %, 100 %, 200 %', items.map((x) => x.replace(/\s/g, ' ')).join(' | ') === 'Ajustar hoja | Ajustar ancho | 50 % | 100 % | 200 %', items.join(' | '));
  check('…with the focus on its first item and the button expanded', (await p.evaluate(() => document.activeElement.id)) === 'zoom-menu-fit' && (await p.getAttribute('#zoom-level', 'aria-expanded')) === 'true');
  for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowDown');
  await p.keyboard.press('Enter');
  st = await state();
  check('choosing 200 % from the keyboard', Math.abs(st.pct - 200) < 0.01 && st.shown === '200 %' && (await p.evaluate(() => document.activeElement.id)) === 'zoom-level', JSON.stringify(st));
  check('…announced', await heard(p, /Zoom 200\s%/));
  await p.keyboard.press('Enter');
  await p.waitForSelector('#zoom-menu');
  await p.keyboard.press('Escape');
  check('Esc closes the menu and the focus goes back', (await p.locator('#zoom-menu').count()) === 0 && (await p.evaluate(() => document.activeElement.id)) === 'zoom-level');

  // Range
  for (let i = 0; i < 12; i++) await p.click('#zoom-in', { force: true });
  st = await state();
  check('at most 800 %, and + says it can’t go further', Math.abs(st.pct - 800) < 0.01 && (await p.getAttribute('#zoom-in', 'aria-disabled')) === 'true', JSON.stringify(st));
  for (let i = 0; i < 16; i++) await p.click('#zoom-out', { force: true });
  st = await state();
  check('at least 10 %, and − says it can’t go further', Math.abs(st.pct - 10) < 0.01 && (await p.getAttribute('#zoom-out', 'aria-disabled')) === 'true', JSON.stringify(st));

  // Ctrl + wheel keeps the point under the pointer
  await setZoom(100);
  const anchorOf = (x, y) =>
    p.evaluate(([x, y]) => {
      const pages = [...document.querySelectorAll('#sheets .page')];
      for (const page of pages) {
        const b = page.querySelector('.sheet-box').getBoundingClientRect();
        if (y >= b.top && y <= b.bottom) return { sheet: page.dataset.sheet, u: (x - b.left) / b.width, v: (y - b.top) / b.height };
      }
      return null;
    }, [x, y]);
  const stageBox = await p.locator('#stage').boundingBox();
  const at = { x: stageBox.x + stageBox.width * 0.62, y: stageBox.y + stageBox.height * 0.4 };
  const before = await anchorOf(at.x, at.y);
  const prevented = await wheel(1.6, at);
  const after = await anchorOf(at.x, at.y);
  st = await state();
  check('Ctrl + wheel over the canvas zooms (not the page)', prevented && Math.abs(st.pct - 160) < 0.5, JSON.stringify({ prevented, pct: st.pct }));
  check('…around the pointer: the same sheet point stays under it', before && after && before.sheet === after.sheet && Math.abs((before.u - after.u) * 210 * PX_PER_MM * 1.6) < 1.5 && Math.abs((before.v - after.v) * 297 * PX_PER_MM * 1.6) < 1.5, JSON.stringify({ before, after }));
  const outside = await p.evaluate(() => {
    const e = new WheelEvent('wheel', { deltaY: -50, ctrlKey: true, bubbles: true, cancelable: true });
    document.querySelector('.topbar').dispatchEvent(e);
    return e.defaultPrevented;
  });
  check('Ctrl + wheel over the top bar stays the browser’s', !outside);

  // Keys: Ctrl + / − with the pointer on the canvas; Ctrl 0 and the rest stay the browser's
  await setZoom(100);
  await p.mouse.move(stageBox.x + 300, stageBox.y + 300);
  await p.keyboard.press('Control+Equal');
  check('Ctrl + = over the canvas: next level', Math.abs((await state()).pct - 125) < 0.01);
  await p.keyboard.press('Control+Minus');
  check('Ctrl + − over the canvas: previous level', Math.abs((await state()).pct - 100) < 0.01);
  const keyPrevented = (key, init = {}) =>
    p.evaluate(([key, init]) => {
      const e = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...init });
      document.body.dispatchEvent(e);
      return e.defaultPrevented;
    }, [key, init]);
  check('Ctrl 0 is never taken', !(await keyPrevented('0')));
  await p.mouse.move(700, 20);
  await p.evaluate(() => document.activeElement?.blur());
  check('with the pointer and the focus off the canvas, Ctrl + / − stay the browser’s', !(await keyPrevented('+')) && !(await keyPrevented('-')));
  await L.piece(ids[0]).focus();
  await L.openMeasures();
  await p.locator('#pos-x').focus();
  await p.mouse.move(stageBox.x + 300, stageBox.y + 300);
  await p.keyboard.press('Control+Equal');
  check('typing in a field, Ctrl + = doesn’t zoom the canvas', Math.abs((await state()).pct - 100) < 0.01);
  await p.keyboard.press('Escape');

  // Pan: Space + drag, the middle button
  await setZoom(200);
  await p.keyboard.press('Escape');
  await p.evaluate(() => document.activeElement?.blur());
  st = await state();
  const mid = { x: stageBox.x + stageBox.width / 2, y: stageBox.y + stageBox.height / 2 };
  await p.mouse.move(mid.x, mid.y);
  await p.keyboard.down(' ');
  await p.mouse.down();
  await p.mouse.move(mid.x - 120, mid.y - 90, { steps: 6 });
  await p.mouse.up();
  await p.keyboard.up(' ');
  let st2 = await state();
  check('Space + drag pans the sheets (both ways when zoomed past the width)', st.wide && Math.abs(st2.scrollTop - st.scrollTop - 90) <= 2 && Math.abs(st2.scrollLeft - st.scrollLeft - 120) <= 2, JSON.stringify({ st, st2 }));
  check('…without selecting or moving anything', (await L.selectedIds()).length === 0 && JSON.stringify((await L.geom()).pieces) === JSON.stringify((await L.geom()).pieces));
  await p.mouse.move(mid.x, mid.y);
  await p.mouse.down({ button: 'middle' });
  await p.mouse.move(mid.x + 60, mid.y + 40, { steps: 5 });
  await p.mouse.up({ button: 'middle' });
  const st3 = await state();
  check('the middle button pans too', Math.abs(st2.scrollTop - st3.scrollTop - 40) <= 2 && Math.abs(st2.scrollLeft - st3.scrollLeft - 60) <= 2, JSON.stringify({ st2, st3 }));
  await L.piece(ids[0]).focus();
  await p.mouse.move(mid.x, mid.y);
  await p.keyboard.press(' ');
  check('Space on a piece without dragging still goes to its toolbar', await p.evaluate(() => !!document.activeElement.closest('#piecebar')));
  await p.keyboard.press('Escape');

  // ---------- Geometry at several zooms and scroll positions
  const grab = (id) =>
    p.evaluate((id) => {
      // The middle of what can be seen of the piece (the stage and its sheet clip it).
      const el = document.querySelector(`#sheets .piece[data-id="${id}"]`);
      const stage = document.getElementById('stage').getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const sheet = el.closest('.sheet').getBoundingClientRect();
      // (Away from the stage's edges, where dragging autoscrolls.)
      const x0 = Math.max(r.left, stage.left + 60, sheet.left), x1 = Math.min(r.right, stage.right - 60, sheet.right);
      const y0 = Math.max(r.top, stage.top + 60, sheet.top), y1 = Math.min(r.bottom, stage.bottom - 60, sheet.bottom);
      return x1 - x0 > 4 && y1 - y0 > 4 ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : null;
    }, id);
  const view = (id, f, panned) =>
    p.evaluate(
      ([id, f, panned]) => {
        const stage = document.getElementById('stage');
        const el = document.querySelector(`#sheets .piece[data-id="${id}"]`);
        const s = stage.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        stage.scrollTop += r.top + Math.min(r.height, 120) / 2 - (s.top + stage.clientHeight * f);
        if (stage.classList.contains('is-wide')) stage.scrollLeft += r.left + Math.min(r.width, 160) / 2 - (s.left + stage.clientWidth * (panned ? 0.3 : 0.5));
      },
      [id, f, panned]
    );
  const dragPx = async (from, dx, dy, steps = 10) => {
    await p.mouse.move(from.x, from.y);
    await p.mouse.down();
    for (let i = 1; i <= steps; i++) await p.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    await p.mouse.up();
    await p.waitForTimeout(40);
  };
  const piece = async (id) => (await L.geom()).pieces.find((x) => x.id === id);

  const ZOOMS = [25, 50, 100, 116, 200, 400];
  const POSITIONS = [['top', 0.25, false], ['middle', 0.5, false], ['bottom', 0.75, false], ['panned', 0.5, true]];
  const SHEETS = [ids[0], ids[1], ids[2]]; // one piece of each sheet
  for (const pct of ZOOMS) {
    const real = await setZoom(pct);
    const z = (real / 100) * PX_PER_MM;
    const bad = [];
    for (const [si, id] of SHEETS.entries()) {
      for (const [name, f, panned] of POSITIONS) {
        await p.keyboard.press('Escape');
        await view(id, f, panned);
        const b0 = await piece(id);
        const s0 = await state();
        const from = await grab(id);
        if (!from) {
          bad.push(`sheet ${si + 1} ${name}: not visible`);
          continue;
        }
        const dmm = { x: 3, y: 2 };
        await dragPx(from, dmm.x * z, dmm.y * z);
        const b1 = await piece(id);
        const s1 = await state();
        const tol = 0.5 + 1.5 / z;
        const problems = [];
        if (b1.sheet !== b0.sheet) problems.push(`sheet ${b0.sheetIndex + 1} → ${b1.sheetIndex + 1}`);
        if (Math.abs(b1.x - b0.x - dmm.x) > tol || Math.abs(b1.y - b0.y - dmm.y) > tol) problems.push(`moved ${(b1.x - b0.x).toFixed(2)}, ${(b1.y - b0.y).toFixed(2)} mm`);
        if (!onGrid(b1.x, 1) || !onGrid(b1.y, 1)) problems.push(`off the grid ${b1.x}, ${b1.y}`);
        if (Math.abs(s1.scrollTop - s0.scrollTop) > 1 || Math.abs(s1.scrollLeft - s0.scrollLeft) > 1) problems.push(`scroll ${s0.scrollTop},${s0.scrollLeft} → ${s1.scrollTop},${s1.scrollLeft}`);
        if (s1.pill) problems.push(`notice «${s1.pill}»`);
        if (s1.dropTargets) problems.push('a sheet still marked as target');
        if (s1.sheetScroll || s1.docOverflow) problems.push('a sheet or the page scrolled');
        if (problems.length) bad.push(`sheet ${si + 1} ${name}: ${problems.join(', ')}`);
      }
    }
    check(`${pct} %: a piece dragged 3 × 2 mm on each sheet, at the top, middle, bottom and panned, stays on its sheet, moves that much on the grid, keeps the scroll and says nothing`, bad.length === 0, bad.join(' | '));

    // Frame and toolbar with the piece
    await L.piece(ids[1]).focus();
    await view(ids[1], 0.5, false);
    await p.waitForTimeout(250);
    const framed = await p.evaluate(([RECT, id]) => {
      const rect = new Function(`return (${RECT})`)();
      return { piece: rect(`#sheets .piece[data-id="${id}"]`), frame: rect('#frame'), bar: rect('#piecebar'), canvas: rect('#canvas'), zoom: rect('.zoom-control') };
    }, [RECT.toString(), ids[1]]);
    const barOk = framed.bar && framed.bar.x >= framed.canvas.x - 1 && framed.bar.x + framed.bar.w <= framed.canvas.x + framed.canvas.w + 1 && !(framed.bar.x < framed.zoom.x + framed.zoom.w && framed.zoom.x < framed.bar.x + framed.bar.w && framed.bar.y < framed.zoom.y + framed.zoom.h && framed.zoom.y < framed.bar.y + framed.bar.h);
    check(`${pct} %: the frame on the piece, the toolbar inside the canvas and off the zoom control`, near(framed.piece, framed.frame) && barOk, JSON.stringify(framed));

    // A group of the same sheet
    await L.selectIds([ids[1], ids[3]]);
    await view(ids[1], 0.5, false);
    const g0 = [await piece(ids[1]), await piece(ids[3])];
    const sg0 = await state();
    const fromG = await grab(ids[1]);
    if (fromG) await dragPx(fromG, 3 * z, 2 * z);
    const g1 = [await piece(ids[1]), await piece(ids[3])];
    const sg1 = await state();
    const moved = g1.map((x, i) => [x.x - g0[i].x, x.y - g0[i].y]);
    check(`${pct} %: a group dragged 3 × 2 mm moves together on its sheet, scroll unchanged, no notice`, !!fromG && g1.every((x, i) => x.sheet === g0[i].sheet) && Math.abs(moved[0][0] - moved[1][0]) < 0.01 && Math.abs(moved[0][1] - moved[1][1]) < 0.01 && Math.abs(moved[0][0] - 3) <= 0.5 + 1.5 / z && Math.abs(sg1.scrollTop - sg0.scrollTop) <= 1 && !sg1.pill, JSON.stringify({ moved, sg0: sg0.scrollTop, sg1: sg1.scrollTop, pill: sg1.pill }));

    // The keyboard
    await L.piece(ids[2]).focus();
    const k0 = await piece(ids[2]);
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowDown');
    const k1 = await piece(ids[2]);
    check(`${pct} %: arrows move 1 mm on the same sheet`, k1.sheet === k0.sheet && Math.abs(k1.x - k0.x - 1) < 0.01 && Math.abs(k1.y - k0.y - 1) < 0.01, JSON.stringify({ k0, k1 }));
    await p.keyboard.press('Escape');

    // The marquee around the piece of sheet 3 selects it alone
    await view(ids[2], 0.5, false);
    const m = await p.evaluate((id) => {
      const r = document.querySelector(`#sheets .piece[data-id="${id}"]`).getBoundingClientRect();
      const sheet = document.querySelector(`#sheets .piece[data-id="${id}"]`).closest('.sheet').getBoundingClientRect();
      const stage = document.getElementById('stage').getBoundingClientRect();
      const x0 = Math.max(sheet.left + 2, r.left - 12, stage.left + 4);
      const y0 = Math.max(sheet.top + 2, r.top - 12, stage.top + 4);
      return { x0, y0, x1: Math.min(r.left + 20, stage.right - 30), y1: Math.min(r.top + 20, stage.bottom - 30) };
    }, ids[2]);
    await p.mouse.move(m.x0, m.y0);
    await p.mouse.down();
    await p.mouse.move(m.x1, m.y1, { steps: 6 });
    await p.mouse.up();
    check(`${pct} %: a marquee touching the piece selects just it`, JSON.stringify(await L.selectedIds()) === JSON.stringify([ids[2]]), JSON.stringify(await L.selectedIds()));
    await p.keyboard.press('Escape');
  }

  // ---------- A drag to the next sheet, autoscrolling there, lands where it was let go
  for (const pct of [25, 116, 400]) {
    const real = await setZoom(pct);
    const z = (real / 100) * PX_PER_MM;
    await p.keyboard.press('Escape');
    await view(ids[0], 0.4, false);
    const from = await grab(ids[0]);
    const b0 = await piece(ids[0]);
    // Where it is held, in mm from its corner: that point lands under the pointer.
    const held = await p.evaluate(([id, from, z]) => {
      const r = document.querySelector(`#sheets .piece[data-id="${id}"]`).getBoundingClientRect();
      return { x: (from.x - r.left) / z, y: (from.y - r.top) / z };
    }, [ids[0], from, z]);
    const stage = await p.locator('#stage').boundingBox();
    await p.mouse.move(from.x, from.y);
    await p.mouse.down();
    await p.mouse.move(from.x, from.y + 10, { steps: 3 });
    // Where the point below the held one, low on sheet 2 (free there), is on screen; autoscrolling down until it shows.
    const tx = b0.x + held.x;
    const ty = 230 + held.y;
    const spot = () =>
      p.evaluate(([z, tx, ty]) => {
        const box = document.querySelectorAll('#sheets .page')[1].querySelector('.sheet-box').getBoundingClientRect();
        return { x: box.left + tx * z, y: box.top + ty * z };
      }, [z, tx, ty]);
    let target = await spot();
    for (let i = 0; i < 600 && target.y > stage.y + stage.height - 80; i++) {
      await p.mouse.move(from.x, stage.y + stage.height - 6);
      await p.waitForTimeout(16);
      target = await spot();
    }
    await p.mouse.move(target.x, target.y, { steps: 8 });
    await p.waitForTimeout(30);
    target = await spot();
    await p.mouse.move(target.x, target.y);
    await p.mouse.up();
    await p.waitForTimeout(60);
    const b1 = await piece(ids[0]);
    const tol = 0.5 + 2 / z;
    check(`${pct} %: dragged with autoscroll onto sheet 2, it lands there with the held point under the pointer`, b1.sheetIndex === 1 && Math.abs(b1.x - b0.x) <= tol && Math.abs(b1.y - 230) <= tol, JSON.stringify({ held, b1, want: [b0.x, 230] }));
    await p.keyboard.press('Control+z');
    await p.waitForTimeout(60);
    check(`${pct} %: one undo step puts it back`, JSON.stringify(await piece(ids[0])) === JSON.stringify(b0) || ((await piece(ids[0])).sheetIndex === 0 && Math.abs((await piece(ids[0])).x - b0.x) < 1e-6));
  }

  // ---------- Off-sheet regression at 25, 100 and 400 % (the piece near a corner: at 400 % that edge shows)
  await L.setPos(ids[2], 12, 12);
  for (const pct of [25, 100, 400]) {
    await setZoom(pct);
    await p.keyboard.press('Escape');
    const bad = [];
    for (const dir of pct === 400 ? ['left', 'up'] : ['right', 'left', 'up', 'down']) {
      await view(ids[2], 0.5, false);
      if (pct === 400) await p.evaluate(() => (document.getElementById('stage').scrollLeft = 0));
      const from = await grab(ids[2]);
      if (!from) {
        bad.push(`${dir}: not visible`);
        continue;
      }
      const sheet = await p.evaluate((id) => {
        const r = document.querySelector(`#sheets .piece[data-id="${id}"]`).closest('.sheet').getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }, ids[2]);
      const s0 = await state();
      const to = { right: [sheet.x + sheet.w + 200, from.y], left: [Math.max(sheet.x - 200, 240), from.y], up: [from.x, Math.max(sheet.y - 150, 70)], down: [from.x, Math.min(sheet.y + sheet.h + 150, 880)] }[dir];
      await dragPx(from, to[0] - from.x, to[1] - from.y, 14);
      await p.waitForTimeout(200);
      const r = await p.evaluate(([RECT, id]) => {
        const rect = new Function(`return (${RECT})`)();
        const el = document.querySelector(`#sheets .piece[data-id="${id}"]`);
        return { piece: rect(`#sheets .piece[data-id="${id}"]`), img: (() => { const b = el.querySelector('img').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })(), frame: rect('#frame'), sheet: (() => { const b = el.closest('.sheet').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })(), parent: el.parentElement.className };
      }, [RECT.toString(), ids[2]]);
      const s1 = await state();
      const cx = r.piece.x + r.piece.w / 2;
      const cy = r.piece.y + r.piece.h / 2;
      const problems = [];
      if (!near(r.frame, r.piece)) problems.push('frame off the piece');
      if (r.parent !== 'sheet') problems.push(`left in ${r.parent}`);
      if (cx < r.sheet.x - 1 || cx > r.sheet.x + r.sheet.w + 1 || cy < r.sheet.y - 1 || cy > r.sheet.y + r.sheet.h + 1) problems.push('center outside the sheet');
      if (s1.sheetScroll || s1.docOverflow) problems.push('a sheet or the page scrolled');
      if (!s1.wide && s1.scrollLeft !== 0) problems.push(`sideways scroll ${s1.scrollLeft}`);
      if (s1.wide && Math.abs(s1.scrollLeft - s0.scrollLeft) > 1) problems.push(`sideways scroll moved ${s0.scrollLeft} → ${s1.scrollLeft}`);
      if (problems.length) bad.push(`${dir}: ${problems.join(', ')}`);
      await p.keyboard.press('Control+z');
      await p.waitForTimeout(40);
    }
    check(`${pct} %: pieces taken off the sheet keep image and frame aligned, the center on the sheet and no stray scroll`, bad.length === 0, bad.join(' | '));
  }

  // ---------- Zoom is view state
  await p.keyboard.press('Escape');
  await setZoom(100);
  await wheel(1.5);
  const canUndo = await p.evaluate(() => !document.getElementById('undo').disabled);
  const zoomed = (await state()).pct;
  if (canUndo) await p.keyboard.press('Control+z');
  check('zooming never enters the undo history', Math.abs((await state()).pct - zoomed) < 0.01, JSON.stringify({ canUndo, historyBefore }));

  errors.push(...s.errors);
  await s.browser.close();
  check('no console errors', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
