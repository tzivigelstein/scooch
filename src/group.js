// Operaciones de grupo (varias piezas elegidas, en una o varias hojas): cada
// subgrupo (las elegidas de una hoja) se transforma dentro de su hoja, se
// ajusta a la grilla como bloque (imán), se acota para que el centro de cada
// pieza quede en su hoja y se valida contra las superposiciones. Módulo puro:
// recibe cajas {id, sheet, x, y, w, h} en mm (ya giradas y recortadas) y
// devuelve las nuevas, sin tocar nada.

import { bounds, snapGroup, validate, align, distribute, moveBy, rotateGroup, scaleGroup } from './align.js';
import { nextFreeForGroup, nearestFreeOffset, groupScaleRange } from './collide.js';

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

/**
 * Factores k para escalar `rects` desde `anchor` ({x, y}, como
 * align.scaleGroup) sin que ningún centro salga de la hoja W × H. Devuelve
 * {min, max} (min > max: ningún factor sirve).
 */
export function containScaleRange(rects, anchor, W, H) {
  let min = 0;
  let max = Infinity;
  for (const r of rects) {
    for (const [c, a, total] of [
      [r.x + r.w / 2, anchor.x, W],
      [r.y + r.h / 2, anchor.y, H],
    ]) {
      // El centro queda en a + d·k, que tiene que estar en [0, total].
      const d = c - a;
      if (d > 0) {
        max = Math.min(max, (total - a) / d);
        min = Math.max(min, -a / d);
      } else if (d < 0) {
        max = Math.min(max, a / -d);
        min = Math.max(min, (a - total) / -d);
      } else if (a < 0 || a > total) {
        return { min: 1, max: 0 };
      }
    }
  }
  return { min, max };
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

// ---------- Planes de cada operación (la UI solo los aplica y los anuncia) ----------
//
// Opciones comunes (`opts`): {W, H, allowOverlap, round, snapStep}. `snapStep`:
// paso de la grilla si el imán está encendido (si no, 0 o null). `boxes`:
// todas las piezas {id, sheet, x, y, w, h}; `ids`: Set de las elegidas.

/** Escala de cada pieza, en %. */
export const SCALE_RANGE = Object.freeze({ min: 1, max: 1000 });

const base = ({ W, H, allowOverlap = false, round = (v) => v }) => ({ W, H, allowOverlap, round });

// Dos medidas a menos de esto (mm) son la misma (más que el redondeo de las posiciones).
const SAME_LENGTH = 1e-3;

/** Factores que respetan la escala de cada pieza (`scales`, en %). */
export function scaleLimits(scales) {
  let min = 0;
  let max = Infinity;
  for (const s of scales) {
    min = Math.max(min, SCALE_RANGE.min / s);
    max = Math.min(max, SCALE_RANGE.max / s);
  }
  return { min, max };
}

// Ancla de cada subgrupo: un punto de su caja (fracciones del ancho y el alto).
const ANCHORS = { center: [0.5, 0.5], 'top-left': [0, 0] };
const anchorOf = (box, anchor) => ({ x: box.x + box.w * ANCHORS[anchor][0], y: box.y + box.h * ANCHORS[anchor][1] });

/**
 * Flechas: corre el grupo (dx, dy). Sin superposición, si chocaría salta lo
 * que estorba (como una pieza); después se acota a la hoja. Devuelve {plan,
 * jumped} (plan.ok false o !plan.changed: no se mueve).
 */
export function planNudge(boxes, ids, dx, dy, opts) {
  let ox = dx;
  let oy = dy;
  let jumped = [];
  if (!opts.allowOverlap) ({ dx: ox, dy: oy, jumped } = nextFreeForGroup([...subgroups(boxes, ids).values()], dx, dy));
  return { plan: planGroup(boxes, ids, (rects) => moveBy(rects, ox, oy), { ...base(opts), rigid: true }), jumped };
}

/**
 * Campos X e Y: la caja del grupo en la hoja `sheet` pasa a `mm` en `axis`
 * ('x' | 'y'); las demás partes se corren lo mismo. null si ya está ahí.
 */
export function planMoveTo(boxes, ids, sheet, axis, mm, opts) {
  const box = groupBounds(boxes, ids).get(sheet);
  const delta = mm - box[axis];
  // Las posiciones se guardan redondeadas a 0,0001 mm: lo que difiere menos de
  // 0,001 mm ya está (p. ej. el «change» que llega al salir del campo).
  if (Math.abs(delta) < SAME_LENGTH) return null;
  return planGroup(boxes, ids, (rects) => moveBy(rects, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0), { ...base(opts), rigid: true, contain: 'reject' });
}

/**
 * Factores posibles para escalar todo el grupo desde `anchor` ('center' o
 * 'top-left' de la caja de cada parte): escala de cada pieza (`scales`),
 * centros dentro de la hoja y, sin superposición, sin pisar a las demás.
 */
export function scaleBounds(boxes, ids, scales, anchor, opts) {
  let { min, max } = scaleLimits(scales);
  for (const { rects, others } of subgroups(boxes, ids).values()) {
    const point = anchorOf(bounds(rects), anchor);
    const inside = containScaleRange(rects, point, opts.W, opts.H);
    min = Math.max(min, inside.min);
    max = Math.min(max, inside.max);
    if (!opts.allowOverlap) {
      const free = groupScaleRange(rects, others, point);
      min = Math.max(min, free.min);
      max = Math.min(max, free.max);
    }
  }
  return { min, max };
}

/** Escala el grupo por `k` desde `anchor` en cada parte (el plan valida). */
export function planScale(boxes, ids, k, anchor, opts) {
  return planGroup(boxes, ids, (rects) => scaleGroup(rects, k, anchorOf(bounds(rects), anchor)).rects, base(opts));
}

/**
 * + y −: `delta` en puntos de la escala de la principal (`primaryScale`; +1 de
 * 50 % es 51 %), todas en la misma proporción, desde el centro de la caja. Se
 * acota al tocar a otra o al llegar a un límite. Devuelve {plan, k} o null si
 * no puede cambiar en ese sentido.
 */
export function planScaleBy(boxes, ids, scales, primaryScale, delta, opts) {
  const wanted = Math.max(SCALE_RANGE.min, primaryScale + delta) / primaryScale;
  const { min, max } = scaleBounds(boxes, ids, scales, 'center', opts);
  if (min > max) return null;
  const k = Math.min(Math.max(wanted, min), max);
  if (Math.abs(k - 1) < 1e-9 || (delta > 0 ? k <= 1 : k >= 1)) return null;
  const plan = planScale(boxes, ids, k, 'center', opts);
  return plan.ok ? { plan, k } : null;
}

/**
 * Campos de ancho y alto: la caja del grupo en la hoja `sheet` pasa a medir
 * `mm` en `axis` ('w' | 'h'), en proporción, desde su esquina superior
 * izquierda (las otras partes igual). null si ya mide eso; {ok: false, reason:
 * 'limit'} si alguna escala pasaría de 1–1000 %. Devuelve {plan, k}.
 */
export function planResizeTo(boxes, ids, sheet, axis, mm, scales, opts) {
  const box = groupBounds(boxes, ids).get(sheet);
  const size = axis === 'w' ? box.w : box.h;
  if (!(mm > 0) || Math.abs(mm - size) < SAME_LENGTH) return null;
  const k = mm / size;
  const limits = scaleLimits(scales);
  if (k < limits.min - 1e-9 || k > limits.max + 1e-9) return { plan: { ok: false, reason: 'limit', rects: new Map(), changed: false }, k };
  return { plan: planGroup(boxes, ids, (rects) => scaleGroup(rects, k, 'top-left').rects, { ...base(opts), contain: 'reject' }), k };
}

/**
 * Escala común: todas pasan a `value` % (acotado a 1–1000), cada una desde su
 * centro. `scales`: Map id → escala actual. Devuelve {plan, scale}.
 */
export function planCommonScale(boxes, ids, scales, value, opts) {
  const scale = Math.min(Math.max(value, SCALE_RANGE.min), SCALE_RANGE.max);
  const plan = planGroup(
    boxes,
    ids,
    (rects) =>
      rects.map((r) => {
        const k = scale / scales.get(r.id);
        return { ...r, x: r.x + (r.w - r.w * k) / 2, y: r.y + (r.h - r.h * k) / 2, w: r.w * k, h: r.h * k };
      }),
    base(opts)
  );
  return { plan, scale };
}

/** Gira el grupo 90° alrededor del centro de su caja (`dir` > 0: horario). {plan, dr} */
export function planRotate(boxes, ids, dir, opts) {
  const direction = dir > 0 ? 'cw' : 'ccw';
  return { plan: planGroup(boxes, ids, (rects) => rotateGroup(rects, direction).rects, base(opts)), dr: dir > 0 ? 90 : 270 };
}

const ALIGN_AXIS = { left: 'x', centerX: 'x', right: 'x', top: 'y', centerY: 'y', bottom: 'y' };
// Contra el área útil, con el imán la esquina va hacia adentro del margen.
const INWARD = { left: 'up', centerX: 'nearest', right: 'down', top: 'up', centerY: 'nearest', bottom: 'down' };

/**
 * Alinear: contra la caja de cada parte o, con `area` ({x, y, w, h}: el área
 * útil), contra ella. Con el imán, el bloque cae en la grilla en el eje que
 * cambia (contra el área útil, hacia adentro). Si alguna pieza saldría de la
 * hoja, no vale.
 */
export function planAlign(boxes, ids, mode, { area = null, ...opts }) {
  const axis = ALIGN_AXIS[mode];
  if (!axis) throw new RangeError(`modo de alineación desconocido: ${mode}`);
  const snap = opts.snapStep > 0 ? { step: opts.snapStep, axes: axis, round: area ? INWARD[mode] : 'nearest' } : null;
  return planGroup(boxes, ids, (rects) => align(rects, mode, area ?? bounds(rects)), { ...base(opts), snap, contain: 'reject' });
}

/** Cuántas hacen falta en una misma hoja para distribuir: con separación 2, parejo 3. */
export const distributeNeeds = (mode) => (mode === 'even' ? 3 : 2);

/** ¿Alguna hoja tiene suficientes elegidas para distribuir con `mode`? */
export const canDistribute = (boxes, ids, mode) => [...subgroups(boxes, ids).values()].some(({ rects }) => rects.length >= distributeNeeds(mode));

/**
 * Distribuir en `axis`: con `gap` mm entre consecutivas (la primera queda) o
 * parejo entre la primera y la última (`mode` 'even'). Las hojas con menos
 * piezas de las necesarias no cambian. Con el imán, el bloque cae en la grilla
 * en ese eje. Si alguna pieza saldría de la hoja, no vale.
 */
export function planDistribute(boxes, ids, axis, { mode = 'gap', gap = 0, ...opts }) {
  const need = distributeNeeds(mode);
  const snap = opts.snapStep > 0 ? { step: opts.snapStep, axes: axis } : null;
  return planGroup(
    boxes,
    ids,
    (rects) => (rects.length < need ? rects : distribute(rects, axis, mode === 'even' ? { within: bounds(rects) } : { gap })),
    { ...base(opts), snap, contain: 'reject' }
  );
}

/**
 * Arrastre: dónde quedaría el grupo corrido (dx, dy) mm. Con `target` (el
 * grupo está en una sola hoja y va a otra), las elegidas pasan a esa hoja con
 * la y corrida `offsetY` mm. Con el imán, el bloque cae en la grilla.
 * Devuelve {plan, boxes} (las cajas con la hoja nueva, para soltar).
 */
export function planDrag(boxes, ids, dx, dy, { target = null, offsetY = 0, ...opts }) {
  const all = target === null ? boxes : boxes.map((b) => (ids.has(b.id) ? { ...b, sheet: target, y: b.y + offsetY } : b));
  const snap = opts.snapStep > 0 ? { step: opts.snapStep, axes: 'xy' } : null;
  return { plan: planGroup(all, ids, (rects) => moveBy(rects, dx, dy), { ...base(opts), snap, rigid: true }), boxes: all };
}

/**
 * Soltar el arrastre (`drag`: el último planDrag). Si ahí pisaría a otras, el
 * bloque va al lugar libre más cercano (con el imán, corrido en pasos de la
 * grilla); si no hay uno cerca, vuelve. Devuelve {result, rects}: result
 * 'moved', 'moved-aside' o 'reverted'.
 */
export function planDrop({ plan, boxes }, ids, opts) {
  if (plan.ok) return { result: 'moved', rects: plan.rects };
  if (plan.reason !== 'overlap') return { result: 'reverted', rects: null };
  const moved = boxes.map((b) => (plan.rects.has(b.id) ? { ...b, ...plan.rects.get(b.id) } : b));
  const layers = [...subgroups(moved, ids).values()].map(({ rects, others }) => ({ rects, others, bounds: { W: opts.W, H: opts.H } }));
  const box = bounds(layers.flatMap((layer) => layer.rects));
  const offset = nearestFreeOffset(layers, { maxDistance: Math.max(box.w, box.h, 15), step: opts.snapStep || 0 });
  if (!offset) return { result: 'reverted', rects: null };
  const round = opts.round ?? ((v) => v);
  const rects = new Map([...plan.rects].map(([id, r]) => [id, { ...r, x: round(r.x + offset.dx), y: round(r.y + offset.dy) }]));
  return { result: 'moved-aside', rects };
}

// ---------- Selección ----------

/** Lista con `primary` al final (la principal), sin repetir. */
export const withPrimaryLast = (list, primary) => (list.includes(primary) ? [...list.filter((id) => id !== primary), primary] : [...list]);

/** Agrega `id` a la selección o lo quita. Devuelve {selection, on}. */
export function toggled(selection, id) {
  const on = !selection.includes(id);
  return { selection: on ? [...selection, id] : selection.filter((other) => other !== id), on };
}

/** Recuadro: las que tocó (sumadas a las de antes con `additive`), las tocadas al final. */
export const touchedSelection = (selection, touched, additive) => [...(additive ? selection.filter((id) => !touched.includes(id)) : []), ...touched];

/**
 * Ctrl+A: las de la hoja actual (`onSheet`, ids); si ya estaban exactamente
 * esas, todas (`all`). La principal sigue siéndolo si queda. {selection, everything}
 */
export function selectAllTarget(selection, onSheet, all) {
  const everything = onSheet.length > 0 && selection.length === onSheet.length && onSheet.every((id) => selection.includes(id));
  return { selection: withPrimaryLast(everything ? all : onSheet, selection.at(-1)), everything };
}

/**
 * Al quitar `removed` (Set), quién queda elegida: la siguiente de la hoja de
 * la principal (`sameSheet`, ids en orden), o la anterior, o ninguna.
 */
export function neighborAfterRemoval(sameSheet, primary, removed) {
  const index = sameSheet.indexOf(primary);
  const after = sameSheet.slice(index + 1).find((id) => !removed.has(id));
  const before = sameSheet.slice(0, Math.max(0, index)).reverse().find((id) => !removed.has(id));
  return after ?? before ?? null;
}

/** Cuántas copias de cada elegida entran sin pasar `max` piezas en total. */
export const copiesAllowed = (total, selected, max) => Math.max(0, Math.floor((max - total) / Math.max(1, selected)));
