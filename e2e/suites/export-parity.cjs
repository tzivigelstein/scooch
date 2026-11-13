// Sin interfaz: el PDF exportado sin recorte ni líneas de corte es igual (contenido de cada
// página, objetos embebidos) al del build anterior, con imágenes, PDF vectorial, PDF con /Rotate,
// piezas giradas y varias hojas.
const { open, makeChecker, addFiles, lib, pdfInfo, download } = require('../lib/selection.cjs');
const { check, report } = makeChecker('PDF idéntico sin recorte ni líneas de corte');

async function exportFrom(base) {
  process.env.BASE = base;
  delete require.cache[require.resolve('../lib/base.cjs')];
  const s = await open();
  const p = s.page;
  const L = lib(p);
  await addFiles(p, ['big.png', 'small.jpg', 'square.webp', 'tall.png', 'twopage.pdf', 'rotated.pdf', 'exif6.jpg']);
  await p.locator('#arrange').click();
  await p.waitForTimeout(100);
  const ids = await L.ids();
  // Giradas y una en otra hoja
  await L.selectIds([ids[1]]);
  await L.piece(ids[1]).focus();
  await p.keyboard.press('r');
  await L.piece(ids[2]).focus();
  await p.keyboard.press('Shift+r');
  await L.piece(ids[3]).focus();
  await p.keyboard.press('Shift+PageDown');
  const { file } = await download(p);
  const info = await pdfInfo(file);
  await s.browser.close();
  return { info, errors: s.errors };
}

(async () => {
  try {
    const current = process.env.BASE;
    const before = await exportFrom(process.env.PARITY_BASE);
    const after = await exportFrom(current);
    check('mismas páginas y medidas', JSON.stringify(before.info.pages.map((pg) => [pg.w, pg.h])) === JSON.stringify(after.info.pages.map((pg) => [pg.w, pg.h])), JSON.stringify(after.info.pages.map((pg) => [pg.w, pg.h])));
    before.info.pages.forEach((pg, i) => {
      const now = after.info.pages[i];
      check(`página ${i + 1}: contenido idéntico (${pg.xobjects} objetos)`, now && now.content === pg.content && now.xobjects === pg.xobjects, `${pg.content} vs ${now?.content}`);
      check(`página ${i + 1}: objetos embebidos idénticos`, now && JSON.stringify(now.objects.slice().sort()) === JSON.stringify(pg.objects.slice().sort()));
    });
    check('sin errores de consola', !before.errors.length && !after.errors.length, [...before.errors, ...after.errors].join(' | '));
  } catch (err) {
    check('sin excepciones', false, err.stack);
  }
  process.exit(report() ? 1 : 0);
})();
