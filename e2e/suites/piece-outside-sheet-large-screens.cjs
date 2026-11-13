// Regresión: piezas llevadas fuera de la hoja. Imagen, marco y barra alineados; grilla y margen
// del tamaño de la hoja; sin scroll horizontal ni hoja descentrada; el centro queda en la hoja.
const { open, makeChecker, addFiles } = require('../lib/sheets.cjs');
const cards = (from, n) => Array.from({ length: n }, (_, i) => `card${String(from + i).padStart(2, '0')}.png`);

const STATE = () => {
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  const sel = document.querySelector('#sheets .piece.is-selected');
  const page = sel?.closest('.page');
  const sheet = sel?.closest('.sheet') ?? page?.querySelector('.sheet') ?? document.querySelector('#sheets .sheet');
  const stage = document.getElementById('stage');
  const bar = document.getElementById('piecebar');
  const visible = (el) => !el.hidden && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).opacity !== '0';
  const sheets = [...document.querySelectorAll('#sheets .sheet')];
  return {
    piece: r(sel),
    img: r(sel?.querySelector('img')),
    frame: r(document.getElementById('frame')),
    bar: visible(bar) ? r(bar) : null,
    canvas: r(document.getElementById('canvas')),
    stage: r(stage),
    sheet: r(sheet),
    layers: sheets.map((sh) => ({ sheet: r(sh), grid: r(sh.querySelector('.grid-layer')), safe: sh.querySelector('.safe').hidden ? null : r(sh.querySelector('.safe')), scroll: [sh.scrollLeft, sh.scrollTop] })),
    stageScrollX: stage.scrollLeft,
    docOverflow: document.documentElement.scrollWidth - innerWidth,
    parent: sel?.parentElement?.className,
    margin: parseFloat(document.getElementById('margin').value.replace(',', '.')),
    zoom: parseFloat(document.querySelector('.sheet-box').style.width) / 210,
  };
};

const near = (a, b, tol = 1.5) => a && b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol;
const inside = (a, b, tol = 1) => a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol;

(async () => {
  const { check, report } = makeChecker('Piezas fuera de la hoja (regresión del marco desfasado)');
  const errors = [];
  for (const [vw, vh] of [[2560, 1440], [3440, 1440]]) {
    for (const multi of [false, true]) {
      const s = await open({ viewport: { width: vw, height: vh }, colorScheme: 'dark' });
      const p = s.page;
      await addFiles(p, multi ? cards(0, 12) : ['square.webp', 'small.jpg']);
      await p.keyboard.press('g'); // grilla visible
      // La misma pieza en todos los casos: de la hoja 2 (con scroll a mitad) o la primera.
      const id = await p.locator('.page').nth(multi ? 1 : 0).locator('.piece').first().getAttribute('data-id');
      for (const dir of ['derecha', 'izquierda', 'arriba', 'abajo']) {
        const tag = `${vw}×${vh} ${multi ? 'varias hojas, scroll a mitad' : '1 hoja'}: afuera por ${dir}`;
        const piece = p.locator(`#sheets .piece[data-id="${id}"]`);
        await piece.focus();
        // La pieza al centro de la vista: con varias hojas, el scroll queda a mitad de camino.
        await piece.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        await p.waitForTimeout(50);
        // Se toma por el centro de lo que se ve de ella (lo que sale de la hoja está recortado).
        const { b, sheet } = await piece.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const sh = el.closest('.sheet').getBoundingClientRect();
          const x0 = Math.max(r.left, sh.left), x1 = Math.min(r.right, sh.right), y0 = Math.max(r.top, sh.top), y1 = Math.min(r.bottom, sh.bottom);
          return { b: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, sheet: { x: sh.x, y: sh.y, width: sh.width, height: sh.height } };
        });
        const sx = b.x + b.width / 2;
        const sy = b.y + b.height / 2;
        const target = {
          derecha: [sheet.x + sheet.width + 260, sy],
          izquierda: [sheet.x - 260, sy],
          arriba: [sx, Math.max(60, sheet.y - 200)],
          abajo: [sx, Math.min(vh - 60, sheet.y + sheet.height + 200)],
        }[dir];
        await p.mouse.move(sx, sy);
        await p.mouse.down();
        for (let i = 1; i <= 16; i++) await p.mouse.move(sx + ((target[0] - sx) * i) / 16, sy + ((target[1] - sy) * i) / 16);
        const during = await p.evaluate(STATE);
        check(`${tag} — durante: la pieza completa (capa sin recorte) y el marco con ella`, during.parent === 'drag-layer' && near(during.piece, during.frame) && near(during.img, during.piece), JSON.stringify({ piece: during.piece, frame: during.frame, parent: during.parent }));
        await p.mouse.up();
        await p.waitForTimeout(250);
        const st = await p.evaluate(STATE);
        check(`${tag} — imagen y marco alineados`, near(st.img, st.piece) && near(st.frame, st.piece), JSON.stringify({ img: st.img, piece: st.piece, frame: st.frame }));
        const cx = st.piece.x + st.piece.w / 2;
        const cy = st.piece.y + st.piece.h / 2;
        check(`${tag} — el centro de la pieza queda en la hoja`, cx >= st.sheet.x - 1 && cx <= st.sheet.x + st.sheet.w + 1 && cy >= st.sheet.y - 1 && cy <= st.sheet.y + st.sheet.h + 1, JSON.stringify({ cx, cy, sheet: st.sheet }));
        check(`${tag} — barra dentro del lienzo y junto a la pieza`, !st.bar || (inside(st.bar, st.canvas) && Math.abs(st.bar.y + st.bar.h / 2 - (st.piece.y + st.piece.h / 2)) < st.piece.h / 2 + st.bar.h + 30), JSON.stringify({ bar: st.bar, piece: st.piece }));
        check(`${tag} — grilla y margen del tamaño de cada hoja, sin scroll en las hojas`, st.layers.every((l) => near(l.grid, l.sheet, 0.5) && l.scroll[0] === 0 && l.scroll[1] === 0 && (!l.safe || Math.abs(l.safe.x - l.sheet.x - st.margin * st.zoom) < 1)), JSON.stringify(st.layers.find((l) => !near(l.grid, l.sheet, 0.5) || l.scroll[0] || l.scroll[1]) ?? ''));
        const left = st.sheet.x - st.stage.x;
        const right = st.stage.x + st.stage.w - (st.sheet.x + st.sheet.w);
        check(`${tag} — sin scroll horizontal y la hoja centrada`, st.stageScrollX === 0 && st.docOverflow === 0 && Math.abs(left - right) < 20, JSON.stringify({ scrollX: st.stageScrollX, doc: st.docOverflow, left, right }));
      }
      // Con el teclado: flechas hacia afuera paran con el centro en el borde
      const piece = p.locator('#sheets .piece.is-selected');
      for (let i = 0; i < 30; i++) await p.keyboard.press('Shift+ArrowRight');
      const st = await p.evaluate(STATE);
      // Con 1 hoja el camino está libre: para con el centro justo en el borde. Con varias, la fila
      // puede estar llena (salta sobre las otras) y entonces se queda; nunca pasa del borde.
      const cxEnd = st.piece.x + st.piece.w / 2;
      const edge = st.sheet.x + st.sheet.w;
      check(`${vw}×${vh} ${multi ? 'varias hojas' : '1 hoja'}: Shift+→ repetido no pasa el centro del borde y todo sigue alineado`, (multi ? cxEnd <= edge + 2 : Math.abs(cxEnd - edge) < 2) && near(st.frame, st.piece) && st.layers.every((l) => l.scroll[0] === 0) && st.stageScrollX === 0, JSON.stringify({ piece: st.piece, sheet: st.sheet }));
      errors.push(...s.errors);
      await s.browser.close();
    }
  }
  check('sin errores de consola', errors.length === 0, errors.join(' | '));
  const failures = report();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
