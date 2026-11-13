// «Duplicar ×N» y «Seleccionar iguales».
const { open, makeChecker, addFiles, tiles, lib, near, overlapping, norm } = require('../lib/selection.cjs');

const { check, report } = makeChecker('Duplicar ×N y Seleccionar iguales');
const errors = [];

async function duplicateTimes() {
  const s = await open();
  const p = s.page;
  const L = lib(p);
  await addFiles(p, tiles(30, 3));
  const ids = await L.ids();
  const g0 = await L.geom();
  await L.selectIds([ids[0]]);
  await L.openMeasures();
  check('«Duplicar» con 1 en el campo', norm(await p.textContent('#dup-many')) === 'Duplicar' && (await p.inputValue('#dup-count')) === '1');
  await p.fill('#dup-count', '5');
  check('el botón dice «Duplicar ×5»', norm(await p.textContent('#dup-many')) === 'Duplicar ×5' && (await p.getAttribute('#dup-many', 'aria-label')) === 'Duplicar: 5 copias de cada pieza seleccionada');
  const before = await L.snap();
  await p.click('#dup-many');
  let g = await L.geom();
  const pl = await L.pill();
  check('5 copias nuevas, elegidas', g.pieces.length === 8 && (await L.selectedIds()).length === 5);
  check('aviso de resultado', /^Se agregaron 5 copias (en la hoja 1|en 2 hojas)$/.test(pl.text), pl.text);
  check('lo que ya estaba no se movió', g0.pieces.every((q) => { const now = g.pieces.find((x) => x.id === q.id); return near(now.x, q.x) && near(now.y, q.y) && now.sheet === q.sheet; }));
  check('sin superposición', overlapping(g.pieces).length === 0, JSON.stringify(overlapping(g.pieces)));
  const copies = g.pieces.filter((q) => !ids.includes(q.id));
  check('copias iguales a la original (medidas y giro)', copies.every((q) => near(q.w, g0.pieces[0].w) && near(q.h, g0.pieces[0].h) && q.r === g0.pieces[0].r));
  await L.undo();
  check('deshacer: un solo paso, exactamente como antes', (await L.snap()) === before);
  // Varias elegidas × 3: 2 × 3 = 6 copias, desde la hoja actual a las siguientes y nuevas.
  await L.selectIds(ids.slice(0, 2));
  await p.fill('#dup-count', '3');
  await p.click('#dup-many');
  g = await L.geom();
  check('2 elegidas × 3: 6 copias', g.pieces.length === 9 && (await L.selectedIds()).length === 6);
  check('sin superposición', overlapping(g.pieces).length === 0);
  // Hoja llena: las copias pasan a hojas nuevas
  await L.selectIds([ids[2]]);
  await p.fill('#dup-count', '12');
  const sheetsBefore = (await L.geom()).sheets.length;
  await p.click('#dup-many');
  g = await L.geom();
  check('hoja llena: las que no entran van a hojas nuevas', g.sheets.length > sheetsBefore && overlapping(g.pieces).length === 0, `${sheetsBefore} → ${g.sheets.length}`);
  check('aviso con varias hojas', /^Se agregaron 12 copias en \d hojas$/.test((await L.pill()).text), (await L.pill()).text);
  // D y la barra siguen duplicando de a 1
  await L.selectIds([ids[0]]);
  const n0 = (await L.ids()).length;
  await L.piece(ids[0]).focus();
  await p.keyboard.press('d');
  check('D duplica ×1 (sin importar el campo)', (await L.ids()).length === n0 + 1);
  errors.push(...s.errors);
  await s.browser.close();
}

async function maxItems() {
  const s = await open();
  const p = s.page;
  const L = lib(p);
  await addFiles(p, tiles(40, 1));
  const [id] = await L.ids();
  await L.selectIds([id]);
  await L.setMeasure('scale', '15'); // chiquita: entran muchas por hoja
  await L.openMeasures();
  check('máximo del campo: 199 copias (200 piezas en total)', (await p.getAttribute('#dup-count', 'max')) === '199');
  await p.fill('#dup-count', '250');
  await p.locator('#dup-count').dispatchEvent('change');
  check('escribir 250: queda en 199', (await p.inputValue('#dup-count')) === '199');
  const t0 = Date.now();
  await p.click('#dup-many');
  await p.waitForFunction(() => document.querySelectorAll('#sheets .piece').length === 200, null, { timeout: 60000 });
  check('199 copias: 200 piezas', (await L.ids()).length === 200, `${Date.now() - t0} ms`);
  check('sin superposición con 200', overlapping((await L.geom()).pieces).length === 0);
  await L.piece(id).focus();
  await L.piece(id).click();
  await p.keyboard.press('d');
  const pl = await L.pill();
  check('al máximo, duplicar avisa y no agrega', (await L.ids()).length === 200 && pl.warn && /hasta 200 piezas/.test(pl.text), pl.text);
  await p.fill('#dup-count', '2');
  await p.click('#dup-many');
  check('×2 al máximo: avisa y no agrega', (await L.ids()).length === 200 && (await L.pill()).warn);
  errors.push(...s.errors);
  await s.browser.close();
}

async function selectSame() {
  const s = await open();
  const p = s.page;
  const L = lib(p);
  await addFiles(p, ['small.jpg', 'tall.png', 'twopage.pdf']);
  const [small, tall, pdf] = await L.ids();
  await L.selectIds([small]);
  await L.openMeasures();
  await p.fill('#dup-count', '3');
  await p.click('#dup-many');
  const smallCopies = (await L.selectedIds());
  // Una copia en otra hoja
  await p.click('#add-sheet');
  await L.selectIds([small]);
  await L.piece(small).focus();
  await p.keyboard.press('Shift+PageDown');
  // PDF: una copia que pasa a la página 2 sigue siendo «igual» (mismo archivo)
  await L.selectIds([pdf]);
  await p.fill('#dup-count', '1');
  await p.click('#dup-many');
  const [pdfCopy] = await L.selectedIds();
  await p.selectOption('#page', '2');
  await p.waitForFunction(() => /página 2/.test(document.getElementById('piece-name').textContent));
  // Seleccionar iguales desde una copia de small.jpg
  await L.selectIds([smallCopies[0]]);
  await p.click('#select-same');
  const sel = await L.selectedIds();
  check('iguales: las 4 de small.jpg (también la de la otra hoja), ninguna otra', JSON.stringify(sel) === JSON.stringify([small, ...smallCopies].sort((a, b) => a - b)), JSON.stringify(sel));
  check('anuncio con las hojas', await p.waitForFunction(() => /Se seleccionaron 4 piezas del mismo archivo, en 2 hojas/.test(document.getElementById('live-polite').textContent), null, { timeout: 2000 }).then(() => true, () => false));
  // Cambiar el tamaño de todas a la vez
  const before = await L.snap();
  const w0 = (await L.geom()).pieces.find((q) => q.id === small).w;
  await L.setMeasure('scale', '50');
  const g = await L.geom();
  const ws = g.pieces.filter((q) => sel.includes(q.id)).map((q) => q.w);
  check('escala 50 % para las 4 (cada una desde su centro)', ws.every((w) => near(w, w0 / 2, 2e-3)) && overlapping(g.pieces).length === 0, JSON.stringify(ws));
  check('las demás no cambian', near(g.pieces.find((q) => q.id === tall).w, (await L.geom()).pieces.find((q) => q.id === tall).w));
  await L.undo();
  check('deshacer: las 4 vuelven en un paso', (await L.snap()) === before);
  // I: atajo; PDF con otra página
  await L.selectIds([pdf]);
  await L.piece(pdf).focus();
  await p.keyboard.press('i');
  check('I con el PDF: también la copia en la página 2', JSON.stringify(await L.selectedIds()) === JSON.stringify([pdf, pdfCopy].sort((a, b) => a - b)));
  // The dialog's contents load when it opens (they are not in the page while closed).
  await p.click('#help');
  await p.waitForSelector('#shortcuts[open] #shortcuts-rows tr');
  check('el atajo figura en el diálogo', await p.evaluate(() => [...document.querySelectorAll('#shortcuts-rows tr')].some((r) => /mismo archivo/.test(r.textContent) && /\bI\b/.test(r.cells[0].textContent))));
  await p.keyboard.press('Escape');
  errors.push(...s.errors);
  await s.browser.close();
}

(async () => {
  try {
    await duplicateTimes();
    await maxItems();
    await selectSame();
  } catch (err) {
    check('sin excepciones', false, err.stack);
  }
  check('sin errores de consola', errors.length === 0, errors.slice(0, 5).join(' | '));
  process.exit(report() ? 1 : 0);
})();
