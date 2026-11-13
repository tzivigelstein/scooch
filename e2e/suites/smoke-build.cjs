// Humo del build: fuente Inter, carga diferida de pdf.js (worker) y pdf-lib, sin errores ni 404.
const { open, makeChecker, helpers, OUT, path, fs } = require('../lib/base.cjs');

(async () => {
  const { check, report } = makeChecker(`Humo del build (${process.env.BASE || 'preview'})`);
  const s = await open();
  const p = s.page;
  const h = helpers(p);
  const requests = [];
  p.on('request', (r) => requests.push(r.url()));
  const initial = await p.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
  await p.evaluate(() => document.fonts.ready);
  const fonts = await p.evaluate(() => ({
    family: getComputedStyle(document.body).fontFamily,
    check: document.fonts.check('14px "Inter Variable"'),
    loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.unicodeRange.slice(0, 12)}`),
    button: getComputedStyle(document.getElementById('arrange')).fontFamily,
  }));
  check('fuente: body usa «Inter Variable» con respaldo system-ui', /^"?Inter Variable"?, system-ui/.test(fonts.family), fonts.family);
  check('fuente: Inter cargada (document.fonts)', fonts.check && fonts.loaded.some((f) => f.startsWith('Inter Variable')), JSON.stringify(fonts.loaded));
  check('fuente: los botones heredan Inter', /Inter Variable/.test(fonts.button));
  check('fuente: solo se descargó el subset latino', initial.filter((u) => /\.woff2/.test(u)).length === 1 && initial.some((u) => /inter-latin-wght/.test(u)), initial.filter((u) => /woff2/.test(u)).join(', '));
  check('al iniciar no se descargan pdf.js ni pdf-lib', !initial.some((u) => /pdfjs|pdf\.worker|pdf-lib/.test(u)), initial.filter((u) => /pdf/.test(u)).join(', '));
  await h.load('small.jpg');
  check('cargar una imagen no descarga pdf.js', !requests.some((u) => /pdfjs|pdf\.worker/.test(u)));
  await h.load('twopage.pdf');
  check('cargar un PDF: pieza nueva', (await h.count()) === 2);
  check('cargar un PDF descarga pdf.js y su worker', requests.some((u) => /pdfjs-dist-[\w-]+\.js$/.test(u)) && requests.some((u) => /pdf\.worker\.min-[\w-]+\.mjs$/.test(u)), requests.filter((u) => /pdf/.test(u)).join(', '));
  const thumb = await p.evaluate(async () => {
    const img = document.querySelector('#sheets .piece[aria-label^="twopage.pdf"] img');
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  });
  check('el PDF se dibujó (vista previa con el worker)', thumb[0] > 100 && thumb[1] > 100, JSON.stringify(thumb));
  check('pdf-lib todavía no se descargó', !requests.some((u) => /pdf-lib/.test(u)));
  const [download] = await Promise.all([p.waitForEvent('download'), p.click('#export')]);
  const file = path.join(OUT, 'smoke-' + download.suggestedFilename());
  await download.saveAs(file);
  const head = fs.readFileSync(file).subarray(0, 5).toString();
  check('exportar descarga pdf-lib y un PDF válido', requests.some((u) => /pdf-lib-[\w-]+\.js$/.test(u)) && head === '%PDF-', head);
  check('sin errores de consola ni 404', s.errors.length === 0, s.errors.join(' | '));
  const failures = report();
  await s.browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
