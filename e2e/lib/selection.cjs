// Helpers de las suites v5 (selección múltiple, copias, recorte, líneas de corte).
const base = require('./sheets.cjs');
const { path, fs } = base;

const OUT5 = base.OUT;
fs.mkdirSync(OUT5, { recursive: true });

const tiles = (from, n) => Array.from({ length: n }, (_, i) => `tile${String(from + i).padStart(3, '0')}.png`);
const cards = (from, n) => Array.from({ length: n }, (_, i) => `card${String(from + i).padStart(2, '0')}.png`);

/**
 * Geometría exacta (mm) leída de los estilos (px / zoom). El zoom sale del ancho
 * de la caja de la hoja y del ancho real del papel en mm (`paperW`, A4: 210).
 */
const GEOM5 = (paperW) => {
  const box = document.querySelector('#sheets .sheet-box');
  const zoom = parseFloat(box.style.width) / paperW;
  const H = parseFloat(box.style.height) / zoom;
  const sheets = [...document.querySelectorAll('#sheets .page')].map((p) => Number(p.dataset.sheet));
  const pieces = [...document.querySelectorAll('#sheets .piece')].map((p) => {
    const page = p.closest('.page');
    const img = p.querySelector('img');
    const tr = img.style.transform;
    return {
      id: Number(p.dataset.id),
      sheet: page ? Number(page.dataset.sheet) : null,
      sheetIndex: page ? sheets.indexOf(Number(page.dataset.sheet)) : -1,
      x: parseFloat(p.style.left) / zoom,
      y: parseFloat(p.style.top) / zoom,
      w: parseFloat(p.style.width) / zoom,
      h: parseFloat(p.style.height) / zoom,
      r: Number((tr.match(/rotate\((\d+)deg\)/) || [0, 0])[1]),
      selected: p.classList.contains('is-selected'),
      label: p.getAttribute('aria-label'),
    };
  });
  pieces.sort((a, b) => a.id - b.id);
  return { zoom, W: paperW, H, sheets, pieces };
};

/** Foto del estado visible, para comparar «exactamente igual». */
const SNAP = () =>
  JSON.stringify({
    sheets: [...document.querySelectorAll('#sheets .page')].map((p) => p.dataset.sheet),
    pieces: [...document.querySelectorAll('#sheets .piece')]
      .map((p) => {
        const img = p.querySelector('img');
        return [p.dataset.id, p.closest('.page')?.dataset.sheet, p.style.left, p.style.top, p.style.width, p.style.height, img.style.width, img.style.height, img.style.transform];
      })
      .sort((a, b) => Number(a[0]) - Number(b[0])),
  });

function lib(page, { paperW = 210 } = {}) {
  const h = base.helpers(page);
  const geom = () => page.evaluate(GEOM5, paperW);
  const snap = () => page.evaluate(SNAP);
  const pill = () => base.pill(page);
  const piece = (id) => page.locator(`#sheets .piece[data-id="${id}"]`);
  const row = (id) => page.locator(`#piece-list [role="option"][data-id="${id}"]`);
  const selectedIds = () => page.evaluate(() => [...document.querySelectorAll('#sheets .piece.is-selected')].map((p) => Number(p.dataset.id)).sort((a, b) => a - b));
  const ids = async () => (await geom()).pieces.map((p) => p.id);
  /** Elige exactamente esas piezas desde la lista (clic y Ctrl+clic). */
  const selectIds = async (list) => {
    await page.keyboard.press('Escape');
    // Con la lista a la vista (≥ 1100 px), desde la lista; si no, en la hoja.
    const target = (await row(list[0]).isVisible()) ? row : piece;
    await target(list[0]).click({ force: target === piece });
    for (const id of list.slice(1)) await target(id).click({ modifiers: ['Control'], force: target === piece });
    await page.waitForTimeout(30);
  };
  /** Pone una pieza en (x, y) mm con los campos X e Y (unidad actual: mm). */
  const setPos = async (id, x, y) => {
    await page.keyboard.press('Escape');
    await row(id).click();
    await h.setMeasure('pos-x', String(x).replace('.', ','));
    await h.setMeasure('pos-y', String(y).replace('.', ','));
  };
  const undo = async () => {
    await page.locator('#undo').click();
    await page.waitForTimeout(30);
  };
  const redo = async () => {
    await page.locator('#redo').click();
    await page.waitForTimeout(30);
  };
  const live = () => page.evaluate(() => document.getElementById('live-polite').textContent + ' ' + document.getElementById('live-assertive').textContent);
  return { ...h, geom, snap, pill, piece, row, selectedIds, ids, selectIds, setPos, undo, redo, live };
}

const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

/** Piezas de la misma hoja que se pisan (más que tocarse, tolerancia de la app 0,01 mm). */
function overlapping(pieces, eps = 0.011) {
  const bad = [];
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i];
      const b = pieces[j];
      if (a.sheet !== b.sheet) continue;
      if (a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps) bad.push([a.id, b.id]);
    }
  return bad;
}

const centersInside = (g) => g.pieces.filter((p) => p.x + p.w / 2 < -1e-3 || p.y + p.h / 2 < -1e-3 || p.x + p.w / 2 > g.W + 1e-3 || p.y + p.h / 2 > g.H + 1e-3);

/** Caja de las piezas `ids` de una hoja. */
function boxOf(g, ids, sheet) {
  const list = g.pieces.filter((p) => ids.includes(p.id) && (sheet === undefined || p.sheet === sheet));
  if (!list.length) return null;
  const x0 = Math.min(...list.map((p) => p.x));
  const y0 = Math.min(...list.map((p) => p.y));
  const x1 = Math.max(...list.map((p) => p.x + p.w));
  const y1 = Math.max(...list.map((p) => p.y + p.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const onGrid = (v, step, tol = 2e-3) => Math.abs(v / step - Math.round(v / step)) * step <= tol;

module.exports = { ...base, OUT5, tiles, cards, lib, near, overlapping, centersInside, boxOf, onGrid, GEOM5, SNAP };
