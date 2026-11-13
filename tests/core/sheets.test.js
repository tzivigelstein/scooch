import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  arrangeSheets,
  samePlan,
  obstaclesBySheet,
  placeIntoSheets,
  spotOnSheet,
  sheetAt,
  keepCenterInside,
  placeOnNewSheet,
  pieceProblems,
  problemSummary,
} from '../../src/core/sheets.js';
import { overlaps } from '../support/pack.js';

// A4 con 10 mm de margen y 5 mm de separación.
const A4 = { W: 210, H: 297 };
const M = 10;
const AREA = { w: A4.W - 2 * M, h: A4.H - 2 * M };
const OPTS = { area: AREA, margin: M, gap: 5, rotate: true };

const counter = (start = 100) => {
  let n = start;
  return () => n++;
};

const boxes = (n, w, h, sheet = 1, prefix = 'p') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, sheet, x: 0, y: 0, w, h }));

/** Cajas finales después de aplicar un plan (girando las que dice). */
function applyPlan(plan, list) {
  return list.map((b) => {
    const p = plan.placements.get(b.id);
    const [w, h] = p.rotated ? [b.h, b.w] : [b.w, b.h];
    return { ...b, sheet: p.sheet, x: p.x, y: p.y, w, h };
  });
}

function assertSheetValid(list, label) {
  for (const a of list) {
    assert.ok(a.x >= M - 1e-6 && a.y >= M - 1e-6, `${a.id} dentro del margen [${label}]`);
    assert.ok(a.x + a.w <= A4.W - M + 1e-6 && a.y + a.h <= A4.H - M + 1e-6, `${a.id} dentro del margen [${label}]`);
    for (const b of list) if (a !== b) assert.ok(!overlaps(a, b), `${a.id} y ${b.id} se pisan [${label}]`);
  }
}

describe('arrangeSheets', () => {
  test('20 piezas iguales → 3 hojas 9 + 9 + 2, sin superposiciones y dentro del margen', () => {
    const list = boxes(20, 56, 80);
    const plan = arrangeSheets(list, [1], { ...OPTS, newId: counter() });
    assert.deepEqual(plan.sheets, [1, 100, 101]);
    assert.equal(plan.packed, 3);
    assert.deepEqual(plan.unplaced, []);
    const placed = applyPlan(plan, list);
    const counts = plan.sheets.map((id) => placed.filter((b) => b.sheet === id).length);
    assert.deepEqual(counts, [9, 9, 2]);
    for (const id of plan.sheets) assertSheetValid(placed.filter((b) => b.sheet === id), `hoja ${id}`);
  });

  test('reusa las hojas en orden y quita las que sobran', () => {
    const list = [...boxes(3, 50, 50, 7, 'a'), ...boxes(2, 50, 50, 3, 'b')];
    const plan = arrangeSheets(list, [3, 7, 9], { ...OPTS, newId: counter() });
    assert.deepEqual(plan.sheets, [3]);
    for (const b of list) assert.equal(plan.placements.get(b.id).sheet, 3);
  });

  test('las que no entran ni solas quedan con su posición, en hojas propias al final', () => {
    const list = [
      ...boxes(2, 50, 50, 1, 'ok'),
      { id: 'big', sheet: 1, x: -20, y: 5, w: 400, h: 300 },
      { id: 'huge', sheet: 2, x: 3, y: 4, w: 500, h: 500 },
    ];
    const plan = arrangeSheets(list, [1, 2], { ...OPTS, newId: counter() });
    assert.equal(plan.packed, 1);
    assert.deepEqual(new Set(plan.unplaced), new Set(['big', 'huge']));
    // Hoja 1: las que entran; «big» (venía de la hoja 1, que ya se usó) va a una nueva; «huge» reusa la 2.
    assert.deepEqual(plan.sheets, [1, 100, 2]);
    assert.deepEqual(plan.placements.get('big'), { sheet: 100, x: -20, y: 5, rotated: false });
    assert.deepEqual(plan.placements.get('huge'), { sheet: 2, x: 3, y: 4, rotated: false });
  });

  test('sin piezas queda una hoja', () => {
    assert.deepEqual(arrangeSheets([], [4, 5], { ...OPTS, newId: counter() }).sheets, [4]);
  });

  test('samePlan: aplicar el plan y volver a acomodar no cambia nada', () => {
    const list = boxes(12, 56, 80);
    const plan = arrangeSheets(list, [1], { ...OPTS, newId: counter() });
    assert.equal(samePlan(plan, list, [1]), false);
    const placed = applyPlan(plan, list);
    const again = arrangeSheets(placed, plan.sheets, { ...OPTS, newId: counter(500) });
    assert.equal(samePlan(again, placed, plan.sheets), true);
    // Una pieza corrida ya no es lo mismo.
    const moved = placed.map((b, i) => (i === 0 ? { ...b, x: b.x + 1 } : b));
    assert.equal(samePlan(again, moved, plan.sheets), false);
  });
});

describe('placeIntoSheets', () => {
  test('rellena huecos desde la hoja indicada, sin tocar las anteriores, y abre hojas nuevas', () => {
    // Hoja 1 llena a medias, hoja 2 vacía de la mitad para abajo.
    const existing = [
      { id: 'a', sheet: 1, x: 10, y: 10, w: 190, h: 130 },
      { id: 'b', sheet: 2, x: 10, y: 10, w: 190, h: 200 },
    ];
    const fresh = Array.from({ length: 4 }, (_, i) => ({ id: `n${i}`, w: 90, h: 60 }));
    const res = placeIntoSheets(fresh, existing, [1, 2], { ...OPTS, from: 1, newId: counter() });
    assert.deepEqual(res.unplaced, []);
    assert.ok(res.placements.every((p) => p.sheet !== 1), 'la hoja 1 (anterior) no se toca');
    const onTwo = res.placements.filter((p) => p.sheet === 2);
    assert.ok(onTwo.length >= 1, 'rellena la hoja 2');
    assert.deepEqual(res.sheets, res.placements.some((p) => p.sheet === 100) ? [100] : []);
    // Nada pisa lo existente ni entre sí.
    const all = [...existing, ...res.placements.map((p) => ({ ...p, w: p.rotated ? 60 : 90, h: p.rotated ? 90 : 60 }))];
    for (const id of [1, 2, 100]) assertSheetValid(all.filter((b) => b.sheet === id), `hoja ${id}`);
  });

  test('desde la hoja actual: si hay lugar, se queda ahí', () => {
    const res = placeIntoSheets([{ id: 'n', w: 50, h: 50 }], [], [1, 2, 3], { ...OPTS, from: 2, newId: counter() });
    assert.equal(res.placements[0].sheet, 3);
    assert.deepEqual(res.sheets, []);
  });

  test('lo que no entra ni solo en una hoja vacía', () => {
    const res = placeIntoSheets([{ id: 'x', w: 900, h: 50 }], [], [1], { ...OPTS, newId: counter() });
    assert.deepEqual(res.unplaced, ['x']);
    assert.deepEqual(res.placements, []);
  });

  test('obstaclesBySheet, en coordenadas del área útil (apenas achicados por el redondeo)', () => {
    const [[], [o]] = obstaclesBySheet([{ id: 1, sheet: 2, x: 15, y: 20, w: 5, h: 6 }], [1, 2], 10);
    assert.ok(Math.abs(o.x - 5) < 0.01 && Math.abs(o.y - 10) < 0.01 && Math.abs(o.w - 5) < 0.02 && Math.abs(o.h - 6) < 0.02, JSON.stringify(o));
  });
});

describe('spotOnSheet', () => {
  test('una pieza vuelve a entrar en el hueco exacto que dejó, aunque las posiciones estén redondeadas', () => {
    // 3 × 3 de 55,9647 × 80,0098 con separación 5, posiciones redondeadas a 0,01 (como en la app).
    const w = 55.9647;
    const h = 80.0098;
    const round = (v) => Math.round(v * 100) / 100;
    const grid = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) grid.push({ id: `${r}${c}`, sheet: 1, x: round(10 + c * (w + 5)), y: round(10 + r * (h + 5)), w, h });
    for (const hole of ['00', '11', '22']) {
      const spot = spotOnSheet({ id: 'n', w, h }, grid.filter((b) => b.id !== hole), OPTS);
      const original = grid.find((b) => b.id === hole);
      assert.ok(spot && Math.abs(spot.x - original.x) < 0.02 && Math.abs(spot.y - original.y) < 0.02, `${hole}: ${JSON.stringify(spot)}`);
    }
  });


  test('lugar libre sin girar, o null si no entra', () => {
    const spot = spotOnSheet({ id: 'n', w: 80, h: 60 }, [{ id: 'a', sheet: 1, x: 10, y: 10, w: 190, h: 100 }], OPTS);
    assert.ok(spot && spot.y >= 115 - 0.02, JSON.stringify(spot));
    assert.equal(spotOnSheet({ id: 'n', w: 150, h: 250 }, [{ id: 'a', sheet: 1, x: 10, y: 10, w: 190, h: 100 }], OPTS), null);
  });
});

describe('sheetAt', () => {
  const tops = [0, 330, 660];
  test('la que contiene el punto o la más cercana', () => {
    assert.equal(sheetAt(10, tops, 297), 0);
    assert.equal(sheetAt(400, tops, 297), 1);
    assert.equal(sheetAt(310, tops, 297), 0, 'entre hojas, más cerca de la primera');
    assert.equal(sheetAt(320, tops, 297), 1, 'entre hojas, más cerca de la segunda');
    assert.equal(sheetAt(-50, tops, 297), 0);
    assert.equal(sheetAt(5000, tops, 297), 2);
    assert.equal(sheetAt(5, [], 297), -1);
  });
});

describe('keepCenterInside', () => {
  test('el centro queda dentro de la hoja; lo demás puede salirse', () => {
    const W = 210;
    const H = 297;
    assert.deepEqual(keepCenterInside({ x: 50, y: 60, w: 40, h: 30 }, W, H), { x: 50, y: 60 }, 'adentro: igual');
    assert.deepEqual(keepCenterInside({ x: 190, y: -10, w: 40, h: 30 }, W, H), { x: 190, y: -10 }, 'se sale menos de la mitad: igual');
    assert.deepEqual(keepCenterInside({ x: 400, y: 600, w: 40, h: 30 }, W, H), { x: 190, y: 282 }, 'muy afuera abajo a la derecha');
    assert.deepEqual(keepCenterInside({ x: -300, y: -300, w: 40, h: 30 }, W, H), { x: -20, y: -15 }, 'muy afuera arriba a la izquierda');
    assert.deepEqual(keepCenterInside({ x: -300, y: 10, w: 500, h: 30 }, W, H), { x: -250, y: 10 }, 'más grande que la hoja: centro en el borde');
  });
});

describe('placeOnNewSheet', () => {
  const W = 210;
  const H = 297;
  test('where it was dropped when it is inside', () => {
    assert.deepEqual(placeOnNewSheet({ x: 30.3, y: 40.6, w: 50, h: 40 }, W, H), { x: 30.3, y: 40.6 });
  });
  test('a box that fits goes entirely inside the sheet', () => {
    assert.deepEqual(placeOnNewSheet({ x: -12, y: 280, w: 50, h: 40 }, W, H), { x: 0, y: 257 });
    assert.deepEqual(placeOnNewSheet({ x: 190, y: -400, w: 50, h: 40 }, W, H), { x: 160, y: 0 });
  });
  test('one larger than the sheet keeps its center inside', () => {
    assert.deepEqual(placeOnNewSheet({ x: -300, y: 10, w: 500, h: 30 }, W, H), { x: -250, y: 10 });
  });
  test('inside the printable area when it fits there, else inside the sheet', () => {
    assert.deepEqual(placeOnNewSheet({ x: 2, y: 280, w: 50, h: 40 }, W, H, { margin: 10 }), { x: 10, y: 247 });
    assert.deepEqual(placeOnNewSheet({ x: 2, y: 3, w: 200, h: 40 }, W, H, { margin: 10 }), { x: 2, y: 10 });
  });
  test('on the grid by its image corner (pad mm inside the box)', () => {
    assert.deepEqual(placeOnNewSheet({ x: 31.2, y: 47.6, w: 50, h: 40 }, W, H, { snapStep: 5 }), { x: 30, y: 50 });
    const p = placeOnNewSheet({ x: 29.2, y: 47.6, w: 50, h: 40 }, W, H, { snapStep: 5, pad: 2 });
    assert.ok(Math.abs(p.x - 28) < 1e-9 && Math.abs(p.y - 48) < 1e-9, JSON.stringify(p));
  });
});

describe('pieceProblems', () => {
  test('se superponen solo con las de su misma hoja', () => {
    const list = [
      { id: 1, sheet: 1, x: 20, y: 20, w: 50, h: 50 },
      { id: 2, sheet: 2, x: 20, y: 20, w: 50, h: 50 },
      { id: 3, sheet: 2, x: 40, y: 40, w: 50, h: 50 },
      { id: 4, sheet: 1, x: -5, y: 20, w: 50, h: 50 },
      { id: 5, sheet: 3, x: 5, y: 150, w: 50, h: 50 },
    ];
    const problems = pieceProblems(list, { W: 210, H: 297, margin: 10 });
    assert.deepEqual(problems.get(1), { cut: false, pastMargin: false, overlap: true });
    assert.deepEqual(problems.get(2), { cut: false, pastMargin: false, overlap: true });
    assert.deepEqual(problems.get(4), { cut: true, pastMargin: false, overlap: true });
    assert.deepEqual(problems.get(5), { cut: false, pastMargin: true, overlap: false });
    const summary = problemSummary(problems, list, [1, 2, 3]);
    assert.deepEqual(summary.cut, { count: 1, sheets: [0] });
    assert.deepEqual(summary.pastMargin, { count: 1, sheets: [2] });
    assert.deepEqual(summary.overlap, { count: 4, sheets: [0, 1] });
  });
});
