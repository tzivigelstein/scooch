// Dropping a piece on another one: it goes to the nearest free spot, on the
// grid when «Imán» is on (like a group), or back if there's none nearby.
const { open, makeChecker, addFiles } = require('../lib/sheets.cjs');
const { lib, overlapping, onGrid } = require('../lib/selection.cjs');

(async () => {
  const { check, report } = makeChecker('Soltar una pieza sobre otra');
  const s = await open({ viewport: { width: 1440, height: 900 } });
  const p = s.page;
  const L = lib(p);
  try {
    await addFiles(p, ['card00.png', 'card01.png']);
    await p.click('#arrange');
    await p.keyboard.press('Escape');
    // A 5 mm grid with «Imán» on.
    await p.locator('#grid-chips input[value="5"]').check();
    const [a, b] = await L.ids();
    const geomBefore = await L.geom();
    const pa = geomBefore.pieces.find((q) => q.id === a);
    const pb = geomBefore.pieces.find((q) => q.id === b);
    // Drag A so it lands mostly over B.
    const zoom = geomBefore.zoom;
    const from = await L.piece(a).boundingBox();
    const dx = (pb.x + 7 - pa.x) * zoom;
    const dy = (pb.y + 9 - pa.y) * zoom;
    await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(from.x + from.width / 2 + (dx * i) / 12, from.y + from.height / 2 + (dy * i) / 12);
    await p.mouse.up();
    await p.waitForTimeout(400);
    const g = await L.geom();
    const moved = g.pieces.find((q) => q.id === a);
    check('soltada encima: se corre a un lugar libre (sin superponerse)', overlapping(g.pieces).length === 0 && (moved.x !== pa.x || moved.y !== pa.y), JSON.stringify(moved));
    check('con el imán, el lugar libre cae en la grilla de 5 mm', onGrid(moved.x, 5) && onGrid(moved.y, 5), JSON.stringify(moved));
    await L.undo();
    const back = (await L.geom()).pieces.find((q) => q.id === a);
    check('un paso de deshacer la devuelve', Math.abs(back.x - pa.x) < 1e-3 && Math.abs(back.y - pa.y) < 1e-3);
  } catch (err) {
    check('sin excepciones', false, err.stack);
  }
  check('sin errores de consola', s.errors.length === 0, s.errors.join(' | '));
  await s.browser.close();
  process.exit(report() ? 1 : 0);
})();
