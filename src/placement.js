// Dónde ubicar algo flotante (la barra de la pieza) entre varias posiciones
// posibles. Módulo puro: rectángulos {x, y, w, h} en px.

const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r, b) => r.x >= b.x && r.y >= b.y && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y + b.h;

/** Intersección de dos rectángulos, o null si no se tocan. */
export function clip(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/**
 * De los `candidates` (en orden de preferencia), el que tapa menos rectángulos de
 * `covers`; a igualdad, el primero. Descarta los que no entran enteros en `bounds`
 * o pisan alguno de `blocked`. Devuelve el candidato elegido, o null si no queda ninguno.
 */
export function pickSpot(candidates, { bounds, covers = [], blocked = [] }) {
  let best = null;
  let fewest = Infinity;
  for (const spot of candidates) {
    if (!inside(spot, bounds) || blocked.some((b) => intersects(spot, b))) continue;
    const covered = covers.filter((r) => intersects(spot, r)).length;
    if (covered < fewest) {
      best = spot;
      fewest = covered;
    }
  }
  return best;
}
