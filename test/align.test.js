import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALIGN_MODES,
  bounds,
  align,
  distribute,
  moveBy,
  scaleGroup,
  rotateGroup,
  snapGroup,
  validate,
} from '../src/align.js';
import { prng } from './support.js';

const r = (id, x, y, w, h) => ({ id, x, y, w, h });
const TOL = 1e-9;

function assertRectsClose(actual, expected, label = '', tol = TOL) {
  assert.equal(actual.length, expected.length, `cantidad ${label}`);
  actual.forEach((a, i) => {
    const e = expected[i];
    assert.equal(a.id, e.id, `id ${label}`);
    for (const k of ['x', 'y', 'w', 'h']) {
      assert.ok(Math.abs(a[k] - e[k]) <= tol, `${label} pieza ${a.id}.${k}: ${a[k]} ≠ ${e[k]}`);
    }
  });
}

// Tres piezas desparramadas: caja {x: 10, y: 5, w: 90, h: 75}.
const group = [r('a', 10, 20, 30, 10), r('b', 50, 5, 20, 40), r('c', 80, 60, 20, 20)];

function randomGroup(rnd, n = 2 + Math.floor(rnd() * 6)) {
  return Array.from({ length: n }, (_, i) =>
    r(`p${i}`, rnd() * 200 - 20, rnd() * 300 - 20, 1 + rnd() * 60, 1 + rnd() * 60)
  );
}

describe('bounds', () => {
  test('casos', () => {
    assert.equal(bounds([]), null);
    assert.deepEqual(bounds([r('a', 3, 4, 5, 6)]), { x: 3, y: 4, w: 5, h: 6 });
    assert.deepEqual(bounds(group), { x: 10, y: 5, w: 90, h: 75 });
    assert.deepEqual(bounds([r('a', -10, -5, 5, 5), r('b', 0, 0, 10, 10)]), { x: -10, y: -5, w: 20, h: 15 });
  });
});

describe('align', () => {
  test('cada modo contra la caja de la selección', () => {
    const expected = {
      left: [10, 10, 10],
      centerX: [40, 45, 45],
      right: [70, 80, 80],
    };
    for (const [mode, xs] of Object.entries(expected)) {
      const res = align(group, mode);
      assert.deepEqual(res.map((p) => p.x), xs, mode);
      assert.deepEqual(res.map((p) => p.y), group.map((p) => p.y), `${mode}: y no cambia`);
    }
    const vertical = {
      top: [5, 5, 5],
      centerY: [37.5, 22.5, 32.5],
      bottom: [70, 40, 60],
    };
    for (const [mode, ys] of Object.entries(vertical)) {
      const res = align(group, mode);
      assert.deepEqual(res.map((p) => p.y), ys, mode);
      assert.deepEqual(res.map((p) => p.x), group.map((p) => p.x), `${mode}: x no cambia`);
    }
    assert.deepEqual(ALIGN_MODES, ['left', 'centerX', 'right', 'top', 'centerY', 'bottom']);
  });

  test('contra el área útil de la hoja', () => {
    const area = { x: 10, y: 10, w: 190, h: 277 };
    const res = align(group, 'right', area);
    assert.deepEqual(res.map((p) => p.x + p.w), [200, 200, 200]);
    assert.deepEqual(align(group, 'centerY', area).map((p) => p.y), [143.5, 128.5, 138.5]);
    // Una sola pieza, centrada en la hoja.
    const [one] = align(align([r('x', 0, 0, 50, 70)], 'centerX', area), 'centerY', area);
    assert.deepEqual(one, r('x', 80, 113.5, 50, 70));
  });

  test('devuelve copias con la misma forma y orden; no toca la entrada', () => {
    const snapshot = JSON.stringify(group);
    const res = align(group, 'left');
    assert.equal(JSON.stringify(group), snapshot);
    assert.deepEqual(res.map((p) => p.id), ['a', 'b', 'c']);
    assert.deepEqual(Object.keys(res[0]).sort(), ['h', 'id', 'w', 'x', 'y']);
    assert.notEqual(res[0], group[0]);
    assert.deepEqual(align([], 'left'), []);
  });

  test('idempotente: alinear dos veces no cambia nada', () => {
    const rnd = prng(5);
    for (let n = 0; n < 50; n++) {
      const rects = randomGroup(rnd);
      const area = { x: 10, y: 10, w: 190, h: 277 };
      for (const mode of ALIGN_MODES) {
        const once = align(rects, mode);
        assertRectsClose(align(once, mode), once, `${mode} selección, caso ${n}`);
        const onSheet = align(rects, mode, area);
        assertRectsClose(align(onSheet, mode, area), onSheet, `${mode} hoja, caso ${n}`);
      }
    }
  });

  test('modo desconocido → RangeError', () => {
    assert.throws(() => align(group, 'middle'), RangeError);
    assert.throws(() => align(group, 'toString'), RangeError);
  });
});

describe('distribute', () => {
  // Desordenadas a propósito: el orden es por posición, no por arreglo.
  const row = [r('c', 100, 0, 20, 10), r('a', 0, 5, 10, 10), r('b', 30, 9, 30, 10), r('d', 150, 0, 5, 10)];

  test('{gap}: separación exacta anclando la primera', () => {
    const res = distribute(row, 'x', { gap: 4 });
    assert.deepEqual(res.map((p) => p.id), ['c', 'a', 'b', 'd'], 'mismo orden que la entrada');
    const byId = Object.fromEntries(res.map((p) => [p.id, p]));
    assert.equal(byId.a.x, 0, 'la primera no se mueve');
    assert.equal(byId.b.x, 14);
    assert.equal(byId.c.x, 48);
    assert.equal(byId.d.x, 72);
    assert.deepEqual(res.map((p) => p.y), row.map((p) => p.y), 'y no cambia');
    // gap 0: pegadas.
    const tight = distribute(row, 'x', { gap: 0 });
    assert.deepEqual(tight.map((p) => p.x), [40, 0, 10, 60]);
  });

  test('{gap} en y, y con 2 piezas', () => {
    const col = [r('top', 0, 0, 10, 20), r('bottom', 5, 100, 10, 30)];
    assert.deepEqual(distribute(col, 'y', { gap: 5 }).map((p) => p.y), [0, 25]);
    assert.deepEqual(distribute([col[1], col[0]], 'y', { gap: 5 }).map((p) => p.y), [25, 0]);
  });

  test('{within}: espacio repartido en partes iguales entre los extremos', () => {
    const box = { x: 0, y: 0, w: 200, h: 50 };
    const res = distribute(row, 'x', { within: box });
    const byId = Object.fromEntries(res.map((p) => [p.id, p]));
    // Suman 65 mm: sobran 135, en 3 espacios de 45.
    assert.equal(byId.a.x, 0);
    assert.equal(byId.b.x, 55);
    assert.equal(byId.c.x, 130);
    assert.equal(byId.d.x, 195);
    assert.equal(byId.d.x + byId.d.w, 200, 'la última termina en el borde');
    // Dentro de la propia caja de la selección los extremos quedan donde estaban.
    const own = distribute(row, 'x', { within: bounds(row) });
    const ownById = Object.fromEntries(own.map((p) => [p.id, p]));
    assert.equal(ownById.a.x, 0);
    assert.equal(ownById.d.x, 150);
    assert.equal(ownById.b.x, 40); // (155 − 65) / 3 = 30 de espacio
    assert.equal(ownById.c.x, 100);
  });

  test('{within} con 2 piezas: contra los extremos; con 1 o 0: sin cambios', () => {
    const two = [r('a', 40, 0, 10, 10), r('b', 60, 0, 20, 10)];
    const box = { x: 0, y: 0, w: 190, h: 10 };
    assert.deepEqual(distribute(two, 'x', { within: box }).map((p) => p.x), [0, 170]);
    assert.deepEqual(distribute([two[0]], 'x', { within: box }), [two[0]]);
    assert.deepEqual(distribute([], 'x', { within: box }), []);
    assert.deepEqual(distribute([two[0]], 'y', { gap: 3 }), [two[0]]);
  });

  test('{within} más chica que las piezas: espacios negativos (validate lo rechaza)', () => {
    const three = [r('a', 0, 0, 10, 10), r('b', 20, 0, 10, 10), r('c', 40, 0, 10, 10)];
    const res = distribute(three, 'x', { within: { x: 0, y: 0, w: 20, h: 10 } });
    assert.deepEqual(res.map((p) => p.x), [0, 5, 10]);
    assert.equal(validate(res, []), false);
  });

  test('conserva el orden, los extremos según el modo y es idempotente (fuzz)', () => {
    const rnd = prng(9);
    for (let n = 0; n < 100; n++) {
      const rects = randomGroup(rnd, 3 + Math.floor(rnd() * 6));
      const axis = n % 2 ? 'x' : 'y';
      const [pos, size] = axis === 'x' ? ['x', 'w'] : ['y', 'h'];
      const sortedIds = (list) => [...list].sort((a, b) => a[pos] - b[pos] || a[size] - b[size]).map((p) => p.id);
      const first = rects.reduce((m, p) => Math.min(m, p[pos]), Infinity);

      const gap = Math.round(rnd() * 10);
      const g = distribute(rects, axis, { gap });
      assert.deepEqual(sortedIds(g), sortedIds(rects), `orden con gap, caso ${n}`);
      assert.ok(Math.abs(Math.min(...g.map((p) => p[pos])) - first) <= TOL, `ancla, caso ${n}`);
      const ordered = [...g].sort((a, b) => a[pos] - b[pos]);
      for (let i = 1; i < ordered.length; i++) {
        const space = ordered[i][pos] - (ordered[i - 1][pos] + ordered[i - 1][size]);
        assert.ok(Math.abs(space - gap) <= 1e-9, `espacio ${space} ≠ ${gap}, caso ${n}`);
      }
      assertRectsClose(distribute(g, axis, { gap }), g, `idempotente con gap, caso ${n}`);

      const total = rects.reduce((s, p) => s + p[size], 0);
      const box = { x: -5, y: -5, w: total + 100, h: total + 100 };
      const w = distribute(rects, axis, { within: box });
      assert.deepEqual(sortedIds(w), sortedIds(rects), `orden con within, caso ${n}`);
      const wo = [...w].sort((a, b) => a[pos] - b[pos]);
      assert.equal(wo[0][pos], box[pos]);
      assert.equal(wo[wo.length - 1][pos] + wo[wo.length - 1][size], box[pos] + box[size]);
      const spaces = wo.slice(1).map((p, i) => p[pos] - (wo[i][pos] + wo[i][size]));
      for (const s of spaces) assert.ok(Math.abs(s - 100 / (wo.length - 1)) <= 1e-9, `espacio ${s}, caso ${n}`);
      assertRectsClose(distribute(w, axis, { within: box }), w, `idempotente con within, caso ${n}`);
    }
  });

  test('errores de uso', () => {
    assert.throws(() => distribute(row, 'z', { gap: 1 }), RangeError);
    assert.throws(() => distribute(row, 'x', {}), TypeError);
    assert.throws(() => distribute(row, 'x', { gap: NaN }), TypeError);
  });
});

describe('transformaciones de grupo', () => {
  test('moveBy', () => {
    assert.deepEqual(moveBy(group, 5, -5), [r('a', 15, 15, 30, 10), r('b', 55, 0, 20, 40), r('c', 85, 55, 20, 20)]);
    assert.deepEqual(moveBy([], 1, 1), []);
  });

  test('scaleGroup: anclas', () => {
    const two = [r('a', 0, 0, 10, 10), r('b', 20, 0, 10, 10)]; // caja 30×10
    const center = scaleGroup(two, 2);
    assert.equal(center.factor, 2);
    assert.deepEqual(center.rects, [r('a', -15, -5, 20, 20), r('b', 25, -5, 20, 20)]);
    assert.deepEqual(scaleGroup(two, 2, 'top-left').rects, [r('a', 0, 0, 20, 20), r('b', 40, 0, 20, 20)]);
    assert.deepEqual(scaleGroup(two, 0.5, 'bottom-right').rects, [r('a', 15, 5, 5, 5), r('b', 25, 5, 5, 5)]);
    assert.deepEqual(scaleGroup(two, 3, { x: 0, y: 0 }).rects, [r('a', 0, 0, 30, 30), r('b', 60, 0, 30, 30)]);
    // La caja escala igual: mismas proporciones y distancias × k.
    const b = bounds(scaleGroup(group, 1.5, 'top').rects);
    assert.deepEqual(b, { x: -12.5, y: 5, w: 135, h: 112.5 });
    assert.deepEqual(scaleGroup([], 2), { rects: [], factor: 2 });
  });

  test('scaleGroup: k y después 1/k vuelve al origen', () => {
    const rnd = prng(21);
    for (let n = 0; n < 50; n++) {
      const rects = randomGroup(rnd);
      const k = 0.2 + rnd() * 4;
      const anchor = ['center', 'top-left', 'bottom-right', 'left', { x: 12.5, y: -3 }][n % 5];
      const there = scaleGroup(rects, k, anchor).rects;
      // Las anclas con nombre caen en el mismo punto de la caja escalada.
      assertRectsClose(scaleGroup(there, 1 / k, anchor).rects, rects, `caso ${n}`, 1e-9);
    }
  });

  test('scaleGroup: errores', () => {
    for (const k of [0, -1, NaN, Infinity, '2']) assert.throws(() => scaleGroup(group, k), RangeError, String(k));
    assert.throws(() => scaleGroup(group, 2, 'middle'), RangeError);
  });

  test('rotateGroup: una pieza gira sobre su centro', () => {
    const res = rotateGroup([r('a', 10, 20, 40, 10)], 'cw');
    assert.equal(res.dr, 90);
    assert.deepEqual(res.rects, [r('a', 25, 5, 10, 40)]);
    assert.equal(rotateGroup([r('a', 10, 20, 40, 10)], 'ccw').dr, 270);
    assert.deepEqual(rotateGroup([]), { rects: [], dr: 90 });
  });

  test('rotateGroup: casos exactos en los dos sentidos', () => {
    // Caja {0, 0, 40, 20}, centro (20, 10). «a» a la izquierda, «b» a la derecha.
    const two = [r('a', 0, 0, 10, 20), r('b', 20, 5, 20, 10)];
    // Horario: lo de la izquierda pasa arriba, lo de la derecha abajo.
    assert.deepEqual(rotateGroup(two, 'cw').rects, [r('a', 10, -10, 20, 10), r('b', 15, 10, 10, 20)]);
    // Antihorario: lo de la izquierda pasa abajo.
    assert.deepEqual(rotateGroup(two, 'ccw').rects, [r('a', 10, 20, 20, 10), r('b', 15, -10, 10, 20)]);
    // La caja conserva el centro y se intercambian las medidas.
    assert.deepEqual(bounds(rotateGroup(two, 'cw').rects), { x: 10, y: -10, w: 20, h: 40 });
  });

  test('rotateGroup: 4 veces vuelve al origen; horario y antihorario se anulan', () => {
    const rnd = prng(33);
    for (let n = 0; n < 50; n++) {
      const rects = randomGroup(rnd);
      let turned = rects;
      for (let i = 0; i < 4; i++) turned = rotateGroup(turned, n % 2 ? 'cw' : 'ccw').rects;
      assertRectsClose(turned, rects, `4 vueltas, caso ${n}`, 1e-9);
      const back = rotateGroup(rotateGroup(rects, 'cw').rects, 'ccw').rects;
      assertRectsClose(back, rects, `ida y vuelta, caso ${n}`, 1e-9);
      // Girar no cambia si se pisan.
      assert.equal(validate(rotateGroup(rects).rects, []), validate(rects, []), `caso ${n}`);
    }
    assert.throws(() => rotateGroup(group, 90), RangeError);
  });

  test('snapGroup: la esquina de la caja cae en la grilla y no deforma', () => {
    const res = snapGroup(group, 5);
    // Caja en (10, 5): ya está en la grilla de 5.
    assert.deepEqual(res, group);
    const moved = snapGroup(moveBy(group, 1.2, 3.4), 5);
    assert.deepEqual(bounds(moved), { x: 10, y: 10, w: 90, h: 75 });
    const rnd = prng(44);
    for (let n = 0; n < 50; n++) {
      const rects = randomGroup(rnd);
      const step = [1, 2.5, 3.175, 5, 10][n % 5];
      const snapped = snapGroup(rects, step);
      const b = bounds(snapped);
      assert.ok(Math.abs(b.x / step - Math.round(b.x / step)) < 1e-9, `x en la grilla, caso ${n}`);
      assert.ok(Math.abs(b.y / step - Math.round(b.y / step)) < 1e-9, `y en la grilla, caso ${n}`);
      // Mismo delta para todas: distancias internas intactas, delta ≤ medio paso.
      const dx = snapped[0].x - rects[0].x;
      const dy = snapped[0].y - rects[0].y;
      assert.ok(Math.abs(dx) <= step / 2 + 1e-9 && Math.abs(dy) <= step / 2 + 1e-9, `caso ${n}`);
      assertRectsClose(snapped, moveBy(rects, dx, dy), `caso ${n}`, 1e-9);
      assertRectsClose(snapGroup(snapped, step), snapped, `idempotente, caso ${n}`, 1e-9);
    }
  });

  test('snapGroup: origen propio y pasos inválidos', () => {
    const one = [r('a', 12, 12, 5, 5)];
    assert.deepEqual(snapGroup(one, 5, { origin: { x: 1, y: 3 } }), [r('a', 11, 13, 5, 5)]);
    for (const step of [0, -5, NaN, Infinity, undefined]) assert.deepEqual(snapGroup(one, step), one, String(step));
    assert.deepEqual(snapGroup([], 5), []);
  });
});

describe('validate', () => {
  test('superposición dentro del grupo y con las demás', () => {
    const others = [r('x', 200, 200, 10, 10)];
    assert.equal(validate(group, others), true);
    assert.equal(validate([r('a', 0, 0, 10, 10), r('b', 5, 5, 10, 10)], []), false, 'se pisan entre sí');
    assert.equal(validate([r('a', 195, 195, 10, 10)], others), false, 'pisa a una no seleccionada');
    assert.equal(validate([r('a', 190, 200, 10, 10)], others), true, 'tocarse vale');
    assert.equal(validate([r('a', 190.005, 200, 10, 10)], others), true, 'dentro de la tolerancia');
    assert.equal(validate([], others), true);
  });

  test('allowOverlap: siempre true', () => {
    const piled = [r('a', 0, 0, 10, 10), r('b', 5, 5, 10, 10)];
    assert.equal(validate(piled, [r('c', 0, 0, 50, 50)], { allowOverlap: true }), true);
  });

  test('se puede pasar la hoja entera como `others`', () => {
    const sheet = [r('a', 0, 0, 10, 10), r('b', 50, 0, 10, 10)];
    const moved = moveBy([sheet[0]], 3, 0); // «a» se pisa con su versión vieja, que no cuenta
    assert.equal(validate(moved, sheet), true);
    assert.equal(validate(moveBy([sheet[0]], 45, 0), sheet), false);
    // Sin ids no se descarta nada.
    assert.equal(validate([{ x: 0, y: 0, w: 5, h: 5 }], [{ x: 1, y: 1, w: 5, h: 5 }]), false);
  });

  test('alinear piezas que quedarían encimadas: la UI lo rechaza', () => {
    const column = [r('a', 0, 0, 10, 10), r('b', 30, 0, 10, 10)];
    assert.equal(validate(align(column, 'left'), []), false);
    assert.equal(validate(align(column, 'top'), []), true);
  });
});
