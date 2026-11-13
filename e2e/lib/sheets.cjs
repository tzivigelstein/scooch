// Helpers for the multi-sheet, units, papers and projects suites, on top of base.cjs.
const base = require('./base.cjs');
const { path, fs } = base;
const { PDFDocument, PDFName } = require('pdf-lib');
const crypto = require('crypto');


const fx = (name) => path.join(base.FIX, name);

async function addFiles(page, names, expected) {
  const before = await page.locator('#sheets .piece').count();
  await page.locator('#file').setInputFiles(names.map(fx));
  const want = expected ?? before + names.length;
  await page.waitForFunction((n) => document.querySelectorAll('#sheets .piece').length === n, want, { timeout: 60000 });
  await page.waitForFunction(() => !/Cargando/.test(document.getElementById('pill').hidden ? '' : document.getElementById('pill-text').textContent));
  await page.waitForTimeout(50);
}

const ready = (page) => page.waitForFunction(() => !document.body.classList.contains('is-loading'), null, { timeout: 20000 });

const pill = (page) =>
  page.evaluate(() => {
    const p = document.getElementById('pill');
    if (p.hidden) return { text: '', action: '' };
    const a = document.getElementById('pill-action');
    return { text: document.getElementById('pill-text').textContent.replace(/ /g, ' '), action: a.hidden ? '' : a.textContent.replace(/ /g, ' '), warn: p.dataset.tone === 'warning' };
  });

/** Per sheet (in order): piece ids and boxes in mm. */
const sheets = (page) =>
  page.evaluate(() => {
    const label = document.getElementById('paper-label').textContent;
    const m = label.match(/· ([\d.,]+)\s×\s([\d.,]+)\s(mm|cm|in)/);
    const box = document.querySelector('#sheets .sheet-box');
    const W = parseFloat(m[1].replace(',', '.'));
    const zoom = parseFloat(box.style.width) / W;
    return [...document.querySelectorAll('#sheets .page')].map((page) => ({
      id: page.dataset.sheet,
      label: page.querySelector('.page-label').textContent,
      group: page.querySelector('.sheet').getAttribute('aria-label'),
      pieces: [...page.querySelectorAll('.sheet > .piece')].map((p) => ({
        id: p.dataset.id,
        name: p.getAttribute('aria-label').split(',')[0],
        x: parseFloat(p.style.left) / zoom,
        y: parseFloat(p.style.top) / zoom,
        w: parseFloat(p.style.width) / zoom,
        h: parseFloat(p.style.height) / zoom,
      })),
    }));
  });

/** Info about a PDF (Buffer or path): pages with their size in mm, objects and a content hash. */
async function pdfInfo(src) {
  const bytes = Buffer.isBuffer(src) ? src : fs.readFileSync(src);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const mm = (pt) => Math.round((pt / 72) * 25.4 * 10) / 10;
  const pages = doc.getPages().map((pg) => {
    const { width, height } = pg.getSize();
    const xobj = pg.node.Resources()?.lookup(PDFName.of('XObject'));
    const names = xobj ? xobj.keys().map((k) => k.toString()) : [];
    const contents = pg.node.Contents();
    const raw = contents ? (contents.asArray ? contents.asArray().map((r) => doc.context.lookup(r).contents) : [contents.contents]) : [];
    const hash = crypto.createHash('sha1');
    for (const c of raw) if (c) hash.update(Buffer.from(c));
    const objects = names.map((n) => {
      const ref = xobj.get(PDFName.of(n.replace(/^\//, '')));
      const obj = doc.context.lookup(ref);
      const h = crypto.createHash('sha1');
      if (obj?.contents) h.update(Buffer.from(obj.contents));
      return h.digest('hex').slice(0, 12);
    });
    return { w: mm(width), h: mm(height), xobjects: names.length, content: hash.digest('hex').slice(0, 12), objects };
  });
  return { title: doc.getTitle(), pages };
}

async function download(page, selector = '#export') {
  const [d] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const file = path.join(base.OUT, `${Date.now()}-${d.suggestedFilename()}`);
  await d.saveAs(file);
  await page.waitForFunction(() => !/Creando/.test(document.getElementById('pill').hidden ? '' : document.getElementById('pill-text').textContent));
  return { file, name: d.suggestedFilename() };
}

/** Was something matching `re` announced (in the polite or assertive region) within `ms`? */
const heard = (page, re, ms = 2500) =>
  page
    .waitForFunction(
      ([src, flags]) => new RegExp(src, flags).test(document.getElementById('live-polite').textContent + ' ' + document.getElementById('live-assertive').textContent),
      [re.source, re.flags],
      { timeout: ms }
    )
    .then(
      () => true,
      () => false
    );

module.exports = { ...base, fx, addFiles, ready, pill, sheets, pdfInfo, download, heard };
