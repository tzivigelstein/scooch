// Acomodar (en las hojas que hagan falta), reducir para usar una sola hoja,
// ubicar lo nuevo y rellenar una hoja con copias. Todo opera sobre el estado
// de store.js; la geometría está en pack.js y sheets.js.

import { pack, fitScale } from './pack.js';
import { arrangeSheets, samePlan, placeIntoSheets } from './sheets.js';
import { CROWD_LIMIT, MAX_ITEMS } from './config.js';
import {
  state,
  settings,
  assets,
  area,
  dims,
  rects,
  findItem,
  newItem,
  newId,
  commit,
  selectedItem,
  boxOf,
  newSheetId,
  sheetIndex,
  itemsOn,
  currentSheet,
} from './store.js';
import { paperName } from './measure.js';
import { say } from './notice.js';
import { animateNext } from './sheetview.js';
import { clamp, tidy } from './util.js';
import { t, formatList } from './copy/index.js';

const packOptions = () => ({ gap: state.gap, rotate: settings.rotate });

// ---------- Edición geométrica ----------

export function keepCenter(item, change) {
  const [w, h] = dims(item);
  const cx = item.x + w / 2;
  const cy = item.y + h / 2;
  change();
  const [nw, nh] = dims(item);
  item.x = cx - nw / 2;
  item.y = cy - nh / 2;
}

export function centerOnSheet(item) {
  const { W, H } = area();
  const [w, h] = dims(item);
  item.x = (W - w) / 2;
  item.y = (H - h) / 2;
}

export function fitToSheet(item) {
  const { W, H, aw, ah } = area();
  const [w, h] = dims(item);
  const factor = aw > 0 && ah > 0 ? Math.min(aw / w, ah / h) : Math.min(W / w, H / h);
  item.scale = clamp(item.scale * factor, 1, 1000);
  centerOnSheet(item);
}

// ---------- Acomodar ----------

// Firma del documento justo después del último acomodo: si nada cambió desde
// entonces, acomodar de nuevo deja todo igual y no agrega un paso de deshacer.
let lastArranged = null;

function layoutSignature() {
  return JSON.stringify([
    state.paper,
    state.landscape,
    state.margin,
    state.gap,
    settings.rotate,
    state.sheets.map((sheet) => sheet.id),
    state.items.map((item) => [item.id, item.asset, item.sheet, item.scale, item.r, item.x, item.y]),
  ]);
}

const nameOf = (id) => assets.get(findItem(id)?.asset)?.name ?? t('pieces.other');

/** Aplica un plan de arrangeSheets: hojas nuevas, posiciones y giros. */
function applyPlan(plan) {
  state.sheets = plan.sheets.map((id) => ({ id }));
  for (const item of state.items) {
    const p = plan.placements.get(item.id);
    if (!p) continue;
    item.sheet = p.sheet;
    item.x = tidy(p.x);
    item.y = tidy(p.y);
    if (p.rotated) item.r = (item.r + 90) % 360;
  }
  lastArranged = layoutSignature();
}

function arrangedText(n, sheets) {
  return sheets > 1 ? t('notices.arrangedSheets', { n, sheets }) : t('notices.arranged', { n });
}

/**
 * Acomoda TODAS las piezas sin superponerlas, en las hojas que hagan falta
 * (crea o quita hojas: no quedan hojas vacías al final). Devuelve el resultado
 * ('arranged', 'same' o 'error') o null si no había nada que hacer.
 */
export function arrange() {
  const n = state.items.length;
  if (!n || state.busy) return null;
  const { aw, ah, m } = area();
  if (aw <= 0 || ah <= 0) {
    say(t('errors.marginTooBig'), { warn: true });
    return 'error';
  }
  if (lastArranged === layoutSignature()) {
    say(arrangedText(n, state.sheets.length));
    return 'same';
  }
  const before = state.sheets.length;
  const sheetIds = state.sheets.map((sheet) => sheet.id);
  const boxes = state.items.map(boxOf);
  const plan = arrangeSheets(boxes, sheetIds, { area: { w: aw, h: ah }, margin: m, ...packOptions(), newId: newSheetId });
  if (samePlan(plan, boxes, sheetIds, tidy)) {
    lastArranged = layoutSignature();
    say(arrangedText(n, state.sheets.length));
    return 'same';
  }
  commit();
  animateNext();
  applyPlan(plan);
  const placed = n - plan.unplaced.length;

  // Las que no entran ni solas: quedan donde estaban y se ofrece ajustarlas.
  if (plan.unplaced.length) {
    const names = formatList(plan.unplaced.map(nameOf));
    const unplaced = t('notices.unplaced', { n: plan.unplaced.length, names });
    const text = placed ? t('notices.twoSentences', { first: arrangedText(placed, plan.packed), second: unplaced }) : unplaced;
    const ids = [...plan.unplaced];
    say(text, { warn: true, action: { label: t('props.fit'), run: () => fitPieces(ids) } });
    return 'arranged';
  }
  // Antes había una hoja y ahora hacen falta más: se ofrece reducir para usar una.
  if (before === 1 && plan.packed > 1) {
    const k = fitScale(rects(state.items), aw, ah, packOptions());
    if (k > 0) {
      const factor = Math.floor(k * 0.999 * 1000) / 1000;
      say(arrangedText(n, plan.packed), {
        action: { label: t('notices.shrinkToOne', { pct: factor * 100 }), run: () => shrinkAndArrange(factor, k) },
      });
      return 'arranged';
    }
  }
  say(arrangedText(n, plan.packed));
  return 'arranged';
}

/** «Ajustar a la hoja» para las piezas que no entraban ni solas, en un solo paso. */
function fitPieces(ids) {
  const items = ids.map(findItem).filter(Boolean);
  if (!items.length || state.busy) return;
  commit();
  animateNext();
  for (const item of items) fitToSheet(item);
  say(t('notices.fitted', { n: items.length }));
}

/**
 * Reduce todas las piezas por el mismo factor y las acomoda en UNA hoja (la
 * primera; las demás se quitan). Un solo paso de deshacer.
 */
export function shrinkAndArrange(factor, exact) {
  const { aw, ah, m } = area();
  const n = state.items.length;
  // El empaquetado es heurístico y no estrictamente monótono: si el factor
  // redondeado justo no entra, se usa el exacto de fitScale (que sí entró)
  // y, por las dudas, factores un poquito más chicos.
  const candidates = [factor, exact];
  for (let f = factor * 0.99; candidates.length < 20; f *= 0.99) candidates.push(f);
  for (const f of candidates) {
    const placements = pack(rects(state.items, f), aw, ah, packOptions());
    if (!placements) continue;
    commit();
    animateNext();
    const sheet = state.sheets[0].id;
    for (const item of state.items) item.scale *= f;
    applyPlan({
      sheets: [sheet],
      placements: new Map(placements.map((p) => [p.id, { sheet, x: m + p.x, y: m + p.y, rotated: p.rotated }])),
    });
    say(t('notices.shrunk', { n, pct: f * 100 }));
    return true;
  }
  say(t('errors.shrinkFailed'), { warn: true });
  return false;
}

// ---------- Lo nuevo (archivos agregados, copias) ----------

/**
 * Dónde van piezas nuevas sin mover las que ya están: rellena huecos desde la
 * hoja `from` (índice) y sigue en las siguientes o en hojas nuevas al final.
 * `rotate`: si se pueden girar para que entren mejor. Agrega las hojas nuevas
 * al documento y devuelve los ids que no entran ni solos en una hoja vacía.
 */
function placeInto(fresh, from, { rotate = settings.rotate } = {}) {
  const { m, aw, ah } = area();
  if (aw <= 0 || ah <= 0) return fresh.map((item) => item.id);
  const plan = placeIntoSheets(rects(fresh), state.items.map(boxOf), state.sheets.map((sheet) => sheet.id), {
    from,
    area: { w: aw, h: ah },
    margin: m,
    gap: state.gap,
    rotate,
    newId: newSheetId,
  });
  for (const p of plan.placements) {
    const item = fresh.find((f) => f.id === p.id);
    item.sheet = p.sheet;
    item.x = tidy(p.x);
    item.y = tidy(p.y);
    if (p.rotated) item.r = (item.r + 90) % 360;
  }
  state.sheets.push(...plan.sheets.map((id) => ({ id })));
  return plan.unplaced;
}

/**
 * Ubica lo recién cargado empezando por la hoja actual, sin mover lo que ya
 * estaba. Solo lo que no entra ni solo en una hoja queda superpuesto, en
 * cascada desde el centro de la hoja actual.
 */
export function placeNew(keys) {
  const { W, H, aw, ah } = area();
  const sheet = currentSheet();
  const crowded = keys.length > 1 || state.items.length > 0;
  const fresh = keys.map((key) => {
    const item = newItem(key, { sheet });
    const [w, h] = dims(item);
    const fit = aw > 0 && ah > 0 ? Math.min(aw / w, ah / h) : 1;
    item.scale = Math.min(1, crowded ? fit * CROWD_LIMIT : fit) * 100;
    return item;
  });
  const unplaced = new Set(placeInto(fresh, sheetIndex(sheet)));
  const cascade = fresh.filter((item) => unplaced.has(item.id));
  cascade.forEach((item, i) => {
    const [w, h] = dims(item);
    const offset = (i - (cascade.length - 1) / 2) * 5;
    item.x = tidy((W - w) / 2 + offset);
    item.y = tidy((H - h) / 2 + offset);
  });
  state.items.push(...fresh);
  state.selected = fresh[fresh.length - 1].id;
}

/**
 * Copia de una pieza, igual (sin girar), en el primer hueco libre desde su
 * hoja; si no entra ni sola, 5 mm abajo a la derecha (queda superpuesta y
 * avisada). Devuelve la copia, ya agregada.
 */
export function duplicatePiece(item) {
  const copy = { ...item, id: newId() };
  const unplaced = placeInto([copy], sheetIndex(item.sheet), { rotate: false });
  if (unplaced.length) {
    copy.sheet = item.sheet;
    copy.x = item.x + 5;
    copy.y = item.y + 5;
  }
  state.items.push(copy);
  return copy;
}

// ---------- Resolución de impresión ----------

/**
 * Con cuántos ppp se imprime una pieza: píxeles de lo que se embebe en el PDF
 * sobre el ancho impreso sin rotar, en pulgadas. Las páginas de PDF sin
 * rotación propia van como vector; las rotadas, como su vista previa.
 * Devuelve {vector: true} o {ppp, level: 'good' | 'ok' | 'low'}.
 */
export function printResolution(item) {
  const asset = assets.get(item.asset);
  if (asset.kind === 'pdf' && asset.pageRotation % 360 === 0) return { vector: true };
  const inches = (asset.w * item.scale) / 100 / 25.4;
  const ppp = Math.round(asset.px[0] / inches);
  return { ppp, level: ppp >= 200 ? 'good' : ppp >= 120 ? 'ok' : 'low' };
}

// ---------- Rellenar con copias (la hoja de la pieza) ----------

export function fillPlan(item) {
  const { aw, ah } = area();
  const g = state.gap;
  const [w, h] = dims(item);
  const grid = (cw, ch) => {
    const cols = Math.max(0, Math.floor((aw + g + 1e-6) / (cw + g)));
    const rows = Math.max(0, Math.floor((ah + g + 1e-6) / (ch + g)));
    return { cols, rows, count: cols * rows, w: cw, h: ch, rotated: false };
  };
  const plan = grid(w, h);
  if (settings.rotate && Math.abs(w - h) > 1e-6) {
    const turned = { ...grid(h, w), rotated: true };
    if (turned.count > plan.count) return turned;
  }
  return plan;
}

/** Resumen para «Rellenar con copias»: texto, aviso (qué reemplaza) y si se puede. */
export function fillSummary(item) {
  const { count } = fillPlan(item);
  const many = state.sheets.length > 1;
  const sheet = sheetIndex(item.sheet) + 1;
  const warning = many ? t('props.fillWarningSheet', { i: sheet }) : t('props.fillWarning');
  const others = state.items.length - itemsOn(item.sheet).length;
  if (!count) return { text: t('props.fillNoFit'), warning, ok: false };
  if (count + others > MAX_ITEMS) return { text: t('props.fillTooMany', { n: count, max: MAX_ITEMS }), warning, ok: false };
  const text = many ? t('props.fillSummarySheet', { n: count, i: sheet }) : t('props.fillSummary', { n: count, paper: paperName() });
  return { text, warning, ok: true };
}

/** Reemplaza las piezas de la hoja de la seleccionada por copias de ella (las demás hojas no cambian). */
export function fillWithCopies() {
  const item = selectedItem();
  if (!item || state.busy) return false;
  const plan = fillPlan(item);
  if (!fillSummary(item).ok) return false;
  const { W, H } = area();
  const g = state.gap;
  const x0 = (W - (plan.cols * plan.w + (plan.cols - 1) * g)) / 2;
  const y0 = (H - (plan.rows * plan.h + (plan.rows - 1) * g)) / 2;
  const r = plan.rotated ? (item.r + 90) % 360 : item.r;
  const sheet = item.sheet;

  commit();
  const copies = [];
  for (let row = 0; row < plan.rows; row++) {
    for (let col = 0; col < plan.cols; col++) {
      const x = tidy(x0 + col * (plan.w + g));
      const y = tidy(y0 + row * (plan.h + g));
      copies.push(newItem(item.asset, { sheet, scale: item.scale, r, x, y }));
    }
  }
  // Las copias ocupan el lugar de la primera pieza de esa hoja en el orden general.
  const at = state.items.findIndex((other) => other.sheet === sheet);
  const rest = state.items.filter((other) => other.sheet !== sheet);
  rest.splice(Math.min(at, rest.length), 0, ...copies);
  state.items = rest;
  state.selected = copies[0].id;
  const many = state.sheets.length > 1;
  say(many ? t('notices.filledSheet', { n: plan.count, i: sheetIndex(sheet) + 1 }) : t('notices.filled', { n: plan.count }));
  return true;
}
