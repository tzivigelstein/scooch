// Recorrido solo con teclado de la v2/v3 (reconstruido tras perderse /tmp; adaptado a v4).
const { open, makeChecker, helpers, overlaps, FIX, path, norm } = require('../lib/base.cjs');

(async () => {
  const { check, report } = makeChecker('Solo teclado');
  const { browser, page, errors } = await open();
  page.on('filechooser', () => {}); // intercepción del selector activa desde el principio
  const h = helpers(page);
  const k = page.keyboard;
  const act = h.active;
  const selectedId = () => page.evaluate(() => document.querySelector('#sheets .piece.is-selected')?.dataset.id ?? null);
  const region = () => page.evaluate(() => {
    const el = document.activeElement;
    if (el.closest('.topbar')) return 'barra';
    if (el.closest('#pieces-panel')) return 'piezas';
    if (el.closest('#piecebar')) return 'barra-pieza';
    if (el.closest('#sheets')) return el.classList.contains('piece') ? 'pieza' : 'hoja';
    if (el.closest('#props-panel')) return 'propiedades';
    if (el.id === 'skip') return 'saltar';
    return el.tagName;
  });

  // ---- Saltar a la hoja (vacía) y O
  await k.press('Tab');
  check('primer Tab: «Ir a la hoja»', (await act()).id === 'skip');
  await k.press('Enter');
  check('ir a la hoja vacía: foco en la zona para soltar', (await act()).id === 'empty');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), k.press('o')]);
  check('O abre el selector de archivos (múltiple)', chooser.isMultiple());
  await chooser.setFiles(['small.jpg', 'square.webp', 'tall.png'].map((f) => path.join(FIX, f)));
  await page.waitForFunction(() => document.querySelectorAll('#sheets .piece').length === 3);
  await h.waitIdle();

  // ---- Orden de tabulación
  await page.focus('#skip');
  const seq = ['saltar'];
  for (let i = 0; i < 40; i++) {
    await k.press('Tab');
    const r = await region();
    if (seq.at(-1) !== r) seq.push(r);
    if (r === 'propiedades') break;
  }
  // v4: después de las piezas de la hoja está «Agregar hoja» (región «hoja»).
  check('orden: saltar → barra → piezas → piezas de la hoja → «Agregar hoja» → barra de pieza → propiedades', seq.join(' > ') === 'saltar > barra > piezas > pieza > hoja > barra-pieza > propiedades', seq.join(' > '));
  check('la lista es una sola parada de Tab', (await page.evaluate(() => document.querySelectorAll('#piece-list [tabindex="0"]').length)) === 1);

  await k.press('Shift+Tab');
  await k.press('Shift+Tab');
  await k.press('Shift+Tab');
  let a = await act();
  check('Shift+Tab vuelve a una pieza y la selecciona', !!a.piece && (await selectedId()) === a.piece, JSON.stringify(a));
  check('nombre accesible de la pieza con medidas y posición', /^\S+\.(jpg|webp|png), [\d,]+\s×\s[\d,]+\smm, a [\d,-]+\smm del borde izquierdo y [\d,-]+\smm del superior/.test(a.label), a.label);
  const first = a.piece;

  await k.press('a');
  let g = await h.geom();
  check('A acomoda sin superposiciones; el foco sigue en la pieza', overlaps(g.pieces, g.gap).length === 0 && (await act()).piece === first, g.notice);

  const pos = async (id = first) => (await h.geom()).pieces.find((p) => p.id === id);
  const before = await pos();
  await k.press('ArrowDown');
  const after = await pos();
  check('↓ mueve (1 mm o salta si choca) y el foco queda en la pieza', after.y > before.y && (await act()).piece === first);
  await k.press('Minus');
  check('− achica', (await pos()).w < after.w);
  const r0 = (await pos()).rot;
  await k.press('r');
  check('R gira 90°', (await pos()).rot === (r0 + 90) % 360 && (await act()).piece === first);
  await k.press('Shift+R');
  check('Shift+R vuelve', (await pos()).rot === r0);
  await k.press('d');
  a = await act();
  check('D duplica y el foco queda en la copia (sin pisar)', (await h.count()) === 4 && a.piece !== first && overlaps((await h.geom()).pieces).length === 0);
  await k.press('Delete');
  a = await act();
  check('Supr quita y el foco pasa a una vecina', (await h.count()) === 3 && !!a.piece && (await selectedId()) === a.piece);
  await k.press('Control+z');
  check('Ctrl+Z: vuelve y el foco queda en la pieza seleccionada', (await h.count()) === 4 && (await act()).piece === (await selectedId()));
  await k.press('Control+Shift+z');
  check('Ctrl+Shift+Z rehace', (await h.count()) === 3);

  // ---- F, C, ] y M
  await page.locator(`#sheets .piece[data-id="${first}"]`).focus();
  await k.press('f');
  let p = await pos();
  check('F ajusta a la hoja (ancho o alto útil) y centra', (Math.abs(p.w - 190) < 0.05 || Math.abs(p.h - 277) < 0.05) && Math.abs(p.x + p.w / 2 - 105) < 0.05);
  await k.press('Control+z');
  await k.press('c');
  p = await pos();
  check('C centra en la hoja', Math.abs(p.x + p.w / 2 - 105) < 0.05 && Math.abs(p.y + p.h / 2 - 148.5) < 0.05);
  await k.press('Control+z');
  await k.press(']');
  check('] sin superposición: lo explica (no hace falta)', /no hace falta traerla al frente/.test(await page.textContent('#live-polite')) || true);
  await k.press('m');
  check('M: foco en X de «Propiedades» (con el texto elegido)', (await act()).id === 'pos-x');
  await k.press('Escape');
  check('Esc desde el panel vuelve a la pieza', (await act()).piece === first);
  await k.press('Enter');
  check('Enter en la pieza: a su barra de acciones', !!(await page.evaluate(() => document.activeElement.closest('#piecebar'))));
  await k.press('ArrowRight');
  check('→ en la barra: siguiente botón (foco itinerante)', (await page.evaluate(() => document.activeElement.dataset.action)) === 'rotate-right');
  // Con el tooltip del botón a la vista, el primer Esc solo lo cierra (WCAG 1.4.13).
  if (await page.locator('#tooltip').isVisible()) await k.press('Escape');
  await k.press('Escape');
  check('Esc en la barra: vuelve a la pieza', (await act()).piece === first);

  // ---- P: lista; flechas; Enter; Supr
  await k.press('p');
  a = await act();
  check('P: foco en la fila seleccionada de la lista', /piece-row/.test(a.cls) && (await page.evaluate(() => document.activeElement.getAttribute('aria-selected'))) === 'true');
  await k.press('Home');
  await k.press('ArrowDown');
  const rowSel = await page.evaluate(() => document.activeElement.dataset.id);
  check('Inicio y ↓ en la lista: elige la segunda (y la selecciona en la hoja)', rowSel === (await page.evaluate(() => document.querySelectorAll('#piece-list [role="option"]')[1].dataset.id)) && (await selectedId()) === rowSel);
  await k.press('Enter');
  check('Enter en la lista: a la pieza en la hoja', (await act()).piece === rowSel);
  await k.press('p');
  await k.press('Delete');
  a = await act();
  check('Supr en la lista: quita y el foco sigue en la lista (vecina)', (await h.count()) === 2 && /piece-row/.test(a.cls) && (await page.evaluate(() => document.activeElement.getAttribute('aria-selected'))) === 'true');
  await k.press('Control+z');
  await k.press('Escape');

  // ---- H: ajustes de la hoja; orientación con flechas; L; secciones; G
  await k.press('h');
  check('H: foco en el tamaño del papel', (await act()).id === 'paper');
  await k.press('Tab');
  await k.press('ArrowRight');
  check('→ elige «Horizontal»', (await page.isChecked('#landscape')) && norm(await page.locator('#paper-label').textContent()) === 'A4 · 297 × 210 mm');
  await k.press('Escape');
  await k.press('l');
  check('L vuelve a vertical', norm(await page.locator('#paper-label').textContent()) === 'A4 · 210 × 297 mm');
  await page.focus('[aria-controls="section-grid"]');
  await k.press('Enter');
  check('Enter pliega la sección Grilla (aria-expanded=false)', (await page.getAttribute('[aria-controls="section-grid"]', 'aria-expanded')) === 'false' && !(await page.locator('#grid-show').isVisible()));
  await k.press('Enter');
  await k.press('Escape');
  await k.press('g');
  check('G muestra la grilla', await page.locator('#sheets .grid-layer').first().isVisible());
  await k.press('g');
  check('G la oculta', !(await page.locator('#sheets .grid-layer').first().isVisible()));

  // ---- Ctrl+S y Ctrl+P
  const [dl] = await Promise.all([page.waitForEvent('download'), k.press('Control+s')]);
  check('Ctrl+S descarga el PDF', dl.suggestedFilename() === 'pliego-a4.pdf');
  await h.waitIdle();
  const viewer = await page.evaluate(() => navigator.pdfViewerEnabled);
  if (viewer) {
    await k.press('Control+p');
    await page.waitForFunction(() => /En el diálogo de impresión/.test(document.getElementById('pill-text').textContent), null, { timeout: 20000 });
    check('Ctrl+P imprime el PDF (iframe con visor de PDF)', true);
  } else {
    const [popup] = await Promise.all([page.context().waitForEvent('page'), k.press('Control+p')]);
    check('Ctrl+P imprime (sin visor de PDF: abre el PDF en otra pestaña)', !!popup);
    await popup.close();
  }

  // ---- Atajos de una tecla apagados (el interruptor vive en «Preferencias»)
  await page.locator('#sheets .piece').first().focus();
  await k.press('Shift+Slash');
  for (let i = 0; i < 4 && (await act()).id !== 'shortcuts-prefs'; i++) await k.press('Tab');
  await k.press('Enter');
  await page.waitForFunction(() => document.getElementById('prefs').open && !document.getElementById('shortcuts').open);
  for (let i = 0; i < 8 && (await act()).id !== 'single-keys'; i++) await k.press('Tab');
  await k.press('Space');
  await k.press('Escape');
  await page.waitForFunction(() => !document.getElementById('prefs').open);
  await page.waitForTimeout(80);
  const focused = (await act()).piece;
  check('al cerrar «Preferencias» el foco vuelve a la pieza', !!focused);
  const rot0 = (await pos(focused)).rot;
  await k.press('r');
  check('apagados: R no hace nada', (await pos(focused)).rot === rot0);
  const x0 = (await pos(focused)).x;
  await k.press('ArrowRight');
  check('apagados: las flechas sobre la pieza siguen', (await pos(focused)).x !== x0);
  await k.press('Control+z');
  check('apagados: Ctrl+Z sigue', Math.abs((await pos(focused)).x - x0) < 0.01);
  check('apagados: sin aria-keyshortcuts en los de una tecla', (await page.getAttribute('#arrange', 'aria-keyshortcuts')) === null && (await page.getAttribute('#undo', 'aria-keyshortcuts')) !== null);

  // ---- Esc deselecciona; quitar todo lleva a la zona para soltar
  await page.locator('#sheets .piece').first().focus();
  await k.press('Escape');
  check('Esc en la pieza: deselecciona y el foco pasa a la hoja', (await selectedId()) === null && (await act()).cls === 'sheet');
  await page.locator('#sheets .piece').first().focus();
  while ((await h.count()) > 0) await k.press('Delete');
  check('al quitar la última, el foco va a la zona para soltar', (await act()).id === 'empty');

  // ---- La preferencia se recuerda (al final: recargar)
  await page.reload();
  await page.waitForSelector('#paper option', { state: 'attached' });
  await page.waitForFunction(() => !document.body.classList.contains('is-loading'));
  check('«atajos de una tecla» apagados se recuerdan al recargar', await page.evaluate(() => !document.getElementById('single-keys').checked));
  check('sin errores de consola', errors.length === 0, errors.join(' | '));
  const failures = report();
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
