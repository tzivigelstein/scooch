// Regresión funcional (reconstruida de la suite v3 tras perderse /tmp; adaptada a v4:
// varias hojas, sin cascada superpuesta, reducir para usar 1 hoja, campos de longitud con coma).
const { open, makeChecker, helpers, overlaps, outsideMargin, OUT, path, fs, norm } = require('../lib/base.cjs');
const num = (s) => parseFloat(String(s).replace(',', '.'));

(async () => {
  const { check, report } = makeChecker('Regresión funcional');
  const { browser, page, errors } = await open();
  const h = helpers(page);
  const { geom, count, load, pieceByName, clickPiece } = h;
  const byId = (list, id) => list.pieces.find((q) => q.id === id);
  const area = (p) => p.w * p.h;

  // ---- Estado inicial
  check('select de papeles: 18 presets en 4 grupos + Personalizado', (await page.locator('#paper option').count()) === 19 && (await page.locator('#paper optgroup').count()) === 4 && (await page.locator('#paper option').last().textContent()) === 'Personalizado');
  check('etiqueta del papel', norm(await page.locator('#paper-label').textContent()) === 'A4 · 210 × 297 mm');
  let g = await geom();
  check('sin píldora con la hoja vacía (lo dice la propia hoja)', g.notice === '' && (await page.locator('#empty').isVisible()));
  check('exportar y acomodar deshabilitados sin piezas', (await page.locator('#export').isDisabled()) && (await page.locator('#arrange').isDisabled()));
  check('barra de pieza oculta sin selección', !(await page.locator('#piecebar').isVisible()));
  check('margen 10 / separación 5', (await page.inputValue('#margin')) === '10' && (await page.inputValue('#gap')) === '5');
  check('título del documento usa APP_NAME', (await page.title()) === 'Pliego — Acomoda imágenes y PDF en una hoja a tamaño real', await page.title());

  // ---- Una imagen grande en hoja vacía: se limita al área útil
  await load('big.png');
  g = await geom();
  const big = g.pieces[0];
  check('carga big.png', (await count()) === 1);
  check('big.png limitada al ancho útil (190 mm)', Math.abs(big.w - 190) < 0.05, `${big.w.toFixed(2)} × ${big.h.toFixed(2)}`);
  check('big.png dentro del margen', outsideMargin(g).length === 0);
  check('Medidas: escala ~74,8 %', Math.abs(num(await page.inputValue('#scale')) - 74.8) < 0.11, await page.inputValue('#scale'));
  check('imagen: resolución de impresión, sin fila de página', /^Se imprime a \d+\sppp/.test(await page.locator('#resolution-text').textContent()) && (await page.locator('#page-row').getAttribute('hidden')) !== null, await page.locator('#resolution-text').textContent());
  check('sin aviso tras cargar sin problemas', g.notice === '', g.notice);

  // ---- Varias más que entran: no se mueve lo existente, se limita a 48 %
  await load('small.jpg', 'square.webp');
  g = await geom();
  check('3 piezas', (await count()) === 3);
  check('lo existente no se movió', Math.abs(byId(g, big.id).x - big.x) < 1e-2 && Math.abs(byId(g, big.id).y - big.y) < 1e-2);
  check('nuevas sin superponer (respetando separación)', overlaps(g.pieces, g.gap).length === 0, JSON.stringify(overlaps(g.pieces, g.gap)));
  check('todo dentro del margen', outsideMargin(g).length === 0);
  check('nuevas limitadas a 48 %', g.pieces.filter((p) => p.id !== big.id).every((p) => p.w <= 0.48 * 190 + 0.01 && p.h <= 0.48 * 277 + 0.01));

  // ---- Más que no entran: v4 (a propósito) van a una hoja nueva, sin cascada superpuesta
  const before3 = await geom();
  await load('tall.png', 'exif6.jpg');
  g = await geom();
  check('5 piezas', (await count()) === 5);
  check('lo existente sigue sin moverse', before3.pieces.every((p) => { const q = byId(g, p.id); return Math.abs(p.x - q.x) < 1e-2 && Math.abs(p.y - q.y) < 1e-2; }));
  check('si no entran: siguen en una hoja nueva, sin superposiciones ni aviso', overlaps(g.pieces, g.gap).length === 0 && g.notice === '', `${g.notice} hojas=${await page.locator('.page').count()}`);

  // EXIF 6: vista previa vertical con la franja roja arriba
  const exif = await page.evaluate(async () => {
    const img = document.querySelector('#sheets .piece[aria-label^="exif6.jpg"] img');
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return { size: [img.naturalWidth, img.naturalHeight], top: [...ctx.getImageData(c.width / 2, 60, 1, 1).data].slice(0, 3), bottom: [...ctx.getImageData(c.width / 2, c.height - 60, 1, 1).data].slice(0, 3) };
  });
  check('EXIF 6: vista previa vertical', exif.size[1] > exif.size[0], JSON.stringify(exif.size));
  check('EXIF 6: orientación aplicada', exif.top[0] > 150 && exif.top[1] < 80 && exif.bottom[1] > 200, `${exif.top} / ${exif.bottom}`);

  // ---- Errores por archivo
  await load('notanimage.png', 'password.pdf');
  g = await geom();
  check('errores en un aviso warning', g.warn && /notanimage\.png/.test(g.notice) && /contraseña/.test(g.notice), g.notice);
  check('errores no agregan piezas', (await count()) === 5);
  check('el aviso de resultado tiene botón de cerrar', await page.locator('#pill-close').isVisible());

  // ---- PDFs
  await load('twopage.pdf', 'rotated.pdf');
  check('7 piezas con los PDF', (await count()) === 7);
  await clickPiece(pieceByName('twopage.pdf'));
  await h.openMeasures();
  check('panel: fila de página visible para PDF', await page.locator('#page-row').isVisible());
  check('opciones «n de N»', JSON.stringify(await page.locator('#page option').allTextContents()) === '["1 de 2","2 de 2"]');
  const w1 = num(await page.inputValue('#width'));
  const h1 = num(await page.inputValue('#height'));
  check('PDF A5: proporción 148:210', Math.abs(w1 / h1 - 148 / 210) < 0.01, `${w1} × ${h1}`);
  await page.selectOption('#page', '2');
  await page.waitForFunction(() => document.getElementById('page').value === '2' && !document.getElementById('page').disabled);
  const w2 = num(await page.inputValue('#width'));
  const h2 = num(await page.inputValue('#height'));
  check('página 2 (200×100): proporción 2:1', Math.abs(w2 / h2 - 2) < 0.02, `${w2} × ${h2}`);
  await h.closePopover();
  await page.keyboard.press('Control+z');
  check('deshacer vuelve a la página 1', (await page.inputValue('#page')) === '1' && Math.abs(num(await page.inputValue('#width')) - w1) < 0.11);
  await page.keyboard.press('Control+Shift+z');
  check('rehacer vuelve a la página 2', (await page.inputValue('#page')) === '2');
  await page.keyboard.press('Control+z');

  // ---- Acomodar: v4 (a propósito) reparte en las hojas necesarias y ofrece reducir para usar 1
  const g4 = await geom();
  await page.click('#arrange');
  g = await geom();
  check('A4 con 7: reparte en 2 hojas y ofrece reducir sin cambiar tamaños', /^Se acomodaron 7 piezas en 2 hojas$/.test(g.notice) && /^Reducir al [\d,]+ % para usar 1 hoja$/.test(g.action) && g.pieces.every((p) => Math.abs(area(p) - area(byId(g4, p.id))) < 1e-4 * area(p)) && overlaps(g.pieces, g.gap).length === 0 && outsideMargin(g).length === 0, `${g.notice} [${g.action}]`);
  await page.click('#pill-action');
  g = await geom();
  check('reducir: sin superposiciones (con separación)', overlaps(g.pieces, g.gap).length === 0, JSON.stringify(overlaps(g.pieces, g.gap)));
  check('reducir: dentro del margen', outsideMargin(g).length === 0);
  check('reducir: una sola hoja', (await page.locator('.page').count()) === 1);
  check('reducir: aviso', /^Se acomodaron 7 piezas, reducidas al [\d,]+ %/.test(g.notice), g.notice);
  const gReduced = g;
  await page.click('#arrange');
  g = await geom();
  check('acomodar de nuevo: mismo resultado', g.pieces.every((p) => { const q = byId(gReduced, p.id); return Math.abs(p.x - q.x) < 1e-2 && Math.abs(p.y - q.y) < 1e-2 && Math.abs(p.w - q.w) < 1e-2; }));
  check('acomodar de nuevo: aviso', g.notice === 'Se acomodaron 7 piezas', g.notice);
  await page.keyboard.press('Control+z');
  g = await geom();
  check('…y no agregó un paso de deshacer (un Ctrl+Z deshace la reducción)', g.pieces.every((p) => Math.abs(area(p) - area(byId(g4, p.id))) < 1e-4 * area(p)));
  await page.keyboard.press('Control+Shift+z');
  await page.screenshot({ path: path.join(OUT, 'reg-01-acomodado-a4.png') });

  // ---- A6: lo que no entra ni solo queda donde estaba y se ofrece «Ajustar a la hoja»
  const beforeShrink = await geom();
  await h.openSheet();
  await page.selectOption('#paper', 'A6');
  await h.closePopover();
  await page.click('#arrange');
  g = await geom();
  check('A6: reparte el resto y avisa la que no entra ni sola, con «Ajustar a la hoja»', /^Se acomodaron 6 piezas en \d+ hojas\. big\.png no entra en la hoja ni sola, así que quedó donde estaba\.$/.test(g.notice) && g.warn && g.action === 'Ajustar a la hoja', `${g.notice} [${g.action}]`);
  check('A6: no achicó en silencio', g.pieces.every((p) => Math.abs(area(p) - area(byId(beforeShrink, p.id))) < 1e-4 * area(p)));
  const bigId = g.pieces.find((p) => p.name === 'big.png').id;
  const rest = { ...g, pieces: g.pieces.filter((p) => p.id !== bigId) };
  check('A6: las demás, sin superposiciones y dentro del margen en cada hoja', overlaps(rest.pieces, g.gap).length === 0 && outsideMargin(rest).length === 0);
  check('A6: la que no entra quedó sola en su hoja', g.pieces.filter((p) => p.sheet === byId(g, bigId).sheet).length === 1);
  const g6before = g;
  await page.click('#pill-action');
  g = await geom();
  const bigFit = byId(g, bigId);
  check('A6 «Ajustar a la hoja»: entra dentro del margen', outsideMargin({ ...g, pieces: [bigFit] }).length === 0 && Math.abs(bigFit.w - 85) < 0.05, `${bigFit.w.toFixed(2)} × ${bigFit.h.toFixed(2)}`);
  await page.keyboard.press('Control+z');
  g = await geom();
  check('deshacer ajustar: vuelve su tamaño', g.pieces.every((p) => Math.abs(p.w - byId(g6before, p.id).w) < 1e-2));
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  g = await geom();
  check('deshacer cambio de papel: A4', g.W === 210 && (await page.inputValue('#paper')) === 'A4');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+Shift+z');
  g = await geom();
  check('rehacer ×3: A6 acomodado y ajustado, sin superposición', g.W === 105 && overlaps(g.pieces, g.gap).length === 0 && outsideMargin(g).length === 0);
  await h.openSheet();
  await page.selectOption('#paper', 'A4');
  await h.closePopover();
  await page.click('#arrange');
  if (/para usar 1 hoja/.test((await geom()).action)) await page.click('#pill-action');

  // ---- Superposición impuesta (Medidas) → aviso con Acomodar
  const gp = (await geom()).pieces;
  const target = [...gp].sort((a, b) => a.x + a.y - (b.x + b.y))[0];
  const mover = [...gp].filter((p) => p !== target && p.sheet === target.sheet).sort((a, b) => a.w * a.h - b.w * b.h)[0];
  await page.locator(`#sheets .piece[data-id="${mover.id}"]`).focus();
  await h.setMeasure('pos-x', target.x + 2);
  await h.setMeasure('pos-y', target.y + 2);
  await h.closePopover();
  g = await geom();
  check('Medidas puede dejar superpuesto (orden explícita)', overlaps(g.pieces).length > 0);
  check('aviso «Hay piezas superpuestas» con Acomodar', g.notice === 'Hay piezas superpuestas' && g.action === 'Acomodar', `${g.notice} [${g.action}]`);
  check('«Traer al frente» habilitado si pisa a otra', (await page.locator('#piece-front').getAttribute('aria-disabled')) === 'false');
  await page.click('#pill-action');
  g = await geom();
  check('el botón del aviso acomoda', overlaps(g.pieces, g.gap).length === 0 && outsideMargin(g).length === 0);
  check('«Traer al frente» deshabilitado si no pisa a ninguna', (await page.locator('#piece-front').getAttribute('aria-disabled')) === 'true');

  // ---- Girar mantiene el centro
  await clickPiece(1);
  let before = (await geom()).pieces.find((p) => p.active);
  await page.click('#piecebar [data-action="rotate-right"]');
  let after = (await geom()).pieces.find((p) => p.active);
  check('girar a la derecha: intercambia ancho/alto', Math.abs(after.w - before.h) < 1e-2 && Math.abs(after.h - before.w) < 1e-2);
  check('girar: mantiene el centro', Math.abs(after.x + after.w / 2 - (before.x + before.w / 2)) < 1e-2 && Math.abs(after.y + after.h / 2 - (before.y + before.h / 2)) < 1e-2);
  check('girar a la derecha: +90°', after.rot === (before.rot + 90) % 360, `${before.rot} → ${after.rot}`);
  await page.click('#piecebar [data-action="rotate-left"]');
  after = (await geom()).pieces.find((p) => p.active);
  check('girar a la izquierda: vuelve', after.rot === before.rot && Math.abs(after.x - before.x) < 1e-2);
  await page.click('#piecebar [data-action="rotate-right"]');
  if ((await geom()).pieces.find((p) => p.active).rot === 0) await page.click('#piecebar [data-action="rotate-right"]');
  await h.openMeasures();
  const rotated = (await geom()).pieces.find((p) => p.active);
  check('Medidas girada: «Girada N°» visible', (await page.locator('#rotation-note').isVisible()) && new RegExp(`Girada ${rotated.rot}°`).test(await page.locator('#rotation-note').textContent()), `${rotated.rot}`);
  check('Medidas girada: ancho/alto son los que ocupa en la hoja', Math.abs(num(await page.inputValue('#width')) - rotated.w) < 0.06 && Math.abs(num(await page.inputValue('#height')) - rotated.h) < 0.06);
  check('Medidas girada: ancho y alto describidos por la nota de giro', /\brotation-note\b/.test(await page.getAttribute('#width', 'aria-describedby')) && /\brotation-note\b/.test(await page.getAttribute('#height', 'aria-describedby')));
  await h.closePopover();
  for (let i = 0; i < 4 && (await geom()).pieces.find((p) => p.active).rot !== 0; i++) await page.click('#piecebar [data-action="rotate-left"]');
  await h.openMeasures();
  check('sin giro: la nota no está y no se describe', !(await page.locator('#rotation-note').isVisible()) && !/rotation-note/.test(await page.getAttribute('#width', 'aria-describedby')));
  await h.closePopover();

  // ---- Flechas
  await page.click('#arrange');
  await clickPiece(1);
  before = (await geom()).pieces.find((p) => p.active);
  await page.keyboard.press('ArrowRight');
  const mid = (await geom()).pieces.find((p) => p.active);
  await page.keyboard.press('Shift+ArrowRight');
  after = (await geom()).pieces.find((p) => p.active);
  check('flecha +1 mm y Shift+flecha +10 mm (o salto si chocó; nunca más allá del centro en el borde)', Math.abs(mid.x - before.x - 1) < 0.01 && after.x >= mid.x && after.x + after.w / 2 <= 210 + 0.01, `${(mid.x - before.x).toFixed(2)} mm, ${(after.x - mid.x).toFixed(2)} mm`);
  // Cada flecha que movió es un paso (si la segunda no tenía lugar, no movió ni agregó paso).
  const steps = 1 + (after.x !== mid.x ? 1 : 0);
  for (let i = 0; i < steps; i++) await page.keyboard.press('Control+z');
  after = (await geom()).pieces.find((p) => p.active);
  check('deshacer flechas (un paso cada una)', Math.abs(after.x - before.x) < 0.01, JSON.stringify({ before: [before.x, before.y, before.w], after: [after.x, after.y] }));

  // ---- Imán, arrastre y tirador (hoja aparte con una sola pieza)
  check('imán encendido y grilla de 1 mm por defecto', (await page.isChecked('#grid-snap')) && (await page.inputValue('#grid-size')) === '1');
  const solo = await open();
  const hs = helpers(solo.page);
  await hs.load('small.jpg');
  const p0 = (await hs.geom()).pieces[0];
  await hs.drag(solo.page.locator('#sheets .piece').first(), 60, 37);
  const p1 = (await hs.geom()).pieces[0];
  const z = (await hs.geom()).zoom;
  const isInt = (v) => Math.abs(v - Math.round(v)) < 1e-3;
  check('arrastrar mueve y redondea a 1 mm (imán)', isInt(p1.x) && isInt(p1.y) && Math.abs(p1.x - p0.x - 60 / z) < 1 && Math.abs(p1.y - p0.y - 37 / z) < 1, `${p1.x}, ${p1.y}`);
  const handle = await solo.page.locator('#handle').boundingBox();
  await solo.page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await solo.page.mouse.down();
  for (let i = 1; i <= 10; i++) await solo.page.mouse.move(handle.x + handle.width / 2 + i * 6, handle.y + handle.height / 2 + i * 4.5);
  await solo.page.mouse.up();
  const p2 = (await hs.geom()).pieces[0];
  check('el tirador escala proporcionalmente', p2.w > p1.w && Math.abs(p2.w / p2.h - p1.w / p1.h) < 0.01, `${p1.w.toFixed(1)} → ${p2.w.toFixed(1)}`);
  await solo.page.keyboard.press('Control+z');
  check('deshacer escala (un paso)', Math.abs((await hs.geom()).pieces[0].w - p1.w) < 0.01);
  await solo.page.keyboard.press('Control+z');
  check('deshacer arrastre (un paso)', Math.abs((await hs.geom()).pieces[0].x - p0.x) < 0.01);
  await hs.setMeasure('width', 50);
  const p3 = (await hs.geom()).pieces[0];
  check('ancho 50 mm (proporción fija)', Math.abs(p3.w - 50) < 0.01 && Math.abs(p3.w / p3.h - p0.w / p0.h) < 0.01, `${p3.w}×${p3.h.toFixed(2)}`);
  await hs.setMeasure('pos-x', -5);
  check('fuera de la hoja → warning de corte', (await hs.geom()).notice === '1 pieza se sale de la hoja y se corta al imprimir', (await hs.geom()).notice);
  await hs.setMeasure('pos-x', 5);
  check('pasa el margen → warning', (await hs.geom()).notice === '1 pieza pasa el margen y puede que la impresora no imprima ese borde', (await hs.geom()).notice);
  await solo.page.click('#piece-fit');
  const p4 = (await hs.geom()).pieces[0];
  check('ajustar a la hoja: máximo dentro del margen y centrado', Math.abs(p4.w - 190) < 0.01 && Math.abs(p4.x + p4.w / 2 - 105) < 0.01 && Math.abs(p4.y + p4.h / 2 - 148.5) < 0.01, `${p4.w.toFixed(2)}×${p4.h.toFixed(2)}`);
  await solo.page.click('#actual');
  check('100 %', (await solo.page.inputValue('#scale')) === '100');
  const slider = await solo.page.locator('#slider').boundingBox();
  await solo.page.mouse.move(slider.x + slider.width * 0.5, slider.y + slider.height / 2);
  await solo.page.mouse.down();
  for (let i = 1; i <= 6; i++) await solo.page.mouse.move(slider.x + slider.width * (0.5 - i * 0.06), slider.y + slider.height / 2);
  await solo.page.mouse.up();
  await solo.page.locator('#slider').dispatchEvent('change');
  const afterSlider = await solo.page.inputValue('#scale');
  await solo.page.keyboard.press('Control+z');
  check('slider: un solo paso de deshacer por arrastre', num(afterSlider) < 100 && (await solo.page.inputValue('#scale')) === '100', `slider→${afterSlider}, ${await solo.page.inputValue('#scale')}`);
  errors.push(...solo.errors);
  await solo.browser.close();

  // ---- Rellenar con copias
  await clickPiece(pieceByName('small.jpg'));
  await h.openMeasures();
  check('Rellenar: plegado por defecto', !(await page.locator('#fill-details').evaluate((d) => d.open)));
  await page.click('#fill-details summary');
  check('Rellenar: advierte que reemplaza todo', /Reemplaza/.test(await page.locator('#fill-warning').textContent()));
  const summary = norm(await page.locator('#fill-summary').textContent());
  check('resumen de copias en vivo', /^\d+ copias en (A4|la hoja \d)$/.test(summary), summary);
  const sheetsBefore = await page.locator('.page').count();
  await page.click('#fill');
  const n = parseInt(summary, 10);
  const onSheet = await page.evaluate(() => document.querySelector('#sheets .piece.is-selected').closest('.sheet').querySelectorAll('.piece').length);
  check('rellenar: cantidad = resumen (en la hoja de la pieza)', onSheet === n, `${onSheet} vs ${n}`);
  check('rellenar: las demás hojas siguen', (await page.locator('.page').count()) === sheetsBefore);
  await page.keyboard.press('Control+z');
  check('deshacer rellenar', (await count()) === 7);
  await page.screenshot({ path: path.join(OUT, 'reg-02-copias.png') });

  // ---- Quitar todas (y deshacer)
  await page.click('#clear');
  check('vaciar', (await count()) === 0 && (await page.locator('#empty').isVisible()));
  await page.keyboard.press('Control+z');
  check('deshacer vaciar', (await count()) === 7);

  // ---- Pegar, soltar y Supr
  await page.evaluate(async () => {
    const blob = await (await fetch(document.querySelector('#sheets .piece img').src)).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'pegada.png', { type: blob.type }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('#sheets .piece').length === 8, null, { timeout: 15000 });
  check('pegar imagen con Ctrl+V', (await count()) === 8);
  const dragClass = await page.evaluate(async () => {
    const blob = await (await fetch(document.querySelector('#sheets .piece img').src)).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'soltada.png', { type: blob.type }));
    const target = document.getElementById('canvas');
    const zone = document.getElementById('workspace');
    target.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    const during = zone.classList.contains('is-drop-target');
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return during && !zone.classList.contains('is-drop-target');
  });
  await page.waitForFunction(() => document.querySelectorAll('#sheets .piece').length === 9, null, { timeout: 15000 });
  check('soltar sobre el lienzo (estado de destino)', dragClass && (await count()) === 9);
  await page.locator('#sheets .piece.is-selected').focus();
  await page.keyboard.press('Delete');
  check('Supr quita la seleccionada', (await count()) === 8);

  // ---- Exportar con todas las rotaciones (y con la grilla visible: no debe salir en el PDF)
  await h.openSheet();
  if (await page.isChecked('#allow-rotate')) await page.click('#allow-rotate');
  await h.closePopover();
  await page.click('#arrange');
  if (/para usar 1 hoja/.test((await geom()).action)) await page.click('#pill-action');
  for (const [i, targetRot] of [[0, 90], [1, 180], [2, 270]]) {
    await clickPiece(i);
    const id = (await geom()).pieces.find((p) => p.active).id;
    for (let t = 0; t < 4 && byId(await geom(), id).rot !== targetRot; t++) await page.click('#piecebar [data-action="rotate-right"]');
  }
  await page.click('#arrange');
  if (/para usar 1 hoja/.test((await geom()).action)) await page.click('#pill-action');
  await page.click('#grid-show');
  check('grilla visible antes de exportar', await page.locator('#sheets .grid-layer').first().isVisible());
  const canvasBox = await page.locator('#canvas').boundingBox();
  await page.mouse.click(canvasBox.x + 10, canvasBox.y + 10);
  g = await geom();
  check('antes de exportar: sin superposición', overlaps(g.pieces, g.gap).length === 0 && outsideMargin(g).length === 0);
  const rots = g.pieces.map((p) => p.rot);
  check('hay piezas con 90, 180 y 270', [90, 180, 270].every((r) => rots.includes(r)), rots.join(','));
  await page.screenshot({ path: path.join(OUT, 'reg-03-antes-de-exportar.png') });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  await download.saveAs(path.join(OUT, download.suggestedFilename()));
  await h.waitIdle();
  g = await geom();
  check('nombre del archivo (APP_NAME + papel)', download.suggestedFilename() === 'pliego-a4.pdf', download.suggestedFilename());
  check('aviso: PDF descargado + consejo de impresión', /^Se descargó pliego-a4\.pdf\. .*Tamaño real.*100 %/.test(g.notice), g.notice);
  check('el consejo no está fijo en la interfaz', !norm(await page.locator('main').textContent()).replace(g.notice, '').includes('Tamaño real'));
  check('el consejo está en el tooltip de Descargar PDF', /Tamaño real/.test(await page.getAttribute('#export', 'data-tip-note')));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(5600);
  check('el aviso de resultado se va solo (~5 s)', (await geom()).notice === '', (await geom()).notice);

  // A3 horizontal
  await h.openSheet();
  await page.check('#landscape');
  await page.selectOption('#paper', 'A3');
  await h.closePopover();
  await page.click('#arrange');
  const [d2] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  await d2.saveAs(path.join(OUT, d2.suggestedFilename()));
  await h.waitIdle();
  check('A3 horizontal: nombre', d2.suggestedFilename() === 'pliego-a3.pdf');
  check('etiqueta A3 horizontal', norm(await page.locator('#paper-label').textContent()) === 'A3 · 420 × 297 mm');

  // Angosto
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(200);
  check('360 px: sin scroll horizontal', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  check('sin errores de consola', errors.length === 0, errors.join(' | '));
  const failures = report();
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
