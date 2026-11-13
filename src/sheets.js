// Varias hojas: repartir, ubicar lo nuevo, a qué hoja pertenece una pieza
// soltada y problemas por hoja. Módulo puro (sin DOM ni textos).
//
// Modelo: el documento tiene una lista ordenada de hojas (ids) y cada pieza
// pertenece a una (`sheet`), con x/y relativas a SU hoja, en mm. Todas las
// hojas tienen el mismo papel, orientación y margen. Aquí las piezas llegan
// como cajas {id, sheet, x, y, w, h} (w/h ya con la orientación aplicada).

import { packSheets, packInto } from './pack.js';
import { overlaps, EPS } from './collide.js';

const sameNumber = (a, b) => Math.abs(a - b) < 1e-9;

/**
 * Acomoda TODAS las piezas en las hojas que hagan falta (`packSheets`).
 * `boxes`: piezas; `sheetIds`: hojas actuales en orden; `area`: {w, h} útil
 * (hoja menos margen) y `margin`; `newId()`: id para cada hoja nueva.
 *
 * Las hojas que salen se reusan en orden (la primera repartida es la primera
 * hoja de antes, etc.) y se crean las que falten; las que sobran se quitan.
 * Las piezas que no entran ni solas en una hoja vacía (`unplaced`) quedan con
 * su x/y, en hojas propias al final (las que compartían hoja, juntas).
 *
 * Devuelve {sheets, placements, unplaced, packed}: `sheets`, los ids finales
 * en orden; `placements`, Map id → {sheet, x, y, rotated} con x/y en la hoja
 * (margen incluido); `unplaced`, ids que no entraron; `packed`, cuántas hojas
 * se usaron para las que sí.
 */
export function arrangeSheets(boxes, sheetIds, { area, margin = 0, gap = 0, rotate = true, newId }) {
  const result = packSheets(
    boxes.map((b) => ({ id: b.id, w: b.w, h: b.h })),
    area.w,
    area.h,
    { gap, rotate }
  );
  const ids = [];
  const take = (i) => ids[i] ?? (ids[i] = sheetIds[i] ?? newId());
  const placements = new Map();
  result.sheets.forEach((sheet, i) => {
    const id = take(i);
    for (const p of sheet) placements.set(p.id, { sheet: id, x: margin + p.x, y: margin + p.y, rotated: p.rotated });
  });
  const packed = result.sheets.length;

  // Las que no entran: con su posición, en hojas propias al final.
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const groups = new Map(); // hoja de antes → hoja nueva
  const sheets = ids.slice(0, packed);
  for (const id of result.unplaced) {
    const box = byId.get(id);
    if (!groups.has(box.sheet)) {
      const reuse = sheetIds.includes(box.sheet) && !sheets.includes(box.sheet) ? box.sheet : newId();
      groups.set(box.sheet, reuse);
      sheets.push(reuse);
    }
    placements.set(id, { sheet: groups.get(box.sheet), x: box.x, y: box.y, rotated: false });
  }
  if (!sheets.length) sheets.push(sheetIds[0] ?? newId());
  return { sheets, placements, unplaced: result.unplaced, packed };
}

/**
 * ¿Aplicar `plan` (de arrangeSheets) dejaría todo como está? Compara la
 * lista de hojas y, por pieza, hoja y posición (a `tolerance` mm), sin giros.
 * `round(v)`: el mismo redondeo con que se aplicaría la posición.
 */
export function samePlan(plan, boxes, sheetIds, round = (v) => v) {
  if (plan.sheets.length !== sheetIds.length || plan.sheets.some((id, i) => id !== sheetIds[i])) return false;
  return boxes.every((b) => {
    const p = plan.placements.get(b.id);
    return p && !p.rotated && p.sheet === b.sheet && sameNumber(round(p.x), b.x) && sameNumber(round(p.y), b.y);
  });
}

// Las posiciones se guardan redondeadas a 0,01 mm, así que un hueco exacto
// (lo que dejó una pieza igual) puede quedar unas milésimas más angosto. Los
// obstáculos se achican esto (la mitad de cada lado) para que la pieza vuelva
// a entrar donde estaba; es menos que cualquier tolerancia visible.
const ROUND_SLACK = 0.012;

const asObstacle = (b, margin) => ({
  x: b.x - margin + ROUND_SLACK / 2,
  y: b.y - margin + ROUND_SLACK / 2,
  w: Math.max(0, b.w - ROUND_SLACK),
  h: Math.max(0, b.h - ROUND_SLACK),
});

/** Obstáculos de cada hoja (lo ocupado), en coordenadas del área útil. */
export function obstaclesBySheet(boxes, sheetIds, margin = 0) {
  return sheetIds.map((id) => boxes.filter((b) => b.sheet === id).map((b) => asObstacle(b, margin)));
}

/**
 * Ubica piezas NUEVAS (`rects`: {id, w, h}) sin mover las que ya están
 * (`boxes`), con `packInto`: rellena los huecos empezando por la hoja `from`
 * (índice en `sheetIds`) y sigue con las siguientes; lo que no entra va a
 * hojas nuevas al final (`newId()` para cada una). Las hojas anteriores a
 * `from` no se tocan.
 *
 * Devuelve {placements, sheets, unplaced}: `placements`, [{id, sheet, x, y,
 * rotated}] con x/y en la hoja; `sheets`, los ids de las hojas nuevas, en
 * orden; `unplaced`, los ids que no entran ni solos en una hoja vacía.
 */
export function placeIntoSheets(rects, boxes, sheetIds, { from = 0, area, margin = 0, gap = 0, rotate = true, newId }) {
  const start = Math.min(Math.max(0, from), Math.max(0, sheetIds.length - 1));
  const targets = sheetIds.slice(start);
  const result = packInto(rects, area.w, area.h, {
    gap,
    rotate,
    sheets: obstaclesBySheet(boxes, targets, margin),
    from: 0,
  });
  const fresh = new Map(); // índice de hoja nueva → id
  const placements = result.placements.map((p) => {
    let sheet = targets[p.sheet];
    if (sheet === undefined) {
      if (!fresh.has(p.sheet)) fresh.set(p.sheet, newId());
      sheet = fresh.get(p.sheet);
    }
    return { id: p.id, sheet, x: margin + p.x, y: margin + p.y, rotated: p.rotated };
  });
  const sheets = [...fresh.entries()].sort((a, b) => a[0] - b[0]).map(([, id]) => id);
  return { placements, sheets, unplaced: result.unplaced };
}

/**
 * Lugar libre para UNA pieza (`rect`: {id, w, h}) en una hoja con esos
 * obstáculos (`boxes` de esa hoja), sin girarla. Devuelve {x, y} en la hoja,
 * o null si no entra ahí.
 */
export function spotOnSheet(rect, boxes, { area, margin = 0, gap = 0 }) {
  const result = packInto([rect], area.w, area.h, {
    gap,
    rotate: false,
    sheets: [boxes.map((b) => asObstacle(b, margin))],
  });
  const p = result.placements[0];
  return p && p.sheet === 0 ? { x: margin + p.x, y: margin + p.y } : null;
}

/**
 * A qué hoja pertenece algo cuyo centro está a `y` (en el mismo sistema que
 * `tops`): la que lo contiene o, si cae entre hojas o fuera, la más cercana.
 * `tops`: borde superior de cada hoja, en orden; `height`: alto de las hojas.
 * Devuelve el índice (−1 si no hay hojas).
 */
export function sheetAt(y, tops, height) {
  let best = -1;
  let bestDistance = Infinity;
  tops.forEach((top, i) => {
    const distance = y < top ? top - y : y > top + height ? y - top - height : 0;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Problemas de cada pieza en su hoja (W×H, margen `margin`): se sale de la
 * hoja (`cut`), pasa el margen (`pastMargin`) o se superpone con otra de la
 * MISMA hoja (`overlap`). Devuelve Map id → {cut, pastMargin, overlap}.
 */
export function pieceProblems(boxes, { W, H, margin = 0 }) {
  const outside = (b, inset) =>
    b.x < inset - EPS || b.y < inset - EPS || b.x + b.w > W - inset + EPS || b.y + b.h > H - inset + EPS;
  const bySheet = new Map();
  for (const b of boxes) {
    if (!bySheet.has(b.sheet)) bySheet.set(b.sheet, []);
    bySheet.get(b.sheet).push(b);
  }
  const result = new Map();
  for (const b of boxes) {
    const cut = outside(b, 0);
    result.set(b.id, {
      cut,
      pastMargin: !cut && outside(b, margin),
      overlap: bySheet.get(b.sheet).some((o) => o !== b && overlaps(b, o)),
    });
  }
  return result;
}

/**
 * Resumen de `pieceProblems` por tipo: cuántas piezas y en qué hojas (índices
 * en `sheetIds`, de menor a mayor). {cut: {count, sheets}, pastMargin, overlap}.
 */
export function problemSummary(problems, boxes, sheetIds) {
  const summary = {};
  for (const kind of ['cut', 'pastMargin', 'overlap']) {
    const hit = boxes.filter((b) => problems.get(b.id)?.[kind]);
    const sheets = [...new Set(hit.map((b) => sheetIds.indexOf(b.sheet)))].filter((i) => i >= 0).sort((a, b) => a - b);
    summary[kind] = { count: hit.length, sheets };
  }
  return summary;
}
