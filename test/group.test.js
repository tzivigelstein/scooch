import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { subgroups, planGroup, groupBounds, common, sameSource, touchedBy, rangeBetween } from '../src/group.js';
import { align, distribute, moveBy, rotateGroup, scaleGroup, bounds } from '../src/align.js';
import { overlaps } from '../src/collide.js';
import { prng } from './support.js';

const b = (id, sheet, x, y, w, h) => ({ id, sheet, x, y, w, h });
const A4 = { W: 210, H: 297 };

// Hoja 1: a, b, c elegidas; z no. Hoja 2: d elegida; y no.
const boxes = [
  b(1, 1, 10, 10, 30, 20),
  b(2, 1, 60, 40, 20, 30),
  b(9, 1, 150, 150, 20, 20),
  b(3, 1, 100, 15, 25, 25),
  b(4, 2, 20, 20, 40, 40),
  b(8, 2, 120, 120, 30, 30),
];
const ids = new Set([1, 2, 3, 4]);

describe('subgroups', () => {
  test('por hoja, con las demás de esa hoja', () => {
    const groups = subgroups(boxes, ids);
    assert.deepEqual([...groups.keys()], [1, 2]);
    assert.deepEqual(groups.get(1).rects.map((r) => r.id), [1, 2, 3]);
    assert.deepEqual(groups.get(1).others.map((r) => r.id), [9]);
    assert.deepEqual(groups.get(2).rects.map((r) => r.id), [4]);
    assert.deepEqual(groups.get(2).others.map((r) => r.id), [8]);
    assert.deepEqual(groupBounds(boxes, ids).get(1), { x: 10, y: 10, w: 115, h: 60 });
  });
});

describe('planGroup', () => {
  test('cada subgrupo se transforma dentro de su hoja', () => {
    const plan = planGroup(boxes, ids, (rects) => align(rects, 'left'), A4);
    assert.equal(plan.ok, false, 'en la hoja 1, alinear a la izquierda las encima');
    assert.equal(plan.reason, 'overlap');
    assert.equal(plan.sheet, 1);
    const top = planGroup(boxes, ids, (rects) => align(rects, 'top'), A4);
    assert.equal(top.ok, true);
    assert.deepEqual([1, 2, 3].map((id) => top.rects.get(id).y), [10, 10, 10]);
    assert.equal(top.rects.get(4).y, 20, 'sola en su hoja: contra su propia caja, no se mueve');
    assert.equal(top.changed, true);
    assert.equal(top.rects.has(9), false, 'solo las elegidas');
  });

  test('con allowOverlap vale lo que se pisa', () => {
    const plan = planGroup(boxes, ids, (rects) => align(rects, 'left'), { ...A4, allowOverlap: true });
    assert.equal(plan.ok, true);
    assert.deepEqual([1, 2, 3].map((id) => plan.rects.get(id).x), [10, 10, 10]);
  });

  test('contra las no elegidas de la misma hoja', () => {
    const near = [b(1, 1, 10, 10, 20, 20), b(2, 1, 40, 10, 20, 20)];
    const plan = planGroup(near, new Set([1]), (rects) => moveBy(rects, 15, 0), A4);
    assert.equal(plan.ok, false);
    const other = [b(1, 1, 10, 10, 20, 20), b(2, 2, 40, 10, 20, 20)];
    assert.equal(planGroup(other, new Set([1]), (rects) => moveBy(rects, 15, 0), A4).ok, true, 'las de otra hoja no chocan');
  });

  test('acota el subgrupo para que los centros queden en la hoja', () => {
    const plan = planGroup(boxes, ids, (rects) => moveBy(rects, -50, 0), { ...A4, rigid: true });
    assert.equal(plan.ok, true);
    // El centro de «a» (x = 10, w = 30) llega hasta 0: corrimiento máximo −25 para todo el subgrupo.
    assert.deepEqual([1, 2, 3].map((id) => plan.rects.get(id).x), [-15, 35, 75]);
    assert.equal(plan.rects.get(4).x, -20, 'cada subgrupo se acota en su hoja');
    const rejected = planGroup(boxes, ids, (rects) => moveBy(rects, -50, 0), { ...A4, contain: 'reject' });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, 'outside');
  });

  test('si los centros no entran ni corriéndolos: outside', () => {
    const wide = [b(1, 1, 0, 0, 10, 10), b(2, 1, 200, 0, 10, 10)];
    const plan = planGroup(wide, new Set([1, 2]), (rects) => scaleGroup(rects, 2, 'top-left').rects, A4);
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, 'outside');
  });

  test('imán: el bloque cae en la grilla sin cambiar distancias; acotado sigue en la grilla', () => {
    const plan = planGroup(boxes, ids, (rects) => moveBy(rects, 3.3, 7.7), { ...A4, snap: { step: 5 }, rigid: true });
    const before = [1, 2, 3].map((id) => boxes.find((x) => x.id === id));
    const after = [1, 2, 3].map((id) => plan.rects.get(id));
    const bx = bounds(after);
    assert.equal(bx.x % 5, 0);
    assert.equal(bx.y % 5, 0);
    for (let i = 1; i < 3; i++) assert.equal(after[i].x - after[0].x, before[i].x - before[0].x);
    // Hacia afuera: acotado por la izquierda, el corrimiento se redondea al paso.
    const out = planGroup([b(1, 1, 3, 3, 10, 10)], new Set([1]), (rects) => moveBy(rects, -20, 0), { ...A4, snap: { step: 5 }, rigid: true });
    assert.equal(out.rects.get(1).x, -5);
    // Solo el eje pedido.
    const onlyX = planGroup([b(1, 1, 3, 3.3, 10, 10)], new Set([1]), (rects) => rects, { ...A4, snap: { step: 5, axes: 'x' } });
    assert.deepEqual([onlyX.rects.get(1).x, onlyX.rects.get(1).y], [5, 3.3]);
  });

  test('rigid: lo que ya se pisaba dentro del grupo no impide moverlo', () => {
    const piled = [b(1, 1, 10, 10, 20, 20), b(2, 1, 15, 15, 20, 20)];
    const all = new Set([1, 2]);
    assert.equal(planGroup(piled, all, (rects) => moveBy(rects, 5, 0), A4).ok, false);
    assert.equal(planGroup(piled, all, (rects) => moveBy(rects, 5, 0), { ...A4, rigid: true }).ok, true);
  });

  test('redondeo y changed', () => {
    const plan = planGroup(boxes, ids, (rects) => moveBy(rects, 1 / 3, 0), { ...A4, round: (v) => Math.round(v * 1e4) / 1e4 });
    assert.equal(plan.rects.get(1).x, 10.3333);
    const same = planGroup(boxes, ids, (rects) => rects, A4);
    assert.equal(same.changed, false);
  });

  test('girar y escalar el grupo: caja y medidas', () => {
    const turned = planGroup(boxes, new Set([1, 2]), (rects) => rotateGroup(rects, 'cw').rects, A4);
    assert.equal(turned.ok, true);
    const bx = bounds([turned.rects.get(1), turned.rects.get(2)]);
    assert.deepEqual([bx.w, bx.h], [60, 70]);
    const scaled = planGroup(boxes, new Set([1, 2]), (rects) => scaleGroup(rects, 2, 'top-left').rects, A4);
    assert.deepEqual(scaled.rects.get(2), { id: 2, x: 110, y: 70, w: 40, h: 60 });
  });

  test('fuzz: si vale, nadie se pisa y los centros quedan en la hoja', () => {
    const rnd = prng(8);
    const ops = [
      (rects) => align(rects, ['left', 'centerX', 'right', 'top', 'centerY', 'bottom'][Math.floor(rnd() * 6)]),
      (rects) => distribute(rects, rnd() < 0.5 ? 'x' : 'y', { gap: rnd() * 10 }),
      (rects) => distribute(rects, rnd() < 0.5 ? 'x' : 'y', { within: bounds(rects) }),
      (rects) => moveBy(rects, rnd() * 300 - 150, rnd() * 300 - 150),
      (rects) => rotateGroup(rects, rnd() < 0.5 ? 'cw' : 'ccw').rects,
      (rects) => scaleGroup(rects, 0.3 + rnd() * 2, 'center').rects,
    ];
    let valid = 0;
    for (let n = 0; n < 400; n++) {
      const list = Array.from({ length: 2 + Math.floor(rnd() * 8) }, (_, i) =>
        b(i + 1, 1 + Math.floor(rnd() * 2), rnd() * 190, rnd() * 270, 5 + rnd() * 40, 5 + rnd() * 40)
      );
      const chosen = new Set(list.filter(() => rnd() < 0.6).map((x) => x.id));
      if (!chosen.size) continue;
      const snap = rnd() < 0.5 ? { step: [1, 3.175, 5][n % 3] } : null;
      const plan = planGroup(list, chosen, ops[n % ops.length], { ...A4, snap });
      if (!plan.ok) continue;
      valid++;
      const final = list.map((x) => (plan.rects.has(x.id) ? { ...x, ...plan.rects.get(x.id) } : x));
      for (const r of final) {
        if (!chosen.has(r.id)) continue;
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        assert.ok(cx >= -1e-6 && cx <= 210 + 1e-6 && cy >= -1e-6 && cy <= 297 + 1e-6, `caso ${n}: centro fuera`);
        for (const o of final) {
          if (o === r || o.sheet !== r.sheet) continue;
          assert.equal(overlaps(r, o), false, `caso ${n}: ${r.id} pisa a ${o.id}`);
        }
      }
    }
    assert.ok(valid > 50, `casos válidos: ${valid}`);
  });
});

describe('ayudas de la selección', () => {
  test('common', () => {
    assert.equal(common([50, 50, 50]), 50);
    assert.equal(common([50, 50.0000001]), 50);
    assert.equal(common([50, 60]), null);
    assert.equal(common([]), null);
  });

  test('sameSource: el mismo archivo de origen (páginas, recorte y escala no importan)', () => {
    const items = [
      { id: 1, src: 7 },
      { id: 2, src: 3 },
      { id: 3, src: 7 },
      { id: 4, src: 9 },
      { id: 5, src: 3 },
    ];
    assert.deepEqual(sameSource(items, new Set([3])), [1, 3]);
    assert.deepEqual(sameSource(items, new Set([2, 4])), [2, 4, 5]);
    assert.deepEqual(sameSource(items, new Set()), []);
  });

  test('touchedBy: las que el recuadro toca', () => {
    const list = [
      { id: 1, x: 0, y: 0, w: 10, h: 10 },
      { id: 2, x: 20, y: 0, w: 10, h: 10 },
      { id: 3, x: 0, y: 30, w: 10, h: 10 },
    ];
    assert.deepEqual(touchedBy({ x: 5, y: 5, w: 20, h: 2 }, list), [1, 2]);
    assert.deepEqual(touchedBy({ x: 10, y: 0, w: 10, h: 10 }, list), [], 'tocar un borde no cuenta');
    assert.deepEqual(touchedBy({ x: -5, y: -5, w: 100, h: 100 }, list), [1, 2, 3]);
  });

  test('rangeBetween', () => {
    const order = [5, 3, 8, 1, 9];
    assert.deepEqual(rangeBetween(order, 3, 1), [3, 8, 1]);
    assert.deepEqual(rangeBetween(order, 9, 8), [8, 1, 9]);
    assert.deepEqual(rangeBetween(order, 4, 8), [8]);
    assert.deepEqual(rangeBetween(order, 3, 4), []);
  });
});
