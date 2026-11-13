// B. Unidades globales: cada campo en mm/cm/in, fracciones y sufijos, flechas por unidad,
// etiquetas y anuncios, y la ida y vuelta mm → cm → in → mm sin tocar el documento.
const { open, makeChecker, helpers, norm, addFiles, pdfInfo, download, heard } = require('../lib/sheets.cjs');

(async () => {
  const { check, report } = makeChecker('B. Unidades');
  const s = await open();
  const p = s.page;
  const h = helpers(p);
  const val = (id) => p.inputValue(id);
  const setUnit = async (unit) => {
    await p.click('#prefs-open');
    await p.waitForSelector('#prefs[open]');
    await p.check(`input[name="unit"][value="${unit}"]`);
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.getElementById('prefs').open);
  };
  const piece = () => p.locator('#sheets .piece[aria-label^="small.jpg"]');
  const docSnapshot = () =>
    p.evaluate(async () => {
      const id = localStorage.getItem('scooch:last-project');
      const record = await new Promise((resolve) => {
        const req = indexedDB.open('scooch');
        req.onsuccess = () => {
          const tx = req.result.transaction('projects');
          tx.objectStore('projects').get(id).onsuccess = (e) => resolve(e.target.result);
        };
      });
      return { doc: JSON.stringify(record.doc), modified: record.modified, undo: document.getElementById('undo').disabled, redo: document.getElementById('redo').disabled };
    });

  await addFiles(p, ['small.jpg', 'square.webp']);
  await piece().focus();
  await h.openMeasures();
  // small.jpg arriba a la izquierda y square.webp lejos, para que no choquen al moverla.
  await p.fill('#pos-x', '120'); await p.keyboard.press('Enter');
  await p.locator('#sheets .piece[aria-label^="square.webp"]').focus();
  await p.fill('#pos-y', '180'); await p.keyboard.press('Enter');
  await piece().focus();
  await p.fill('#pos-x', '10'); await p.keyboard.press('Enter');
  await p.fill('#pos-y', '10'); await p.keyboard.press('Enter');
  await p.waitForTimeout(1500); // guardado automático

  check('mm por omisión: campos tipo texto con teclado decimal', (await p.getAttribute('#pos-x', 'type')) === 'text' && (await p.getAttribute('#pos-x', 'inputmode')) === 'decimal');
  check('mm: X/Y/ancho/alto', (await val('#pos-x')) === '10' && (await val('#pos-y')) === '10' && (await val('#width')) === '67,7' && (await val('#height')) === '50,8', [await val('#pos-x'), await val('#width'), await val('#height')].join(' '));
  check('mm: margen, separación, grilla', (await val('#margin')) === '10' && (await val('#gap')) === '5' && (await val('#grid-size')) === '1');
  const before = await docSnapshot();
  const pdfBefore = await pdfInfo((await download(p)).file);
  await piece().focus();

  // ---------- cm
  await setUnit('cm');
  check('cm: X/Y/ancho/alto', (await val('#pos-x')) === '1' && (await val('#width')) === '6,77' && (await val('#height')) === '5,08', [await val('#pos-x'), await val('#width'), await val('#height')].join(' '));
  check('cm: margen 1, separación 0,5, grilla 0,1', (await val('#margin')) === '1' && (await val('#gap')) === '0,5' && (await val('#grid-size')) === '0,1');
  check('cm: símbolo junto a los campos', await p.evaluate(() => [...document.querySelectorAll('[data-unit]')].every((el) => el.textContent === 'cm')));
  check('cm: nombres accesibles', (await p.getAttribute('#pos-x', 'aria-label')) === 'X: distancia desde el borde izquierdo, en centímetros' && (await p.textContent('#margin-unit')) === ', en centímetros');
  check('cm: tamaños de grilla sugeridos', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#grid-chips span')].map((x) => x.textContent.replace(/ /g, ' ')))) === '["0,1 cm","0,5 cm","1 cm"]');
  check('cm: etiqueta de la hoja y opciones de papel', norm(await p.textContent('#paper-label')) === 'A4 · 21 × 29,7 cm' && norm(await p.evaluate(() => document.querySelector('#paper option[value="A4"]').textContent)) === 'A4 (21 × 29,7 cm)');
  check('cm: lista de piezas y barra de la pieza', norm(await p.evaluate(() => document.querySelector('#piece-list .row-dims').textContent)) === '6,77 × 5,08 cm' && norm(await p.textContent('#piece-size')) === '6,77 × 5,08 cm');
  check('cm: nombre accesible de la pieza', norm(await piece().getAttribute('aria-label')) === 'small.jpg, 6,77 × 5,08 cm, a 1 cm del borde izquierdo y 1 cm del superior');
  check('cm: anuncio al cambiar', await heard(p, /Medidas en centímetros/), await p.textContent('#live-polite'));
  check('cm: la escala y los ppp no cambian', (await val('#scale')) === '100' && /Se imprime a 300\sppp/.test(await p.textContent('#resolution-text')));

  // ---------- ida y vuelta sin editar: mm → cm → in → mm no cambia el documento
  await setUnit('in');
  check('in: X 0,394 y ancho 2,667 (solo se muestra distinto)', (await val('#pos-x')) === '0,394' && (await val('#width')) === '2,667', [await val('#pos-x'), await val('#width')].join(' '));
  await setUnit('mm');
  await p.waitForTimeout(1300);
  const after = await docSnapshot();
  check('mm → cm → in → mm: mismo documento guardado', after.doc === before.doc);
  check('cambiar de unidad no guarda nada (misma fecha del proyecto)', after.modified === before.modified);
  check('cambiar de unidad no agrega pasos de deshacer', after.undo === before.undo && after.redo === before.redo);
  const pdfAfter = await pdfInfo((await download(p)).file);
  check('el PDF sale igual', JSON.stringify(pdfAfter.pages) === JSON.stringify(pdfBefore.pages), JSON.stringify([pdfBefore.pages[0].content, pdfAfter.pages[0].content]));
  check('vuelven los mismos valores en mm', (await val('#pos-x')) === '10' && (await val('#width')) === '67,7' && (await val('#margin')) === '10');
  await setUnit('cm');
  await piece().focus();

  // flechas en el campo: 0,1 cm; Shift 1 cm; Alt 0,01 cm
  await p.focus('#pos-x');
  await p.keyboard.press('ArrowUp');
  check('cm: ↑ en X suma 0,1 cm', (await val('#pos-x')) === '1,1', await val('#pos-x'));
  await p.keyboard.press('Shift+ArrowUp');
  check('cm: Shift+↑ suma 1 cm', (await val('#pos-x')) === '2,1', await val('#pos-x'));
  await p.keyboard.press('Alt+ArrowDown');
  check('cm: Alt+↓ resta 0,01 cm', (await val('#pos-x')) === '2,09', await val('#pos-x'));
  check('cm: se aplica a la pieza', /a 2,09\scm del borde izquierdo/.test(await piece().getAttribute('aria-label')));
  await p.fill('#pos-x', '2.5');
  await p.keyboard.press('Enter');
  check('cm: «2.5» → 2,5 cm', (await val('#pos-x')) === '2,5');
  await p.fill('#pos-x', '30 mm');
  await p.keyboard.press('Enter');
  check('cm: «30 mm» (sufijo) → 3 cm', (await val('#pos-x')) === '3');
  await p.fill('#pos-x', '1/2 in');
  await p.keyboard.press('Enter');
  check('cm: «1/2 in» → 1,27 cm', (await val('#pos-x')) === '1,27', await val('#pos-x'));
  await p.fill('#pos-x', 'hola');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  check('cm: «hola» no se entiende: vuelve y lo anuncia', (await val('#pos-x')) === '1,27' && /«hola» no es una medida válida\. Se mantiene 1,27\scm\./.test(await p.textContent('#live-assertive')), await p.textContent('#live-assertive'));
  await p.fill('#width', '0');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  check('cm: ancho 0 queda en el mínimo (escala 1 %), sin pasos de más', (await val('#width')) === '0,07' && (await val('#scale')) === '1');
  await p.fill('#margin', '1,5');
  await p.keyboard.press('Enter');
  check('cm: margen 1,5 cm', (await val('#margin')) === '1,5');
  await p.fill('#gap', '3 mm');
  await p.keyboard.press('Enter');
  check('cm: separación «3 mm» → 0,3 cm', (await val('#gap')) === '0,3');
  await h.openSheet();
  await p.fill('#grid-size', '0,5');
  await p.keyboard.press('Enter');
  check('cm: grilla 0,5 cm marca el atajo de 5 mm', (await val('#grid-size')) === '0,5' && (await p.isChecked('#grid-chips input[value="5"]')));
  for (let i = 0; i < 3; i++) await p.keyboard.press('Escape');

  // ---------- in
  await setUnit('in');
  await piece().focus();
  await h.openMeasures();
  check('in: tamaños de grilla en fracciones', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#grid-chips span')].map((x) => x.textContent.replace(/ /g, ' ')))) === '["1/8 in","1/4 in","1/2 in"]');
  check('in: carta en pulgadas', norm(await p.evaluate(() => document.querySelector('#paper option[value="letter"]').textContent)) === 'Carta (8,5 × 11 in)');
  check('in: la ayuda de las flechas', /Shift: 1\/2\sin; Alt: 1\/64\sin/.test(await p.textContent('#piece-hint')), await p.textContent('#piece-hint'));
  await p.fill('#pos-x', '1 1/2');
  await p.keyboard.press('Enter');
  check('in: «1 1/2» → 1,5 in', (await val('#pos-x')) === '1,5');
  await p.fill('#pos-y', '1-1/4"');
  await p.keyboard.press('Enter');
  check('in: «1-1/4"» → 1,25 in', (await val('#pos-y')) === '1,25');
  await p.fill('#pos-y', '25,4 mm');
  await p.keyboard.press('Enter');
  check('in: «25,4 mm» → 1 in', (await val('#pos-y')) === '1');
  await p.focus('#pos-x');
  await p.keyboard.press('ArrowUp');
  check('in: ↑ suma 1/16 in', (await val('#pos-x')) === '1,563');
  await p.keyboard.press('Shift+ArrowUp');
  check('in: Shift+↑ suma 1/2 in', (await val('#pos-x')) === '2,063');
  await p.keyboard.press('Alt+ArrowUp');
  check('in: Alt+↑ suma 1/64 in', (await val('#pos-x')) === '2,078');
  await p.fill('#pos-x', '1');
  await p.keyboard.press('Enter');
  await piece().focus();
  for (let i = 0; i < 16; i++) await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(700);
  check('in: 16 flechas → 1 in exacto (2 in)', /a 2\sin del borde izquierdo/.test(await piece().getAttribute('aria-label')), await piece().getAttribute('aria-label'));
  check('in: anuncio de la posición en pulgadas', await heard(p, /A 2\sin del borde izquierdo y 1\sin del superior/), await p.textContent('#live-polite'));
  await p.keyboard.press('Shift+ArrowLeft');
  check('in: Shift+← mueve 1/2 in', /a 1,5\sin del borde izquierdo/.test(await piece().getAttribute('aria-label')));
  await p.keyboard.press('Alt+ArrowLeft');
  check('in: Alt+← mueve 1/64 in', /a 1,484\sin del borde izquierdo/.test(await piece().getAttribute('aria-label')), await piece().getAttribute('aria-label'));
  await p.keyboard.press('Escape');
  await p.keyboard.press('g');
  check('in: anuncio de la grilla (5 mm = 0,197 in)', await heard(p, /Grilla visible, cada 0,197\sin/), await p.textContent('#live-polite'));
  await p.keyboard.press('g');
  await p.keyboard.press('Shift+Slash');
  check('in: tabla de atajos con pasos en pulgadas', /Mover la pieza 1\/16\sin \(Shift: 1\/2\sin; Alt: 1\/64\sin\)/.test(await p.textContent('#shortcuts-rows')));
  await p.keyboard.press('Escape');
  await setUnit('mm');
  check('la unidad se recuerda (localStorage)', (await p.evaluate(() => localStorage.getItem('scooch:unit-preference'))) === 'mm');
  await setUnit('in');
  await p.reload();
  await p.waitForFunction(() => !document.body.classList.contains('is-loading'));
  check('al recargar sigue en pulgadas', norm(await p.textContent('#paper-label')) === 'A4 · 8,268 × 11,693 in');

  await p.focus('#prefs-open');
  await p.keyboard.press('Enter');
  await p.waitForSelector('#prefs[open]');
  for (let i = 0; i < 5 && !(await p.evaluate(() => document.activeElement.name === 'unit')); i++) await p.keyboard.press('Tab');
  await p.keyboard.press('ArrowLeft');
  check('Preferencias con teclado: flechas en el segmentado (in → cm)', (await p.evaluate(() => document.querySelector('input[name="unit"]:checked').value)) === 'cm');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(80);
  check('Esc cierra y el foco vuelve al engranaje', (await p.evaluate(() => document.activeElement.id)) === 'prefs-open');
  check('tooltip del engranaje', (await p.getAttribute('#prefs-open', 'data-tip')) === 'Preferencias');

  check('sin errores de consola', s.errors.length === 0, s.errors.join(' | '));
  const failures = report();
  await s.browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
