import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { pack, fitScale, score, fixedCandidates } from '../src/pack.js';
import { TOL, prng, shuffled, assertValid } from './support.js';

const copies = (n, w, h, prefix = 'p') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, w, h }));
const scaled = (rects, k) => rects.map((r) => ({ id: r.id, w: r.w * k, h: r.h * k }));

const sortedUnique = (values) => [...new Set(values.map((v) => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);

describe('pack: casos exactos', () => {
  test('lista vacía → []', () => {
    assert.deepEqual(pack([], 100, 100), []);
    assert.deepEqual(pack([], 100, 100, { rotate: false, gap: 5 }), []);
    // Aunque el área esté toda ocupada, no hay nada que ubicar.
    assert.deepEqual(pack([], 100, 100, { obstacles: [{ x: 0, y: 0, w: 100, h: 100 }] }), []);
  });

  test('grilla justa 3×3 (190×277, piezas 60×89, gap 5)', () => {
    const rects = copies(9, 60, 89);
    for (const rotate of [true, false]) {
      const res = pack(rects, 190, 277, { gap: 5, rotate });
      const boxes = assertValid(rects, 190, 277, res, { gap: 5, rotate }, `rotate:${rotate}`);
      assert.ok(res.every((p) => !p.rotated), 'ninguna debería girarse');
      assert.deepEqual(sortedUnique(boxes.map((b) => b.x)), [0, 65, 130]);
      assert.deepEqual(sortedUnique(boxes.map((b) => b.y)), [0, 94, 188]);
    }
  });

  test('grilla justa que solo entra con todas giradas', () => {
    const rects = copies(9, 89, 60);
    const res = pack(rects, 190, 277, { gap: 5 });
    assertValid(rects, 190, 277, res, { gap: 5 });
    assert.ok(res.every((p) => p.rotated), 'todas deberían girarse');
    assert.equal(pack(rects, 190, 277, { gap: 5, rotate: false }), null);
  });

  test('una pieza de más no entra', () => {
    // 10 × (60+5)×(89+5) supera el área agrandada (195×282): imposible por área.
    assert.equal(pack(copies(10, 60, 89), 190, 277, { gap: 5 }), null);
  });

  test('el gap no se exige contra el borde', () => {
    const one = [{ id: 'a', w: 100, h: 50 }];
    assert.deepEqual(pack(one, 100, 50, { gap: 10 }), [{ id: 'a', x: 0, y: 0, rotated: false }]);

    const two = copies(2, 50, 100);
    const res = pack(two, 105, 100, { gap: 5 });
    const boxes = assertValid(two, 105, 100, res, { gap: 5 });
    assert.deepEqual(sortedUnique(boxes.map((b) => b.x)), [0, 55]);
    assert.equal(pack(two, 104.9, 100, { gap: 5 }), null);
  });

  test('sin gap, piezas que llenan el área exacta', () => {
    const quads = copies(4, 50, 50);
    assertValid(quads, 100, 100, pack(quads, 100, 100));
    const mixed = [
      { id: 'top', w: 100, h: 40 },
      { id: 'left', w: 60, h: 60 },
      { id: 'right', w: 40, h: 60 },
    ];
    for (const rotate of [true, false]) {
      assertValid(mixed, 100, 100, pack(mixed, 100, 100, { rotate }), { rotate });
    }
  });

  test('pieza que solo entra girada', () => {
    const rects = [{ id: 'x', w: 150, h: 80 }];
    const res = pack(rects, 100, 200);
    assertValid(rects, 100, 200, res);
    assert.equal(res[0].rotated, true);
    assert.equal(pack(rects, 100, 200, { rotate: false }), null);
  });

  test('pieza más grande que el área → null', () => {
    assert.equal(pack([{ id: 'big', w: 300, h: 300 }], 200, 250), null);
    assert.equal(pack([{ id: 'long', w: 210, h: 10 }], 200, 200), null);
    // Una que no entra arruina todo aunque las demás sí entren.
    assert.equal(pack([...copies(3, 10, 10), { id: 'big', w: 201, h: 1 }], 200, 200), null);
  });

  test('las piezas cuadradas nunca se marcan giradas', () => {
    const rects = [...copies(12, 40, 40), { id: 'r1', w: 90, h: 30 }, { id: 'r2', w: 30, h: 90 }];
    const res = pack(rects, 170, 230, { gap: 2 });
    assertValid(rects, 170, 230, res, { gap: 2 });
    for (const p of res) if (p.id.startsWith('p')) assert.equal(p.rotated, false, `cuadrada ${p.id}`);
  });

  test('no modifica la entrada', () => {
    const rects = [
      { id: 1, w: 30, h: 10 },
      { id: 2, w: 10, h: 30 },
      { id: 3, w: 20, h: 20 },
    ];
    const obstacles = [{ x: 0, y: 0, w: 5, h: 5 }];
    const snapshot = JSON.stringify({ rects, obstacles });
    pack(rects, 100, 100, { gap: 1, obstacles });
    fitScale(rects, 30, 30, { gap: 1, obstacles });
    assert.equal(JSON.stringify({ rects, obstacles }), snapshot);
  });
});

describe('pack: obstáculos', () => {
  test('las piezas esquivan el obstáculo respetando el gap', () => {
    const obstacles = [{ x: 0, y: 0, w: 100, h: 200 }];
    const fits = [{ id: 'a', w: 90, h: 200 }];
    const res = pack(fits, 200, 200, { gap: 10, obstacles });
    assertValid(fits, 200, 200, res, { gap: 10, obstacles });
    assert.equal(res[0].x, 110);
    assert.equal(pack([{ id: 'a', w: 91, h: 200 }], 200, 200, { gap: 10, obstacles }), null);
  });

  test('sin gap la pieza puede tocar el obstáculo', () => {
    const obstacles = [{ x: 0, y: 0, w: 50, h: 100 }];
    const rects = [{ id: 'a', w: 50, h: 100 }];
    const res = pack(rects, 100, 100, { obstacles });
    assertValid(rects, 100, 100, res, { obstacles });
    assert.equal(res[0].x, 50);
  });

  test('obstáculo afuera del área pero a menos del gap', () => {
    const obstacles = [{ x: 102, y: 0, w: 10, h: 50 }];
    assert.equal(pack([{ id: 'a', w: 100, h: 50 }], 100, 50, { gap: 5, obstacles }), null);
    const rects = [{ id: 'a', w: 97, h: 50 }];
    assertValid(rects, 100, 50, pack(rects, 100, 50, { gap: 5, obstacles }), { gap: 5, obstacles });
  });

  test('obstáculos superpuestos y saliéndose del área', () => {
    const obstacles = [
      { x: -20, y: -20, w: 70, h: 60 },
      { x: 30, y: 20, w: 40, h: 40 },
      { x: 150, y: 120, w: 80, h: 80 },
      { x: 60, y: 140, w: 30, h: 30 },
    ];
    const rects = [...copies(6, 30, 20, 'h'), ...copies(3, 15, 45, 'v')];
    const res = pack(rects, 200, 180, { gap: 4, obstacles });
    assertValid(rects, 200, 180, res, { gap: 4, obstacles });
  });

  test('área completamente bloqueada → null', () => {
    const rects = [{ id: 'a', w: 1, h: 1 }];
    assert.equal(pack(rects, 100, 100, { obstacles: [{ x: -5, y: -5, w: 200, h: 200 }] }), null);
    // Varios obstáculos que entre todos tapan el área.
    const quarters = [
      { x: 0, y: 0, w: 60, h: 60 },
      { x: 50, y: 0, w: 50, h: 60 },
      { x: 0, y: 50, w: 60, h: 50 },
      { x: 40, y: 40, w: 70, h: 70 },
    ];
    assert.equal(pack(rects, 100, 100, { obstacles: quarters }), null);
    // Con gap, un hueco de 8 entre obstáculos no alcanza para 1 mm + 2×5 de gap.
    const strips = [
      { x: 0, y: 0, w: 46, h: 100 },
      { x: 54, y: 0, w: 46, h: 100 },
    ];
    assert.equal(pack(rects, 100, 100, { gap: 5, obstacles: strips }), null);
    assert.ok(pack(rects, 100, 100, { gap: 3, obstacles: strips }));
  });
});

describe('fitScale', () => {
  test('1 cuando ya entran (y con lista vacía)', () => {
    assert.equal(fitScale([], 100, 100), 1);
    assert.equal(fitScale(copies(9, 60, 89), 190, 277, { gap: 5 }), 1);
    assert.equal(fitScale(copies(2, 100, 100), 205, 100, { gap: 5 }), 1);
  });

  test('k empaqueta, y también 0.999·k', () => {
    const cases = [
      // Grilla 3×4: 4·89k + 3·5 ≤ 277 → k ≤ 0.73596; con giro se consigue más.
      { rects: copies(10, 60, 89), W: 190, H: 277, opts: { gap: 5 }, min: 0.8 },
      { rects: copies(10, 60, 89), W: 190, H: 277, opts: { gap: 5, rotate: false }, min: 0.735 },
      {
        rects: [...copies(7, 120, 80, 'h'), ...copies(5, 50, 150, 'v')],
        W: 210,
        H: 297,
        opts: { gap: 3, obstacles: [{ x: 0, y: 0, w: 210, h: 40 }] },
        min: 0.3,
      },
    ];
    for (const [i, { rects, W, H, opts, min }] of cases.entries()) {
      const k = fitScale(rects, W, H, opts);
      assert.ok(k > min && k < 1, `caso ${i}: k=${k}`);
      for (const f of [k, 0.999 * k]) {
        const s = scaled(rects, f);
        assertValid(s, W, H, pack(s, W, H, opts), opts, `caso ${i}, factor ${f}`);
      }
    }
  });

  test('k no supera la cota por área', () => {
    const k = fitScale(copies(10, 60, 89), 190, 277, { gap: 5 });
    assert.ok(10 * 60 * k * 89 * k <= 190 * 277, `k=${k}`);
  });

  test('una pieza el doble de grande que el área → ~0.5', () => {
    const k = fitScale([{ id: 'a', w: 400, h: 100 }], 200, 200);
    assert.ok(k <= 0.5 + TOL && k > 0.499, `k=${k}`);
  });

  test('el gap no se escala', () => {
    // Dos de 100×100 lado a lado en 155 con gap 5: 2·100k + 5 ≤ 155 → k ≤ 0.75.
    // Si se escalara el gap daría 0.756.
    const k = fitScale(copies(2, 100, 100), 155, 100, { gap: 5 });
    assert.ok(k <= 0.75 + TOL && k > 0.749, `k=${k}`);
  });

  test('0 en casos imposibles', () => {
    // Con gap 30 en 100×100 entran a lo sumo 4×4 piezas, por chicas que sean.
    const k = fitScale(copies(50, 10, 10), 100, 100, { gap: 30 });
    assert.ok(k < 0.01, `k=${k}`);
    const blocked = fitScale(copies(2, 10, 10), 100, 100, { obstacles: [{ x: 0, y: 0, w: 100, h: 100 }] });
    assert.equal(blocked, 0);
  });
});

// Casos generados que seguro entran: grillas justas de piezas iguales.
// `upright` son las piezas en la orientación de la grilla; `flipped`, giradas.
function gridCase(rnd) {
  const cols = 1 + Math.floor(rnd() * 5);
  const rows = 1 + Math.floor(rnd() * 6);
  const w = 20 + Math.round(rnd() * 80);
  const h = 20 + Math.round(rnd() * 80);
  const gap = rnd() < 0.5 ? 0 : 5;
  return {
    W: cols * w + (cols - 1) * gap,
    H: rows * h + (rows - 1) * gap,
    gap,
    upright: copies(cols * rows, w, h),
    flipped: copies(cols * rows, h, w),
  };
}

// Filas de piezas de igual alto que suman justo el ancho, sin girar.
function shelfCase(rnd) {
  const W = 150 + Math.round(rnd() * 250);
  const gap = rnd() < 0.5 ? 0 : 5;
  const rows = 1 + Math.floor(rnd() * 5);
  const rects = [];
  let H = 0;
  for (let r = 0; r < rows; r++) {
    const h = 20 + Math.round(rnd() * 80);
    H += h + (r ? gap : 0);
    const n = 1 + Math.floor(rnd() * 4);
    let left = W - (n - 1) * gap;
    for (let i = 0; i < n && left > 0; i++) {
      const w = i === n - 1 ? left : Math.max(10, Math.round((left / (n - i)) * (0.6 + rnd() * 0.8)));
      left -= w;
      if (w > 0) rects.push({ id: rects.length, w, h });
    }
  }
  return { W, H, gap, rects };
}

function randomCase(rnd) {
  const integer = rnd() < 0.4; // medidas enteras: más contactos exactos
  const num = (v) => (integer ? Math.max(1, Math.round(v)) : v);
  const W = num(40 + rnd() * 400);
  const H = num(40 + rnd() * 400);
  const n = 1 + Math.floor(rnd() * 40);
  const gap = rnd() < 0.3 ? 0 : num(rnd() * 10);
  const rotate = rnd() < 0.6;
  const big = rnd() < 0.5 ? 0.15 : 0.45;
  const rects = Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    w: num(1 + rnd() * W * big),
    h: num(1 + rnd() * H * big),
  }));
  const obstacles =
    rnd() < 0.5
      ? Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => ({
          x: num(-30 + rnd() * (W + 30)),
          y: num(-30 + rnd() * (H + 30)),
          w: num(1 + rnd() * W * 0.4),
          h: num(1 + rnd() * H * 0.4),
        }))
      : [];
  return { W, H, rects, opts: { gap, rotate, obstacles } };
}

describe('fuzz', () => {
  test('pack: cuando hay resultado, los invariantes se cumplen siempre', () => {
    let packed = 0;
    const CASES = 800;
    for (let seed = 1; seed <= CASES; seed++) {
      const { W, H, rects, opts } = randomCase(prng(seed));
      const res = pack(rects, W, H, opts);
      if (res === null) continue;
      packed++;
      assertValid(rects, W, H, res, opts, `semilla ${seed}`);
    }
    // Que el fuzz no sea trivial: una buena parte tiene que entrar.
    assert.ok(packed > CASES * 0.3, `solo ${packed} de ${CASES} empaquetados`);
  });

  test('pack: grillas justas siempre entran (con y sin giro)', () => {
    // Antes del arreglo fallaban ~1 de cada 3: con giro libre la heurística
    // giraba la primera pieza y después no entraban todas.
    for (let seed = 1; seed <= 300; seed++) {
      const { W, H, gap, upright, flipped } = gridCase(prng(seed * 7919));
      const label = `grilla ${W}×${H} gap ${gap}, semilla ${seed}`;
      assertValid(upright, W, H, pack(upright, W, H, { gap }), { gap }, label);
      assertValid(flipped, W, H, pack(flipped, W, H, { gap }), { gap }, `${label} (giradas)`);
      const noRotate = { gap, rotate: false };
      assertValid(upright, W, H, pack(upright, W, H, noRotate), noRotate, `${label} (sin giro)`);
    }
  });

  test('pack: filas justas sin girar entran casi siempre', () => {
    // Regresión de calidad: antes, con giro libre, fallaba ~28% de estos casos.
    let ok = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { W, H, gap, rects } = shelfCase(prng(seed * 104729));
      const res = pack(rects, W, H, { gap });
      if (res) {
        ok++;
        assertValid(rects, W, H, res, { gap }, `filas, semilla ${seed}`);
      }
    }
    assert.ok(ok >= 291, `entraron ${ok} de 300`);
  });

  test('fitScale: k siempre empaqueta y 0.999·k casi siempre', (t) => {
    let smallerFails = 0;
    let scaledCases = 0;
    const CASES = 300;
    for (let seed = 1; seed <= CASES; seed++) {
      const rnd = prng(seed * 977);
      const W = 100 + rnd() * 300;
      const H = 100 + rnd() * 300;
      const n = 1 + Math.floor(rnd() * 25);
      const gap = rnd() < 0.3 ? 0 : rnd() * 8;
      const rotate = rnd() < 0.6;
      const rects = Array.from({ length: n }, (_, i) => ({ id: i, w: 10 + rnd() * W * 0.7, h: 10 + rnd() * H * 0.7 }));
      const obstacles =
        rnd() < 0.4 ? [{ x: rnd() * W, y: rnd() * H, w: rnd() * W * 0.3, h: rnd() * H * 0.3 }] : [];
      const opts = { gap, rotate, obstacles };
      const k = fitScale(rects, W, H, opts);
      assert.ok(k >= 0 && k <= 1, `semilla ${seed}: k=${k}`);
      if (k === 0) continue;
      scaledCases++;
      const s = scaled(rects, k);
      assertValid(s, W, H, pack(s, W, H, opts), opts, `fitScale semilla ${seed}, k=${k}`);
      if (!pack(scaled(rects, 0.999 * k), W, H, opts)) smallerFails++;
    }
    // La heurística no es monótona: en layouts muy apretados, achicar un poco
    // cambia las decisiones y a veces deja de entrar (pasaba igual antes de los
    // cambios). Tiene que ser raro; lo garantizado es k exacto.
    t.diagnostic(`0.999·k no entró en ${smallerFails} de ${scaledCases} casos`);
    assert.ok(smallerFails <= scaledCases * 0.05, `0.999·k falló ${smallerFails} de ${scaledCases}`);
  });
});

// Hasta dónde llega la distribución hacia abajo y hacia la derecha.
function extent(rects, result) {
  const byId = new Map(rects.map((r) => [r.id, r]));
  let bottom = 0;
  let right = 0;
  for (const p of result) {
    const r = byId.get(p.id);
    bottom = Math.max(bottom, p.y + (p.rotated ? r.w : r.h));
    right = Math.max(right, p.x + (p.rotated ? r.h : r.w));
  }
  return { bottom, right };
}

// Filas de una distribución: por cada y (a 0,1 mm), las medidas de las piezas
// que arrancan ahí.
function rowsOf(rects, result) {
  const byId = new Map(rects.map((r) => [r.id, r]));
  const rows = new Map();
  for (const p of result) {
    const r = byId.get(p.id);
    const y = Math.round(p.y * 10);
    if (!rows.has(y)) rows.set(y, new Set());
    rows.get(y).add(`${r.w}x${r.h}`);
  }
  return [...rows.values()];
}

const at = (id, x, y, rotated = false) => ({ id, x, y, rotated });

describe('score', () => {
  test('a. más franja libre abajo es mejor', () => {
    const two = copies(2, 50, 50);
    const side = [at('p0', 0, 0), at('p1', 60, 0)];
    const stacked = [at('p0', 0, 0), at('p1', 0, 60)];
    assert.ok(score(side, two, 190, 277) < score(stacked, two, 190, 277));
  });

  test('b. girar solo si libera bastante', () => {
    // 290×300 girada baja 1 % del alto: no vale la pena.
    const almost = [{ id: 't', w: 290, h: 300 }];
    assert.ok(score([at('t', 0, 0)], almost, 1000, 1000) < score([at('t', 0, 0, true)], almost, 1000, 1000));
    // 100×300 girada libera el 20 % del alto: sí.
    const tall = [{ id: 't', w: 100, h: 300 }];
    assert.ok(score([at('t', 0, 0, true)], tall, 1000, 1000) < score([at('t', 0, 0)], tall, 1000, 1000));
  });

  test('c. con la misma altura, bordes alineados y piezas iguales juntas', () => {
    // Misma caja ocupada (120×105); la escalonada tiene dos bordes x más.
    const four = copies(4, 50, 50);
    const grid = [at('p0', 0, 0), at('p1', 70, 0), at('p2', 0, 55), at('p3', 70, 55)];
    const staggered = [at('p0', 0, 0), at('p1', 70, 0), at('p2', 15, 55), at('p3', 70, 55)];
    assert.ok(score(grid, four, 190, 277) < score(staggered, four, 190, 277));

    // Iguales en la misma fila contra intercaladas (igual altura).
    const pairs = [...copies(2, 40, 40, 'a'), ...copies(2, 60, 40, 'b')];
    const byRows = [at('a0', 0, 0), at('a1', 45, 0), at('b0', 0, 45), at('b1', 65, 45)];
    const mixed = [at('a0', 0, 0), at('b0', 45, 0), at('b1', 0, 45), at('a1', 65, 45)];
    assert.ok(score(byRows, pairs, 190, 277) < score(mixed, pairs, 190, 277));
  });

  test('d. a igualdad de todo, más a la izquierda', () => {
    const one = [{ id: 'a', w: 50, h: 50 }];
    assert.ok(score([at('a', 0, 0)], one, 190, 277) < score([at('a', 100, 0)], one, 190, 277));
  });

  test('no depende del orden de las piezas ni de las ubicaciones', () => {
    const rnd = prng(3);
    const rects = [...copies(3, 40, 30, 'a'), ...copies(2, 25, 60, 'b')];
    const placements = pack(rects, 190, 277, { gap: 5 });
    const s = score(placements, rects, 190, 277);
    assert.equal(score(shuffled(placements, rnd), shuffled(rects, rnd), 190, 277), s);
  });
});

describe('pack: elige la mejor', () => {
  test('9 iguales 60×89 en 190×277 con gap 5 → grilla 3×3 sin girar', () => {
    // (Las coordenadas exactas se verifican en "grilla justa 3×3".)
    const rects = copies(9, 60, 89);
    const res = pack(rects, 190, 277, { gap: 5 });
    assert.ok(res.every((p) => !p.rotated));
    assert.equal(rowsOf(rects, res).length, 3);
  });

  test('piezas iguales que entran sin girar no se giran', () => {
    // 40×65: giradas bajarían solo 1,8 % del alto (antes se giraban).
    for (const [w, h] of [
      [60, 89],
      [50, 70],
      [40, 65],
      [35, 40],
    ]) {
      const rects = copies(6, w, h);
      const res = pack(rects, 190, 277, { gap: 5 });
      assertValid(rects, 190, 277, res, { gap: 5 }, `${w}×${h}`);
      assert.ok(res.every((p) => !p.rotated), `${w}×${h}: ${res.filter((p) => p.rotated).length} giradas`);
    }
  });

  test('gira cuando libera claramente más franja', () => {
    // Sin girar, 4×(100×40) apiladas llegan a 175 mm; giradas, lado a lado, a 100.
    const four = copies(4, 100, 40);
    const res = pack(four, 190, 277, { gap: 5 });
    assertValid(four, 190, 277, res, { gap: 5 });
    assert.ok(res.every((p) => p.rotated), 'todas giradas (y todas igual)');
    assert.equal(extent(four, res).bottom, 100);

    // 6×(30×60): giradas entran en dos filas de 30 en vez de dos de 60.
    const six = copies(6, 30, 60);
    const res6 = pack(six, 190, 277, { gap: 5 });
    assert.ok(res6.every((p) => p.rotated));
    assert.equal(extent(six, res6).bottom, 65);
  });

  test('dos tamaños: filas de un solo tamaño', () => {
    const rects = [...copies(3, 90, 60, 'g'), ...copies(3, 60, 40, 'c')];
    for (const rotate of [true, false]) {
      const opts = { gap: 5, rotate };
      const res = pack(rects, 190, 277, opts);
      assertValid(rects, 190, 277, res, opts, `rotate:${rotate}`);
      const rows = rowsOf(rects, res);
      assert.ok(
        rows.every((sizes) => sizes.size === 1),
        `rotate:${rotate}: filas ${JSON.stringify(rows.map((r) => [...r]))}`
      );
    }
  });

  test('puntúa igual o mejor que todas las combinaciones fijas', () => {
    let compared = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const { W, H, rects, opts } = randomCase(prng(seed));
      const res = pack(rects, W, H, opts);
      const candidates = fixedCandidates(rects, W, H, opts);
      assert.equal(res === null, candidates.length === 0, `semilla ${seed}`);
      if (!res) continue;
      const best = score(res, rects, W, H);
      for (const c of candidates) {
        assertValid(rects, W, H, c, opts, `candidata, semilla ${seed}`);
        assert.ok(best <= score(c, rects, W, H) + 1e-9, `semilla ${seed}`);
        compared++;
      }
    }
    assert.ok(compared > 2000, `solo ${compared} comparaciones`);
  });

  test('determinística e independiente del orden de la entrada', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { W, H, rects, opts } = randomCase(prng(seed));
      const res = pack(rects, W, H, opts);
      const again = pack(structuredClone(rects), W, H, structuredClone(opts));
      const reordered = pack(shuffled(rects, prng(seed + 1)), W, H, opts);
      assert.deepEqual(again, res, `semilla ${seed}`);
      assert.deepEqual(reordered, res, `semilla ${seed} (mezcladas)`);
    }
  });

  test('fitScale da 1 exactamente cuando pack entra', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { W, H, rects, opts } = randomCase(prng(seed));
      const fits = pack(rects, W, H, opts) !== null;
      const k = fitScale(rects, W, H, opts);
      assert.equal(k === 1, fits, `semilla ${seed}: k=${k}`);
    }
  });
});

describe('rendimiento', () => {
  test('pack con 60 piezas en un A4 en menos de 300 ms', (t) => {
    const rnd = prng(60);
    const rects = Array.from({ length: 60 }, (_, i) => ({ id: i, w: 5 + rnd() * 25, h: 5 + rnd() * 25 }));
    const opts = { gap: 3, obstacles: [{ x: 40, y: 60, w: 60, h: 40 }] };
    const t0 = performance.now();
    const res = pack(rects, 190, 277, opts);
    const ms = performance.now() - t0;
    t.diagnostic(`pack 60 piezas: ${ms.toFixed(0)} ms`);
    assertValid(rects, 190, 277, res, opts);
    assert.ok(ms < 300, `tardó ${ms.toFixed(0)} ms`);
  });

  test('pack con 200 piezas en menos de 1,5 s', (t) => {
    const rnd = prng(42);
    const rects = Array.from({ length: 200 }, (_, i) => ({ id: i, w: 5 + rnd() * 40, h: 5 + rnd() * 40 }));
    const opts = { gap: 3, obstacles: [{ x: 100, y: 100, w: 200, h: 150 }] };
    const t0 = performance.now();
    const res = pack(rects, 1000, 700, opts);
    const ms = performance.now() - t0;
    t.diagnostic(`pack 200 piezas: ${ms.toFixed(0)} ms`);
    assertValid(rects, 1000, 700, res, opts);
    assert.ok(ms < 1500, `tardó ${ms.toFixed(0)} ms`);
  });

  test('fitScale con 100 piezas en pocos segundos', (t) => {
    const rnd = prng(7);
    const rects = Array.from({ length: 100 }, (_, i) => ({ id: i, w: 20 + rnd() * 60, h: 20 + rnd() * 60 }));
    const opts = { gap: 3, obstacles: [{ x: 50, y: 50, w: 100, h: 80 }] };
    const t0 = performance.now();
    const k = fitScale(rects, 320, 450, opts);
    const ms = performance.now() - t0;
    t.diagnostic(`fitScale 100 piezas: ${ms.toFixed(0)} ms (k=${k.toFixed(4)})`);
    assert.ok(k > 0 && k < 1);
    const s = scaled(rects, k);
    assertValid(s, 320, 450, pack(s, 320, 450, opts), opts);
    assert.ok(ms < 5000, `tardó ${ms.toFixed(0)} ms`);
  });
});
