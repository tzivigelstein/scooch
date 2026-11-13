// Paneles y lista en los tres anchos (reconstruida tras perderse /tmp; adaptada a v4).
const { open, makeChecker, helpers } = require('../lib/base.cjs');

(async () => {
  const { check, report } = makeChecker('Paneles y lista');
  const allErrors = [];

  // ---------- 1440: tres columnas, lista, secciones plegables
  {
    const s = await open();
    const p = s.page;
    const h = helpers(p);
    const vis = (sel) => p.locator(sel).isVisible();
    check('1440: panel de piezas y propiedades visibles, sin botones de panel', (await vis('#pieces-panel')) && (await vis('#props-panel')) && !(await vis('#pieces-toggle')) && !(await vis('#pieces-dock')));
    check('lista vacía: texto de ayuda y zona para agregar', (await vis('#list-empty')) && (await vis('#addzone')));
    await h.load('small.jpg', 'square.webp', 'tall.png');
    check('lista: una fila por pieza, con nombre y medidas', (await p.locator('#piece-list [role="option"]').count()) === 3 && /\d+,?\d*\s×\s\d+,?\d*\smm/.test(await p.locator('#piece-list .row-dims').first().textContent()));
    check('contador «3 piezas»', (await p.textContent('#piece-total')) === '3 piezas');
    const row = p.locator('#piece-list [role="option"]').nth(1);
    const rowId = await row.getAttribute('data-id');
    await row.click();
    check('clic en una fila: selecciona esa pieza en la hoja (marco)', (await p.evaluate((id) => document.querySelector(`#sheets .piece[data-id="${id}"]`).classList.contains('is-selected'), rowId)) && (await row.getAttribute('aria-selected')) === 'true');
    check('la fila elegida tiene el foco (una sola parada de Tab)', (await p.evaluate(() => document.activeElement.getAttribute('role'))) === 'option' && (await p.locator('#piece-list [tabindex="0"]').count()) === 1);
    await h.pieceByName('tall.png').focus();
    check('seleccionar en la hoja marca la fila', (await p.getAttribute(`#piece-list [role="option"][data-id="${await h.pieceByName('tall.png').getAttribute('data-id')}"]`, 'aria-selected')) === 'true');
    check('propiedades: nombre de la pieza seleccionada', (await p.textContent('#piece-name')) === 'tall.png');
    await h.showTab('sheet');
    check('secciones: Papel, Distribución y Grilla abiertas por omisión', (await p.getAttribute('[aria-controls="section-sheet"]', 'aria-expanded')) === 'true' && (await p.getAttribute('[aria-controls="section-arrange"]', 'aria-expanded')) === 'true' && (await p.getAttribute('[aria-controls="section-grid"]', 'aria-expanded')) === 'true');
    check('el título de la sección es «Distribución»', (await p.textContent('[aria-controls="section-arrange"]')).trim() === 'Distribución');
    await p.click('[aria-controls="section-arrange"]');
    check('plegar «Distribución»: aria-expanded=false y contenido oculto', (await p.getAttribute('[aria-controls="section-arrange"]', 'aria-expanded')) === 'false' && !(await vis('#gap')));
    await p.reload();
    await p.waitForSelector('#paper option', { state: 'attached' });
    await p.waitForFunction(() => !document.body.classList.contains('is-loading'));
    check('la sección plegada se recuerda al recargar', (await p.getAttribute('[aria-controls="section-arrange"]', 'aria-expanded')) === 'false');
    await p.click('[aria-controls="section-arrange"]');
    check('desplegar la vuelve a mostrar', await vis('#gap'));
    check('el proyecto se restauró con sus 3 piezas', (await h.count()) === 3);
    await p.click('#clear');
    check('«Quitar todas»: vacía y deja la lista vacía', (await h.count()) === 0 && (await vis('#list-empty')));
    await p.keyboard.press('Control+z');
    check('…y se puede deshacer', (await h.count()) === 3);
    allErrors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 1024: el panel de piezas se pliega a una franja
  {
    const s = await open({ viewport: { width: 1024, height: 768 } });
    const p = s.page;
    const h = helpers(p);
    await h.load('small.jpg', 'square.webp');
    check('1024: franja con botón «Piezas»; panel de piezas oculto; propiedades visibles', (await p.locator('#pieces-toggle').isVisible()) && !(await p.locator('#pieces-panel').isVisible()) && (await p.locator('#props-panel').isVisible()));
    await p.locator('#pieces-toggle').focus();
    await p.keyboard.press('Enter');
    check('abre el panel superpuesto (aria-expanded) con el foco en la lista', (await p.locator('#pieces-panel').isVisible()) && (await p.getAttribute('#pieces-toggle', 'aria-expanded')) === 'true' && /piece-row/.test((await h.active()).cls));
    await p.keyboard.press('Escape');
    check('Esc cierra y el foco vuelve al botón', !(await p.locator('#pieces-panel').isVisible()) && (await h.active()).id === 'pieces-toggle' && (await p.getAttribute('#pieces-toggle', 'aria-expanded')) === 'false');
    await h.pieceByName('small.jpg').focus();
    await p.keyboard.press('p');
    check('P abre el panel y enfoca la lista', (await p.locator('#pieces-panel').isVisible()) && /piece-row/.test((await h.active()).cls));
    await p.mouse.click(600, 700);
    check('clic afuera cierra el panel', !(await p.locator('#pieces-panel').isVisible()));
    check('1024: sin scroll horizontal', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    allErrors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 390: sin columnas; propiedades como hoja inferior; botones abajo
  {
    const s = await open({ viewport: { width: 390, height: 844 } });
    const p = s.page;
    const h = helpers(p);
    check('390: sin paneles a la vista, con «Piezas» y «Propiedades» abajo', !(await p.locator('#pieces-panel').isVisible()) && !(await p.locator('#props-panel').isVisible()) && (await p.locator('#pieces-dock').isVisible()) && (await p.locator('#props-toggle').isVisible()));
    await h.load('small.jpg', 'square.webp');
    check('contador en el botón «Piezas»', (await p.textContent('#dock-count')) === '2');
    await p.locator('#sheets .piece').first().focus();
    await p.click('#props-toggle');
    check('«Propiedades» abre la hoja inferior', (await p.locator('#props-panel').isVisible()) && (await p.getAttribute('#props-toggle', 'aria-expanded')) === 'true');
    const box = await p.locator('#props-panel').boundingBox();
    check('la hoja inferior va abajo y a todo el ancho', Math.abs(box.width - 390) < 1 && box.y + box.height >= 843);
    // Objetivos táctiles con el panel abierto
    const small = await p.evaluate(() => [...document.querySelectorAll('#props-panel button, #props-panel input, #props-panel select, #props-panel summary, .topbar button')].filter((el) => el.offsetParent && el.getBoundingClientRect().height > 0).map((el) => { const r = el.getBoundingClientRect(); const target = el.type === 'checkbox' || el.type === 'radio' ? el.closest('label, .switch-row') ?? el : el.type === 'range' ? el.closest('.scale-row') : el; const t = target.getBoundingClientRect(); return { id: el.id || el.className, w: Math.round(Math.max(r.width, t.width)), h: Math.round(Math.max(r.height, t.height)) }; }).filter((x) => x.h < 40 || x.w < 40).map((x) => `${x.id} ${x.w}×${x.h}`));
    check('objetivos táctiles ≥ 40 px (390, con propiedades abiertas)', small.length === 0, small.join(', '));
    await p.keyboard.press('Escape');
    await p.click('#pieces-dock');
    check('«Piezas» abre el panel superpuesto con foco en la lista', (await p.locator('#pieces-panel').isVisible()) && /piece-row/.test((await h.active()).cls));
    const topSmall = await p.evaluate(() => [...document.querySelectorAll('.dock-btn, #piece-list [role="option"]')].filter((el) => el.offsetParent).filter((el) => el.getBoundingClientRect().height < 40).length);
    check('objetivos táctiles ≥ 40 px (barra, botones de panel, lista)', topSmall === 0, String(topSmall));
    await p.click('.drawer-close >> visible=true');
    check('cerrar con el botón del panel', !(await p.locator('#pieces-panel').isVisible()));
    check('390: sin scroll horizontal', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    const bar = await p.evaluate(() => { const r = document.querySelector('.topbar').getBoundingClientRect(); return r.height; });
    check('390: barra superior en dos filas (marca y proyecto; acciones)', bar > 80 && bar < 110, String(bar));
    allErrors.push(...s.errors);
    await s.browser.close();
  }

  check('sin errores de consola', allErrors.length === 0, allErrors.join(' | '));
  const failures = report();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
