import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EPS, overlaps, overlapsAny, overlapping, nearestFree, nextFreeInDirection, maxGrowth, nextFreeForGroup, nearestFreeOffset, groupScaleRange } from '../src/collide.js';

const r = (x, y, w, h, id) => ({ id, x, y, w, h });

// PRNG con semilla (mulberry32) para que el fuzz sea reproducible.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('overlaps', () => {
  test('se pisan', () => {
    assert.equal(overlaps(r(0, 0, 10, 10), r(5, 5, 10, 10)), true);
    assert.equal(overlaps(r(0, 0, 10, 10), r(2, 2, 2, 2)), true, 'uno adentro del otro');
  });
  test('tocarse no es pisarse', () => {
    assert.equal(overlaps(r(0, 0, 10, 10), r(10, 0, 10, 10)), false, 'lado con lado');
    assert.equal(overlaps(r(0, 0, 10, 10), r(10, 10, 5, 5)), false, 'esquina con esquina');
    assert.equal(overlaps(r(0, 0, 10, 10), r(10 - EPS / 2, 0, 10, 10)), false, 'dentro de la tolerancia');
    assert.equal(overlaps(r(0, 0, 10, 10), r(9.9, 0, 10, 10)), true, 'fuera de la tolerancia');
  });
  test('separados', () => {
    assert.equal(overlaps(r(0, 0, 10, 10), r(20, 0, 10, 10)), false);
    assert.equal(overlaps(r(0, 0, 10, 10), r(0, 11, 10, 10)), false);
  });
  test('overlapsAny / overlapping', () => {
    const others = [r(20, 0, 5, 5, 'a'), r(3, 3, 2, 2, 'b')];
    assert.equal(overlapsAny(r(0, 0, 10, 10), others), true);
    assert.deepEqual(overlapping(r(0, 0, 10, 10), others).map((o) => o.id), ['b']);
    assert.equal(overlapsAny(r(0, 0, 10, 10), []), false);
  });
});

describe('nearestFree', () => {
  test('si ya está libre, se queda', () => {
    assert.deepEqual(nearestFree(r(0, 0, 10, 10), [r(20, 20, 5, 5)]), { x: 0, y: 0 });
  });

  test('se corre al borde más cercano del que estorba', () => {
    // Soltado casi sobre el borde derecho de A: lo más cerca es a su derecha.
    const a = r(0, 0, 50, 50);
    assert.deepEqual(nearestFree(r(45, 10, 20, 20), [a]), { x: 50, y: 10 });
    // Casi sobre el borde de abajo: abajo.
    assert.deepEqual(nearestFree(r(10, 45, 20, 20), [a]), { x: 10, y: 50 });
    // Casi sobre el borde izquierdo (sale de la hoja, está permitido sin bounds).
    assert.deepEqual(nearestFree(r(-15, 10, 20, 20), [a]), { x: -20, y: 10 });
  });

  test('encuentra una esquina entre dos piezas', () => {
    // A arriba a la izquierda y B debajo de A: soltado pisando las dos.
    const a = r(0, 0, 30, 30);
    const b = r(0, 30, 30, 30);
    const spot = nearestFree(r(25, 25, 10, 10), [a, b]);
    assert.deepEqual(spot, { x: 30, y: 25 });
    assert.equal(overlapsAny({ ...spot, w: 10, h: 10 }, [a, b]), false);
  });

  test('respeta maxDistance: si no hay lugar cerca, null', () => {
    const blockers = [r(0, 0, 100, 100)];
    assert.equal(nearestFree(r(40, 40, 10, 10), blockers, { maxDistance: 20 }), null);
    assert.deepEqual(nearestFree(r(40, 40, 10, 10), blockers, { maxDistance: 100 }), { x: 40, y: -10 });
  });

  test('respeta bounds', () => {
    const area = r(0, 0, 100, 100);
    const a = r(0, 0, 60, 100);
    // A la izquierda de A no entra (se saldría del área): va a la derecha.
    assert.deepEqual(nearestFree(r(5, 10, 20, 20), [a], { bounds: area }), { x: 60, y: 10 });
    // Sin lugar adentro: null.
    assert.equal(nearestFree(r(5, 10, 50, 20), [a], { bounds: area }), null);
  });

  test('el resultado nunca pisa y es el más cercano entre una grilla densa de prueba (fuzz)', () => {
    const rnd = prng(7);
    for (let n = 0; n < 150; n++) {
      const others = Array.from({ length: 1 + Math.floor(rnd() * 8) }, (_, i) =>
        r(Math.round(rnd() * 80), Math.round(rnd() * 80), 5 + Math.round(rnd() * 30), 5 + Math.round(rnd() * 30), i)
      );
      const rect = r(Math.round(rnd() * 80), Math.round(rnd() * 80), 5 + Math.round(rnd() * 20), 5 + Math.round(rnd() * 20));
      const spot = nearestFree(rect, others);
      assert.ok(spot, 'sin bounds siempre hay lugar');
      assert.equal(overlapsAny({ ...spot, w: rect.w, h: rect.h }, others), false, `pisa en el caso ${n}`);
      // Ninguna posición entera libre está más cerca (con margen por la discretización).
      const best = Math.hypot(spot.x - rect.x, spot.y - rect.y);
      for (let x = -40; x <= 140; x++) {
        for (let y = -40; y <= 140; y++) {
          const d = Math.hypot(x - rect.x, y - rect.y);
          if (d >= best - 1e-9) continue;
          assert.equal(
            overlapsAny({ x, y, w: rect.w, h: rect.h }, others),
            true,
            `caso ${n}: (${x}, ${y}) está libre y más cerca que ${JSON.stringify(spot)}`
          );
        }
      }
    }
  });
});

describe('nextFreeInDirection', () => {
  test('sin estorbos, es un paso normal', () => {
    assert.deepEqual(nextFreeInDirection(r(0, 0, 10, 10), [r(50, 0, 10, 10)], 1, 0), { x: 1, y: 0, jumped: [] });
  });

  test('tocando a otra, el paso siguiente salta al otro lado', () => {
    const b = r(10, 0, 20, 10, 'b');
    const res = nextFreeInDirection(r(0, 0, 10, 10), [b], 1, 0);
    assert.equal(res.x, 30);
    assert.equal(res.y, 0);
    assert.deepEqual(res.jumped.map((o) => o.id), ['b']);
  });

  test('salta varias seguidas si están pegadas', () => {
    const others = [r(10, 0, 10, 10, 'a'), r(20, 0, 10, 10, 'b'), r(35, 0, 10, 10, 'c')];
    const res = nextFreeInDirection(r(0, 0, 10, 10), others, 1, 0);
    assert.equal(res.x, 45, 'pasa a, b y como tampoco entra entre b y c (5 mm), también c');
    assert.deepEqual(res.jumped.map((o) => o.id), ['a', 'b', 'c']);
  });

  test('en las cuatro direcciones', () => {
    const b = r(20, 20, 10, 10);
    assert.equal(nextFreeInDirection(r(30, 20, 10, 10), [b], -1, 0).x, 10);
    assert.equal(nextFreeInDirection(r(20, 10, 10, 10), [b], 0, 1).y, 30);
    assert.equal(nextFreeInDirection(r(20, 30, 10, 10), [b], 0, -10).y, 10);
  });

  test('si ya estaba pisando (impuesto), igual sale', () => {
    const b = r(0, 0, 40, 40, 'b');
    const res = nextFreeInDirection(r(10, 10, 10, 10), [b], 1, 0);
    assert.equal(res.x, 40);
  });

  test('nunca queda trabada (fuzz)', () => {
    const rnd = prng(11);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [10, 0], [0, -10], [0.1, 0]];
    for (let n = 0; n < 300; n++) {
      const others = Array.from({ length: Math.floor(rnd() * 12) }, () =>
        r(rnd() * 100, rnd() * 100, 1 + rnd() * 30, 1 + rnd() * 30)
      );
      const rect = r(rnd() * 100, rnd() * 100, 1 + rnd() * 20, 1 + rnd() * 20);
      const [dx, dy] = dirs[n % dirs.length];
      const res = nextFreeInDirection(rect, others, dx, dy);
      assert.equal(overlapsAny({ x: res.x, y: res.y, w: rect.w, h: rect.h }, others), false, `caso ${n}`);
      // Se movió al menos el paso pedido, en esa dirección y solo en ese eje.
      if (dx) assert.ok(Math.sign(res.x - rect.x) === Math.sign(dx) && Math.abs(res.x - rect.x) >= Math.abs(dx) - 1e-9);
      if (dy) assert.ok(Math.sign(res.y - rect.y) === Math.sign(dy) && Math.abs(res.y - rect.y) >= Math.abs(dy) - 1e-9);
      if (!dx) assert.equal(res.x, rect.x);
      if (!dy) assert.equal(res.y, rect.y);
    }
  });
});

describe('maxGrowth', () => {
  test('sin vecinos no hay límite', () => {
    assert.equal(maxGrowth(r(0, 0, 10, 10), []), Infinity);
  });

  test('desde el centro frena al tocar', () => {
    // Centro en 5; vecina empieza en x = 15: puede llegar a 20 de ancho (k = 2).
    const k = maxGrowth(r(0, 0, 10, 10), [r(15, 0, 10, 10)], 'center');
    assert.ok(Math.abs(k - 2) < 1e-9, String(k));
  });

  test('desde el centro, en diagonal frena por el eje que se cruza último', () => {
    // Vecina en diagonal: hace falta cruzar en x y en y a la vez.
    const k = maxGrowth(r(0, 0, 10, 10), [r(20, 12, 10, 10)], 'center');
    // En x se tocan con k = (2·20 − 10)/10 = 3; en y con (2·12 − 10)/10 = 1,4.
    assert.ok(Math.abs(k - 3) < 1e-9, String(k));
  });

  test('desde arriba a la izquierda solo frena lo que está a la derecha o abajo', () => {
    const rect = r(10, 10, 10, 10);
    assert.equal(maxGrowth(rect, [r(0, 0, 9, 50)], 'top-left'), Infinity, 'a la izquierda no frena');
    const k = maxGrowth(rect, [r(30, 0, 10, 50)], 'top-left');
    assert.ok(Math.abs(k - 2) < 1e-9, String(k));
  });

  test('las que ya pisa no frenan', () => {
    assert.equal(maxGrowth(r(0, 0, 10, 10), [r(5, 5, 10, 10)], 'center'), Infinity);
  });

  test('agrandar hasta el límite nunca pisa (fuzz)', () => {
    const rnd = prng(3);
    for (let n = 0; n < 300; n++) {
      const anchor = n % 2 ? 'center' : 'top-left';
      const rect = r(20 + rnd() * 50, 20 + rnd() * 50, 2 + rnd() * 20, 2 + rnd() * 20);
      const others = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () =>
        r(rnd() * 120, rnd() * 120, 2 + rnd() * 25, 2 + rnd() * 25)
      ).filter((o) => !overlaps(rect, o));
      const k = maxGrowth(rect, others, anchor);
      if (!Number.isFinite(k)) continue;
      const grow = (f) =>
        anchor === 'center'
          ? r(rect.x + (rect.w * (1 - f)) / 2, rect.y + (rect.h * (1 - f)) / 2, rect.w * f, rect.h * f)
          : r(rect.x, rect.y, rect.w * f, rect.h * f);
      assert.equal(overlapsAny(grow(k), others), false, `caso ${n}: en el límite no pisa`);
      assert.equal(overlapsAny(grow(k * 1.01 + 0.01), others), true, `caso ${n}: pasado el límite pisa`);
    }
  });
});

describe('grupos', () => {
  test('nextFreeForGroup: salta lo justo para que ninguna pise nada', () => {
    const rects = [r(0, 0, 10, 10, 'a'), r(20, 0, 10, 10, 'b')];
    const others = [r(32, 0, 5, 10, 'x'), r(40, 20, 5, 5, 'y')];
    // Sin estorbo: el paso tal cual.
    assert.deepEqual(nextFreeForGroup([{ rects, others: [] }], 1, 0), { dx: 1, dy: 0, jumped: [] });
    // «b» pisaría a «x»: salta hasta dejarla atrás (b.x = 37).
    const res = nextFreeForGroup([{ rects, others }], 3, 0);
    assert.equal(res.dx, 17);
    assert.deepEqual(res.jumped.map((o) => o.id), ['x']);
    // Al saltar, «a» cae sobre «x»: sigue hasta dejarla atrás también.
    const tight = [r(0, 0, 10, 10, 'a'), r(12, 0, 10, 10, 'b')];
    const res2 = nextFreeForGroup([{ rects: tight, others: [r(24, 0, 5, 10, 'x')] }], 3, 0);
    assert.equal(res2.dx, 29);
    // Hacia arriba y en varias hojas a la vez.
    const up = nextFreeForGroup(
      [
        { rects: [r(0, 20, 10, 10, 'a')], others: [r(0, 12, 10, 5, 'x')] },
        { rects: [r(0, 20, 10, 10, 'c')], others: [] },
      ],
      0,
      -4
    );
    assert.deepEqual([up.dx, up.dy], [0, -18]);
  });

  test('nextFreeForGroup: nunca deja piezas pisándose (fuzz)', () => {
    const rnd = prng(5);
    for (let n = 0; n < 200; n++) {
      const rects = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, i) => r(rnd() * 100, rnd() * 100, 2 + rnd() * 20, 2 + rnd() * 20, `g${i}`));
      const others = Array.from({ length: Math.floor(rnd() * 8) }, (_, i) => r(rnd() * 150, rnd() * 150, 2 + rnd() * 20, 2 + rnd() * 20, `o${i}`));
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][n % 4];
      const res = nextFreeForGroup([{ rects, others }], dx, dy);
      for (const g of rects) assert.equal(overlapsAny(r(g.x + res.dx, g.y + res.dy, g.w, g.h), others), false, `caso ${n}`);
      assert.ok(dx ? Math.sign(res.dx) === dx && res.dy === 0 : Math.sign(res.dy) === dy && res.dx === 0, `caso ${n}`);
    }
  });

  test('nearestFreeOffset: el corrimiento libre más corto, con los centros en la hoja', () => {
    const rects = [r(10, 10, 10, 10, 'a'), r(25, 10, 10, 10, 'b')];
    // Libre: no se mueve.
    assert.deepEqual(nearestFreeOffset([{ rects, others: [r(50, 50, 5, 5)] }]), { dx: 0, dy: 0 });
    // «b» pisa a «x» por 2 mm a la derecha: lo más corto es correr el grupo 2 mm a la izquierda.
    const res = nearestFreeOffset([{ rects, others: [r(33, 10, 10, 10, 'x')] }]);
    assert.deepEqual(res, { dx: -2, dy: 0 });
    // Con la hoja: el centro de «a» no puede salir por la izquierda.
    const edge = nearestFreeOffset([{ rects: [r(-4, 10, 10, 10, 'a')], others: [r(0, 10, 10, 10, 'x')], bounds: { W: 100, H: 100 } }]);
    assert.deepEqual(edge, { dx: 0, dy: -10 }, 'a igual distancia, arriba antes que abajo');
    // Muy lejos: null.
    assert.equal(nearestFreeOffset([{ rects, others: [r(0, 0, 100, 100)] }], { maxDistance: 5 }), null);
    // Varias hojas: el mismo corrimiento para todas.
    const two = nearestFreeOffset([
      { rects: [r(0, 0, 10, 10, 'a')], others: [r(8, 0, 10, 10, 'x')] },
      { rects: [r(0, 0, 10, 10, 'c')], others: [r(0, 9, 10, 10, 'y')] },
    ], { maxDistance: 30 });
    for (const [g, o] of [[r(0, 0, 10, 10), r(8, 0, 10, 10)], [r(0, 0, 10, 10), r(0, 9, 10, 10)]]) {
      assert.equal(overlaps(r(g.x + two.dx, g.y + two.dy, 10, 10), o), false);
    }
  });

  test('groupScaleRange: el factor exacto en que toca a otra, al agrandar y al reducir', () => {
    const rects = [r(0, 0, 10, 10, 'a'), r(20, 0, 10, 10, 'b')];
    // Desde la esquina (0, 0): «b» toca a «x» (x = 45) cuando 30k = 45.
    const grow = groupScaleRange(rects, [r(45, 0, 10, 10, 'x')], { x: 0, y: 0 });
    assert.ok(Math.abs(grow.max - (45 + EPS) / 30) < 1e-12, String(grow.max));
    assert.equal(grow.min, 0);
    // Una pieza entre las dos: al reducir, «b» la alcanza.
    const shrink = groupScaleRange(rects, [r(12, 0, 4, 10, 'x')], { x: 0, y: 0 });
    assert.ok(Math.abs(shrink.min - (16 - EPS) / 20) < 1e-12, String(shrink.min));
    // …y al agrandar, «a» la alcanza desde el otro lado.
    assert.ok(Math.abs(shrink.max - (12 + EPS) / 10) < 1e-12, String(shrink.max));
    // Las que ya se pisan no frenan.
    assert.deepEqual(groupScaleRange([rects[0]], [r(5, 5, 10, 10)], { x: 0, y: 0 }), { min: 0, max: Infinity });
  });

  test('groupScaleRange: dentro del rango no se pisa nada (fuzz)', () => {
    const rnd = prng(17);
    for (let n = 0; n < 200; n++) {
      const rects = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => r(rnd() * 100, rnd() * 100, 2 + rnd() * 20, 2 + rnd() * 20));
      const others = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => r(rnd() * 150, rnd() * 150, 2 + rnd() * 20, 2 + rnd() * 20)).filter((o) => !overlapsAny(o, rects));
      const anchor = { x: rnd() * 100, y: rnd() * 100 };
      const { min, max } = groupScaleRange(rects, others, anchor);
      const at = (k) => rects.map((g) => r(anchor.x + (g.x - anchor.x) * k, anchor.y + (g.y - anchor.y) * k, g.w * k, g.h * k));
      for (const k of [min, (min + 1) / 2, 1, Math.min(max, 5), (1 + Math.min(max, 5)) / 2].filter((k) => k > 0 && Number.isFinite(k))) {
        for (const g of at(k)) assert.equal(overlapsAny(g, others, EPS + 1e-7), false, `caso ${n}, k ${k}`);
      }
      if (Number.isFinite(max)) assert.ok(at(max * (1 + 1e-7)).some((g) => overlapsAny(g, others)), `caso ${n}: pasado el máximo se pisa`);
    }
  });
});
