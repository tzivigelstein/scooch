// Colisiones entre rectángulos {x, y, w, h} (mm, origen arriba a la izquierda).
// Tocarse no es superponerse: hay una tolerancia de EPS mm. Módulo puro.

export const EPS = 0.01;

/** ¿`a` y `b` se pisan (más que tocarse)? */
export function overlaps(a, b, eps = EPS) {
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
}

/** Los de `others` que `rect` pisa. */
export const overlapping = (rect, others, eps = EPS) => others.filter((o) => overlaps(rect, o, eps));

export const overlapsAny = (rect, others, eps = EPS) => others.some((o) => overlaps(rect, o, eps));

const inside = (r, b, eps = EPS) =>
  r.x >= b.x - eps && r.y >= b.y - eps && r.x + r.w <= b.x + b.w + eps && r.y + r.h <= b.y + b.h + eps;

/**
 * Posición libre más cercana (distancia euclídea de la esquina) a `rect` para
 * un rectángulo de rect.w × rect.h que no pise a ninguno de `others`.
 *
 * Candidatos: la propia posición y las que lo apoyan contra los bordes de los
 * otros (x = izquierda de otro − ancho, x = derecha de otro, ídem en y) y de
 * `bounds`, combinadas entre sí y con la x/y original. Ahí está siempre la más
 * cercana: o solo se corre en un eje hasta un borde, o queda en una esquina
 * formada por bordes de dos rectángulos.
 *
 * Opciones: `bounds` ({x, y, w, h}) si tiene que quedar adentro de un área;
 * `maxDistance` para descartar lugares demasiado lejos. Devuelve {x, y} o null.
 */
export function nearestFree(rect, others, { bounds = null, maxDistance = Infinity } = {}) {
  const { w, h } = rect;
  const xs = new Set([rect.x]);
  const ys = new Set([rect.y]);
  for (const o of others) {
    xs.add(o.x - w);
    xs.add(o.x + o.w);
    ys.add(o.y - h);
    ys.add(o.y + o.h);
  }
  if (bounds) {
    xs.add(bounds.x);
    xs.add(bounds.x + bounds.w - w);
    ys.add(bounds.y);
    ys.add(bounds.y + bounds.h - h);
  }
  const candidates = [];
  for (const x of xs) {
    for (const y of ys) {
      const d = Math.hypot(x - rect.x, y - rect.y);
      if (d > maxDistance + 1e-9) continue;
      if (bounds && !inside({ x, y, w, h }, bounds)) continue;
      candidates.push({ x, y, d });
    }
  }
  // A igual distancia, la de más arriba y después la de más a la izquierda.
  candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  for (const c of candidates) {
    if (!overlapsAny({ x: c.x, y: c.y, w, h }, others)) return { x: c.x, y: c.y };
  }
  return null;
}

/**
 * Mueve `rect` en (dx, dy) (un solo eje). Si ahí pisa a otro, salta al primer
 * lugar libre en esa misma dirección, justo al otro lado de lo que estorba.
 * Nunca queda trabado. Devuelve {x, y, jumped} con los rectángulos saltados.
 */
export function nextFreeInDirection(rect, others, dx, dy) {
  let x = rect.x + dx;
  let y = rect.y + dy;
  const jumped = [];
  // Cada vuelta deja atrás al menos un rectángulo, que ya no vuelve a estorbar.
  for (let guard = 0; guard <= others.length; guard++) {
    const blockers = overlapping({ x, y, w: rect.w, h: rect.h }, others);
    if (!blockers.length || (!dx && !dy)) break;
    for (const b of blockers) if (!jumped.includes(b)) jumped.push(b);
    if (dx > 0) x = Math.max(...blockers.map((b) => b.x + b.w));
    else if (dx < 0) x = Math.min(...blockers.map((b) => b.x - rect.w));
    if (dy > 0) y = Math.max(...blockers.map((b) => b.y + b.h));
    else if (dy < 0) y = Math.min(...blockers.map((b) => b.y - rect.h));
  }
  return { x, y, jumped };
}

/**
 * Mayor factor k por el que se puede agrandar `rect` sin pisar a `others`.
 * `anchor`: 'center' (crece desde el centro) o 'top-left' (crece hacia la
 * derecha y abajo, como con el tirador). Los que ya pisa no lo frenan.
 * Infinity si nada lo frena; puede ser < 1 si ya está tocando a otro.
 */
export function maxGrowth(rect, others, anchor = 'center') {
  let limit = Infinity;
  for (const b of others) {
    if (overlaps(rect, b)) continue;
    let k;
    if (anchor === 'center') {
      // Se pisan cuando las distancias entre centros son menores que la suma de
      // las semi-medidas en los dos ejes a la vez.
      const dx = Math.abs(rect.x + rect.w / 2 - (b.x + b.w / 2));
      const dy = Math.abs(rect.y + rect.h / 2 - (b.y + b.h / 2));
      k = Math.max((2 * dx - b.w) / rect.w, (2 * dy - b.h) / rect.h);
    } else {
      // Lo que queda a la izquierda o arriba nunca se alcanza.
      if (b.x + b.w <= rect.x + EPS || b.y + b.h <= rect.y + EPS) continue;
      k = Math.max((b.x - rect.x) / rect.w, (b.y - rect.y) / rect.h);
    }
    if (k < limit) limit = k;
  }
  return limit;
}
