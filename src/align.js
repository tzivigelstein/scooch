// Selección múltiple: alinear, distribuir y transformar un grupo de piezas.
// Trabaja con rectángulos {id, x, y, w, h} en mm, ya con la orientación de
// cada pieza aplicada (origen arriba a la izquierda, y hacia abajo). Módulo
// puro: devuelve rectángulos nuevos con la misma forma y en el mismo orden que
// la entrada (así encadenan y van directo a `validate`); nunca la modifica.

import { overlaps } from './collide.js';

const copy = ({ id, x, y, w, h }) => ({ id, x, y, w, h });

/** Caja {x, y, w, h} que contiene a todos, o null si no hay ninguno. */
export function bounds(rects) {
  if (!rects.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Modo → [coordenada, medida, fracción]: la pieza queda en
// referencia.coordenada + (referencia.medida − pieza.medida) × fracción.
const MODES = {
  left: ['x', 'w', 0],
  centerX: ['x', 'w', 0.5],
  right: ['x', 'w', 1],
  top: ['y', 'h', 0],
  centerY: ['y', 'h', 0.5],
  bottom: ['y', 'h', 1],
};

/** Modos de `align`. */
export const ALIGN_MODES = Object.keys(MODES);

/**
 * Alinea cada pieza contra la caja `reference` ({x, y, w, h}): la de la
 * selección (por omisión, `bounds(rects)`) o el área útil de la hoja (en
 * coordenadas de la hoja: {x: margen, y: margen, w: ancho útil, h: alto útil}).
 * `mode`: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'. Solo
 * cambia la coordenada de ese eje. Alinear dos veces da lo mismo.
 */
export function align(rects, mode, reference = bounds(rects)) {
  if (!Object.hasOwn(MODES, mode)) throw new RangeError(`modo de alineación desconocido: ${mode}`);
  const [pos, size, t] = MODES[mode];
  return rects.map((r) => {
    const out = copy(r);
    out[pos] = t === 0 ? reference[pos] : reference[pos] + (reference[size] - r[size]) * t;
    return out;
  });
}

const AXES = { x: ['x', 'w'], y: ['y', 'h'] };

const compareIds = (a, b) => {
  if (typeof a !== typeof b) return typeof a < typeof b ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

/**
 * Distribuye las piezas a lo largo de `axis` ('x' | 'y'), ordenadas por su
 * posición en ese eje (a igual posición, la más corta primero y después por
 * id). La otra coordenada no cambia. Dos modos:
 *
 * - `{gap}`: la primera queda donde está y cada una de las siguientes arranca
 *   exactamente `gap` mm después de donde termina la anterior. Con menos de 2
 *   piezas no hay nada que hacer y quedan como están.
 * - `{within: caja}`: la primera arranca al principio de la caja, la última
 *   termina al final, y el espacio que sobra se reparte en partes iguales entre
 *   cada par de consecutivas. Con 2 piezas, quedan contra los extremos; con 1
 *   (o ninguna), como están. Si las piezas suman más que la caja, el espacio
 *   entre ellas es negativo (se pisarían en ese eje): `validate` lo detecta.
 */
export function distribute(rects, axis, options = {}) {
  if (!Object.hasOwn(AXES, axis)) throw new RangeError(`eje desconocido: ${axis}`);
  const [pos, size] = AXES[axis];
  const out = rects.map(copy);
  const order = out
    .map((r, i) => i)
    .sort(
      (a, b) =>
        out[a][pos] - out[b][pos] || out[a][size] - out[b][size] || compareIds(out[a].id, out[b].id) || a - b
    )
    .map((i) => out[i]);
  if (out.length < 2) return out;

  if (options.within) {
    const box = options.within;
    const total = order.reduce((s, r) => s + r[size], 0);
    const space = (box[size] - total) / (order.length - 1);
    let cursor = box[pos];
    for (const r of order) {
      r[pos] = cursor;
      cursor += r[size] + space;
    }
    // La última, exacta contra el final (sin el error acumulado de las sumas).
    const last = order[order.length - 1];
    last[pos] = box[pos] + box[size] - last[size];
    return out;
  }
  if (typeof options.gap === 'number' && Number.isFinite(options.gap)) {
    let cursor = order[0][pos] + order[0][size];
    for (const r of order.slice(1)) {
      r[pos] = cursor + options.gap;
      cursor = r[pos] + r[size];
    }
    return out;
  }
  throw new TypeError('distribute: se esperaba {gap} o {within}');
}

/** Mueve todas las piezas (dx, dy) mm. */
export const moveBy = (rects, dx, dy) => rects.map((r) => ({ ...copy(r), x: r.x + dx, y: r.y + dy }));

// Anclas con nombre: fracción del ancho y del alto de la caja del grupo.
const ANCHORS = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
};

/** Punto {x, y} de un ancla: un punto dado o un nombre de ANCHORS sobre la caja del grupo. */
function anchorPoint(rects, anchor) {
  if (anchor && typeof anchor === 'object') return anchor;
  if (!Object.hasOwn(ANCHORS, anchor)) throw new RangeError(`ancla desconocida: ${anchor}`);
  const b = bounds(rects) ?? { x: 0, y: 0, w: 0, h: 0 };
  const [fx, fy] = ANCHORS[anchor];
  return { x: b.x + b.w * fx, y: b.y + b.h * fy };
}

/**
 * Escala el grupo por `k` (> 0) respecto de `anchor`: un punto {x, y} en mm o
 * un nombre ('center', 'top-left', 'top', 'top-right', 'left', 'right',
 * 'bottom-left', 'bottom', 'bottom-right') sobre la caja del grupo. Escala
 * posiciones y tamaños, así las distancias entre piezas crecen igual.
 * Devuelve {rects, factor}: `factor` (= k) multiplica el `scale` de cada pieza.
 */
export function scaleGroup(rects, k, anchor = 'center') {
  if (typeof k !== 'number' || !Number.isFinite(k) || k <= 0) throw new RangeError(`factor inválido: ${k}`);
  const a = anchorPoint(rects, anchor);
  return {
    rects: rects.map((r) => ({ id: r.id, x: a.x + (r.x - a.x) * k, y: a.y + (r.y - a.y) * k, w: r.w * k, h: r.h * k })),
    factor: k,
  };
}

/**
 * Gira el grupo 90° alrededor del centro de su caja: `direction` 'cw'
 * (horario, como `r`) o 'ccw'. Cada pieza gira con él: su centro da la vuelta
 * alrededor del centro del grupo y su ancho y alto se intercambian. Devuelve
 * {rects, dr}: `dr` (90 o 270) se suma al `r` de cada pieza, módulo 360.
 * La caja del grupo conserva el centro y queda con ancho y alto intercambiados.
 */
export function rotateGroup(rects, direction = 'cw') {
  if (direction !== 'cw' && direction !== 'ccw') throw new RangeError(`sentido desconocido: ${direction}`);
  const b = bounds(rects);
  if (!b) return { rects: [], dr: direction === 'cw' ? 90 : 270 };
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const cw = direction === 'cw';
  return {
    rects: rects.map((r) => {
      const dx = r.x + r.w / 2 - cx;
      const dy = r.y + r.h / 2 - cy;
      // Con la y hacia abajo, horario es (dx, dy) → (−dy, dx).
      const nx = cw ? -dy : dy;
      const ny = cw ? dx : -dx;
      return { id: r.id, x: cx + nx - r.h / 2, y: cy + ny - r.w / 2, w: r.h, h: r.w };
    }),
    dr: cw ? 90 : 270,
  };
}

// Redondeo a la grilla: al más cercano, hacia arriba o hacia abajo (con una
// tolerancia, así un valor que ya está en la grilla no salta un paso).
const ROUNDING = {
  nearest: Math.round,
  up: (v) => Math.ceil(v - 1e-9),
  down: (v) => Math.floor(v + 1e-9),
};

/**
 * Imán para el grupo como bloque: lo mueve entero (mismo delta para todas)
 * para que la esquina superior izquierda de su caja caiga en la grilla más
 * cercana de paso `step` mm, con origen en `origin` (por omisión la esquina de
 * la hoja, como el imán de una pieza). No cambia las distancias internas. Con
 * un paso no positivo o no finito, no mueve nada. No redondea el resultado.
 *
 * `axes`: 'xy' (por omisión), 'x' o 'y': en qué ejes se ajusta (el otro no
 * se toca). `round`: 'nearest' (por omisión), 'up' o 'down', o {x, y} con uno
 * por eje: hacia dónde va la esquina (p. ej. hacia adentro del margen).
 */
export function snapGroup(rects, step, { origin = { x: 0, y: 0 }, axes = 'xy', round = 'nearest' } = {}) {
  const b = bounds(rects);
  if (!b || typeof step !== 'number' || !Number.isFinite(step) || step <= 0) return rects.map(copy);
  const mode = (axis) => ROUNDING[typeof round === 'object' ? (round[axis] ?? 'nearest') : round] ?? ROUNDING.nearest;
  const snap = (v, o, axis) => (axes.includes(axis) ? o + mode(axis)((v - o) / step) * step : v);
  return moveBy(rects, snap(b.x, origin.x, 'x') - b.x, snap(b.y, origin.y, 'y') - b.y);
}

/**
 * ¿El resultado de una operación de grupo es aceptable? true si las piezas
 * de `result` no se pisan entre sí ni con `others` (las no seleccionadas;
 * se ignoran las de `others` cuyo id está en `result`, así se puede pasar la
 * hoja entera). Tocarse no es pisarse (tolerancia de collide.js). Con
 * `allowOverlap`, siempre true. La UI lo usa para rechazar la operación entera.
 * Con `internal: false` no compara las de `result` entre sí (para un grupo que
 * se mueve rígido: lo que ya se pisaba adentro no lo cambia el movimiento).
 */
export function validate(result, others = [], { allowOverlap = false, internal = true } = {}) {
  if (allowOverlap) return true;
  for (let i = 0; internal && i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) if (overlaps(result[i], result[j])) return false;
  }
  const moved = new Set(result.map((r) => r.id));
  for (const o of others) {
    if (o.id !== undefined && moved.has(o.id)) continue;
    for (const r of result) if (overlaps(r, o)) return false;
  }
  return true;
}
