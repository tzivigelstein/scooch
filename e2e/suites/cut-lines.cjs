// Cut lines: the Hoja tab's controls, the lines on screen equal to the PDF's (positions, weight,
// color, dash), never over a piece nor off the sheet, outline sharing edges, the gap note and its
// fix, the history and saving with the project.
const { open, makeChecker, addFiles, lib, download, fs } = require('../lib/selection.cjs');
const { PDFDocument, PDFRawStream, decodePDFRawStream } = require('pdf-lib');

const PT = 72 / 25.4;
const TOL = 1e-3;

// What the screen draws, per sheet: the lines (mm) and the stroke.
const SCREEN = () =>
  [...document.querySelectorAll('#sheets .page')].map((page) => {
    const svg = page.querySelector('.cut-layer');
    const pieces = [...page.querySelectorAll('.sheet > .piece')].map((p) => p.getAttribute('aria-label'));
    if (!svg) return { lines: [], pieces: pieces.length };
    const g = svg.querySelector('g');
    return {
      pieces: pieces.length,
      viewBox: svg.getAttribute('viewBox'),
      width: Number(svg.dataset.width),
      color: svg.dataset.color,
      stroke: g.getAttribute('stroke'),
      dash: svg.dataset.dash,
      dasharray: g.getAttribute('stroke-dasharray'),
      lines: [...svg.querySelectorAll('line')].map((l) => ['x1', 'y1', 'x2', 'y2'].map((k) => Number(l.getAttribute(k)))),
    };
  });

async function pdfStrokes(file) {
  const doc = await PDFDocument.load(fs.readFileSync(file), { updateMetadata: false });
  return doc.getPages().map((page) => {
    const { height } = page.getSize();
    const stream = page.node.Contents();
    const list = stream.asArray ? stream.asArray().map((ref) => doc.context.lookup(ref)) : [stream];
    const text = list.map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : '')).join('\n');
    const lines = [...text.matchAll(/(\S+) (\S+) m\n(\S+) (\S+) l\nS/g)].map((m) => {
      const [x1, y1, x2, y2] = m.slice(1, 5).map(Number);
      return [x1 / PT, (height - y1) / PT, x2 / PT, (height - y2) / PT];
    });
    const width = [...text.matchAll(/\n([\d.]+) w\n/g)].map((m) => Number(m[1]));
    const color = [...text.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) RG/g)].map((m) => m.slice(1, 4).map(Number));
    const dash = [...text.matchAll(/\[([\d. ]*)\] [\d.]+ d/g)].map((m) => m[1].trim());
    return { lines, width, color, dash };
  });
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const sameLines = (a, b) => a.length === b.length && a.every((l, i) => l.every((v, j) => Math.abs(v - b[i][j]) < 0.01));

(async () => {
  const { check, report } = makeChecker('Cut lines');
  const errors = [];
  const s = await open();
  const p = s.page;
  const L = lib(p);
  await addFiles(p, ['big.png', 'wide.png', 'tall.png', 'square.webp', 'small.jpg']);
  await p.keyboard.press('Escape');
  await L.showTab('sheet');
  check('cut lines: none by default, nothing drawn', (await p.isChecked('#cut-mode input[value="none"]')) && (await p.locator('.cut-layer').count()) === 0 && (await p.isHidden('#cut-options')));
  check('the modes are a named radio group with tooltips', (await p.getAttribute('#cut-mode', 'role')) === 'radiogroup' && (await p.getAttribute('#cut-mode', 'aria-label')) === 'Líneas de corte' && (await p.getAttribute('#cut-mode input[value="corners"]', 'data-tip')) === 'Marcas en las esquinas de cada pieza');

  // Corner marks: screen = PDF, never over a piece nor off the sheet.
  await p.click('#cut-mode input[value="corners"]', { force: true });
  let screen = await p.evaluate(SCREEN);
  const geom = await L.geom();
  const inPiece = ([x1, y1, x2, y2]) =>
    geom.pieces.some((q) => (y1 === y2 ? y1 > q.y + TOL && y1 < q.y + q.h - TOL && Math.min(x2, q.x + q.w) - Math.max(x1, q.x) > TOL : x1 > q.x + TOL && x1 < q.x + q.w - TOL && Math.min(y2, q.y + q.h) - Math.max(y1, q.y) > TOL));
  check('corners: lines on screen, none over a piece', screen[0].lines.length > 0 && !screen[0].lines.some(inPiece), JSON.stringify(screen[0].lines.filter(inPiece)));
  check('…none off the sheet', screen[0].lines.every(([x1, y1, x2, y2]) => Math.min(x1, x2) >= -TOL && Math.max(x1, x2) <= geom.W + TOL && Math.min(y1, y2) >= -TOL && Math.max(y1, y2) <= geom.H + TOL));
  check('the layer is hidden from assistive technology and lets the pointer through', await p.evaluate(() => {
    const svg = document.querySelector('.cut-layer');
    return svg.getAttribute('aria-hidden') === 'true' && getComputedStyle(svg).pointerEvents === 'none';
  }));
  let pdf = await pdfStrokes((await download(p)).file);
  check('the PDF has the same lines as the screen', sameLines(screen[0].lines, pdf[0].lines), `${screen[0].lines.length} vs ${pdf[0].lines.length}`);
  check('…same stroke: 0,25 pt, black, solid', pdf[0].width.includes(0.25) && screen[0].width === 0.25 && screen[0].color === '#000000' && pdf[0].color.some((c) => c.join() === '0,0,0') && !screen[0].dasharray && pdf[0].dash.every((d) => d === ''), JSON.stringify({ screen: screen[0].width, pdf: pdf[0].width, dash: pdf[0].dash }));

  // Stroke options: weight, custom color (hex field), dotted.
  await p.click('#cut-options summary');
  await p.click('#cut-weight input[value="medium"]', { force: true });
  await p.click('#cut-colors input[value="custom"]', { force: true });
  check('«Otro» shows a named color picker and a hex field', (await p.isVisible('#cut-color')) && (await p.getAttribute('#cut-color', 'aria-label')) === 'Color de las líneas de corte' && (await p.isVisible('#cut-hex')));
  await p.fill('#cut-hex', '12a0ff');
  await p.keyboard.press('Enter');
  await p.click('#cut-dash input[value="dotted"]', { force: true });
  screen = await p.evaluate(SCREEN);
  check('weight, color and dash reach the screen', screen[0].width === 0.5 && screen[0].color === '#12a0ff' && screen[0].stroke === '#12a0ff' && screen[0].dash === '0.75 1.5', JSON.stringify(screen[0]));
  const dashMm = screen[0].dasharray.split(' ').map(Number);
  check('…the dash in the sheet’s millimetres, the PDF’s points converted', Math.abs(dashMm[0] - 0.75 / PT) < 1e-6 && Math.abs(dashMm[1] - 1.5 / PT) < 1e-6, screen[0].dasharray);
  pdf = await pdfStrokes((await download(p)).file);
  const rgb = hexToRgb('#12a0ff');
  check('the PDF draws them the same: 0,5 pt, #12A0FF, dotted', pdf[0].width.includes(0.5) && pdf[0].color.some((c) => c.every((v, i) => Math.abs(v - rgb[i]) < 0.002)) && pdf[0].dash.includes('0.75 1.5') && sameLines(screen[0].lines, pdf[0].lines), JSON.stringify(pdf[0].dash));
  await p.fill('#cut-hex', 'azul');
  await p.keyboard.press('Enter');
  check('an invalid hex code says so and changes nothing', (await p.getAttribute('#cut-hex', 'aria-invalid')) === 'true' && (await p.isVisible('#cut-hex-error')) && (await p.evaluate(SCREEN))[0].color === '#12a0ff');
  await p.keyboard.press('Escape'); // the field goes back to the color
  await p.keyboard.press('Escape'); // out of the panel, to the sheet

  // History: one step per choice.
  await p.keyboard.press('Control+z');
  check('Ctrl+Z undoes the last change (dotted → solid)', (await p.evaluate(SCREEN))[0].dash === '');
  await p.keyboard.press('Control+Shift+z');
  check('…and redo brings it back', (await p.evaluate(SCREEN))[0].dash === '0.75 1.5');

  // The gap the marks need: a note with a one-click fix that never blocks.
  check('gap 5 mm < 4 + 1,5: a note offers 5,5 mm', (await p.isVisible('#cut-gap-note')) && /5,5\smm/.test(await p.textContent('#cut-gap-fix')));
  await p.click('#cut-gap-fix');
  check('the fix sets the gap and offers to arrange', (await p.inputValue('#gap')) === '5,5' && (await L.pill()).action === 'Acomodar' && (await p.isHidden('#cut-gap-note')), JSON.stringify(await L.pill()));
  await p.click('#pill-action');

  // Outline: one line per shared edge, nothing over a piece above.
  await p.click('#cut-mode input[value="outline"]', { force: true });
  check('outline: length and distance hide (they are for the marks)', await p.isHidden('#cut-length'));
  screen = await p.evaluate(SCREEN);
  const collinear = screen[0].lines.some((a, i) => screen[0].lines.some((b, j) => j > i && (a[1] === a[3] ? b[1] === b[3] && Math.abs(a[1] - b[1]) < TOL && Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > -TOL : b[0] === b[2] && Math.abs(a[0] - b[0]) < TOL && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > -TOL)));
  check('outline: shared or continuing edges are one line', screen[0].lines.length > 0 && !collinear);
  pdf = await pdfStrokes((await download(p)).file);
  check('outline: the PDF has the same lines', sameLines(screen[0].lines, pdf[0].lines));

  // Saved with the project.
  await p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado', null, { timeout: 8000 });
  const saved = JSON.stringify(await p.evaluate(SCREEN));
  await p.reload();
  await p.waitForFunction(() => !document.body.classList.contains('is-loading') && document.querySelectorAll('#sheets .piece').length === 5);
  await p.waitForTimeout(200);
  check('reloaded: the same lines and stroke', JSON.stringify(await p.evaluate(SCREEN)) === saved);
  await L.showTab('sheet');
  check('…and the controls say so', (await p.isChecked('#cut-mode input[value="outline"]')) && (await p.isChecked('#cut-weight input[value="medium"]')) && (await p.isChecked('#cut-dash input[value="dotted"]')));

  // While dragging, the lines hide (they would show where the pieces were).
  const node = p.locator('#sheets .piece').first();
  const b = await node.boundingBox();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await p.mouse.down();
  await p.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 + 10, { steps: 4 });
  check('while dragging, the cut lines hide', await p.evaluate(() => getComputedStyle(document.querySelector('.cut-layer')).visibility === 'hidden'));
  await p.keyboard.press('Escape');
  await p.mouse.up();
  errors.push(...s.errors);
  await s.browser.close();

  check('no console errors', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
