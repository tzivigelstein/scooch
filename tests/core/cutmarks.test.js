import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { CUT_MODES, cutLines } from '../../src/core/cutmarks.js';
import { prng, shuffled } from './support.js';

const TOL = 1e-6;
const H = (y, x1, x2) => ({ x1, y1: y, x2, y2: y });
const V = (x, y1, y2) => ({ x1: x, y1, x2: x, y2 });

/** Grilla n×n de piezas de `size` mm separadas `gap`, desde (x0, y0). */
function grid(n, size, gap, x0 = 0, y0 = 0) {
  const out = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      out.push({ x: x0 + col * (size + gap), y: y0 + row * (size + gap), w: size, h: size });
    }
  }
  return out;
}

/** Las líneas de bordes de una grilla, cada una con los mismos tramos, en el orden de salida. */
function expectedGrid(lines, spans) {
  return [
    ...lines.flatMap((y) => spans.map(([a, b]) => H(y, a, b))),
    ...lines.flatMap((x) => spans.map(([a, b]) => V(x, a, b))),
  ];
}

// Propiedades de cualquier resultado: ejes, largo positivo, orden y sin
// colineales que se pisen o toquen (ya están unidos).
function assertWellFormed(segments, label = '') {
  for (const s of segments) {
    const horizontal = s.y1 === s.y2;
    assert.ok(horizontal || s.x1 === s.x2, `${label}: no es horizontal ni vertical ${JSON.stringify(s)}`);
    assert.ok(s.x1 <= s.x2 && s.y1 <= s.y2, `${label}: extremos al revés ${JSON.stringify(s)}`);
    assert.ok(s.x2 - s.x1 + (s.y2 - s.y1) > TOL, `${label}: largo nulo ${JSON.stringify(s)}`);
  }
  const keyed = segments.map((s) => (s.y1 === s.y2 ? ['h', s.y1, s.x1, s.x2] : ['v', s.x1, s.y1, s.y2]));
  for (let i = 1; i < keyed.length; i++) {
    const [d0, c0, a0, b0] = keyed[i - 1];
    const [d1, c1, a1] = keyed[i];
    const ordered = d0 < d1 || (d0 === d1 && (c0 < c1 - TOL || (Math.abs(c0 - c1) <= TOL && a0 <= a1)));
    assert.ok(ordered, `${label}: fuera de orden en ${i}`);
    if (d0 === d1 && Math.abs(c0 - c1) <= TOL) assert.ok(a1 > b0 + TOL, `${label}: colineales sin unir en ${i}`);
  }
}

// ¿Algún punto del segmento está estrictamente adentro de la pieza?
function entersPiece(s, q) {
  if (s.y1 === s.y2) {
    if (!(s.y1 > q.y + TOL && s.y1 < q.y + q.h - TOL)) return false;
    return Math.min(s.x2, q.x + q.w) - Math.max(s.x1, q.x) > TOL;
  }
  if (!(s.x1 > q.x + TOL && s.x1 < q.x + q.w - TOL)) return false;
  return Math.min(s.y2, q.y + q.h) - Math.max(s.y1, q.y) > TOL;
}

const insideBounds = (s, b) =>
  s.x1 >= b.x - TOL && s.x2 <= b.x + b.w + TOL && s.y1 >= b.y - TOL && s.y2 <= b.y + b.h + TOL;

describe('modos', () => {
  test("'none' y modos desconocidos", () => {
    assert.deepEqual(CUT_MODES, ['none', 'corners', 'outline']);
    assert.deepEqual(cutLines(grid(2, 10, 5), { mode: 'none' }), []);
    assert.throws(() => cutLines([], { mode: 'cross' }), RangeError);
    assert.deepEqual(cutLines([]), []);
    assert.deepEqual(cutLines([], { mode: 'outline' }), []);
  });

  test('piezas inválidas se ignoran; largo nulo no dibuja; offset negativo cuenta como 0', () => {
    const bad = [
      { x: 0, y: 0, w: 0, h: 10 },
      { x: 0, y: 0, w: 10, h: -1 },
      { x: NaN, y: 0, w: 10, h: 10 },
    ];
    assert.deepEqual(cutLines(bad), []);
    const one = [{ x: 10, y: 20, w: 30, h: 40 }];
    assert.deepEqual(cutLines(one, { length: 0 }), []);
    assert.deepEqual(cutLines(one, { length: -3 }), []);
    assert.deepEqual(cutLines(one, { offset: -2 }), cutLines(one, { offset: 0 }));
    assert.equal(cutLines(one, { offset: 0 })[0].x2, 10, 'arranca en la esquina');
  });
});

describe("'corners': casos exactos", () => {
  test('una pieza: 8 marcas', () => {
    const one = [{ x: 10, y: 20, w: 30, h: 40 }];
    assert.deepEqual(cutLines(one), [
      H(20, 4.5, 8.5),
      H(20, 41.5, 45.5),
      H(60, 4.5, 8.5),
      H(60, 41.5, 45.5),
      V(10, 14.5, 18.5),
      V(10, 61.5, 65.5),
      V(40, 14.5, 18.5),
      V(40, 61.5, 65.5),
    ]);
    // Largo y separación propios.
    assert.deepEqual(cutLines(one, { length: 10, offset: 3 })[0], H(20, -3, 7));
  });

  test('dos pegadas: comparten las marcas del borde común y no se dibujan sobre la vecina', () => {
    const two = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 10, y: 0, w: 10, h: 10 },
    ];
    assert.deepEqual(cutLines(two), [
      H(0, -5.5, -1.5),
      H(0, 21.5, 25.5),
      H(10, -5.5, -1.5),
      H(10, 21.5, 25.5),
      V(0, -5.5, -1.5),
      V(0, 11.5, 15.5),
      V(10, -5.5, -1.5),
      V(10, 11.5, 15.5),
      V(20, -5.5, -1.5),
      V(20, 11.5, 15.5),
    ]);
  });

  test('alineadas en columna: la marca entre ellas se comparte si se pisan', () => {
    const column = (gap) => [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 0, y: 10 + gap, w: 10, h: 10 },
    ];
    // gap 20 > 2 × (1,5 + 4): marcas separadas.
    const far = cutLines(column(20)).filter((s) => s.x1 === 0 && s.x2 === 0);
    assert.deepEqual(far, [V(0, -5.5, -1.5), V(0, 11.5, 15.5), V(0, 24.5, 28.5), V(0, 41.5, 45.5)]);
    // gap 8: las dos marcas se pisan y quedan en una.
    const near = cutLines(column(8)).filter((s) => s.x1 === 0 && s.x2 === 0);
    assert.deepEqual(near, [V(0, -5.5, -1.5), V(0, 11.5, 16.5), V(0, 29.5, 33.5)]);
  });

  test('grilla 3×3 con gap mayor que 2 × (offset + length): 72 marcas sueltas', () => {
    const segments = cutLines(grid(3, 10, 12));
    assert.equal(segments.length, 72);
    const lines = [0, 10, 22, 32, 44, 54];
    assert.deepEqual(
      segments,
      expectedGrid(lines, [
        [-5.5, -1.5],
        [11.5, 15.5],
        [16.5, 20.5],
        [33.5, 37.5],
        [38.5, 42.5],
        [55.5, 59.5],
      ])
    );
  });

  test('grilla 3×3 con gap entre offset + length y el doble: las de enfrente se unen', () => {
    const segments = cutLines(grid(3, 10, 8));
    assert.equal(segments.length, 48);
    assert.deepEqual(
      segments,
      expectedGrid(
        [0, 10, 18, 28, 36, 46],
        [
          [-5.5, -1.5],
          [11.5, 16.5],
          [29.5, 34.5],
          [47.5, 51.5],
        ]
      )
    );
  });

  test('grilla 3×3 con gap menor que offset + length: la marca cruza el espacio entero', () => {
    const segments = cutLines(grid(3, 10, 3));
    assert.equal(segments.length, 48);
    assert.deepEqual(
      segments,
      expectedGrid(
        [0, 10, 13, 23, 26, 36],
        [
          [-5.5, -1.5],
          [10, 13],
          [23, 26],
          [37.5, 41.5],
        ]
      )
    );
  });

  test('grilla 3×3 con gap menor que offset: solo las marcas de afuera', () => {
    const segments = cutLines(grid(3, 10, 1));
    assert.equal(segments.length, 24);
    assert.deepEqual(
      segments,
      expectedGrid(
        [0, 10, 11, 21, 22, 32],
        [
          [-5.5, -1.5],
          [33.5, 37.5],
        ]
      )
    );
  });

  test('grilla 3×3 pegada: una marca por línea de corte y lado', () => {
    assert.deepEqual(
      cutLines(grid(3, 10, 0)),
      expectedGrid(
        [0, 10, 20, 30],
        [
          [-5.5, -1.5],
          [31.5, 35.5],
        ]
      )
    );
  });

  test('pieza contra el borde de la hoja', () => {
    const sheet = { x: 0, y: 0, w: 100, h: 100 };
    // En la esquina: lo de afuera y lo que corre sobre el borde se descarta.
    assert.deepEqual(cutLines([{ x: 0, y: 0, w: 50, h: 30 }], { bounds: sheet }), [
      H(30, 51.5, 55.5),
      V(50, 31.5, 35.5),
    ]);
    // Contra el borde derecho y a 2 mm del de arriba: las de arriba se cortan en el borde.
    assert.deepEqual(cutLines([{ x: 60, y: 2, w: 40, h: 20 }], { bounds: sheet }), [
      H(2, 54.5, 58.5),
      H(22, 54.5, 58.5),
      V(60, 0, 0.5),
      V(60, 23.5, 27.5),
    ]);
    // Bounds desplazados (área útil con margen).
    const area = { x: 10, y: 10, w: 80, h: 80 };
    assert.deepEqual(cutLines([{ x: 10, y: 10, w: 80, h: 80 }], { bounds: area }), []);
  });
});

describe("'outline'", () => {
  test('una pieza, dos pegadas y grillas', () => {
    assert.deepEqual(cutLines([{ x: 1, y: 2, w: 3, h: 4 }], { mode: 'outline' }), [
      H(2, 1, 4),
      H(6, 1, 4),
      V(1, 2, 6),
      V(4, 2, 6),
    ]);
    const two = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 10, y: 0, w: 10, h: 10 },
    ];
    assert.deepEqual(cutLines(two, { mode: 'outline' }), [
      H(0, 0, 20),
      H(10, 0, 20),
      V(0, 0, 10),
      V(10, 0, 10),
      V(20, 0, 10),
    ]);
    assert.deepEqual(cutLines(grid(3, 10, 0), { mode: 'outline' }), expectedGrid([0, 10, 20, 30], [[0, 30]]));
    assert.deepEqual(
      cutLines(grid(3, 10, 5), { mode: 'outline' }),
      expectedGrid(
        [0, 10, 15, 25, 30, 40],
        [
          [0, 10],
          [15, 25],
          [30, 40],
        ]
      )
    );
  });

  test('bordes compartidos en parte', () => {
    // B más corta, apoyada a la derecha de A: el borde x = 10 queda de 0 a 20.
    const pieces = [
      { x: 0, y: 0, w: 10, h: 20 },
      { x: 10, y: 5, w: 10, h: 10 },
    ];
    const v10 = cutLines(pieces, { mode: 'outline' }).filter((s) => s.x1 === 10 && s.x2 === 10);
    assert.deepEqual(v10, [V(10, 0, 20)]);
  });

  test('recorte a la hoja', () => {
    const sheet = { x: 0, y: 0, w: 100, h: 100 };
    assert.deepEqual(cutLines([{ x: 0, y: 0, w: 50, h: 30 }], { mode: 'outline', bounds: sheet }), [
      H(30, 0, 50),
      V(50, 0, 30),
    ]);
    assert.deepEqual(cutLines([{ x: 80, y: 90, w: 40, h: 40 }], { mode: 'outline', bounds: sheet }), [
      H(90, 80, 100),
      V(80, 90, 100),
    ]);
  });
});

describe('propiedades (fuzz)', () => {
  function randomCase(rnd) {
    const W = 100 + rnd() * 200;
    const Hh = 100 + rnd() * 250;
    const n = 1 + Math.floor(rnd() * 25);
    const integer = rnd() < 0.5; // medidas enteras: más bordes alineados y contactos exactos
    const num = (v) => (integer ? Math.round(v) : v);
    const pieces = Array.from({ length: n }, () => ({
      x: num(-10 + rnd() * W),
      y: num(-10 + rnd() * Hh),
      w: Math.max(1, num(1 + rnd() * 60)),
      h: Math.max(1, num(1 + rnd() * 60)),
    }));
    // A veces, una grilla (piezas alineadas, con gaps chicos y grandes).
    if (rnd() < 0.3)
      pieces.push(
        ...grid(1 + Math.floor(rnd() * 4), num(5 + rnd() * 30), num(rnd() * 12), num(rnd() * 50), num(rnd() * 50))
      );
    const opts = { length: 1 + rnd() * 8, offset: rnd() * 4 };
    return { pieces, bounds: { x: 0, y: 0, w: W, h: Hh }, opts };
  }

  test("'corners': nada adentro de una pieza ni afuera de la hoja", () => {
    let total = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const { pieces, bounds, opts } = randomCase(prng(seed));
      const label = `semilla ${seed}`;
      const segments = cutLines(pieces, { ...opts, mode: 'corners', bounds });
      assertWellFormed(segments, label);
      total += segments.length;
      for (const s of segments) {
        assert.ok(insideBounds(s, bounds), `${label}: afuera ${JSON.stringify(s)}`);
        for (const q of pieces)
          assert.ok(!entersPiece(s, q), `${label}: ${JSON.stringify(s)} entra en ${JSON.stringify(q)}`);
      }
      // Sin bounds tampoco entra en ninguna, y el orden de la entrada no importa.
      const free = cutLines(pieces, opts);
      assertWellFormed(free, `${label} sin bounds`);
      for (const s of free) for (const q of pieces) assert.ok(!entersPiece(s, q), `${label} sin bounds`);
      assert.deepEqual(cutLines(shuffled(pieces, prng(seed)), opts), free, `${label}: orden`);
    }
    assert.ok(total > 1000, `solo ${total} segmentos`);
  });

  test("'corners': cada marca sobrevive salvo donde la tapa otra pieza", () => {
    // Piezas sueltas y separadas: todas las marcas enteras.
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = prng(seed * 3);
      const n = 1 + Math.floor(rnd() * 5);
      const pieces = Array.from({ length: n }, (_, i) => ({
        x: i * 100 + rnd() * 10,
        y: rnd() * 100,
        w: 5 + rnd() * 30,
        h: 5 + rnd() * 30,
      }));
      const segments = cutLines(pieces);
      assert.equal(segments.length, 8 * n, `semilla ${seed}`);
      for (const s of segments) assert.ok(Math.abs(s.x2 - s.x1 + (s.y2 - s.y1) - 4) < 1e-9, `semilla ${seed}: largo`);
    }
  });

  test("'outline': cada borde de cada pieza queda cubierto por un solo segmento", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { pieces } = randomCase(prng(seed * 7));
      const segments = cutLines(pieces, { mode: 'outline' });
      assertWellFormed(segments, `semilla ${seed}`);
      const covered = (dir, c, a, b) =>
        segments.some((s) =>
          dir === 'h'
            ? s.y1 === s.y2 && Math.abs(s.y1 - c) <= TOL && s.x1 <= a + TOL && s.x2 >= b - TOL
            : s.x1 === s.x2 && Math.abs(s.x1 - c) <= TOL && s.y1 <= a + TOL && s.y2 >= b - TOL
        );
      // Every edge of a piece that no piece above it overlaps (an overlapped one is checked apart).
      const overlapped = (q, i) => pieces.slice(i + 1).some((o) => q.x < o.x + o.w - TOL && o.x < q.x + q.w - TOL && q.y < o.y + o.h - TOL && o.y < q.y + q.h - TOL);
      pieces.forEach((q, i) => {
        if (overlapped(q, i)) return;
        assert.ok(covered('h', q.y, q.x, q.x + q.w) && covered('h', q.y + q.h, q.x, q.x + q.w), `semilla ${seed}`);
        assert.ok(covered('v', q.x, q.y, q.y + q.h) && covered('v', q.x + q.w, q.y, q.y + q.h), `semilla ${seed}`);
      });
      // Whatever runs inside a piece is the edge of a piece stacked above it.
      const onEdge = (s, o) => (s.y1 === s.y2 ? [o.y, o.y + o.h].some((y) => Math.abs(y - s.y1) <= TOL) : [o.x, o.x + o.w].some((x) => Math.abs(x - s.x1) <= TOL));
      for (const s of segments) {
        pieces.forEach((q, i) => {
          if (entersPiece(s, q)) assert.ok(pieces.slice(i + 1).some((o) => onEdge(s, o)), `semilla ${seed}: an outline under a piece above it ${JSON.stringify(s)}`);
        });
      }
      // Ningún segmento sale de la unión de los bordes: el largo total no supera la suma de perímetros.
      const length = segments.reduce((s, g) => s + (g.x2 - g.x1) + (g.y2 - g.y1), 0);
      const perimeters = pieces.reduce((s, q) => s + 2 * (q.w + q.h), 0);
      assert.ok(length <= perimeters + 1e-6, `semilla ${seed}`);
    }
  });

  test('rendimiento: 200 piezas en una fracción de segundo', async (t) => {
    const pieces = grid(14, 12, 2);
    const t0 = performance.now();
    const segments = cutLines(pieces);
    const ms = performance.now() - t0;
    await t.annotate(`cutLines 196 piezas: ${ms.toFixed(0)} ms, ${segments.length} segmentos`);
    assert.ok(ms < 300, `tardó ${ms.toFixed(0)} ms`);
  });
});

describe('outline with overlapping pieces and the stroke style', () => {
  test('an outline doesn’t run over the image of a piece stacked above it', () => {
    const lower = { x: 0, y: 0, w: 40, h: 40 };
    const upper = { x: 20, y: 20, w: 40, h: 40 };
    const lines = cutLines([lower, upper], { mode: 'outline' });
    // The lower piece's right and bottom edges stop where the upper one starts; the upper one is whole.
    assert.ok(lines.some((s) => s.x1 === 40 && s.x2 === 40 && s.y1 === 0 && s.y2 === 20), JSON.stringify(lines));
    assert.ok(!lines.some((s) => s.x1 === 40 && s.y2 > 20 + TOL && s.y1 < 40 - TOL), 'nothing inside the upper piece');
    assert.ok(lines.some((s) => s.y1 === 20 && s.y2 === 20 && s.x1 <= 20 && s.x2 >= 60), 'the upper piece’s top edge');
    // The other order: the upper (now lower) piece’s edges under the first are left out.
    const flipped = cutLines([upper, lower], { mode: 'outline' });
    assert.ok(!flipped.some((s) => s.y1 === 20 && s.y2 === 20 && s.x1 < 40 - TOL && s.x2 > 20 + TOL), JSON.stringify(flipped));
  });

  test('touching pieces share one line', () => {
    const lines = cutLines([{ x: 0, y: 0, w: 20, h: 10 }, { x: 20, y: 0, w: 20, h: 10 }], { mode: 'outline' });
    assert.deepEqual(lines.filter((s) => s.x1 === 20 && s.x2 === 20), [V(20, 0, 10)]);
    assert.deepEqual(lines.filter((s) => s.y1 === 0 && s.y2 === 0), [H(0, 0, 40)]);
  });

  test('cutStyle: weights in points, colors and the dotted pattern', async () => {
    const { cutStyle, CUT_WEIGHTS, dotPattern } = await import('../../src/core/cutmarks.js');
    assert.deepEqual(CUT_WEIGHTS, { thin: 0.25, medium: 0.5, thick: 1 });
    assert.deepEqual(cutStyle({}), { width: 0.25, hex: '#000000', rgb: [0, 0, 0], dash: null });
    const style = cutStyle({ weight: 'thick', color: '#FF8000', dash: 'dotted' });
    assert.equal(style.width, 1);
    assert.equal(style.hex, '#ff8000');
    assert.deepEqual(style.rgb, [1, 128 / 255, 0]);
    assert.deepEqual(style.dash, dotPattern(1));
    assert.deepEqual(cutStyle({ color: 'nope', weight: 'x' }), { width: 0.25, hex: '#000000', rgb: [0, 0, 0], dash: null });
  });
});

describe('cut margin', () => {
  test('cutBox grows (or shrinks) a box on every side, never inverting it', async () => {
    const { cutBox } = await import('../../src/core/cutmarks.js');
    assert.deepEqual(cutBox({ x: 10, y: 20, w: 30, h: 40 }, 2), { x: 8, y: 18, w: 34, h: 44 });
    assert.deepEqual(cutBox({ x: 10, y: 20, w: 30, h: 40 }, -1), { x: 11, y: 21, w: 28, h: 38 });
    assert.deepEqual(cutBox({ x: 10, y: 20, w: 30, h: 40 }, -50), { x: 25, y: 35, w: 0, h: 10 }, 'shrinks to a line at most');
    assert.deepEqual(cutBox({ x: 10, y: 20, w: 30, h: 40 }), { x: 10, y: 20, w: 30, h: 40 });
  });

  test('cut boxes of rotated and cropped pieces follow their size on the sheet', async () => {
    const { cutBox } = await import('../../src/core/cutmarks.js');
    const { pieceSize } = await import('../../src/core/crop.js');
    const asset = { w: 150, h: 100 };
    for (const r of [0, 90, 180, 270]) {
      for (const crop of [null, { x: 0.1, y: 0.2, w: 0.5, h: 0.4 }]) {
        const { w, h } = pieceSize(asset, { scale: 50, r, crop });
        const box = cutBox({ x: 20, y: 30, w, h }, 3);
        assert.ok(Math.abs(box.w - (w + 6)) < 1e-9 && Math.abs(box.h - (h + 6)) < 1e-9 && box.x === 17 && box.y === 27, `r=${r} crop=${!!crop}`);
      }
    }
  });

  test('lines go on the cut boxes; equal margins that touch share one line', () => {
    // 2 mm margins and a 4 mm gap: the cut boxes touch at x = 52.
    const a = { x: 10, y: 10, w: 40, h: 30 };
    const b = { x: 54, y: 10, w: 40, h: 30 };
    const outline = cutLines([a, b], { mode: 'outline', margin: 2 });
    assert.deepEqual(outline.filter((s) => s.x1 === s.x2 && Math.abs(s.x1 - 52) < TOL), [V(52, 8, 42)]);
    assert.ok(outline.some((s) => s.y1 === 8 && s.y2 === 8 && Math.abs(s.x1 - 8) < TOL && Math.abs(s.x2 - 96) < TOL), 'the top edges continue as one line');
    const corners = cutLines([a, b], { mode: 'corners', margin: 2, length: 4, offset: 1 });
    assertWellFormed(corners, 'corners with margin');
    // The marks start at the cut box corners (8, 8): the first horizontal one ends at 8 − 1.
    assert.ok(corners.some((s) => s.y1 === 8 && Math.abs(s.x2 - 7) < TOL && Math.abs(s.x1 - 3) < TOL), JSON.stringify(corners.slice(0, 4)));
    // Nothing inside an image box nor a cut box.
    for (const q of [a, b, { x: 8, y: 8, w: 44, h: 34 }, { x: 52, y: 8, w: 44, h: 34 }]) assert.ok(!corners.some((s) => entersPiece(s, q)), JSON.stringify(q));
  });

  test('a negative margin draws the outline inside the image; a degenerate cut box draws nothing', () => {
    const lines = cutLines([{ x: 10, y: 10, w: 40, h: 30 }], { mode: 'outline', margin: -1 });
    assert.deepEqual(lines, [H(11, 11, 49), H(39, 11, 49), V(11, 11, 39), V(49, 11, 39)]);
    assert.deepEqual(cutLines([{ x: 10, y: 10, w: 40, h: 30 }], { mode: 'outline', margin: -20 }), []);
    assert.deepEqual(cutLines([{ x: 10, y: 10, w: 40, h: 30 }], { mode: 'corners', margin: -20 }), []);
  });

  test('footprintPad: the margin only while cut lines are on and it is positive', async () => {
    const { footprintPad } = await import('../../src/core/cutmarks.js');
    assert.equal(footprintPad({ mode: 'corners', margin: 2 }), 2);
    assert.equal(footprintPad({ mode: 'outline', margin: 2 }), 2);
    assert.equal(footprintPad({ mode: 'none', margin: 2 }), 0);
    assert.equal(footprintPad({ mode: 'corners', margin: -1 }), 0);
    assert.equal(footprintPad({ mode: 'corners', margin: 0 }), 0);
    assert.equal(footprintPad(null), 0);
  });
});
