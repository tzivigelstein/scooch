// Barra de la pieza: no tapa vecinas si puede evitarlo, nunca sale del lienzo ni pisa paneles;
// en pantallas angostas va anclada abajo (reconstruida tras perderse /tmp; adaptada a v4).
const { open, makeChecker, helpers } = require('../lib/base.cjs');

const RECTS = () => {
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  };
  const sheetEl = document.querySelector('#sheets .piece.is-selected')?.closest('.sheet') ?? document.querySelector('#sheets .sheet');
  const sheet = r(sheetEl);
  const clip = (a) => {
    const x = Math.max(a.x, sheet.x);
    const y = Math.max(a.y, sheet.y);
    const w = Math.min(a.x + a.w, sheet.x + sheet.w) - x;
    const h = Math.min(a.y + a.h, sheet.y + sheet.h) - y;
    return w > 0 && h > 0 ? { x, y, w, h } : null;
  };
  const bar = document.getElementById('piecebar');
  return {
    bar: r(bar),
    side: bar.dataset.side,
    hidden: bar.hidden || getComputedStyle(bar).visibility === 'hidden',
    canvas: r(document.getElementById('canvas')),
    sheet,
    selected: r(document.querySelector('#sheets .piece.is-selected')),
    others: [...sheetEl.querySelectorAll('.piece:not(.is-selected)')].map((p) => clip(r(p))).filter(Boolean),
    panels: [...document.querySelectorAll('.panel')].filter((p) => p.offsetParent && getComputedStyle(p).display !== 'none' && p.classList.contains('is-open')).map(r),
    dock: [...document.querySelectorAll('.dock-btn')].filter((b) => b.offsetParent).map(r),
    pill: document.getElementById('pill').hidden ? null : r(document.getElementById('pill')),
  };
};
const hit = (a, b, tol = 0.5) => a.x < b.x + b.w - tol && b.x < a.x + a.w - tol && a.y < b.y + b.h - tol && b.y < a.y + a.h - tol;
const within = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;

(async () => {
  const { check, report } = makeChecker('Barra de la pieza');
  const allErrors = [];

  for (const [w, hgt] of [[1440, 900], [1280, 720], [1024, 768]]) {
    const s = await open({ viewport: { width: w, height: hgt } });
    const h = helpers(s.page);
    const p = s.page;
    await h.load('big.png', 'small.jpg', 'square.webp', 'twopage.pdf', 'tall.png', 'exif6.jpg');
    await p.click('#arrange');
    if (await p.locator('#pill-action').isVisible()) await p.click('#pill-action');
    await p.evaluate(() => document.getElementById('pill-close')?.click());
    const n = await h.count();
    let outside = 0;
    let onPanel = 0;
    let onSelf = 0;
    let covered = 0;
    const sides = new Set();
    for (let i = 0; i < n; i++) {
      await p.locator('#sheets .piece').nth(i).focus();
      await p.waitForTimeout(150);
      const g = await p.evaluate(RECTS);
      if (g.hidden) continue;
      sides.add(g.side);
      if (!within(g.bar, g.canvas)) outside++;
      if (g.panels.some((pl) => hit(g.bar, pl))) onPanel++;
      if (g.side !== 'over' && hit(g.bar, g.selected)) onSelf++;
      covered += g.others.filter((o) => hit(g.bar, o)).length;
    }
    check(`${w}×${hgt}: la barra nunca sale del lienzo`, outside === 0, String(outside));
    check(`${w}×${hgt}: nunca encima de un panel abierto`, onPanel === 0, String(onPanel));
    check(`${w}×${hgt}: no tapa la pieza seleccionada (salvo sin lugar)`, onSelf === 0, String(onSelf));
    check(`${w}×${hgt}: tapa pocas vecinas (≤ 1 por pieza en promedio)`, covered <= n, `${covered} en ${n}`);
    check(`${w}×${hgt}: usa posiciones arriba/abajo/costados`, [...sides].every((sd) => ['above', 'below', 'left', 'right', 'over'].includes(sd)), [...sides].join(','));
    // Con el panel de piezas abierto encima (1024), la barra se corre
    if (w < 1100) {
      await p.locator('#sheets .piece').first().focus();
      await p.click('#pieces-toggle');
      await p.waitForTimeout(250);
      await p.locator('#sheets .piece').first().focus({ preventScroll: true });
      const g = await p.evaluate(RECTS);
      check(`${w}×${hgt}: con el panel de piezas abierto, la barra no queda debajo`, g.hidden || !g.panels.some((pl) => hit(g.bar, pl)), JSON.stringify({ bar: g.bar, panels: g.panels }));
    }
    // Rol y nombre
    check(`${w}×${hgt}: toolbar con nombre de la pieza`, (await p.getAttribute('#piecebar', 'role')) === 'toolbar' && /^Acciones de /.test(await p.getAttribute('#piecebar', 'aria-label')));
    allErrors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- Varias hojas: la barra sigue a la pieza al hacer scroll y se oculta si sale de la vista
  {
    const s = await open();
    const p = s.page;
    const h = helpers(p);
    await h.load('big.png', 'small.jpg', 'square.webp', 'twopage.pdf', 'tall.png', 'exif6.jpg', 'rotated.pdf');
    await p.locator('#sheets .piece').first().focus();
    const g0 = await p.evaluate(RECTS);
    await p.evaluate(() => document.getElementById('stage').scrollBy(0, 2000));
    await p.waitForTimeout(150);
    const g1 = await p.evaluate(RECTS);
    check('al sacar la pieza de la vista con el scroll, la barra se oculta', g1.hidden || !hit(g1.selected, g1.canvas), JSON.stringify({ hidden: g1.hidden, sel: g1.selected }));
    await p.evaluate(() => document.getElementById('stage').scrollTo(0, 0));
    await p.waitForTimeout(150);
    const g2 = await p.evaluate(RECTS);
    check('al volver, reaparece junto a la pieza', !g2.hidden && Math.abs(g2.bar.y - g0.bar.y) < 2, JSON.stringify({ a: g0.bar, b: g2.bar }));
    allErrors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- Angosto: anclada abajo, encima de «Piezas»/«Propiedades»; el aviso, encima de la barra
  for (const [w, hgt] of [[390, 844], [360, 740]]) {
    const s = await open({ viewport: { width: w, height: hgt } });
    const p = s.page;
    const h = helpers(p);
    await h.load('small.jpg', 'square.webp');
    await p.locator('#sheets .piece').first().focus();
    await p.waitForTimeout(150);
    const g = await p.evaluate(RECTS);
    check(`${w}: anclada abajo («docked»), centrada`, g.side === 'docked' && Math.abs(g.bar.x + g.bar.w / 2 - w / 2) < 2, JSON.stringify(g.bar));
    check(`${w}: encima de los botones de panel, sin pisarlos`, g.dock.every((d) => g.bar.y + g.bar.h <= d.y + 0.5), JSON.stringify({ bar: g.bar, dock: g.dock }));
    check(`${w}: dentro del lienzo`, within(g.bar, g.canvas));
    await h.setMeasure('pos-x', -5);
    await p.keyboard.press('Escape');
    if (await p.locator('#props-panel.is-open').count()) await p.click('#props-toggle');
    await p.locator('#sheets .piece').first().focus();
    await p.waitForTimeout(150);
    const g2 = await p.evaluate(RECTS);
    check(`${w}: con un aviso a la vista, el aviso va encima de la barra`, g2.pill && g2.pill.y + g2.pill.h <= g2.bar.y + 0.5, JSON.stringify({ pill: g2.pill, bar: g2.bar }));
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
