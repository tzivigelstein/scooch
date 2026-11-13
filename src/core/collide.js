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

// ---------- Grupos que se mueven rígidos (varias piezas, en una o varias hojas) ----------
//
// `layers`: [{rects, others, bounds?}], una por hoja: `rects` son las piezas del
// grupo en esa hoja y `others`, las demás de esa hoja. Todas las capas se
// corren igual. Con `bounds` ({W, H}), el centro de cada pieza tiene que quedar
// dentro de la hoja W × H.

const movedBy = (r, dx, dy) => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });

function centerInside(r, bounds) {
  if (!bounds) return true;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return cx >= -1e-9 && cy >= -1e-9 && cx <= bounds.W + 1e-9 && cy <= bounds.H + 1e-9;
}

/**
 * Como `nextFreeInDirection`, para un grupo: lo corre (dx, dy) (un solo eje)
 * y, si alguna pieza pisa a otra de su hoja, salta en esa dirección lo justo
 * para dejarla atrás, hasta que no pise nada. Devuelve {dx, dy, jumped}: el
 * corrimiento final y las de `others` que saltó (sin repetir).
 */
export function nextFreeForGroup(layers, dx, dy) {
  let ox = dx;
  let oy = dy;
  const jumped = [];
  const forward = dx > 0 || dy > 0;
  const pairs = layers.reduce((n, l) => n + l.rects.length * l.others.length, 0);
  // Cada vuelta avanza hasta el borde de un par pieza–obstáculo distinto: termina.
  for (let guard = 0; guard <= pairs && (dx || dy); guard++) {
    let next = null;
    for (const { rects, others } of layers) {
      for (const r of rects) {
        const moved = movedBy(r, ox, oy);
        for (const b of others) {
          if (!overlaps(moved, b)) continue;
          if (!jumped.includes(b)) jumped.push(b);
          const need = dx > 0 ? b.x + b.w - r.x : dx < 0 ? b.x - r.w - r.x : dy > 0 ? b.y + b.h - r.y : b.y - r.h - r.y;
          next = next === null ? need : forward ? Math.max(next, need) : Math.min(next, need);
        }
      }
    }
    if (next === null) break;
    if (dx) ox = next;
    else oy = next;
  }
  return { dx: ox, dy: oy, jumped };
}

/**
 * Corrimiento (dx, dy) más corto (distancia euclídea) que deja un grupo sin
 * pisar a nadie de su hoja y, con `bounds`, con los centros dentro de la hoja.
 * Candidatos: 0 y los corrimientos que apoyan una pieza del grupo contra un
 * borde de otra (o su centro contra el borde de la hoja), combinados en x e y
 * (como `nearestFree`). `maxDistance` descarta los lejanos. No compara las del
 * grupo entre sí (se mueven juntas). Con `step` (> 0), solo corrimientos que
 * son múltiplos del paso (el bloque sigue en la grilla del imán): cada
 * candidato se redondea al múltiplo de abajo y al de arriba. Devuelve {dx, dy}
 * o null.
 */
export function nearestFreeOffset(layers, { maxDistance = Infinity, step = 0 } = {}) {
  const xs = new Set([0]);
  const ys = new Set([0]);
  for (const { rects, others, bounds } of layers) {
    for (const r of rects) {
      for (const o of others) {
        xs.add(o.x - r.w - r.x);
        xs.add(o.x + o.w - r.x);
        ys.add(o.y - r.h - r.y);
        ys.add(o.y + o.h - r.y);
      }
      if (bounds) {
        xs.add(-(r.x + r.w / 2));
        xs.add(bounds.W - (r.x + r.w / 2));
        ys.add(-(r.y + r.h / 2));
        ys.add(bounds.H - (r.y + r.h / 2));
      }
    }
  }
  const onGrid = (values) => {
    if (!(step > 0)) return values;
    const out = new Set();
    for (const v of values) {
      out.add(Math.floor(v / step + 1e-9) * step);
      out.add(Math.ceil(v / step - 1e-9) * step);
    }
    return out;
  };
  const near = (values) => [...onGrid(values)].filter((v) => Math.abs(v) <= maxDistance + 1e-9);
  const candidates = [];
  for (const dx of near(xs)) {
    for (const dy of near(ys)) {
      const d = Math.hypot(dx, dy);
      if (d <= maxDistance + 1e-9) candidates.push({ dx, dy, d });
    }
  }
  // A igual distancia, más arriba y después más a la izquierda (como nearestFree).
  candidates.sort((a, b) => a.d - b.d || a.dy - b.dy || a.dx - b.dx);
  const fits = (dx, dy) =>
    layers.every(({ rects, others, bounds }) =>
      rects.every((r) => {
        const m = movedBy(r, dx, dy);
        return centerInside(m, bounds) && !overlapsAny(m, others);
      })
    );
  // Tope de candidatos: los más cercanos alcanzan (el resto queda muy lejos).
  for (const c of candidates.slice(0, 20000)) if (fits(c.dx, c.dy)) return { dx: c.dx, dy: c.dy };
  return null;
}

/**
 * Factores k entre los que se puede escalar un grupo respecto de `anchor`
 * ({x, y}: posiciones y medidas se multiplican por k desde ese punto, como
 * align.scaleGroup) sin que ninguna de `rects` pise a ninguna de `others`.
 * Las del grupo nunca se pisan entre sí al escalar (es una homotecia). Las
 * que ya se pisan a k = 1 no frenan (como maxGrowth). Devuelve {min, max}:
 * 0 e Infinity si nada lo frena; en los extremos se tocan, sin pisarse.
 */
export function groupScaleRange(rects, others, anchor) {
  let min = 0;
  let max = Infinity;
  for (const r of rects) {
    for (const o of others) {
      if (overlaps(r, o)) continue;
      // Se pisan para k en (lo, hi): cada desigualdad es lineal en k.
      let lo = 0;
      let hi = Infinity;
      const less = (c, d) => {
        // c·k < d
        if (c > 0) hi = Math.min(hi, d / c);
        else if (c < 0) lo = Math.max(lo, d / c);
        else if (!(d > 0)) hi = -Infinity;
      };
      const more = (c, d) => {
        // c·k > d
        if (c > 0) lo = Math.max(lo, d / c);
        else if (c < 0) hi = Math.min(hi, d / c);
        else if (!(d < 0)) hi = -Infinity;
      };
      less(r.x - anchor.x, o.x + o.w - EPS - anchor.x);
      more(r.x + r.w - anchor.x, o.x + EPS - anchor.x);
      less(r.y - anchor.y, o.y + o.h - EPS - anchor.y);
      more(r.y + r.h - anchor.y, o.y + EPS - anchor.y);
      if (!(lo < hi)) continue;
      if (hi <= 1) min = Math.max(min, hi);
      else if (lo >= 1) max = Math.min(max, lo);
    }
  }
  return { min, max };
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
