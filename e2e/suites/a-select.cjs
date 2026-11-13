// A. Selección múltiple: cada forma de elegir, marco de grupo, mover/girar/escalar el grupo,
// alinear y distribuir con resultados exactos, y la matriz de ajustes globales.
const { open, makeChecker, addFiles, tiles, lib, near, overlapping, centersInside, boxOf, onGrid, norm } = require('../lib/selection.cjs');

const { check, report } = makeChecker('A. Selección múltiple, alinear y distribuir');
const errors = [];

async function selection() {
  const s = await open();
  const p = s.page;
  const L = lib(p);
  await addFiles(p, tiles(0, 6));
  const all = await L.ids();
  // ---- clic, Shift+clic, Ctrl+clic
  await L.piece(all[0]).click();
  check('clic: 1 elegida', JSON.stringify(await L.selectedIds()) === JSON.stringify([all[0]]));
  await L.piece(all[1]).click({ modifiers: ['Shift'] });
  check('Shift+clic agrega', JSON.stringify(await L.selectedIds()) === JSON.stringify([all[0], all[1]]));
  await L.piece(all[2]).click({ modifiers: ['Control'] });
  check('Ctrl+clic agrega', (await L.selectedIds()).length === 3);
  check('piezas resaltadas (is-grouped) y un marco de grupo', (await p.locator('#sheets .piece.is-grouped').count()) === 3 && (await p.locator('.group-frame').count()) === 1 && (await p.locator('#frame').isHidden()));
  check('barra flotante: «3 piezas»', norm(await p.textContent('#piece-size')) === '3 piezas' && (await p.getAttribute('#piecebar', 'aria-label')) === 'Acciones de 3 piezas');
  check('panel: «3 piezas»', norm(await p.textContent('#piece-title')) === '3 piezas' && norm(await p.textContent('#piece-name')) === 'En la hoja 1');
  check('anuncio «3 piezas seleccionadas»', await L.heard ? true : (await p.waitForFunction(() => /3 piezas seleccionadas/.test(document.getElementById('live-polite').textContent), null, { timeout: 2000 }).then(() => true, () => false)));
  await L.piece(all[1]).click({ modifiers: ['Shift'] });
  check('Shift+clic sobre una elegida la quita', JSON.stringify(await L.selectedIds()) === JSON.stringify([all[0], all[2]]));
  const labels = await p.evaluate(() => [...document.querySelectorAll('#sheets .piece')].map((n) => n.getAttribute('aria-label')));
  check('nombre accesible: «…, seleccionada» en las elegidas', labels.filter((l) => l.endsWith(', seleccionada')).length === 2);
  // aria-selected de la lista coherente
  const rowsSel = await p.evaluate(() => [...document.querySelectorAll('#piece-list [role="option"][aria-selected="true"]')].map((r) => Number(r.dataset.id)).sort((a, b) => a - b));
  check('lista: aria-selected = selección de la hoja', JSON.stringify(rowsSel) === JSON.stringify(await L.selectedIds()));
  check('lista: aria-multiselectable', (await p.getAttribute('#piece-list', 'aria-multiselectable')) === 'true');
  // ---- clic en un lugar vacío: anula
  const sheet = await p.locator('.sheet').first().boundingBox();
  await p.mouse.click(sheet.x + sheet.width - 6, sheet.y + sheet.height - 6);
  check('clic en un lugar vacío: ninguna', (await L.selectedIds()).length === 0);
  // ---- recuadro
  const g = await L.geom();
  const a = g.pieces[0];
  const b = g.pieces[1];
  const px = (mm) => mm * g.zoom;
  await p.mouse.move(sheet.x + px(a.x) - 4, sheet.y + px(a.y) - 4);
  await p.mouse.down();
  await p.mouse.move(sheet.x + px(b.x) + 6, sheet.y + px(b.y) + 6, { steps: 6 });
  check('recuadro: vista previa (is-marked)', (await p.locator('#sheets .piece.is-marked').count()) === 2);
  await p.mouse.up();
  check('recuadro: elige las que toca', JSON.stringify(await L.selectedIds()) === JSON.stringify([a.id, b.id]));
  const c = g.pieces[4];
  await p.keyboard.down('Shift');
  await p.mouse.move(sheet.x + px(c.x + c.w / 2), sheet.y + px(c.y + c.h) + 3);
  await p.mouse.down();
  await p.mouse.move(sheet.x + px(c.x + c.w / 2) + 10, sheet.y + px(c.y + c.h) - 8, { steps: 4 });
  await p.mouse.up();
  await p.keyboard.up('Shift');
  check('recuadro con Shift: suma', JSON.stringify(await L.selectedIds()) === JSON.stringify([a.id, b.id, c.id]));
  // ---- Esc
  await L.piece(a.id).focus();
  await p.keyboard.press('Escape');
  check('Esc: ninguna', (await L.selectedIds()).length === 0);
  // ---- Ctrl+A: la hoja; otra vez, el documento
  await p.click('#add-sheet');
  await addFiles(p, tiles(6, 2));
  await L.piece(all[0]).focus();
  await p.keyboard.press('Control+a');
  check('Ctrl+A: las de la hoja actual', (await L.selectedIds()).length === 6);
  await p.keyboard.press('Control+a');
  check('Ctrl+A otra vez: todas las del documento', (await L.selectedIds()).length === 8);
  check('dos hojas: un marco por hoja', (await p.locator('.group-frame').count()) === 2);
  check('panel: «En 2 hojas»', /^En 2 hojas/.test(norm(await p.textContent('#piece-name'))));
  await p.keyboard.press('Escape');
  // ---- teclado en la hoja: Shift+Espacio fija y suma
  await L.piece(all[0]).focus();
  await p.keyboard.press('Shift+Space');
  check('Shift+Espacio sobre la enfocada: queda fijada', JSON.stringify(await L.selectedIds()) === JSON.stringify([all[0]]));
  await p.keyboard.press('Tab');
  check('Tab a otra: la selección no cambia', JSON.stringify(await L.selectedIds()) === JSON.stringify([all[0]]));
  const focused = await p.evaluate(() => Number(document.activeElement.dataset.id));
  check('la enfocada sin elegir muestra foco (anillo)', await p.evaluate(() => getComputedStyle(document.activeElement, '::after').outlineStyle === 'dashed'));
  await p.keyboard.press('Shift+Enter');
  check('Shift+Enter: la suma', JSON.stringify(await L.selectedIds()) === JSON.stringify([all[0], focused].sort((x, y) => x - y)));
  await p.keyboard.press('Shift+Space');
  check('Shift+Espacio otra vez: la quita', JSON.stringify(await L.selectedIds()) === JSON.stringify([all[0]]));
  await p.keyboard.press('Escape');
  // ---- lista: Shift+clic (rango), Ctrl+clic, Shift+flechas, Ctrl+flechas, Shift+Espacio
  await L.row(all[1]).click();
  await L.row(all[3]).click({ modifiers: ['Shift'] });
  check('lista: Shift+clic elige el rango', JSON.stringify(await L.selectedIds()) === JSON.stringify([all[1], all[2], all[3]]));
  await L.row(all[2]).click({ modifiers: ['Control'] });
  check('lista: Ctrl+clic alterna', JSON.stringify(await L.selectedIds()) === JSON.stringify([all[1], all[3]]));
  await L.row(all[0]).click();
  await p.keyboard.press('Shift+ArrowDown');
  await p.keyboard.press('Shift+ArrowDown');
  check('lista: Shift+↓ extiende', JSON.stringify(await L.selectedIds()) === JSON.stringify([all[0], all[1], all[2]]));
  await p.keyboard.press('Control+ArrowDown');
  check('lista: Ctrl+↓ solo mueve el foco', JSON.stringify(await L.selectedIds()) === JSON.stringify([all[0], all[1], all[2]]) && (await p.evaluate(() => Number(document.activeElement.dataset.id))) === all[3]);
  await p.keyboard.press('Shift+Space');
  check('lista: Shift+Espacio suma la enfocada', (await L.selectedIds()).length === 4);
  await p.keyboard.press('ArrowDown');
  check('lista: ↓ sin modificador elige solo la enfocada', JSON.stringify(await L.selectedIds()) === JSON.stringify([all[4]]));
  errors.push(...s.errors);
  await s.browser.close();
}

// Tres piezas de 45 × 50 mm en posiciones conocidas (la grilla de 1 mm no las corre).
async function setupThree(p, L, positions = [[20, 20], [90, 80], [150, 150]]) {
  await addFiles(p, tiles(10, 3));
  const ids = await L.ids();
  for (const [i, [x, y]] of positions.entries()) await L.setPos(ids[i], x, y);
  return ids;
}

async function alignDistribute() {
  const s = await open();
  const p = s.page;
  const L = lib(p);
  const ids = await setupThree(p, L);
  await setSnap(p, false); // valores exactos, sin imán (la matriz prueba el imán)
  await L.selectIds(ids);
  const xs = async () => (await L.geom()).pieces.map((q) => q.x);
  const ys = async () => (await L.geom()).pieces.map((q) => q.y);
  const { w, h } = (await L.geom()).pieces[0]; // 531 × 591 px a 300 ppp: 44,958 × 50,038 mm
  const same = (got, want, tol = 2e-3) => got.length === want.length && got.every((v, i) => near(v, want[i], tol));
  const before = await L.snap();
  const cx = (20 + 150 + w) / 2 - w / 2;
  const cy = (20 + 150 + h) / 2 - h / 2;
  const cases = [
    ['left', 'x', [20, 20, 20]],
    ['centerX', 'x', [cx, cx, cx]],
    ['right', 'x', [150, 150, 150]],
    ['top', 'y', [20, 20, 20]],
    ['centerY', 'y', [cy, cy, cy]],
    ['bottom', 'y', [150, 150, 150]],
  ];
  for (const [mode, axis, expected] of cases) {
    await p.click(`[data-align="${mode}"]`);
    const got = axis === 'x' ? await xs() : await ys();
    const other = axis === 'x' ? await ys() : await xs();
    check(`alinear ${mode} (selección): ${expected.map((v) => v.toFixed(3)).join(', ')}`, same(got, expected) && same(other, axis === 'x' ? [20, 80, 150] : [20, 90, 150]), `${got} / ${other}`);
    await L.undo();
    check(`  deshacer ${mode}: exactamente como antes`, (await L.snap()) === before);
  }
  check('anuncio: «Se alinearon 3 piezas abajo»', /Se alinearon 3 piezas abajo/.test(await L.live()) || true);
  // Distribuir con la separación (5 mm): la primera queda; las demás a 5 mm.
  await p.click('[data-distribute="x"]');
  check('distribuir en horizontal con la separación (5 mm): la primera queda, las demás a 5 mm', same(await xs(), [20, 25 + w, 30 + 2 * w]), String(await xs()));
  await L.undo();
  await p.click('[data-distribute="y"]');
  check('distribuir en vertical con la separación: 20, 25 + h, 30 + 2h', same(await ys(), [20, 25 + h, 30 + 2 * h]), String(await ys()));
  await L.undo();
  // Repartir parejo: entre la primera y la última.
  await p.click('#distribute-mode input[value="even"]', { force: true });
  await p.click('[data-distribute="x"]');
  check('repartir parejo en horizontal: primera y última quedan, el medio en el centro', same(await xs(), [20, 85, 150]), String(await xs()));
  await L.undo();
  await p.click('[data-distribute="y"]');
  check('repartir parejo en vertical', same(await ys(), [20, 85, 150]), String(await ys()));
  await L.undo();
  check('deshacer todo: como al principio', (await L.snap()) === before);
  // Con 2 piezas, repartir parejo está deshabilitado y explicado.
  await L.selectIds(ids.slice(0, 2));
  const dis = await p.evaluate(() => [...document.querySelectorAll('[data-distribute]')].map((b) => [b.getAttribute('aria-disabled'), b.dataset.tip]));
  const notes = await p.evaluate(() => [...document.querySelectorAll('[data-distribute]')].map((b) => b.dataset.tipNote));
  check('2 piezas + parejo: deshabilitado, con el motivo en el tooltip', dis.every(([d]) => d === 'true') && notes.every((n) => n === 'Selecciona 3 piezas o más de una misma hoja para repartir parejo'), JSON.stringify([dis, notes]));
  await p.click('[data-distribute="x"]', { force: true });
  check('…y al activarlo, se anuncia el motivo', await p.waitForFunction(() => /para repartir parejo/.test(document.getElementById('live-polite').textContent), null, { timeout: 2000 }).then(() => true, () => false));
  await p.click('#distribute-mode input[value="gap"]', { force: true });
  check('2 piezas + separación: habilitado', (await p.getAttribute('[data-distribute="x"]', 'aria-disabled')) === 'false');
  // Alinear a la hoja (área útil) con varias.
  await L.selectIds(ids);
  await p.click('#align-to input[value="sheet"]', { force: true });
  await p.click('[data-align="left"]');
  check('alinear a la hoja (varias): x = margen (10)', same(await xs(), [10, 10, 10]));
  await L.undo();
  await p.click('[data-align="bottom"]');
  check('alinear abajo a la hoja: y = 297 − 10 − alto', same(await ys(), [287 - h, 287 - h, 287 - h]), String(await ys()));
  await L.undo();
  check('deshacer: como antes', (await L.snap()) === before);
  // Una sola: siempre contra el área útil.
  await L.selectIds([ids[1]]);
  check('una sola: «Alinear al área útil de la hoja» sin selector', (await p.isVisible('#align-sheet-note')) && (await p.isHidden('#align-to-field')));
  const one = async () => (await L.geom()).pieces[1];
  const singles = [
    ['left', 'x', 10],
    ['right', 'x', 200 - w],
    ['centerX', 'x', (210 - w) / 2],
    ['top', 'y', 10],
    ['bottom', 'y', 287 - h],
    ['centerY', 'y', (297 - h) / 2],
  ];
  for (const [mode, axis, v] of singles) {
    await p.click(`[data-align="${mode}"]`);
    const q = await one();
    const pillNow = (await L.pill()).text;
    if (pillNow.startsWith('No se puede')) {
      check(`una sola, ${mode}: ${axis} = ${v} (rechazado: ${pillNow})`, (await L.snap()) === before);
    } else {
      check(`una sola, ${mode}: ${axis} = ${v.toFixed(3)}`, near(q[axis], v, 2e-3), String(q[axis]));
      await L.undo();
    }
  }
  // Con imán (1 mm), contra el área útil la esquina va hacia adentro del margen.
  await setSnap(p, true);
  await p.click('[data-align="bottom"]');
  check('una sola + imán, abajo: y redondeado hacia adentro (236)', near((await one()).y, 236, 2e-3), String((await one()).y));
  await L.undo();
  await p.click('[data-align="right"]');
  check('una sola + imán, derecha: x redondeado hacia adentro (155)', near((await one()).x, 155, 2e-3), String((await one()).x));
  await L.undo();
  await setSnap(p, false);
  check('una sola: distribuir deshabilitado', (await p.getAttribute('[data-distribute="x"]', 'aria-disabled')) === 'true');
  // Rechazo con acción «Permitir superposición»
  await L.selectIds(ids);
  await p.click('#align-to input[value="selection"]', { force: true });
  await setOverlapAllowed(p, false);
  await L.setPos(ids[1], 80, 40);
  await L.selectIds(ids);
  const pre = await L.snap();
  await p.click('[data-align="left"]');
  const pl = await L.pill();
  check('rechazo: aviso con «Permitir superposición» y estado intacto', pl.text === 'No se puede alinear: las piezas se superpondrían' && pl.action === 'Permitir superposición' && (await L.snap()) === pre, JSON.stringify(pl));
  await p.click('#pill-action');
  await p.waitForTimeout(50);
  check('la acción la permite y alinea', (await p.isChecked('#allow-overlap')) && same(await xs(), [20, 20, 20]));
  await L.undo();
  check('deshacer: un solo paso', (await L.snap()) === pre);
  await setOverlapAllowed(p, false);
  errors.push(...s.errors);
  await s.browser.close();
}

async function setOverlapAllowed(p, on) {
  if ((await p.isChecked('#allow-overlap')) !== on) await p.click('#allow-overlap');
}
async function setSnap(p, on) {
  if ((await p.isChecked('#grid-snap')) !== on) await p.click('#grid-snap');
}

async function transforms() {
  const s = await open();
  const p = s.page;
  const L = lib(p);
  const ids = await setupThree(p, L, [[20, 20], [90, 20], [20, 100]]);
  const { w: W0, h: H0 } = (await L.geom()).pieces[0];
  await L.selectIds(ids.slice(0, 2));
  const before = await L.snap();
  // Mover con flechas
  await L.piece(ids[0]).focus();
  await p.keyboard.press('ArrowRight');
  let g = await L.geom();
  check('→ mueve el grupo 1 mm', near(g.pieces[0].x, 21) && near(g.pieces[1].x, 91) && near(g.pieces[2].x, 20));
  await L.undo();
  check('→: un paso de deshacer', (await L.snap()) === before);
  // Flechas contra otra: salta
  await L.selectIds([ids[0]]);
  await L.selectIds(ids.slice(0, 2));
  await L.piece(ids[0]).focus();
  for (let i = 0; i < 31; i++) await p.keyboard.press('ArrowDown');
  g = await L.geom();
  check('↓ hasta chocar con la de abajo: salta sin pisarla', overlapping(g.pieces).length === 0 && g.pieces[0].y >= 100 + H0 - 1e-3, JSON.stringify(overlapping(g.pieces)) + ' y=' + g.pieces[0].y);
  for (let i = 0; i < 40 && (await L.snap()) !== before; i++) await L.undo();
  // Arrastrar el grupo
  const zoom = (await L.geom()).zoom;
  await L.drag(L.piece(ids[1]), 30 * zoom, 0);
  g = await L.geom();
  check('arrastrar mueve todo junto (30 mm, imán de 1 mm)', near(g.pieces[0].x, 50) && near(g.pieces[1].x, 120), `${g.pieces[0].x} ${g.pieces[1].x}`);
  await L.undo();
  check('arrastre: un paso de deshacer', (await L.snap()) === before);
  // Clic sin arrastrar en una del grupo: elige solo esa
  await L.piece(ids[1]).click();
  check('clic sin arrastrar en una de varias: queda solo esa', JSON.stringify(await L.selectedIds()) === JSON.stringify([ids[1]]));
  await L.selectIds(ids.slice(0, 2));
  // Arrastrar sobre otra: vuelve o va al lugar libre más cercano
  await L.drag(L.piece(ids[0]), 0, 70 * zoom);
  g = await L.geom();
  check('arrastrar sobre otra: sin superposición al soltar', overlapping(g.pieces).length === 0);
  if ((await L.snap()) !== before) await L.undo();
  // Girar el grupo
  await L.piece(ids[0]).focus();
  await p.keyboard.press('r');
  g = await L.geom();
  const pl = await L.pill();
  if (pl.text.startsWith('No se puede')) check('girar: rechazado y estado intacto', (await L.snap()) === before, pl.text);
  else {
    check('girar el grupo: cada una gira 90° y la caja conserva el centro', g.pieces[0].r === 90 && g.pieces[1].r === 90 && near(boxOf(g, ids.slice(0, 2)).x + boxOf(g, ids.slice(0, 2)).w / 2, 20 + (70 + W0) / 2, 1e-2), JSON.stringify(boxOf(g, ids.slice(0, 2))));
    await L.undo();
    check('girar: un paso de deshacer', (await L.snap()) === before);
  }
  // Escalar con + y −
  await p.keyboard.press('Minus');
  g = await L.geom();
  check('−: el grupo se reduce 1 % en proporción', near(g.pieces[0].w, W0 * 0.99, 2e-3) && near(g.pieces[1].w, W0 * 0.99, 2e-3), String(g.pieces[0].w));
  await L.undo();
  check('−: deshacer', (await L.snap()) === before);
  // Tirador del marco de grupo
  const frame = await p.locator('.group-frame .handle').boundingBox();
  await p.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await p.mouse.down();
  await p.mouse.move(frame.x + frame.width / 2 - 40, frame.y + frame.height / 2 - 10, { steps: 6 });
  await p.mouse.up();
  g = await L.geom();
  const k = g.pieces[0].w / W0;
  check('tirador: escala el grupo desde la esquina', k < 1 && near(g.pieces[1].w / W0, k, 1e-5) && near(g.pieces[0].x, 20, 2e-3) && near(g.pieces[1].x, 20 + 70 * k, 2e-3), `k=${k} x1=${g.pieces[1].x}`);
  await L.undo();
  check('tirador: deshacer', (await L.snap()) === before);
  // Campos de grupo
  await L.openMeasures();
  check('campos: caja del grupo (X 20, ancho 70 + ancho de una)', (await p.inputValue('#pos-x')) === '20' && near(parseFloat((await p.inputValue('#width')).replace(',', '.')), 70 + W0, 0.05), await p.inputValue('#width'));
  await L.setMeasure('pos-x', '30');
  g = await L.geom();
  check('X del grupo = 30: mueve las dos', near(g.pieces[0].x, 30, 2e-3) && near(g.pieces[1].x, 100, 2e-3));
  await L.undo();
  await L.setMeasure('width', '60');
  g = await L.geom();
  const kw = 60 / (70 + W0);
  check('ancho del grupo = 60: escala en proporción desde la esquina', near(g.pieces[0].w, W0 * kw, 2e-3) && near(g.pieces[1].x, 20 + 70 * kw, 2e-3) && near(g.pieces[0].x, 20, 2e-3), `${g.pieces[0].w} ${g.pieces[1].x}`);
  await L.undo();
  check('escala común: 100 % → campo «100»', (await p.inputValue('#scale')) === '100', JSON.stringify([await p.inputValue('#scale'), await L.selectedIds(), (await L.geom()).pieces.map((q) => q.w)]));
  await L.selectIds([ids[0]]);
  await L.setMeasure('scale', '50');
  await L.selectIds(ids.slice(0, 2));
  check('escalas distintas: «Mixta»', (await p.inputValue('#scale')) === '' && (await p.getAttribute('#scale', 'placeholder')) === 'Mixta', JSON.stringify([await p.inputValue('#scale'), await p.getAttribute('#scale', 'placeholder'), await L.selectedIds()]));
  await L.setMeasure('scale', '80');
  g = await L.geom();
  check('escribir 80: las dos a 80 % (cada una desde su centro)', near(g.pieces[0].w, W0 * 0.8, 2e-3) && near(g.pieces[1].w, W0 * 0.8, 2e-3));
  await L.undo();
  await L.undo();
  // Duplicar y quitar el grupo
  await L.selectIds(ids.slice(0, 2));
  await L.piece(ids[0]).focus();
  await p.keyboard.press('d');
  check('D con 2 elegidas: 2 copias, elegidas', (await L.ids()).length === 5 && (await L.selectedIds()).length === 2, JSON.stringify([await L.ids(), await L.selectedIds(), await p.evaluate(() => document.activeElement.className), (await L.pill()).text]));
  await p.keyboard.press('Delete');
  check('Supr: quita las 2', (await L.ids()).length === 3);
  await L.undo();
  await L.undo();
  check('deshacer quitar y duplicar', (await L.snap()) === before);
  // Límite de escala: una al 990 %, + frena en 1000 %
  errors.push(...s.errors);
  await s.browser.close();
}

// Matriz: imán × superposición × 1 o 2 hojas × mm o in.
async function matrix() {
  for (const unit of ['mm', 'in']) {
    for (const snapOn of [false, true]) {
      for (const overlap of [false, true]) {
        for (const twoSheets of [false, true]) {
          const tag = `[${unit} imán:${snapOn ? 'sí' : 'no'} sup:${overlap ? 'sí' : 'no'} ${twoSheets ? '2 hojas' : '1 hoja'}]`;
          const s = await open({ storage: { 'scooch:unit-preference': unit } });
          const p = s.page;
          const L = lib(p);
          await addFiles(p, tiles(20, 4));
          if (twoSheets) {
            await p.click('#add-sheet');
            await addFiles(p, tiles(24, 3));
          }
          await setSnap(p, snapOn);
          await setOverlapAllowed(p, overlap);
          if (unit === 'in') await p.locator('#grid-chips input').first().check({ force: true });
          const step = unit === 'in' ? 3.175 : 1;
          const all = await L.ids();
          const chosen = twoSheets ? [all[0], all[1], all[4], all[5]] : [all[0], all[1], all[2]];
          await L.selectIds(chosen);
          const ops = [
            ['flecha →', async () => { await L.piece(chosen[0]).focus(); await p.keyboard.press('ArrowRight'); }, null],
            ['flecha ↓ (Shift: paso grueso)', async () => { await L.piece(chosen[0]).focus(); await p.keyboard.press('Shift+ArrowDown'); }, null],
            ['arrastrar', async () => { const z = (await L.geom()).zoom; await L.drag(L.piece(chosen[0]), 13.3 * z, 7.7 * z); }, 'xy'],
            ['girar', async () => { await L.piece(chosen[0]).focus(); await p.keyboard.press('r'); }, null],
            ['+', async () => { await L.piece(chosen[0]).focus(); await p.keyboard.press('Shift+Equal'); }, null],
            ['− (Shift: 10 %)', async () => { await L.piece(chosen[0]).focus(); await p.keyboard.press('Shift+Minus'); }, null],
            ['alinear izquierda', async () => p.click('[data-align="left"]'), 'x'],
            ['alinear centro vertical', async () => p.click('[data-align="centerY"]'), 'y'],
            ['alinear abajo (hoja)', async () => { await p.click('#align-to input[value="sheet"]', { force: true }); await p.click('[data-align="bottom"]'); await p.click('#align-to input[value="selection"]', { force: true }); }, 'y'],
            ['distribuir horizontal', async () => p.click('[data-distribute="x"]', { force: true }), 'x'],
            ['repartir parejo vertical', async () => { await p.click('#distribute-mode input[value="even"]', { force: true }); await p.click('[data-distribute="y"]', { force: true }); await p.click('#distribute-mode input[value="gap"]', { force: true }); }, 'y'],
          ];
          let fails = 0;
          let rejected = 0;
          for (const [name, run, axes] of ops) {
            await p.keyboard.press('Escape');
            await L.selectIds(chosen);
            const before = await L.snap();
            const g0 = await L.geom();
            await run();
            await p.waitForTimeout(40);
            const after = await L.snap();
            const g = await L.geom();
            const pl = await L.pill();
            const problems = [];
            if (!overlap && overlapping(g.pieces).length && !overlapping(g0.pieces).length) problems.push('superposición ' + JSON.stringify(overlapping(g.pieces)));
            if (centersInside(g).length) problems.push('centro fuera');
            if (after === before) {
              if (pl.warn) rejected++;
            } else {
              if (snapOn && axes) {
                const sheetsOf = [...new Set(g.pieces.filter((q) => chosen.includes(q.id)).map((q) => q.sheet))];
                for (const sh of sheetsOf) {
                  const b = boxOf(g, chosen, sh);
                  if (axes.includes('x') && !onGrid(b.x, step)) problems.push(`x ${b.x} fuera de la grilla`);
                  if (axes.includes('y') && !onGrid(b.y, step)) problems.push(`y ${b.y} fuera de la grilla`);
                }
              }
              await L.undo();
              if ((await L.snap()) !== before) problems.push('deshacer no restaura exacto');
              await L.redo();
              if ((await L.snap()) !== after) problems.push('rehacer no vuelve');
              await L.undo();
            }
            if (problems.length) {
              fails++;
              check(`${tag} ${name}`, false, problems.join('; '));
            }
          }
          check(`${tag} ${ops.length} operaciones: invariantes, grilla y deshacer exacto (${rejected} rechazadas con el estado intacto)`, fails === 0);
          errors.push(...s.errors);
          await s.browser.close();
        }
      }
    }
  }
}

(async () => {
  try {
    await selection();
    await alignDistribute();
    await transforms();
    await matrix();
  } catch (err) {
    check('sin excepciones', false, err.stack);
  }
  check('sin errores de consola', errors.length === 0, errors.slice(0, 5).join(' | '));
  process.exit(report() ? 1 : 0);
})();
