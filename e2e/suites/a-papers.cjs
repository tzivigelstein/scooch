// A. Papeles: presets agrupados, personalizado válido e inválido, coincidencia con preset,
// preferencia recordada y PDF con el tamaño de página correcto.
const { open, makeChecker, helpers, norm, addFiles, pill, pdfInfo, download } = require('../lib/sheets.cjs');

(async () => {
  const { check, report } = makeChecker('A. Papeles');
  const s = await open();
  const p = s.page;
  const h = helpers(p);

  const groups = await p.evaluate(() => [...document.querySelectorAll('#paper optgroup')].map((g) => [g.label, [...g.children].map((o) => o.value)]));
  check('4 grupos en orden: Serie A, Serie B, América, Fotográfico', JSON.stringify(groups.map((g) => g[0])) === JSON.stringify(['Serie A', 'Serie B', 'América', 'Fotográfico']), JSON.stringify(groups.map((g) => g[0])));
  check('América: Carta, Oficio, Folio, Tabloide (ids de papers.js)', JSON.stringify(groups[2][1]) === JSON.stringify(['letter', 'legal', 'folio', 'tabloid']));
  const names = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#paper option')].map((o) => [o.value, o.textContent.replace(/ /g, ' ')])));
  check('nombres visibles desde el copy', names.letter === 'Carta (215,9 × 279,4 mm)' && names.legal === 'Oficio (215,9 × 355,6 mm)' && names.folio === 'Folio (216 × 330 mm)' && names['photo-10x15'] === 'Foto 10 × 15 (101,6 × 152,4 mm)', JSON.stringify([names.letter, names.legal, names.folio, names['photo-10x15']]));
  check('«Personalizado» al final, fuera de los grupos', await p.evaluate(() => { const o = document.querySelector('#paper option[value="custom"]'); return o && o.parentElement.tagName === 'SELECT' && o === document.querySelector('#paper').lastElementChild; }));
  check('A4 por omisión', (await p.inputValue('#paper')) === 'A4' && norm(await p.textContent('#paper-label')) === 'A4 · 210 × 297 mm');

  await h.openSheet();
  await p.selectOption('#paper', 'folio');
  check('Folio: etiqueta de la hoja', norm(await p.textContent('#paper-label')) === 'Folio · 216 × 330 mm');
  check('Folio: sin campos de personalizado', !(await p.isVisible('#custom-paper')));
  await addFiles(p, ['small.jpg']);
  let d = await download(p);
  let info = await pdfInfo(d.file);
  check('Folio: nombre del archivo pliego-folio.pdf', d.name === 'pliego-folio.pdf', d.name);
  check('Folio: página de 216 × 330 mm', info.pages.length === 1 && info.pages[0].w === 216 && info.pages[0].h === 330, JSON.stringify(info.pages));
  check('Folio: título del PDF', info.title === 'Pliego Folio', info.title);
  await p.keyboard.press('Escape');

  await h.openSheet();
  await p.selectOption('#paper', 'custom');
  check('Personalizado: muestra ancho y alto', (await p.isVisible('#paper-w')) && (await p.isVisible('#paper-h')));
  check('arranca con el tamaño de ahora', (await p.inputValue('#paper-w')) === '216' && (await p.inputValue('#paper-h')) === '330');
  check('coincide con un preset: lo muestra', norm(await p.textContent('#paper-match')) === 'Coincide con Folio' && (await p.isVisible('#paper-match')));
  check('la coincidencia describe los campos', (await p.getAttribute('#paper-w', 'aria-describedby')) === 'paper-match');
  check('etiqueta con el nombre del preset que coincide', norm(await p.textContent('#paper-label')) === 'Folio · 216 × 330 mm', norm(await p.textContent('#paper-label')));
  check('nombres accesibles con la unidad', (await p.getAttribute('#paper-w', 'aria-label')) === 'Ancho de la hoja, en milímetros' && (await p.getAttribute('#paper-h', 'aria-label')) === 'Alto de la hoja, en milímetros');

  await p.fill('#paper-w', '200');
  await p.fill('#paper-h', '250');
  await p.keyboard.press('Enter');
  check('personalizado válido: 200 × 250 mm', norm(await p.textContent('#paper-label')) === 'Personalizado · 200 × 250 mm', norm(await p.textContent('#paper-label')));
  check('sin coincidencia: no la muestra', !(await p.isVisible('#paper-match')));
  check('vertical (200 < 250)', await p.isChecked('#portrait'));
  await p.fill('#paper-w', '300');
  await p.keyboard.press('Enter');
  check('300 × 250: queda horizontal', (await p.isChecked('#landscape')) && norm(await p.textContent('#paper-label')) === 'Personalizado · 300 × 250 mm');
  await p.fill('#paper-w', '29.7 cm');
  await p.fill('#paper-h', '21 cm');
  await p.keyboard.press('Enter');
  check('«29.7 cm» × «21 cm» → coincide con A4 horizontal', norm(await p.textContent('#paper-match')) === 'Coincide con A4 horizontal', norm(await p.textContent('#paper-match')));
  check('sigue en «Personalizado» (no cambia el selector solo)', (await p.inputValue('#paper')) === 'custom');

  await p.fill('#paper-w', '5');
  check('inválido (muy chico): mensaje visible', norm(await p.textContent('#paper-error')) === 'El ancho mínimo es 20 mm' && (await p.isVisible('#paper-error')));
  check('inválido: aria-invalid y aria-describedby al mensaje', (await p.getAttribute('#paper-w', 'aria-invalid')) === 'true' && /paper-error/.test(await p.getAttribute('#paper-w', 'aria-describedby')));
  check('inválido: no dice con qué preset coincide (sería el tamaño anterior)', !(await p.isVisible('#paper-match')));
  check('inválido: no cambia la hoja', /297 × 210 mm/.test(norm(await p.textContent('#paper-label'))));
  await p.fill('#paper-h', '2500');
  check('inválido (muy grande, en el alto)', norm(await p.textContent('#paper-error')) === 'El alto máximo es 2000 mm' && (await p.getAttribute('#paper-h', 'aria-invalid')) === 'true' && (await p.getAttribute('#paper-w', 'aria-invalid')) === null);
  await p.fill('#paper-h', 'abc');
  check('inválido (no es un número)', norm(await p.textContent('#paper-error')) === 'Escribe el alto con números, por ejemplo 330');
  await p.fill('#paper-h', '1/');
  check('a medio escribir («1/»): todavía no es error', !(await p.isVisible('#paper-error')));
  await p.fill('#paper-h', '9');
  await p.keyboard.press('Tab');
  await p.waitForTimeout(150);
  check('al salir con algo inválido: vuelve al valor anterior', (await p.inputValue('#paper-h')) === '210' && !(await p.isVisible('#paper-error')) && (await p.getAttribute('#paper-h', 'aria-invalid')) === null);
  check('…y lo anuncia', /El alto mínimo es 20 mm\. Se mantiene 210 mm\./.test(norm(await p.textContent('#live-assertive'))), norm(await p.textContent('#live-assertive')));

  await p.fill('#paper-w', '123,4');
  await p.fill('#paper-h', '170');
  await p.keyboard.press('Enter');
  await p.keyboard.press('Escape');
  d = await download(p);
  info = await pdfInfo(d.file);
  check('personalizado: nombre del archivo con las medidas', d.name === 'pliego-123x170mm.pdf', d.name);
  check('personalizado: página de 123,4 × 170 mm', info.pages[0].w === 123.4 && info.pages[0].h === 170, JSON.stringify(info.pages[0]));
  check('personalizado: título con las medidas', /^Pliego 123,4\s×\s170\smm$/.test(info.title), info.title);
  check('aviso de descarga con el nombre', /^Se descargó pliego-123x170mm\.pdf/.test((await pill(p)).text));

  await p.keyboard.press('Control+z');
  check('deshacer: vuelve el alto anterior', norm(await p.textContent('#paper-label')) === 'Personalizado · 123,4 × 210 mm', norm(await p.textContent('#paper-label')));
  await p.keyboard.press('Control+z');
  check('deshacer otra vez: vuelve el ancho anterior (A4 horizontal)', norm(await p.textContent('#paper-label')) === 'A4 · 297 × 210 mm', norm(await p.textContent('#paper-label')));
  await p.keyboard.press('Control+Shift+z');
  await p.keyboard.press('Control+Shift+z');
  check('rehacer ×2: 123,4 × 170 mm', norm(await p.textContent('#paper-label')) === 'Personalizado · 123,4 × 170 mm');

  await h.openSheet();
  await p.fill('#paper-w', '111');
  await p.keyboard.press('Enter');
  await p.selectOption('#paper', 'A5');
  check('A5 elegido', norm(await p.textContent('#paper-label')) === 'A5 · 148 × 210 mm');
  await p.selectOption('#paper', 'custom');
  check('«Personalizado» recuerda el último (111 × …)', (await p.inputValue('#paper-w')) === '111', await p.inputValue('#paper-w'));
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('custom-paper')));
  check('preferencia local guardada', saved && saved.w === 111, JSON.stringify(saved));
  check('etiqueta de la hoja con personalizado', /^Personalizado · 111 × \d+ mm$/.test(norm(await p.textContent('#paper-label'))));

  check('sin errores de consola', s.errors.length === 0, s.errors.join(' | '));
  const failures = report();
  await s.browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
