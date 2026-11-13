// Reglas de superposición, imán y grilla (reconstruida tras perderse /tmp; adaptada a v4).
const { open, makeChecker, helpers, overlaps } = require('../lib/base.cjs');
const { heard, pill } = require('../lib/sheets.cjs');

const near = (a, b, tol = 0.06) => Math.abs(a - b) <= tol;
const multiple = (v, step, tol = 0.02) => Math.abs(v / step - Math.round(v / step)) * step <= tol;

(async () => {
  const { check, report } = makeChecker('Reglas: superposición, imán y grilla');
  const allErrors = [];
  const s = await open();
  const p = s.page;
  const h = helpers(p);
  const byName = async (name) => (await h.geom()).pieces.find((x) => x.name === name);
  const place = async (name, x, y) => {
    await h.clickPiece(h.pieceByName(name));
    await h.setMeasure('pos-x', String(x).replace('.', ','));
    await h.setMeasure('pos-y', String(y).replace('.', ','));
  };
  const focusPiece = async (name) => {
    await h.pieceByName(name).focus();
    await p.waitForTimeout(30);
  };
  const center = async (name) => {
    const b = await h.pieceByName(name).boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const dragTo = async (name, x, y) => {
    const c = await center(name);
    await h.drag(h.pieceByName(name), x - c.x, y - c.y, 16);
    await p.waitForTimeout(250);
  };
  const clearLive = () => p.evaluate(() => { for (const id of ['live-polite', 'live-assertive']) document.getElementById(id).textContent = ''; });

  await h.load('small.jpg', 'square.webp');
  let g = await h.geom();
  const [A, B] = g.pieces.map((x) => x.name);
  check('superposición desactivada por defecto', !(await p.isChecked('#allow-overlap')));
  check('al cargar, ninguna pieza se superpone', overlaps(g.pieces).length === 0);

  // ---------- Flechas: si el paso la deja encima de otra, salta al otro lado
  await place(A, 20, 40);
  const a0 = await byName(A);
  await place(B, 20 + a0.w + 0.5, 40);
  const b0 = await byName(B);
  await focusPiece(A);
  await clearLive();
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(80);
  let a1 = await byName(A);
  check('flecha hacia otra pieza: salta justo al otro lado', near(a1.x, b0.x + b0.w), `${a1.x} vs ${b0.x + b0.w}`);
  check('después del salto no se superponen', overlaps((await h.geom()).pieces).length === 0);
  check('se anuncia el salto («Saltó sobre …»)', await heard(p, new RegExp(`Saltó sobre ${B.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)));
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(50);
  check('el paso siguiente es normal (1 mm)', near((await byName(A)).x, a1.x + 1));
  await p.keyboard.press('Control+z');
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(80);
  check('cada paso se deshace por separado', near((await byName(A)).x, a0.x), String((await byName(A)).x));

  // ---------- Agrandar con + frena al tocar a la otra
  await place(A, 20, 40);
  await place(B, 20 + a0.w + 4, 40);
  await focusPiece(A);
  await clearLive();
  const scale0 = Number(await p.inputValue('#scale').catch(() => '0'));
  for (let i = 0; i < 8; i++) await p.keyboard.press('Shift+Equal');
  await p.waitForTimeout(80);
  g = await h.geom();
  a1 = g.pieces.find((x) => x.name === A);
  const b1 = g.pieces.find((x) => x.name === B);
  check('al agrandar con + no llega a superponerse', overlaps(g.pieces).length === 0, JSON.stringify(overlaps(g.pieces)));
  check('frena al tocarla (queda a menos de 0,5 mm)', b1.x - (a1.x + a1.w) < 0.5 && b1.x - (a1.x + a1.w) >= -0.02, String(b1.x - (a1.x + a1.w)));
  check('avisa que no hay más espacio', await heard(p, /No hay más espacio para agrandarla/));
  check('la escala sí creció', a1.w > a0.w, `${a0.w} → ${a1.w} (escala inicial ${scale0})`);
  await p.keyboard.press('Shift+Minus');
  await p.keyboard.press('Shift+Minus');
  await p.waitForTimeout(50);
  check('con − se achica sin frenos', (await byName(A)).w < a1.w);

  // ---------- Arrastrar encima de otra: va al lugar libre más cercano (un paso de deshacer)
  await place(A, 30, 60);
  await place(B, 120, 60);
  const before = await h.geom();
  const target = await center(A);
  await clearLive();
  await dragTo(B, target.x + 5, target.y + 5);
  g = await h.geom();
  const bAfter = g.pieces.find((x) => x.name === B);
  const bBefore = before.pieces.find((x) => x.name === B);
  check('soltada encima: no queda superpuesta', overlaps(g.pieces).length === 0, JSON.stringify(overlaps(g.pieces)));
  check('soltada encima: se corre al lado, no vuelve a su lugar', !near(bAfter.x, bBefore.x, 1) || !near(bAfter.y, bBefore.y, 1), JSON.stringify({ bBefore, bAfter }));
  const aNow = g.pieces.find((x) => x.name === A);
  const dist = Math.hypot(bAfter.x + bAfter.w / 2 - (aNow.x + aNow.w / 2), bAfter.y + bAfter.h / 2 - (aNow.y + aNow.h / 2));
  check('queda pegada a la que tapaba (lugar libre cercano)', dist < Math.max(aNow.w, aNow.h) + Math.max(bAfter.w, bAfter.h), String(dist));
  check('sin aviso de «volvió a su lugar»', !/volvió a su lugar/.test(g.notice));
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(80);
  const bUndo = await byName(B);
  check('deshacer la devuelve en un paso', near(bUndo.x, bBefore.x) && near(bUndo.y, bBefore.y), JSON.stringify(bUndo));

  // ---------- Hoja llena: soltada encima de otra lejos de todo hueco, vuelve y avisa
  await h.clickPiece(h.pieceByName(A));
  await h.openMeasures();
  await p.evaluate(() => { const d = document.getElementById('fill-details'); d.open = true; });
  await p.click('#fill');
  await p.waitForTimeout(400);
  g = await h.geom();
  const n = g.pieces.length;
  check('rellenar: hoja llena sin superposiciones', n > 10 && overlaps(g.pieces).length === 0, String(n));
  // La pieza más cercana al centro de la hoja y la de la esquina de arriba a la izquierda.
  const mid = g.pieces.reduce((m, x) => (Math.hypot(x.x + x.w / 2 - g.W / 2, x.y + x.h / 2 - g.H / 2) < Math.hypot(m.x + m.w / 2 - g.W / 2, m.y + m.h / 2 - g.H / 2) ? x : m));
  const corner = g.pieces.reduce((m, x) => (x.x + x.y < m.x + m.y ? x : m));
  const midNode = p.locator(`#sheets .piece[data-id="${mid.id}"]`);
  const cornerNode = p.locator(`#sheets .piece[data-id="${corner.id}"]`);
  const mb = await midNode.boundingBox();
  const cb = await cornerNode.boundingBox();
  await clearLive();
  await h.drag(cornerNode, mb.x + mb.width / 2 + 3 - (cb.x + cb.width / 2), mb.y + mb.height / 2 + 3 - (cb.y + cb.height / 2), 16);
  await p.waitForTimeout(400);
  const g2 = await h.geom();
  const c2 = g2.pieces.find((x) => x.id === corner.id);
  check('sin hueco cerca: vuelve a su lugar', near(c2.x, corner.x) && near(c2.y, corner.y), JSON.stringify({ corner, c2 }));
  // The blocked look and the piece going back show it: no notice, only the screen reader hears it.
  check('sin aviso visible', !/volvió a su lugar/.test(g2.notice), g2.notice);
  const heardBack = await p.evaluate(() => document.getElementById('live-polite').textContent);
  check('el lector de pantalla lo oye', /No hay espacio ahí\. La pieza volvió a su lugar/.test(heardBack), heardBack);
  check('nada quedó superpuesto', overlaps(g2.pieces).length === 0);
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(150);
  check('el intento fallido no ocupa un paso de deshacer (deshacer quita el relleno)', (await h.count()) < n, String(await h.count()));
  await p.keyboard.press('Control+Shift+z');
  await p.waitForTimeout(150);
  await p.evaluate(() => document.getElementById('pill-close')?.click());
  // Volver a dos piezas para lo que sigue
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(150);
  check('volvemos a 2 piezas', (await h.count()) === 2, String(await h.count()));

  // ---------- Permitir superposición: se guarda como preferencia (fuera del historial)
  await h.openSheet();
  const arrangeToggle = p.locator('[aria-controls="section-arrange"]');
  if ((await arrangeToggle.getAttribute('aria-expanded')) === 'false') await arrangeToggle.click();
  await p.locator('#allow-overlap').check();
  check('el interruptor queda activado', await p.isChecked('#allow-overlap'));
  check('se guarda en el navegador', (await p.evaluate(() => localStorage.getItem('scooch:piece-preferences'))) === '{"allowOverlap":true}', await p.evaluate(() => localStorage.getItem('scooch:piece-preferences')));
  await place(A, 30, 60);
  await place(B, 120, 60);
  const tA = await center(A);
  await dragTo(B, tA.x + 5, tA.y + 5);
  g = await h.geom();
  check('con superposición permitida, queda donde se soltó (encima)', overlaps(g.pieces).length === 1, JSON.stringify(overlaps(g.pieces)));
  const pl = await pill(p);
  check('y no se marca como problema', !/superpuest/.test(pl.text) && (await p.locator('#piece-list .is-problem, #piece-list [data-problem*="overlap"]').count()) === 0, JSON.stringify(pl));
  await focusPiece(B);
  const bx = (await byName(B)).x;
  await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(50);
  check('las flechas mueven 1 mm sin saltar', near((await byName(B)).x, bx - 1));
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(50);
  check('deshacer no toca la preferencia', await p.isChecked('#allow-overlap'));
  // Persistencia al recargar
  await p.reload();
  await p.waitForFunction(() => !document.body.classList.contains('is-loading'));
  await p.waitForTimeout(400);
  await h.openSheet();
  check('al recargar sigue permitida', await p.isChecked('#allow-overlap'));
  check('y el documento conserva la superposición', overlaps((await h.geom()).pieces).length === 1);
  // Al desactivarla con piezas encimadas, aparece el problema
  if ((await arrangeToggle.getAttribute('aria-expanded')) === 'false') await arrangeToggle.click();
  await p.locator('#allow-overlap').uncheck();
  await p.waitForTimeout(150);
  const pl2 = await pill(p);
  check('al desactivarla, se avisa «Hay piezas superpuestas» con «Acomodar»', /Hay piezas superpuestas/.test(pl2.text) && pl2.action === 'Acomodar', JSON.stringify(pl2));
  check('se guarda desactivada', (await p.evaluate(() => localStorage.getItem('scooch:piece-preferences'))) === '{"allowOverlap":false}');
  await place(B, 120, 60);
  await p.evaluate(() => document.getElementById('pill-close')?.click());

  // ---------- Grilla e imán
  const gridToggle = p.locator('[aria-controls="section-grid"]');
  if ((await gridToggle.getAttribute('aria-expanded')) === 'false') await gridToggle.click();
  check('grilla oculta por defecto, 1 mm, imán activado', !(await p.isChecked('#grid-show')) && (await p.isChecked('#grid-snap')) && (await p.locator('#grid-chips input:checked').getAttribute('value')) === '1', await p.locator('#grid-chips input:checked').getAttribute('value'));
  check('sin grilla visible en la hoja', await p.locator('#sheets .grid-layer').first().isHidden());
  await focusPiece(A);
  await clearLive();
  await p.keyboard.press('g');
  await p.waitForTimeout(80);
  check('G muestra la grilla', await p.locator('#sheets .grid-layer').first().isVisible());
  check('y lo anuncia', await heard(p, /Grilla visible, cada 1\s?mm/));
  check('el interruptor la refleja', await p.isChecked('#grid-show'));
  // Imán a 5 mm
  await h.openSetting('#grid-chips');
  await p.locator('#grid-chips input[value="5"]').check();
  await p.waitForTimeout(50);
  await dragTo(A, (await center(A)).x + 37, (await center(A)).y + 23);
  let a2 = await byName(A);
  check('con imán a 5 mm, la posición queda en múltiplos de 5', multiple(a2.x, 5) && multiple(a2.y, 5), `${a2.x}, ${a2.y}`);
  // Tamaño propio
  await p.fill('#grid-size', '2,5');
  await p.locator('#grid-size').dispatchEvent('change');
  await p.waitForTimeout(50);
  check('tamaño propio: ningún tamaño rápido marcado', (await p.locator('#grid-chips input:checked').count()) === 0);
  await dragTo(A, (await center(A)).x - 41, (await center(A)).y + 17);
  a2 = await byName(A);
  check('con imán a 2,5 mm, múltiplos de 2,5', multiple(a2.x, 2.5) && multiple(a2.y, 2.5), `${a2.x}, ${a2.y}`);
  // Sin imán
  await h.openSetting('#grid-snap');
  await p.locator('#grid-snap').uncheck();
  await dragTo(A, (await center(A)).x + 33, (await center(A)).y + 11);
  a2 = await byName(A);
  check('sin imán, queda donde se soltó (no en múltiplos de 2,5)', !(multiple(a2.x, 2.5) && multiple(a2.y, 2.5)), `${a2.x}, ${a2.y}`);
  check('preferencias de grilla guardadas', (await p.evaluate(() => JSON.parse(localStorage.getItem('scooch:grid-preferences')))).size === 2.5);
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(50);
  check('deshacer no cambia la grilla', (await p.isChecked('#grid-show')) && !(await p.isChecked('#grid-snap')));
  await p.reload();
  await p.waitForFunction(() => !document.body.classList.contains('is-loading'));
  await p.waitForTimeout(300);
  await h.openSheet();
  if ((await gridToggle.getAttribute('aria-expanded')) === 'false') await gridToggle.click();
  check('al recargar: grilla visible, 2,5 mm, sin imán', (await p.isChecked('#grid-show')) && !(await p.isChecked('#grid-snap')) && /^2,5/.test(await p.inputValue('#grid-size')), await p.inputValue('#grid-size'));
  // La grilla nace en la esquina de cada hoja
  const bg = await p.evaluate(() => {
    const layer = document.querySelector('#sheets .grid-layer');
    const sheet = layer.closest('.sheet').getBoundingClientRect();
    const r = layer.getBoundingClientRect();
    return { dx: r.left - sheet.left, dy: r.top - sheet.top, pos: getComputedStyle(layer).backgroundPosition };
  });
  check('la grilla empieza en la esquina de la hoja', Math.abs(bg.dx) < 1.5 && Math.abs(bg.dy) < 1.5 && /^0(px)? 0(px)?/.test(bg.pos.split(',')[0].trim()), JSON.stringify(bg));
  // Ocultar con G
  await focusPiece(A);
  await clearLive();
  await p.keyboard.press('g');
  check('G de nuevo la oculta y lo anuncia', (await heard(p, /Grilla oculta/)) && (await p.locator('#sheets .grid-layer').first().isHidden()));

  allErrors.push(...s.errors);
  await s.browser.close();
  check('sin errores de consola', allErrors.length === 0, allErrors.join(' | '));
  const failures = report();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
