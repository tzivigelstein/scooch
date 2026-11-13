import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { pack, packSheets, packInto, score } from '../../src/core/pack.js';
import { prng, shuffled, assertValid } from './support.js';

const copies = (n, w, h, prefix = 'p') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, w, h }));
const sortedUnique = (values) => [...new Set(values.map((v) => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);

// A4 con 10 mm de margen.
const W = 190;
const H = 277;

/** Cota inferior de hojas por área (cada pieza reserva su gap a la derecha y abajo). */
function areaBound(rects, W, H, gap) {
  const area = rects.reduce((s, r) => s + (r.w + gap) * (r.h + gap), 0);
  return Math.ceil(area / ((W + gap) * (H + gap)) - 1e-9);
}

const areaOf = (rects, placements) => {
  const byId = new Map(rects.map((r) => [r.id, r]));
  return placements.reduce((s, p) => s + byId.get(p.id).w * byId.get(p.id).h, 0);
};

/**
 * Invariantes de packSheets: cada hoja válida, cada id una sola vez (en una
 * hoja o en unplaced) y hojas de mayor a menor área ocupada.
 */
function assertSheets(rects, W, H, result, opts = {}, label = '') {
  const where = label ? ` [${label}]` : '';
  assert.ok(Array.isArray(result.sheets) && Array.isArray(result.unplaced), `forma del resultado${where}`);
  const byId = new Map(rects.map((r) => [r.id, r]));
  const seen = new Set();
  const note = (id) => {
    assert.ok(byId.has(id), `id desconocido ${id}${where}`);
    assert.ok(!seen.has(id), `id ${id} dos veces${where}`);
    seen.add(id);
  };
  result.sheets.forEach((sheet, i) => {
    assert.ok(sheet.length > 0, `hoja ${i} vacía${where}`);
    const mine = sheet.map((p) => byId.get(p.id));
    assertValid(mine, W, H, sheet, opts, `hoja ${i}${label ? `, ${label}` : ''}`);
    for (const p of sheet) note(p.id);
  });
  for (const id of result.unplaced) note(id);
  assert.equal(seen.size, rects.length, `faltan piezas${where}`);
  const areas = result.sheets.map((sheet) => areaOf(rects, sheet));
  for (let i = 1; i < areas.length; i++) {
    assert.ok(areas[i] <= areas[i - 1] + 1e-6, `hoja ${i} más llena que la anterior: ${areas}${where}`);
  }
  return areas;
}

/** Invariantes de packInto contra las hojas existentes. */
function assertInto(rects, W, H, sheets, result, { gap = 0, rotate = true } = {}, label = '') {
  const where = label ? ` [${label}]` : '';
  const byId = new Map(rects.map((r) => [r.id, r]));
  const seen = new Set();
  for (const id of [...result.placements.map((p) => p.id), ...result.unplaced]) {
    assert.ok(byId.has(id), `id desconocido ${id}${where}`);
    assert.ok(!seen.has(id), `id ${id} dos veces${where}`);
    seen.add(id);
  }
  assert.equal(seen.size, rects.length, `faltan piezas${where}`);
  const bySheet = new Map();
  for (const p of result.placements) {
    assert.ok(Number.isInteger(p.sheet) && p.sheet >= 0, `hoja inválida ${p.sheet}${where}`);
    if (!bySheet.has(p.sheet)) bySheet.set(p.sheet, []);
    bySheet.get(p.sheet).push(p);
  }
  const fresh = [...bySheet.keys()].filter((s) => s >= sheets.length).sort((a, b) => a - b);
  fresh.forEach((s, i) => assert.equal(s, sheets.length + i, `hojas nuevas salteadas${where}`));
  for (const [s, list] of bySheet) {
    const obstacles = s < sheets.length ? sheets[s] : [];
    const mine = list.map((p) => byId.get(p.id));
    const placements = list.map(({ id, x, y, rotated }) => ({ id, x, y, rotated }));
    assertValid(mine, W, H, placements, { gap, rotate, obstacles }, `hoja ${s}${label ? `, ${label}` : ''}`);
  }
  return bySheet;
}

function randomPieces(rnd, n, maxSide) {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, w: 5 + rnd() * maxSide, h: 5 + rnd() * maxSide }));
}

describe('packSheets: casos exactos', () => {
  test('sin piezas', () => {
    assert.deepEqual(packSheets([], W, H), { sheets: [], unplaced: [] });
    assert.deepEqual(packSheets([], W, H, { gap: 5, rotate: false }), { sheets: [], unplaced: [] });
  });

  test('20 piezas 60×89 en 190×277 con gap 5 → 3 hojas de 9 + 9 + 2', () => {
    const rects = copies(20, 60, 89);
    for (const rotate of [true, false]) {
      const opts = { gap: 5, rotate };
      const res = packSheets(rects, W, H, opts);
      assertSheets(rects, W, H, res, opts, `rotate:${rotate}`);
      assert.deepEqual(res.unplaced, []);
      assert.deepEqual(res.sheets.map((s) => s.length), [9, 9, 2]);
      // Las dos llenas son la grilla 3×3 sin girar.
      for (const sheet of res.sheets.slice(0, 2)) {
        assert.ok(sheet.every((p) => !p.rotated));
        assert.deepEqual(sortedUnique(sheet.map((p) => p.x)), [0, 65, 130]);
        assert.deepEqual(sortedUnique(sheet.map((p) => p.y)), [0, 94, 188]);
      }
      assert.equal(areaBound(rects, W, H, 5), 3);
    }
  });

  test('cantidades justas: 9 → 1 hoja, 10 → 9 + 1, 18 → 9 + 9, 27 → 3 llenas', () => {
    for (const [n, expected] of [
      [1, [1]],
      [9, [9]],
      [10, [9, 1]],
      [18, [9, 9]],
      [27, [9, 9, 9]],
    ]) {
      const rects = copies(n, 60, 89);
      const res = packSheets(rects, W, H, { gap: 5 });
      assertSheets(rects, W, H, res, { gap: 5 }, `${n} piezas`);
      assert.deepEqual(res.sheets.map((s) => s.length), expected, `${n} piezas`);
    }
  });

  test('dos medidas que llenan dos hojas justas: cada medida en su hoja', () => {
    // 9 de 60×89 (grilla 3×3) y 4 de 90×135 (2×2): la cota por área da 2.
    const rects = [...copies(9, 60, 89, 'c'), ...copies(4, 90, 135, 'g')];
    const res = packSheets(rects, W, H, { gap: 5 });
    assertSheets(rects, W, H, res, { gap: 5 });
    assert.equal(areaBound(rects, W, H, 5), 2);
    assert.equal(res.sheets.length, 2);
    const kinds = res.sheets.map((s) => [...new Set(s.map((p) => p.id[0]))].join(''));
    assert.deepEqual(kinds.sort(), ['c', 'g']);
  });

  test('las piezas iguales van juntas si no cuesta hojas', () => {
    // Tres medidas casi iguales; entran 4 por hoja (2×2). Llenando la primera
    // hoja al máximo quedaría 2a + 2b y b partida; juntas: 2a + 2c | 3b.
    const rects = [...copies(2, 90, 135, 'a'), ...copies(3, 90, 134, 'b'), ...copies(2, 90, 133, 'c')];
    const res = packSheets(rects, W, H, { gap: 5 });
    assertSheets(rects, W, H, res, { gap: 5 });
    assert.deepEqual(
      res.sheets.map((s) => s.map((p) => p.id).sort()),
      [
        ['a0', 'a1', 'c0', 'c1'],
        ['b0', 'b1', 'b2'],
      ]
    );

    // 5 + 5 de dos medidas, entran 9 por hoja: 5 | 5 en vez de 9 | 1.
    const pairs = [...copies(5, 60, 89, 'a'), ...copies(5, 60, 88, 'b')];
    const res2 = packSheets(pairs, W, H, { gap: 5 });
    assertSheets(pairs, W, H, res2, { gap: 5 });
    assert.deepEqual(
      res2.sheets.map((s) => [...new Set(s.map((p) => p.id[0]))]),
      [['a'], ['b']],
      'cada medida en una sola hoja, la más grande primero'
    );
  });

  test('si juntar las iguales costaría una hoja más, se parte un grupo', () => {
    // 5 + 5 + 5 con lugar para 9 por hoja: sin partir harían falta 3 hojas.
    const rects = [...copies(5, 60, 89, 'a'), ...copies(5, 60, 88, 'b'), ...copies(5, 60, 87, 'c')];
    const res = packSheets(rects, W, H, { gap: 5 });
    assertSheets(rects, W, H, res, { gap: 5 });
    assert.deepEqual(res.sheets.map((s) => s.length), [9, 6]);
    // Una sola medida queda repartida entre las dos hojas.
    const split = ['a', 'b', 'c'].filter((k) => res.sheets.every((s) => s.some((p) => p.id[0] === k)));
    assert.equal(split.length, 1, `partidas: ${split}`);
  });

  test('las que no entran ni solas van a unplaced', () => {
    const rects = [
      { id: 'ok', w: 50, h: 50 },
      { id: 'big', w: 300, h: 300 },
      { id: 'long', w: 250, h: 100 }, // entra solo girada
      { id: 'exact', w: 190, h: 277 },
    ];
    const res = packSheets(rects, W, H, { gap: 10 });
    assertSheets(rects, W, H, res, { gap: 10 });
    assert.deepEqual(res.unplaced, ['big']);
    assert.equal(res.sheets.length, 2, 'la exacta ocupa una hoja entera; contra el borde no hay gap');
    const long = res.sheets.flat().find((p) => p.id === 'long');
    assert.equal(long.rotated, true);

    const fixed = packSheets(rects, W, H, { gap: 10, rotate: false });
    assertSheets(rects, W, H, fixed, { gap: 10, rotate: false });
    assert.deepEqual(fixed.unplaced, ['long', 'big'], 'en orden canónico: lado mayor, lado menor');
  });

  test('área útil nula o negativa: nada entra', () => {
    const rects = copies(3, 10, 10);
    for (const [w, h] of [
      [0, 100],
      [100, -5],
    ]) {
      const res = packSheets(rects, w, h);
      assert.deepEqual(res.sheets, []);
      assert.deepEqual(res.unplaced.sort(), ['p0', 'p1', 'p2']);
    }
  });

  test('no modifica la entrada', () => {
    const rects = [...copies(4, 30, 10), { id: 'x', w: 10, h: 30 }];
    const snapshot = JSON.stringify(rects);
    packSheets(rects, 60, 60, { gap: 2 });
    packInto(rects, 60, 60, { gap: 2, sheets: [[{ x: 0, y: 0, w: 20, h: 20 }]] });
    assert.equal(JSON.stringify(rects), snapshot);
  });
});

describe('packSheets: propiedades', () => {
  test('fuzz: invariantes, cota por área y calidad de cada hoja', () => {
    let sheets = 0;
    let bound = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = prng(seed * 31);
      const n = 1 + Math.floor(rnd() * 40);
      const maxSide = 20 + rnd() * 100;
      const gap = rnd() < 0.3 ? 0 : Math.round(rnd() * 6);
      const rotate = rnd() < 0.7;
      const rects = randomPieces(rnd, n, maxSide);
      const opts = { gap, rotate };
      const label = `semilla ${seed}`;
      const res = packSheets(rects, W, H, opts);
      assertSheets(rects, W, H, res, opts, label);
      assert.deepEqual(res.unplaced, [], label);
      const lb = areaBound(rects, W, H, gap);
      // Piezas de hasta ~1/2 de la hoja: a lo sumo una hoja más que la cota.
      assert.ok(res.sheets.length <= lb + 1, `${label}: ${res.sheets.length} hojas, cota ${lb}`);
      sheets += res.sheets.length;
      bound += lb;
      // Cada hoja, al menos tan buena como `pack` con sus mismas piezas.
      for (const sheet of res.sheets) {
        const mine = sheet.map((p) => rects.find((r) => r.id === p.id));
        const alone = pack(mine, W, H, opts);
        if (alone) assert.ok(score(sheet, mine, W, H) <= score(alone, mine, W, H) + 1e-9, label);
      }
    }
    assert.ok(sheets <= bound * 1.1, `en total ${sheets} hojas para una cota de ${bound}`);
  });

  test('piezas chicas: tantas hojas como la cota por área', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rnd = prng(seed * 7);
      const rects = randomPieces(rnd, 40 + Math.floor(rnd() * 40), 25);
      const res = packSheets(rects, W, H, { gap: 3 });
      assertSheets(rects, W, H, res, { gap: 3 }, `semilla ${seed}`);
      assert.ok(res.sheets.length <= areaBound(rects, W, H, 3), `semilla ${seed}: ${res.sheets.length} hojas`);
    }
  });

  test('determinístico e independiente del orden de la entrada', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const rnd = prng(seed * 101);
      const rects = [...randomPieces(rnd, 1 + Math.floor(rnd() * 30), 90), ...copies(Math.floor(rnd() * 8), 40, 60)];
      const opts = { gap: rnd() < 0.5 ? 0 : 4, rotate: rnd() < 0.7 };
      const res = packSheets(rects, W, H, opts);
      assert.deepEqual(packSheets(structuredClone(rects), W, H, opts), res, `semilla ${seed}`);
      assert.deepEqual(packSheets(shuffled(rects, prng(seed)), W, H, opts), res, `semilla ${seed} (mezcladas)`);
    }
  });
});

describe('packInto', () => {
  test('sin piezas nuevas', () => {
    assert.deepEqual(packInto([], W, H, { sheets: [[]] }), { placements: [], unplaced: [] });
  });

  test('«Duplicar ×12»: completa la grilla de la hoja y sigue en una nueva', () => {
    // Una pieza 60×89 arriba a la izquierda; caben 8 más en su hoja.
    const sheets = [[{ x: 0, y: 0, w: 60, h: 89 }]];
    const rects = copies(12, 60, 89, 'd');
    const res = packInto(rects, W, H, { gap: 5, sheets });
    const bySheet = assertInto(rects, W, H, sheets, res, { gap: 5 });
    assert.deepEqual(res.unplaced, []);
    assert.equal(bySheet.get(0).length, 8);
    assert.equal(bySheet.get(1).length, 4);
    assert.deepEqual([...bySheet.keys()], [0, 1]);
    const first = bySheet.get(0);
    assert.deepEqual(sortedUnique(first.map((p) => p.x)), [0, 65, 130]);
    assert.deepEqual(sortedUnique(first.map((p) => p.y)), [0, 94, 188]);
  });

  test('rellena las hojas existentes en orden y saltea las llenas', () => {
    const full = [{ x: 0, y: 0, w: W, h: H }];
    const half = [{ x: 0, y: 0, w: W, h: 140 }];
    const sheets = [full, half, []];
    const rects = copies(5, 60, 60);
    const res = packInto(rects, W, H, { gap: 5, sheets });
    const bySheet = assertInto(rects, W, H, sheets, res, { gap: 5 });
    assert.deepEqual([...bySheet.keys()], [1], 'todas en el hueco de la hoja 1');
    assert.ok(res.placements.every((p) => p.y >= 145 - 1e-9), 'debajo del obstáculo, con gap');
  });

  test('`from`: empieza por esa hoja', () => {
    const sheets = [[], [], []];
    const rects = copies(3, 50, 50);
    const res = packInto(rects, W, H, { gap: 5, sheets, from: 2 });
    assertInto(rects, W, H, sheets, res, { gap: 5 });
    assert.ok(res.placements.every((p) => p.sheet === 2));
    // Si no entra todo, sigue con las siguientes (dando la vuelta) y después nuevas.
    const many = copies(30, 60, 89);
    const res2 = packInto(many, W, H, { gap: 5, sheets: [[], []], from: 1 });
    const bySheet = assertInto(many, W, H, [[], []], res2, { gap: 5 });
    assert.deepEqual([...bySheet.keys()], [0, 1, 2, 3]);
    assert.equal(bySheet.get(1).length, 9);
    assert.equal(bySheet.get(0).length, 9);
    assert.equal(bySheet.get(2).length + bySheet.get(3).length, 12);
    // `from` fuera de rango se acota.
    assertInto(rects, W, H, sheets, packInto(rects, W, H, { sheets, from: 99 }));
  });

  test('sin hojas existentes es como packSheets', () => {
    const rects = [...copies(7, 60, 89, 'a'), ...copies(6, 80, 50, 'b')];
    const opts = { gap: 5 };
    const into = packInto(rects, W, H, { ...opts, sheets: [] });
    const sheets = packSheets(rects, W, H, opts);
    const flat = sheets.sheets.flatMap((sheet, i) => sheet.map((p) => ({ id: p.id, sheet: i, x: p.x, y: p.y, rotated: p.rotated })));
    assert.deepEqual(into, { placements: flat, unplaced: sheets.unplaced });
  });

  test('las que no entran ni en una hoja vacía van a unplaced', () => {
    const rects = [{ id: 'big', w: 500, h: 10 }, ...copies(2, 20, 20)];
    const sheets = [[{ x: 0, y: 0, w: W, h: H }]];
    const res = packInto(rects, W, H, { gap: 1, sheets });
    assertInto(rects, W, H, sheets, res, { gap: 1 });
    assert.deepEqual(res.unplaced, ['big']);
    assert.ok(res.placements.every((p) => p.sheet === 1), 'la hoja existente está llena');
  });

  test('fuzz: nunca pisa obstáculos y respeta el gap', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rnd = prng(seed * 13);
      const gap = rnd() < 0.3 ? 0 : Math.round(rnd() * 8);
      const rotate = rnd() < 0.7;
      const sheets = Array.from({ length: Math.floor(rnd() * 3) }, () =>
        Array.from({ length: Math.floor(rnd() * 6) }, () => ({
          x: -20 + rnd() * W,
          y: -20 + rnd() * H,
          w: 5 + rnd() * 90,
          h: 5 + rnd() * 90,
        }))
      );
      const rects = randomPieces(rnd, 1 + Math.floor(rnd() * 25), 100);
      const opts = { gap, rotate };
      const res = packInto(rects, W, H, { ...opts, sheets });
      assertInto(rects, W, H, sheets, res, opts, `semilla ${seed}`);
      assert.deepEqual(res.unplaced, [], `semilla ${seed}`);
    }
  });

  test('determinístico e independiente del orden de la entrada', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rnd = prng(seed * 17);
      const sheets = [[{ x: 20, y: 30, w: 80, h: 60 }], [{ x: 100, y: 0, w: 90, h: 277 }]];
      const rects = randomPieces(rnd, 5 + Math.floor(rnd() * 20), 80);
      const opts = { gap: 4, sheets };
      const res = packInto(rects, W, H, opts);
      assert.deepEqual(packInto(structuredClone(rects), W, H, structuredClone(opts)), res, `semilla ${seed}`);
      assert.deepEqual(packInto(shuffled(rects, prng(seed)), W, H, opts), res, `semilla ${seed} (mezcladas)`);
    }
  });
});

describe('rendimiento (varias hojas)', () => {
  test('packSheets con 60 piezas en menos de 500 ms', async (t) => {
    const rects = randomPieces(prng(60), 60, 70);
    const t0 = performance.now();
    const res = packSheets(rects, W, H, { gap: 3 });
    const ms = performance.now() - t0;
    await t.annotate(`packSheets 60 piezas: ${ms.toFixed(0)} ms, ${res.sheets.length} hojas`);
    assertSheets(rects, W, H, res, { gap: 3 });
    assert.ok(ms < 500, `tardó ${ms.toFixed(0)} ms`);
  });

  test('packSheets con 200 piezas en menos de 2 s', async (t) => {
    for (const maxSide of [25, 80]) {
      const rects = randomPieces(prng(200 + maxSide), 200, maxSide);
      const t0 = performance.now();
      const res = packSheets(rects, W, H, { gap: 3 });
      const ms = performance.now() - t0;
      await t.annotate(`packSheets 200 piezas (hasta ${maxSide + 5} mm): ${ms.toFixed(0)} ms, ${res.sheets.length} hojas`);
      assertSheets(rects, W, H, res, { gap: 3 });
      assert.ok(ms < 2000, `tardó ${ms.toFixed(0)} ms`);
    }
  });

  test('packInto con 60 piezas nuevas sobre 3 hojas ocupadas en menos de 500 ms', async (t) => {
    const rnd = prng(61);
    const sheets = Array.from({ length: 3 }, () =>
      Array.from({ length: 6 }, () => ({ x: rnd() * 150, y: rnd() * 230, w: 10 + rnd() * 40, h: 10 + rnd() * 40 }))
    );
    const rects = randomPieces(rnd, 60, 50);
    const t0 = performance.now();
    const res = packInto(rects, W, H, { gap: 3, sheets });
    const ms = performance.now() - t0;
    await t.annotate(`packInto 60 piezas: ${ms.toFixed(0)} ms`);
    assertInto(rects, W, H, sheets, res, { gap: 3 });
    assert.ok(ms < 500, `tardó ${ms.toFixed(0)} ms`);
  });
});
