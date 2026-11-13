// Acomodar, reducir, ubicar lo nuevo y rellenar con copias.
// Todo opera sobre el estado de store.js.

import { pack, fitScale } from './pack.js';
import { CROWD_LIMIT, MAX_ITEMS } from './config.js';
import { state, settings, assets, area, dims, rects, findItem, newItem, commit, paperName, selectedItem } from './store.js';
import { say } from './notice.js';
import { animateNext } from './sheetview.js';
import { clamp, tidy } from './util.js';
import { t } from './copy/index.js';

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

// Firma de la hoja justo después del último acomodo: si nada cambió desde
// entonces, acomodar de nuevo deja todo igual y no agrega un paso de deshacer.
let lastArranged = null;

function layoutSignature() {
  return JSON.stringify([
    state.paper,
    state.landscape,
    state.margin,
    state.gap,
    settings.rotate,
    state.items.map((item) => [item.id, item.asset, item.scale, item.r, item.x, item.y]),
  ]);
}

/** ¿Las ubicaciones cambiarían algo respecto de lo que ya hay? */
function changes(placements) {
  const { m } = area();
  return placements.some((p) => {
    const item = findItem(p.id);
    return p.rotated || item.x !== tidy(m + p.x) || item.y !== tidy(m + p.y);
  });
}

function applyPlacements(placements) {
  const { m } = area();
  for (const p of placements) {
    const item = findItem(p.id);
    item.x = tidy(m + p.x);
    item.y = tidy(m + p.y);
    if (p.rotated) item.r = (item.r + 90) % 360;
  }
  lastArranged = layoutSignature();
}

const arrangedText = (n) => t('notices.arranged', { n });

/**
 * Acomoda todo sin superponer. Devuelve el resultado ('arranged', 'same',
 * 'nofit' o 'error') o null si no había nada que hacer.
 */
export function arrange() {
  const n = state.items.length;
  if (!n || state.busy) return null;
  const { aw, ah } = area();
  if (aw <= 0 || ah <= 0) {
    say(t('errors.marginTooBig'), { warn: true });
    return 'error';
  }
  if (lastArranged === layoutSignature()) {
    say(arrangedText(n));
    return 'same';
  }

  const placements = pack(rects(state.items), aw, ah, packOptions());
  if (placements) {
    if (!changes(placements)) {
      lastArranged = layoutSignature();
      say(arrangedText(n));
      return 'same';
    }
    commit();
    animateNext();
    applyPlacements(placements);
    say(arrangedText(n));
    return 'arranged';
  }

  // No entran: se ofrece reducir, nunca se achica sin avisar.
  const k = fitScale(rects(state.items), aw, ah, packOptions());
  if (!k) {
    say(t('errors.neverFits'), { warn: true });
    return 'error';
  }
  const factor = Math.floor(k * 0.999 * 1000) / 1000;
  say(t('notices.noFit'), {
    warn: true,
    action: { label: t('notices.shrinkAction', { pct: factor * 100 }), run: () => shrinkAndArrange(factor, k) },
  });
  return 'nofit';
}

export function shrinkAndArrange(factor, exact) {
  const { aw, ah } = area();
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
    for (const item of state.items) item.scale *= f;
    applyPlacements(placements);
    say(t('notices.shrunk', { n, pct: f * 100 }));
    return true;
  }
  say(t('errors.shrinkFailed'), { warn: true });
  return false;
}

// ---------- Lo recién cargado ----------

/** Ubica lo recién cargado sin mover lo que ya estaba en la hoja. */
export function placeNew(keys) {
  const { W, H, m, aw, ah } = area();
  const crowded = keys.length > 1 || state.items.length > 0;
  const fresh = keys.map((key) => {
    const item = newItem(key);
    const [w, h] = dims(item);
    const fit = aw > 0 && ah > 0 ? Math.min(aw / w, ah / h) : 1;
    item.scale = Math.min(1, crowded ? fit * CROWD_LIMIT : fit) * 100;
    return item;
  });

  const obstacles = state.items.map((item) => {
    const [w, h] = dims(item);
    return { x: item.x - m, y: item.y - m, w, h };
  });
  const placements = aw > 0 && ah > 0 ? pack(rects(fresh), aw, ah, { ...packOptions(), obstacles }) : null;

  if (placements) {
    for (const p of placements) {
      const item = fresh.find((f) => f.id === p.id);
      item.x = tidy(m + p.x);
      item.y = tidy(m + p.y);
      if (p.rotated) item.r = 90;
    }
  } else {
    // En cascada desde el centro; el aviso de superposición ofrece acomodar.
    fresh.forEach((item, i) => {
      const [w, h] = dims(item);
      const offset = (i - (fresh.length - 1) / 2) * 5;
      item.x = tidy((W - w) / 2 + offset);
      item.y = tidy((H - h) / 2 + offset);
    });
  }
  state.items.push(...fresh);
  state.selected = fresh[fresh.length - 1].id;
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

// ---------- Rellenar con copias ----------

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

/** Resumen para «Rellenar con copias»: texto y si se puede rellenar. */
export function fillSummary(item) {
  const { count } = fillPlan(item);
  if (!count) return { text: t('props.fillNoFit'), ok: false };
  if (count > MAX_ITEMS) return { text: t('props.fillTooMany', { n: count, max: MAX_ITEMS }), ok: false };
  return { text: t('props.fillSummary', { n: count, paper: paperName() }), ok: true };
}

export function fillWithCopies() {
  const item = selectedItem();
  if (!item || state.busy) return false;
  const plan = fillPlan(item);
  if (!plan.count || plan.count > MAX_ITEMS) return false;
  const { W, H } = area();
  const g = state.gap;
  const x0 = (W - (plan.cols * plan.w + (plan.cols - 1) * g)) / 2;
  const y0 = (H - (plan.rows * plan.h + (plan.rows - 1) * g)) / 2;
  const r = plan.rotated ? (item.r + 90) % 360 : item.r;

  commit();
  state.items = [];
  for (let row = 0; row < plan.rows; row++) {
    for (let col = 0; col < plan.cols; col++) {
      const x = tidy(x0 + col * (plan.w + g));
      const y = tidy(y0 + row * (plan.h + g));
      state.items.push(newItem(item.asset, { scale: item.scale, r, x, y }));
    }
  }
  state.selected = state.items[0].id;
  say(t('notices.filled', { n: plan.count, paper: paperName() }));
  return true;
}
