// Utilidades compartidas por los tests (no tiene tests propios).

import assert from 'node:assert/strict';

export const TOL = 1e-6;

/** PRNG con semilla (mulberry32) para que el fuzz sea reproducible. */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mezcla con semilla (Fisher–Yates), sin tocar el original. */
export function shuffled(items, rnd) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Distancia euclídea entre dos rectángulos (0 si se tocan o se pisan). */
export function distance(a, b) {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

export const overlaps = (a, b) =>
  a.x < b.x + b.w - TOL && b.x < a.x + a.w - TOL && a.y < b.y + b.h - TOL && b.y < a.y + a.h - TOL;

/**
 * Verifica todos los invariantes de un resultado de `pack` y devuelve las
 * cajas finales ({id, x, y, w, h} ya con la orientación aplicada).
 */
export function assertValid(rects, W, H, result, { gap = 0, rotate = true, obstacles = [] } = {}, label = '') {
  const where = label ? ` [${label}]` : '';
  assert.ok(Array.isArray(result), `se esperaba un arreglo${where}`);
  assert.equal(result.length, rects.length, `cantidad de piezas${where}`);

  const byId = new Map(rects.map((r) => [r.id, r]));
  const seen = new Set();
  const boxes = result.map((p) => {
    const r = byId.get(p.id);
    assert.ok(r, `id desconocido ${p.id}${where}`);
    assert.ok(!seen.has(p.id), `id repetido ${p.id}${where}`);
    seen.add(p.id);
    assert.equal(typeof p.rotated, 'boolean', `rotated no es booleano${where}`);
    if (!rotate) assert.equal(p.rotated, false, `pieza ${p.id} girada con rotate:false${where}`);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `posición inválida ${p.id}${where}`);
    const w = p.rotated ? r.h : r.w;
    const h = p.rotated ? r.w : r.h;
    const box = { id: p.id, x: p.x, y: p.y, w, h };
    assert.ok(
      box.x >= -TOL && box.y >= -TOL && box.x + w <= W + TOL && box.y + h <= H + TOL,
      `pieza ${p.id} fuera del área: ${JSON.stringify(box)} en ${W}×${H}${where}`
    );
    return box;
  });

  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      assert.ok(!overlaps(a, b), `se pisan ${a.id} y ${b.id}${where}`);
      assert.ok(
        distance(a, b) >= gap - TOL,
        `${a.id} y ${b.id} a ${distance(a, b)} < gap ${gap}${where}`
      );
    }
    for (const o of obstacles) {
      assert.ok(!overlaps(a, o), `${a.id} pisa el obstáculo ${JSON.stringify(o)}${where}`);
      assert.ok(
        distance(a, o) >= gap - TOL,
        `${a.id} a ${distance(a, o)} del obstáculo < gap ${gap}${where}`
      );
    }
  }
  return boxes;
}
