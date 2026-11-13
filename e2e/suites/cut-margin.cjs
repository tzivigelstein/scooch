// The cut margin: lines on each piece's cut box (screen = PDF) at +2, 0 and −1 mm; arranging keeps
// the cut boxes a gap apart; changing the margin or the mode never moves pieces; the history and saving.
const { open, makeChecker, addFiles, lib, download, fs } = require('../lib/selection.cjs');
const { PDFDocument, PDFRawStream, decodePDFRawStream } = require('pdf-lib');

const PT = 72 / 25.4;

const SCREEN = () => {
  const svg = document.querySelector('#sheets .cut-layer');
  return svg ? [...svg.querySelectorAll('line')].map((l) => ['x1', 'y1', 'x2', 'y2'].map((k) => Number(l.getAttribute(k)))) : [];
};

async function pdfLines(file) {
  const doc = await PDFDocument.load(fs.readFileSync(file), { updateMetadata: false });
  const page = doc.getPages()[0];
  const { height } = page.getSize();
  const stream = page.node.Contents();
  const list = stream.asArray ? stream.asArray().map((ref) => doc.context.lookup(ref)) : [stream];
  const text = list.map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : '')).join('\n');
  return [...text.matchAll(/(\S+) (\S+) m\n(\S+) (\S+) l\nS/g)].map((m) => {
    const [x1, y1, x2, y2] = m.slice(1, 5).map(Number);
    return [x1 / PT, (height - y1) / PT, x2 / PT, (height - y2) / PT];
  });
}

const same = (a, b) => a.length === b.length && a.every((l, i) => l.every((v, j) => Math.abs(v - b[i][j]) < 0.01));

(async () => {
  const { check, report } = makeChecker('Cut margin');
  const errors = [];
  const s = await open();
  const p = s.page;
  const L = lib(p);
  await addFiles(p, ['wide.png', 'tall.png', 'square.webp', 'small.jpg']);
  await p.click('#arrange');
  await p.keyboard.press('Escape');
  await L.showTab('sheet');
  await p.click('#cut-mode input[value="outline"]', { force: true });
  await p.click('#cut-options summary');
  check('the cut margin field: named, with its unit, no helper sentence', (await p.getAttribute('#cut-margin', 'aria-label')) === 'Margen de corte, en milímetros' && (await p.locator('#cut-margin-hint').count()) === 0 && (await p.inputValue('#cut-margin')) === '0');
  // The canvas explains it: while typing, the line moves right away (to the clamped value).
  await p.fill('#cut-margin', '4');
  const live = await p.evaluate(SCREEN);
  const piece = (await L.geom()).pieces[0];
  check('typing a margin moves the cut line live, before confirming', live.some(([x1, y1, x2, y2]) => (x1 === x2 && Math.abs(x1 - (piece.x - 4)) < 0.01) || (y1 === y2 && Math.abs(y1 - (piece.y - 4)) < 0.01)), JSON.stringify(live.slice(0, 3)));
  await p.fill('#cut-margin', '99');
  check('…clamped while typing (20 mm at most)', (await p.evaluate(SCREEN)).some(([x1, , x2]) => x1 === x2 && Math.abs(x1 - (piece.x - 20)) < 0.01 || Math.abs(x1) < 0.01));
  await p.keyboard.press('Escape');

  for (const margin of [2, 0, -1]) {
    const before = await L.snap();
    await p.fill('#cut-margin', String(margin).replace('.', ','));
    await p.keyboard.press('Enter');
    check(`margin ${margin}: changing it doesn’t move any piece`, (await L.snap()) === before);
    const g = await L.geom();
    const screen = await p.evaluate(SCREEN);
    // Every outline line runs on a piece's cut box edge.
    const onCutBox = screen.every(([x1, y1, x2, y2]) =>
      g.pieces.some((q) => {
        const box = { x: q.x - margin, y: q.y - margin, w: q.w + 2 * margin, h: q.h + 2 * margin };
        return y1 === y2
          ? [box.y, box.y + box.h].some((y) => Math.abs(y - y1) < 0.01) && x1 >= box.x - 0.01 - 1e3 && x2 <= box.x + box.w + 1e3
          : [box.x, box.x + box.w].some((x) => Math.abs(x - x1) < 0.01);
      })
    );
    check(`margin ${margin}: the lines run on the cut boxes`, screen.length > 0 && onCutBox, JSON.stringify(screen.slice(0, 2)));
    const pdf = await pdfLines((await download(p)).file);
    check(`margin ${margin}: the PDF draws the same lines`, same(screen, pdf), `${screen.length} vs ${pdf.length}`);
  }

  // A positive margin: arranging keeps the cut boxes a gap apart, inside the printable area.
  await p.fill('#cut-margin', '3');
  await p.keyboard.press('Enter');
  await p.click('#arrange');
  const g = await L.geom();
  const gap = 5;
  const boxes = g.pieces.map((q) => ({ ...q, x: q.x - 3, y: q.y - 3, w: q.w + 6, h: q.h + 6 }));
  const tooClose = boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => a.sheet === b.sheet && a.x < b.x + b.w + gap - 0.02 && b.x < a.x + a.w + gap - 0.02 && a.y < b.y + b.h + gap - 0.02 && b.y < a.y + a.h + gap - 0.02).map((b) => [a.id, b.id]));
  check('arrange: cut boxes at least the gap apart', tooClose.length === 0, JSON.stringify(tooClose));
  check('arrange: cut boxes inside the printable area', boxes.every((b) => b.x >= 10 - 0.02 && b.y >= 10 - 0.02 && b.x + b.w <= 200.02 && b.y + b.h <= 287.02));
  check('the selected piece shows its cut box faintly', await (async () => {
    await L.piece(g.pieces[0].id).focus();
    return p.evaluate(() => document.getElementById('frame').hasAttribute('data-cut'));
  })());

  // Mode none: the margin no longer counts for the layout (nothing moves either).
  await L.showTab('sheet');
  const snapBefore = await L.snap();
  await p.click('#cut-mode input[value="none"]', { force: true });
  check('turning the cut lines off doesn’t move pieces', (await L.snap()) === snapBefore);
  await p.keyboard.press('Control+z');
  check('Ctrl+Z brings the cut lines back', (await p.locator('.cut-layer').count()) === 1);
  // Saved.
  await p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado', null, { timeout: 8000 });
  await p.reload();
  await p.waitForFunction(() => !document.body.classList.contains('is-loading'));
  await p.waitForTimeout(200);
  await L.showTab('sheet');
  await p.click('#cut-options summary');
  check('reloaded: margin 3 mm, outline', (await p.inputValue('#cut-margin')) === '3' && (await p.isChecked('#cut-mode input[value="outline"]')));
  errors.push(...s.errors);
  await s.browser.close();

  check('no console errors', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
