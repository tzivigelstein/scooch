import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrangeSheets,
  samePlan,
  obstaclesBySheet,
  placeIntoSheets,
  spotOnSheet,
  sheetAt,
  pieceProblems,
  problemSummary,
} from '../src/sheets.js';
import { overlaps } from './support.js';

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

  test('obstaclesBySheet, en coordenadas del área útil', () => {
    assert.deepEqual(obstaclesBySheet([{ id: 1, sheet: 2, x: 15, y: 20, w: 5, h: 6 }], [1, 2], 10), [[], [{ x: 5, y: 10, w: 5, h: 6 }]]);
  });
});

describe('spotOnSheet', () => {
  test('lugar libre sin girar, o null si no entra', () => {
    const spot = spotOnSheet({ id: 'n', w: 80, h: 60 }, [{ id: 'a', sheet: 1, x: 10, y: 10, w: 190, h: 100 }], OPTS);
    assert.ok(spot && spot.y >= 115 - 1e-6, JSON.stringify(spot));
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
