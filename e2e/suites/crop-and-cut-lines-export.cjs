// Sin interfaz: un proyecto guardado con recorte (imagen y PDF vectorial, girados) y líneas de corte,
// cargado directo en IndexedDB. Se restaura igual, la pantalla muestra el recorte, el PDF lleva el
// trazado de recorte (la página de PDF sigue siendo vector) y las marcas, y rasterizado coincide
// con la captura de la hoja.
const { open, makeChecker, addFiles, lib, pdfInfo, download, path, fs, OUT } = require('../lib/selection.cjs');
const { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } = require('pdf-lib');
const { check, report } = makeChecker('Recorte y líneas de corte: proyecto, pantalla y PDF');
const ROOT = path.resolve(__dirname, '../..');
const PDFJS = path.join(ROOT, 'node_modules/pdfjs-dist/build');

// Cambia el documento guardado del proyecto abierto (sin interfaz) y devuelve el nuevo.
const PATCH = async (patch) => {
  const id = localStorage.getItem('scooch:last-project');
  const db = await new Promise((res, rej) => { const r = indexedDB.open('scooch', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const get = () => new Promise((res) => { const r = db.transaction('projects').objectStore('projects').get(id); r.onsuccess = () => res(r.result); });
  const record = await get();
  const doc = record.doc;
  doc.cuts = { ...doc.cuts, ...patch.cuts }; // the stroke stays as the document has it (version 3)
  for (const [i, change] of patch.items.entries()) Object.assign(doc.items[i], change);
  await new Promise((res, rej) => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put({ ...record, doc, modified: Date.now() + 5000 }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
  return doc;
};

async function contents(file) {
  const doc = await PDFDocument.load(fs.readFileSync(file), { updateMetadata: false });
  const page = doc.getPages()[0];
  const stream = page.node.Contents();
  const list = stream.asArray ? stream.asArray().map((ref) => doc.context.lookup(ref)) : [stream];
  const text = list.map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : '')).join('\n');
  const xobj = page.node.Resources().lookup(PDFName.of('XObject'));
  const types = xobj.keys().map((k) => doc.context.lookup(xobj.get(k)).dict.get(PDFName.of('Subtype')).toString());
  return { text, types };
}

(async () => {
  const errors = [];
  try {
    const { cutLines } = await import(path.join(ROOT, 'src/core/cutmarks.js'));
    const { pieceSize } = await import(path.join(ROOT, 'src/core/crop.js'));
    const s = await open({ viewport: { width: 1440, height: 900 } });
    const p = s.page;
    const L = lib(p);
    await addFiles(p, ['big.png', 'twopage.pdf', 'small.jpg']);
    await p.locator('#arrange').click();
    await p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado', null, { timeout: 8000 });
    const cuts = { mode: 'corners', length: 4, offset: 1.5 };
    const doc = await p.evaluate(PATCH, {
      cuts,
      items: [
        { crop: { x: 0.2, y: 0.1, w: 0.5, h: 0.7 }, r: 90, scale: 40 },
        { crop: { x: 0.55, y: 0.02, w: 0.45, h: 0.5 }, r: 270, scale: 60 },
        { crop: null, r: 180 },
      ],
    });
    await p.reload();
    await p.waitForFunction(() => !document.body.classList.contains('is-loading') && document.querySelectorAll('#sheets .piece').length === 3);
    await p.waitForTimeout(300);
    // Pantalla: medidas de cada pieza = pieceSize (recorte + giro)
    const g = await L.geom();
    for (const [i, item] of doc.items.entries()) {
      const want = pieceSize(doc.assets[item.asset], item);
      const got = g.pieces[i];
      check(`pieza ${i + 1}: en pantalla mide lo de pieceSize (${want.w.toFixed(2)} × ${want.h.toFixed(2)} mm)`, Math.abs(got.w - want.w) < 0.01 && Math.abs(got.h - want.h) < 0.01, `${got.w} × ${got.h}`);
    }
    // Se restauró tal cual y se vuelve a guardar igual
    await p.keyboard.press('Escape');
    // PDF: trazado de recorte, vector, marcas
    const { file } = await download(p);
    const { text, types } = await contents(file);
    check('PDF: 2 trazados de recorte (las piezas recortadas)', (text.match(/ re\nW\nn/g) ?? []).length === 2, (text.match(/ re\nW\nn/g) ?? []).length);
    check('PDF: la página de PDF recortada sigue siendo vector (Form)', types.includes('/Form') && types.filter((t) => t === '/Image').length === 2, JSON.stringify(types));
    const boxes = doc.items.map((item) => {
      const { w, h } = pieceSize(doc.assets[item.asset], item);
      return { x: item.x, y: item.y, w, h };
    });
    const lines = cutLines(boxes, { ...cuts, bounds: { x: 0, y: 0, w: 210, h: 297 } });
    const strokes = (text.match(/ l\nS/g) ?? []).length;
    check(`PDF: ${lines.length} líneas de corte (las de cutLines)`, strokes === lines.length && lines.length > 0, `${strokes}`);
    check('PDF: líneas de 0,25 pt en negro (el trazo de un documento nuevo)', /0\.25 w/.test(text) && /0 0 0 RG/.test(text));
    // Rasterizado: sin líneas (la pantalla no las dibuja todavía), PDF vs captura de la hoja
    await p.evaluate(PATCH, { cuts: { mode: 'none', length: 4, offset: 1.5 }, items: [] });
    await p.reload();
    await p.waitForFunction(() => !document.body.classList.contains('is-loading') && document.querySelectorAll('#sheets .piece').length === 3);
    await p.addStyleTag({ content: '.grid-layer,.safe,#frame,.group-frame,#piecebar,#pill{visibility:hidden!important}.sheet{box-shadow:none!important;border-radius:0!important}' });
    await p.mouse.move(2, 2);
    await p.waitForTimeout(400);
    const sheetBox = await p.locator('.sheet').first().boundingBox();
    await p.locator('.sheet').first().screenshot({ path: path.join(OUT, 'crop-and-cut-lines-screen.png') });
    const plain = await download(p);
    await p.route('**/__pdfjs/**', (route) => route.fulfill({ path: path.join(PDFJS, path.basename(route.request().url())), contentType: 'text/javascript' }));
    const b64 = fs.readFileSync(plain.file).toString('base64');
    const dataUrl = await p.evaluate(async ({ b64, width }) => {
      const pdfjs = await import('/__pdfjs/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/__pdfjs/pdf.worker.min.mjs';
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width * devicePixelRatio) / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return canvas.toDataURL('image/png');
    }, { b64, width: sheetBox.width });
    fs.writeFileSync(path.join(OUT, 'crop-and-cut-lines-pdf.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
    // Same measure as PIL's convert('L') + ImageChops.difference, computed in the page.
    const png = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    const out = await p.evaluate(async ([a, b]) => {
      const load = (src) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = ia.naturalWidth;
      const h = ia.naturalHeight;
      const pixels = (img) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const pa = pixels(ia);
      const pb = pixels(ib);
      const luma = (d, i) => (d[i] * 19595 + d[i + 1] * 38470 + d[i + 2] * 7471 + 0x8000) >> 16;
      let sum = 0;
      let big = 0;
      for (let i = 0; i < w * h * 4; i += 4) {
        const v = Math.abs(luma(pa, i) - luma(pb, i));
        sum += v;
        if (v > 64) big++;
      }
      return [sum / (w * h), big / (w * h)];
    }, [png(path.join(OUT, 'crop-and-cut-lines-screen.png')), png(path.join(OUT, 'crop-and-cut-lines-pdf.png'))]);
    check(`rasterizado: el PDF coincide con la hoja en pantalla (dif. media ${out[0].toFixed(2)}/255, ${(out[1] * 100).toFixed(2)} % de píxeles muy distintos)`, out[0] < 3 && out[1] < 0.01);
    errors.push(...s.errors);
    await s.browser.close();
  } catch (err) {
    check('sin excepciones', false, err.stack);
  }
  check('sin errores de consola', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})();
