// Operaciones de grupo (varias piezas elegidas, en una o varias hojas): cada
// subgrupo (las elegidas de una hoja) se transforma dentro de su hoja, se
// ajusta a la grilla como bloque (imán), se acota para que el centro de cada
// pieza quede en su hoja y se valida contra las superposiciones. Módulo puro:
// recibe cajas {id, sheet, x, y, w, h} en mm (ya giradas y recortadas) y
// devuelve las nuevas, sin tocar nada.

import { bounds, snapGroup, validate } from './align.js';

/**
 * Las elegidas (`ids`, un Set) agrupadas por hoja, en el orden de `boxes`:
 * Map hoja → {rects: elegidas, others: las demás de esa hoja}. Solo las hojas
 * que tienen alguna elegida.
 */
export function subgroups(boxes, ids) {
  const out = new Map();
  for (const b of boxes) {
    if (!ids.has(b.id)) continue;
    if (!out.has(b.sheet)) out.set(b.sheet, { rects: [], others: [] });
    out.get(b.sheet).rects.push(b);
  }
  for (const b of boxes) if (!ids.has(b.id) && out.has(b.sheet)) out.get(b.sheet).others.push(b);
  return out;
}

const plain = ({ id, x, y, w, h }) => ({ id, x, y, w, h });

// Rango de corrimientos [lo, hi] de un eje para que todos los centros queden
// en [0, total]. lo > hi: no hay forma.
function centerRange(rects, pos, size, total) {
  let lo = -Infinity;
  let hi = Infinity;
  for (const r of rects) {
    const c = r[pos] + r[size] / 2;
    lo = Math.max(lo, -c);
    hi = Math.min(hi, total - c);
  }
  return [lo, hi];
}

// Corrimiento mínimo para entrar en [lo, hi]; con imán, redondeado hacia
// afuera a un múltiplo del paso si así también entra (el bloque sigue en la grilla).
function containShift(lo, hi, step) {
  const shift = Math.min(Math.max(0, lo), hi);
  if (!shift || !step) return shift;
  const k = shift > 0 ? Math.ceil(shift / step - 1e-9) : Math.floor(shift / step + 1e-9);
  const snapped = k * step;
  return snapped >= lo - 1e-9 && snapped <= hi + 1e-9 ? snapped : shift;
}

/**
 * Plan de una operación de grupo.
 *
 * `boxes`: todas las piezas del documento; `ids`: Set de las elegidas.
 * `transform(rects, sheet)`: devuelve los rectángulos nuevos del subgrupo de
 * esa hoja (mismo orden e ids).
 *
 * Opciones:
 * - `W`, `H`: medidas de la hoja.
 * - `snap`: null o {step, axes ('x' | 'y' | 'xy'), round} para snapGroup: el
 *   subgrupo se ajusta a la grilla como bloque, sin cambiar sus distancias.
 * - `contain`: 'clamp' (por omisión: si algún centro sale de la hoja, el
 *   subgrupo entero se corre lo justo para que todos queden adentro) o
 *   'reject' (no se aplica: `reason` 'outside').
 * - `allowOverlap`: con false (por omisión), si alguna pieza pisa a otra de su
 *   hoja (elegida o no) la operación no vale: `reason` 'overlap'.
 * - `rigid`: el grupo solo se mueve; las elegidas que ya se pisaban entre sí
 *   no cuentan (el movimiento no lo cambia).
 * - `round(v)`: redondeo de las posiciones (p. ej. a 0,0001 mm).
 *
 * Devuelve {ok, reason, sheet, rects, changed}: `rects`, Map id → {id, x, y,
 * w, h} (también cuando no vale por superposición, para mostrarlo); `sheet`,
 * la hoja del problema; `changed`, si algo se movió o cambió de medida.
 */
export function planGroup(boxes, ids, transform, options = {}) {
  const { W, H, snap = null, contain = 'clamp', allowOverlap = false, rigid = false, round = (v) => v } = options;
  const rects = new Map();
  let failure = null;
  let changed = false;
  for (const [sheet, { rects: group, others }] of subgroups(boxes, ids)) {
    let next = transform(group.map(plain), sheet).map(plain);
    if (snap?.step > 0) next = snapGroup(next, snap.step, { axes: snap.axes ?? 'xy', round: snap.round ?? 'nearest' });
    const [xlo, xhi] = centerRange(next, 'x', 'w', W);
    const [ylo, yhi] = centerRange(next, 'y', 'h', H);
    if (xlo > xhi + 1e-9 || ylo > yhi + 1e-9) {
      failure ??= { reason: 'outside', sheet };
    } else {
      const step = snap?.step > 0 ? snap.step : 0;
      const dx = containShift(xlo, xhi, (snap?.axes ?? 'xy').includes('x') ? step : 0);
      const dy = containShift(ylo, yhi, (snap?.axes ?? 'xy').includes('y') ? step : 0);
      if (dx || dy) {
        if (contain === 'reject') failure ??= { reason: 'outside', sheet };
        else next = next.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
      }
    }
    next = next.map((r) => ({ ...r, x: round(r.x), y: round(r.y) }));
    if (!failure && !validate(next, others, { allowOverlap, internal: !rigid })) failure = { reason: 'overlap', sheet };
    next.forEach((r, i) => {
      const before = group[i];
      if (r.x !== before.x || r.y !== before.y || Math.abs(r.w - before.w) > 1e-9 || Math.abs(r.h - before.h) > 1e-9) changed = true;
      rects.set(r.id, r);
    });
  }
  return failure ? { ok: false, ...failure, rects, changed } : { ok: true, reason: null, sheet: null, rects, changed };
}

/** Caja de cada subgrupo: Map hoja → {x, y, w, h}. */
export function groupBounds(boxes, ids) {
  const out = new Map();
  for (const [sheet, { rects }] of subgroups(boxes, ids)) out.set(sheet, bounds(rects));
  return out;
}

/**
 * Valor común de una propiedad en varias piezas (con tolerancia), o null si
 * no coinciden («Mixta»). `values`: números.
 */
export function common(values, tolerance = 1e-6) {
  if (!values.length) return null;
  const first = values[0];
  return values.every((v) => Math.abs(v - first) <= tolerance) ? first : null;
}

/**
 * Qué piezas son «iguales»: las que vienen del mismo archivo de origen que
 * alguna de `ids`. `items`: [{id, src}] (src: el archivo original del asset;
 * las páginas de un mismo PDF lo comparten, y no cambia con el recorte, la
 * escala, el giro ni la página). Devuelve los ids, en el orden de `items`.
 */
export function sameSource(items, ids) {
  const sources = new Set(items.filter((item) => ids.has(item.id)).map((item) => item.src));
  return items.filter((item) => sources.has(item.src)).map((item) => item.id);
}

/**
 * Selección por recuadro: los ids de las cajas (en coordenadas comunes, p. ej.
 * px del lienzo) que el recuadro `area` ({x, y, w, h}) toca (tocarse por un
 * borde no cuenta). `boxes`: [{id, x, y, w, h}].
 */
export function touchedBy(area, boxes) {
  const x1 = area.x + area.w;
  const y1 = area.y + area.h;
  return boxes.filter((b) => b.x < x1 && area.x < b.x + b.w && b.y < y1 && area.y < b.y + b.h).map((b) => b.id);
}

/**
 * Rango de una lista entre dos ids (incluidos), para Shift+clic y
 * Shift+flechas: `order`, todos los ids en orden. Si alguno no está, solo `to`.
 */
export function rangeBetween(order, from, to) {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (b < 0) return [];
  if (a < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}
