// Imprimir (iframe + print() espiado), caminos alternativos, descarga y resolución de impresión
// (reconstruida tras perderse /tmp; adaptada a v4).
const { open, makeChecker, helpers, OUT, path, fs, norm } = require('../lib/base.cjs');
const { pdfInfo } = require('../lib/sheets.cjs');

const SPY = (mode) => {
  window.__print = { calls: [], blobs: [], mode };
  const create = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    const url = create.call(this, obj);
    if (obj instanceof Blob && obj.type === 'application/pdf') window.__print.blobs.push({ url, blob: obj });
    return url;
  };
  const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get() {
      const w = desc.get.call(this);
      if (w && this.classList.contains('print-frame') && !w.__spied) {
        w.__spied = true;
        const frame = this;
        w.print = () => {
          if (window.__print.mode === 'throw') throw new Error('print() falló (forzado)');
          window.__print.calls.push({ src: frame.src, contentType: frame.contentDocument?.contentType ?? null });
        };
      }
      return w;
    },
  });
  const openTab = window.open;
  window.open = function (url, ...rest) {
    window.__print.opened = String(url);
    return openTab.call(this, url, ...rest);
  };
};
const spy = (mode) => [{ content: `(${SPY})(${JSON.stringify(mode)})` }];

async function savePdfFromBlob(page, index, file) {
  const b64 = await page.evaluate(async (i) => {
    const blob = window.__print.blobs.at(i).blob;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }, index);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

(async () => {
  const { check, report } = makeChecker('Imprimir, descargar y resolución');
  const allErrors = [];

  // ---------- 1. Imprimir por iframe (Chrome con visor de PDF)
  {
    const s = await open({ launch: { channel: 'chromium' }, init: spy('spy') });
    const h = helpers(s.page);
    check('Chrome con visor de PDF (pdfViewerEnabled)', await s.page.evaluate(() => navigator.pdfViewerEnabled === true));
    check('«Imprimir» deshabilitado sin piezas', await s.page.locator('#print').isDisabled());
    await h.load('big.png', 'small.jpg');
    await s.page.click('#print');
    await s.page.waitForFunction(() => window.__print.calls.length === 1, null, { timeout: 20000 });
    const call = await s.page.evaluate(() => window.__print.calls[0]);
    const blobUrl = await s.page.evaluate(() => window.__print.blobs.at(-1).url);
    check('Imprimir: print() invocado en el contentWindow del iframe', !!call);
    check('Imprimir: el iframe cargó el PDF (application/pdf)', call.contentType === 'application/pdf' && call.src === blobUrl, JSON.stringify(call));
    const frameInfo = await s.page.evaluate(() => {
      const f = document.querySelector('iframe.print-frame');
      const cs = getComputedStyle(f);
      return { n: document.querySelectorAll('iframe.print-frame').length, display: cs.display, left: f.getBoundingClientRect().left, hidden: f.getAttribute('aria-hidden'), tab: f.tabIndex, title: f.title };
    });
    check('iframe oculto fuera de pantalla (no display:none), aria-hidden, tabindex -1, con title', frameInfo.display !== 'none' && frameInfo.left < -1000 && frameInfo.hidden === 'true' && frameInfo.tab === -1 && !!frameInfo.title, JSON.stringify(frameInfo));
    await savePdfFromBlob(s.page, -1, path.join(OUT, 'print-a4.pdf'));
    const printed = await pdfInfo(path.join(OUT, 'print-a4.pdf'));
    check('el PDF impreso: 1 página A4 con 2 imágenes', printed.pages.length === 1 && printed.pages[0].w === 210 && printed.pages[0].h === 297 && printed.pages[0].xobjects === 2, JSON.stringify(printed.pages));
    let g = await h.geom();
    check('Imprimir: consejo contextual en la píldora', g.notice === 'En el diálogo de impresión, elige «Tamaño real» o «100 %» y el papel A4', g.notice);
    await s.page.mouse.move(5, 300);
    await s.page.waitForTimeout(6000);
    check('el consejo de impresión no se va solo', (await h.geom()).notice.startsWith('En el diálogo de impresión'));
    await s.page.click('#print');
    await s.page.waitForFunction(() => window.__print.calls.length === 2, null, { timeout: 20000 });
    check('segunda impresión: reusa el mismo iframe', (await s.page.locator('iframe.print-frame').count()) === 1);
    // El PDF descargado es el mismo que el impreso
    const [d] = await Promise.all([s.page.waitForEvent('download'), s.page.click('#export')]);
    await d.saveAs(path.join(OUT, 'download-a4.pdf'));
    const downloaded = await pdfInfo(path.join(OUT, 'download-a4.pdf'));
    check('descargar e imprimir dan el mismo PDF (contenido)', JSON.stringify(downloaded.pages) === JSON.stringify(printed.pages));
    check('título del PDF', downloaded.title === 'Scooch A4', downloaded.title);
    allErrors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 2. print() falla → abre el PDF en otra pestaña
  {
    const s = await open({ launch: { channel: 'chromium' }, init: spy('throw') });
    const h = helpers(s.page);
    await h.load('small.jpg');
    const [popup] = await Promise.all([s.context.waitForEvent('page'), s.page.click('#print')]);
    check('si print() falla: abre el PDF en otra pestaña', !!popup && (await s.page.evaluate(() => /^blob:/.test(window.__print.opened ?? ''))));
    await s.page.waitForFunction(() => /otra pestaña/.test(document.getElementById('pill-text').textContent));
    check('…y lo explica', /^Se abrió el PDF en otra pestaña\. Imprímelo desde ahí con «Tamaño real» o «100 %» y el papel A4\.$/.test(norm(await s.page.textContent('#pill-text'))), norm(await s.page.textContent('#pill-text')));
    await popup.close();
    allErrors.push(...s.errors.filter((e) => !/print\(\) falló/.test(e)));
    await s.browser.close();
  }

  // ---------- 3. Sin visor de PDF (headless shell): abre otra pestaña; ventana bloqueada: descarga
  {
    const s = await open({ init: spy('spy') });
    const h = helpers(s.page);
    check('sin visor de PDF (headless shell)', await s.page.evaluate(() => navigator.pdfViewerEnabled === false));
    await h.load('small.jpg');
    const [popup] = await Promise.all([s.context.waitForEvent('page'), s.page.click('#print')]);
    check('sin visor: abre el PDF en otra pestaña (sin iframe)', !!popup && (await s.page.locator('iframe.print-frame').count()) === 0);
    await popup.close();
    await s.page.evaluate(() => (window.open = () => null));
    const [d] = await Promise.all([s.page.waitForEvent('download'), s.page.click('#print')]);
    check('ventanas bloqueadas: descarga el PDF', d.suggestedFilename() === 'scooch-a4.pdf');
    await s.page.waitForFunction(() => /Ábrelo e imprímelo/.test(document.getElementById('pill-text').textContent));
    check('…y explica cómo imprimirlo', /^Se descargó scooch-a4\.pdf\. Ábrelo e imprímelo con «Tamaño real» o «100 %» y el papel A4\.$/.test(norm(await s.page.textContent('#pill-text'))));
    allErrors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 4. Descarga, nombre, atajos y resolución de impresión
  {
    const s = await open();
    const h = helpers(s.page);
    await h.load('small.jpg', 'twopage.pdf', 'rotated.pdf');
    const [d] = await Promise.all([s.page.waitForEvent('download'), s.page.click('#export')]);
    check('descargar: scooch-a4.pdf', d.suggestedFilename() === 'scooch-a4.pdf');
    check('descargar: «%PDF-»', fs.readFileSync(await d.path()).subarray(0, 5).toString() === '%PDF-');
    await h.waitIdle();
    check('aviso de descarga con el consejo', /^Se descargó scooch-a4\.pdf\. Al imprimirlo, elige «Tamaño real» o «100 %»\.$/.test((await h.geom()).notice));
    const [d2] = await Promise.all([s.page.waitForEvent('download'), s.page.keyboard.press('Control+e')]);
    check('Ctrl+E también descarga', d2.suggestedFilename() === 'scooch-a4.pdf');
    await h.waitIdle();
    await h.pieceByName('small.jpg').focus();
    await h.openMeasures();
    check('imagen a 100 %: «Se imprime a 300 ppp»', /^Se imprime a 300\sppp$/.test(await s.page.textContent('#resolution-text')), await s.page.textContent('#resolution-text'));
    check('nivel bueno: ícono de verificación', (await s.page.getAttribute('#resolution-note', 'data-level')) === 'good');
    await h.setMeasure('scale', 200);
    check('a 200 %: 150 ppp con «Calidad aceptable»', /^Se imprime a 150\sppp · Calidad aceptable$/.test(await s.page.textContent('#resolution-text')), await s.page.textContent('#resolution-text'));
    await h.setMeasure('scale', 400);
    check('a 400 %: 75 ppp con «Puede verse pixelada»', /^Se imprime a 75\sppp · Puede verse pixelada$/.test(await s.page.textContent('#resolution-text')) && (await s.page.getAttribute('#resolution-note', 'data-level')) === 'low', await s.page.textContent('#resolution-text'));
    check('baja resolución: distintivo en la lista', (await s.page.locator('.piece-row[aria-selected="true"] .row-badge[data-kind="lowRes"]').count()) === 1);
    await s.page.keyboard.press('Control+z');
    await s.page.keyboard.press('Control+z');
    await h.pieceByName('twopage.pdf').focus();
    check('PDF sin giro: «Vectorial: nítida a cualquier tamaño»', (await s.page.textContent('#resolution-text')) === 'Vectorial: nítida a cualquier tamaño');
    await h.pieceByName('rotated.pdf').focus();
    check('PDF con /Rotate: se imprime como imagen (con ppp)', /^Se imprime a \d+\sppp/.test(await s.page.textContent('#resolution-text')), await s.page.textContent('#resolution-text'));
    await s.page.screenshot({ path: path.join(OUT, 'output-medidas-ppp.png') });
    const info = await pdfInfo(await d2.path());
    check('el PDF: 1 página A4 con las 3 piezas', info.pages.length === 1 && info.pages[0].xobjects === 3, JSON.stringify(info.pages));
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
