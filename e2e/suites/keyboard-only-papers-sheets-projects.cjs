// Recorrido solo con teclado (ningún evento de mouse) de los papeles, las unidades, varias hojas y los proyectos.
const { open, makeChecker, norm, sheets, heard, fx } = require('../lib/sheets.cjs');
const cards = (from, n) => Array.from({ length: n }, (_, i) => `card${String(from + i).padStart(2, '0')}.png`);

(async () => {
  const { check, report } = makeChecker('Solo teclado: papeles, unidades, hojas y proyectos');
  const s = await open();
  const p = s.page;
  // La intercepción del selector de archivos se activa al primer oyente: se activa ya.
  p.on('filechooser', () => {});
  const k = p.keyboard;
  const act = () => p.evaluate(() => ({ id: document.activeElement.id, cls: String(document.activeElement.className), label: document.activeElement.getAttribute('aria-label'), act: document.activeElement.dataset?.act, sheet: document.activeElement.closest('.page')?.dataset.sheet }));
  const tabTo = async (pred, max = 40, back = false) => {
    for (let i = 0; i < max; i++) {
      if (pred(await act())) return true;
      await k.press(back ? 'Shift+Tab' : 'Tab');
    }
    return pred(await act());
  };

  // ---- D: nombre en la barra
  await p.focus('#skip');
  check('Tab llega al nombre del proyecto (junto a la marca)', await tabTo((a) => a.id === 'project-name', 5));
  await k.press('Enter');
  check('Enter: campo para cambiar el nombre, con el texto seleccionado', (await act()).id === 'project-name-input' && (await p.evaluate(() => document.activeElement.selectionEnd - document.activeElement.selectionStart)) > 0);
  await k.type('Tarjetas');
  await k.press('Enter');
  check('Enter guarda y vuelve al botón', (await act()).id === 'project-name' && norm(await p.textContent('#project-name-text')) === 'Tarjetas');
  await k.press('Tab');
  check('Tab: «Proyectos»', (await act()).id === 'projects-open');
  await k.press('Enter');
  await p.waitForSelector('#projects[open]');
  check('Enter abre el diálogo con el foco en «Nuevo proyecto»', (await act()).id === 'project-new');
  await k.press('Escape');
  await p.waitForFunction(() => !document.getElementById('projects').open);
  await p.waitForTimeout(80);
  check('Esc cierra y el foco vuelve a «Proyectos»', (await act()).id === 'projects-open');

  // ---- B: Preferencias
  check('Tab llega al engranaje', await tabTo((a) => a.id === 'prefs-open', 12));
  await k.press('Enter');
  await p.waitForSelector('#prefs[open]');
  for (let i = 0; i < 4 && !(await p.evaluate(() => document.activeElement.name === 'unit')); i++) await k.press('Tab');
  check('foco en el segmentado de unidades (mm)', await p.evaluate(() => document.activeElement.name === 'unit' && document.activeElement.value === 'mm'));
  await k.press('ArrowRight');
  check('→ elige cm', await p.evaluate(() => document.querySelector('input[name="unit"]:checked').value === 'cm'));
  await k.press('Tab');
  check('Tab: «Atajos de 1 tecla»', (await act()).id === 'single-keys');
  await k.press('Escape');
  await p.waitForFunction(() => !document.getElementById('prefs').open);
  await p.waitForTimeout(80);
  check('Esc cierra y vuelve al engranaje; la hoja ya está en cm', (await act()).id === 'prefs-open' && norm(await p.textContent('#paper-label')) === 'A4 · 21 × 29,7 cm');

  // ---- A: papel personalizado desde el teclado (H va a la sección Hoja)
  await p.focus('#skip');
  await k.press('Tab');
  await k.press('Escape');
  await k.press('h');
  check('H: focus on the Hoja tab', (await act()).id === 'props-tab-sheet');
  await k.press('Tab');
  await k.press('Tab');
  check('Tab (past the «Papel» header): the paper size', (await act()).id === 'paper');
  await k.press('End');
  check('Fin: «Personalizado» con los campos de ancho y alto', (await p.inputValue('#paper')) === 'custom' && (await p.isVisible('#paper-w')));
  check('Tab llega al ancho (después de la orientación)', await tabTo((a) => a.id === 'paper-w', 4));
  await k.press('Control+a');
  await k.type('30');
  await k.press('Tab');
  await k.press('Control+a');
  await k.type('20');
  await k.press('Enter');
  check('30 × 20 cm: hoja personalizada horizontal', norm(await p.textContent('#paper-label')) === 'Personalizado · 30 × 20 cm' && (await p.isChecked('#landscape')));
  await k.press('ArrowUp');
  check('↑ en el alto: +0,1 cm', (await p.inputValue('#paper-h')) === '20,1');
  await k.press('Control+a');
  await k.type('1');
  check('fuera de rango: aviso accesible junto al campo mientras se escribe', norm(await p.textContent('#paper-h-limit')) === 'Mínimo 2 cm' && (await p.getAttribute('#paper-h', 'aria-invalid')) === 'true');
  await k.press('Escape');
  await p.waitForTimeout(150);
  check('Esc deshace la edición (también el paso con ↑) y vuelve a la hoja', !/paper/.test((await act()).id) && (await p.inputValue('#paper-h')) === '20', JSON.stringify([await act(), await p.inputValue('#paper-h')]));
  await k.press('h');
  await k.press('Tab');
  await k.press('Tab');
  await k.press('Home');
  for (let i = 0; i < 4; i++) await k.press('ArrowDown');
  check('flechas en el selector: A4', (await p.inputValue('#paper')) === 'A4');
  await k.press('Escape');
  // Si el selector abrió su lista, el primer Esc la cierra; el segundo vuelve a la hoja.
  if ((await act()).id === 'paper') await k.press('Escape');
  check('Esc desde el panel: foco en la hoja (zona para soltar)', (await act()).id === 'empty', JSON.stringify(await act()));

  // ---- C: varias hojas con el teclado
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), k.press('o')]);
  await chooser.setFiles(cards(0, 12).map(fx));
  await p.waitForFunction(() => document.querySelectorAll('#sheets .piece').length === 12, null, { timeout: 30000 });
  await p.waitForFunction(() => !/Cargando/.test(document.getElementById('pill').hidden ? '' : document.getElementById('pill-text').textContent));
  await p.focus('#skip');
  await k.press('Enter');
  check('«Ir a la hoja»: foco en la pieza seleccionada', /piece/.test((await act()).cls));
  let list = await sheets(p);
  check('12 piezas en 2 hojas', JSON.stringify(list.map((x) => x.pieces.length)) === '[9,3]');
  await k.press('PageUp');
  await k.press('PageUp');
  check('Re Pág: a la hoja 1', (await act()).sheet === list[0].id);
  await k.press('PageDown');
  check('Av Pág: a la hoja 2, a su primera pieza', (await act()).sheet === list[1].id && /piece/.test((await act()).cls));
  await k.press('Shift+PageDown');
  list = await sheets(p);
  check('Shift+Av Pág: la pieza va a una hoja nueva (3)', list.length === 3 && (await act()).sheet === list[2].id && (await heard(p, /Se movió a la hoja 3 de 3/)));
  await k.press('a');
  list = await sheets(p);
  check('A: acomoda en 2 hojas (9 + 3) y quita la vacía', JSON.stringify(list.map((x) => x.pieces.length)) === '[9,3]', JSON.stringify(list.map((x) => x.pieces.length)));
  check('Tab desde la pieza llega a «Agregar hoja»', await tabTo((a) => a.id === 'add-sheet', 20));
  await k.press('Enter');
  check('Enter agrega la hoja 3', (await sheets(p)).length === 3 && (await heard(p, /Se agregó la hoja 3/)));
  check('Shift+Tab llega a «Quitar la hoja 3»', (await tabTo((a) => /page-remove/.test(a.cls), 4, true)) && (await act()).label === 'Quitar la hoja 3');
  await k.press('Enter');
  check('Enter la quita (vacía: sin preguntar) y el foco queda en una hoja', (await sheets(p)).length === 2 && /sheet/.test((await act()).cls));
  await k.press('Shift+Tab');
  check('Shift+Tab: «Quitar la hoja 2»', (await act()).label === 'Quitar la hoja 2');
  await k.press('Enter');
  await p.waitForSelector('#confirm[open]');
  await k.press('Enter');
  await p.waitForTimeout(100);
  check('confirmar con Enter: quita la hoja 2 con sus 3 piezas', (await sheets(p)).length === 1 && (await p.locator('#sheets .piece').count()) === 9);
  await k.press('Control+z');
  check('Ctrl+Z la devuelve', (await sheets(p)).length === 2 && (await p.locator('#sheets .piece').count()) === 12);
  await k.press('p');
  check('P: foco en la lista (una fila)', /piece-row/.test((await act()).cls));
  for (let i = 0; i < 12; i++) await k.press('ArrowDown');
  check('↓ recorre de la hoja 1 a la 2', (await p.evaluate(() => document.activeElement.closest('[role="group"]')?.querySelector('.group-title').textContent)) === 'Hoja 2');
  await k.press('Enter');
  check('Enter: a la pieza en la hoja', /piece/.test((await act()).cls));

  // ---- D: diálogo de proyectos con el teclado
  await k.press('Control+o');
  await p.waitForSelector('#projects[open]');
  await k.press('Enter');
  await p.waitForFunction(() => document.getElementById('project-name-text').textContent === 'Sin título' && !document.querySelector('#sheets .piece'));
  check('Nuevo proyecto con Enter: en blanco y foco en la zona para soltar', (await act()).id === 'empty');
  await p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado');
  await k.press('Control+o');
  await p.waitForSelector('#projects[open]');
  await k.press('Tab');
  check('Tab: la primera tarjeta', (await act()).act === 'open');
  await k.press('ArrowDown');
  check('↓: la tarjeta de «Tarjetas»', /Tarjetas/.test((await act()).label));
  await k.press('Tab');
  await k.press('Tab');
  check('Tab: «Cambiar el nombre de «Tarjetas»»', (await act()).label === 'Cambiar el nombre de «Tarjetas»');
  await k.press('Enter');
  await k.press('Control+a');
  await k.type('Tarjetas finales');
  await k.press('Enter');
  await p.waitForFunction(() => [...document.querySelectorAll('.project-title')].some((t) => t.textContent === 'Tarjetas finales'));
  check('cambiar el nombre desde la tarjeta con el teclado', (await act()).act === 'rename');
  await k.press('Shift+Tab');
  await k.press('Shift+Tab');
  check('Shift+Tab vuelve a «Abrir»', (await act()).act === 'open');
  await k.press('Enter');
  await p.waitForFunction(() => document.getElementById('project-name-text').textContent === 'Tarjetas finales');
  check('Enter abre el proyecto, con sus 12 piezas y el foco en la hoja', (await p.locator('#sheets .piece').count()) === 12 && /sheet|piece|dropzone/.test((await act()).cls));
  await k.press('Control+o');
  await p.waitForSelector('#projects[open]');
  await k.press('Tab');
  await k.press('ArrowDown');
  for (let i = 0; i < 3; i++) await k.press('Tab');
  check('Tab: «Eliminar «Sin título»»', (await act()).label === 'Eliminar «Sin título»');
  await k.press('Enter');
  await p.waitForSelector('#confirm[open]');
  check('confirmación con el foco en «Cancelar»', (await act()).id === 'confirm-cancel');
  await k.press('Tab');
  await k.press('Enter');
  await p.waitForFunction(() => document.querySelectorAll('.project-card').length === 1);
  check('eliminar con el teclado; el foco sigue en el diálogo', !!(await p.evaluate(() => document.activeElement.closest('#projects'))));
  await k.press('Escape');

  check('sin errores de consola', s.errors.length === 0, s.errors.join(' | '));
  const failures = report();
  await s.browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
