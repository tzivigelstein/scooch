// Estado de la hoja, assets cargados e historial de deshacer/rehacer.
// Todas las medidas internas en mm.

import { MAX_UNDO, GRID_STORAGE, GRID_DEFAULTS, GRID_MIN, GRID_MAX, PIECES_STORAGE, UNIT_STORAGE } from './config.js';
import { sizeOf } from './papers.js';
import { isUnit } from './units.js';
import { storageGet, storageSet, clamp } from './util.js';

export const assets = new Map();

export const state = {
  items: [],
  selected: null,
  paper: 'A4', // id de un preset de papers.js o {custom: true, w, h}
  landscape: false,
  margin: 10,
  gap: 5,
  busy: false,
};

/** Preferencias que no forman parte del historial. */
export const settings = {
  rotate: true,
  singleKeys: true,
  grid: loadGrid(),
  allowOverlap: loadAllowOverlap(),
  unit: loadUnit(), // 'mm' | 'cm' | 'in': solo para mostrar y cargar medidas
};

function loadUnit() {
  const saved = storageGet(UNIT_STORAGE);
  return isUnit(saved) ? saved : 'mm';
}

/** Unidad de las medidas («Preferencias»): se guarda; no toca el documento. */
export function setUnit(unit) {
  if (!isUnit(unit)) return;
  settings.unit = unit;
  storageSet(UNIT_STORAGE, unit);
}

function loadAllowOverlap() {
  try {
    return JSON.parse(storageGet(PIECES_STORAGE) ?? 'null')?.allowOverlap === true;
  } catch {
    return false;
  }
}

/** «Permitir superposición»: preferencia guardada, fuera del historial. */
export function setAllowOverlap(on) {
  settings.allowOverlap = on;
  storageSet(PIECES_STORAGE, JSON.stringify({ allowOverlap: on }));
}

function loadGrid() {
  try {
    const saved = JSON.parse(storageGet(GRID_STORAGE) ?? 'null') ?? {};
    const size = Number(saved.size);
    return {
      show: typeof saved.show === 'boolean' ? saved.show : GRID_DEFAULTS.show,
      size: Number.isFinite(size) ? clamp(size, GRID_MIN, GRID_MAX) : GRID_DEFAULTS.size,
      snap: typeof saved.snap === 'boolean' ? saved.snap : GRID_DEFAULTS.snap,
    };
  } catch {
    return { ...GRID_DEFAULTS };
  }
}

/** Cambia preferencias de la grilla y las guarda. */
export function setGrid(changes) {
  Object.assign(settings.grid, changes);
  storageSet(GRID_STORAGE, JSON.stringify(settings.grid));
}

/** Aviso de la última acción ({text, warn, action}) y texto mientras se carga algo. */
export const status = { flash: null, busyText: '' };

let nextItemId = 1;
let nextAssetId = 1;

// ---------- Render ----------

let renderer = () => {};
export const setRenderer = (fn) => (renderer = fn);
/** Redibuja toda la interfaz a partir del estado. */
export const render = () => renderer();

// ---------- Geometría ----------

export function sheetSize() {
  const size = sizeOf(state.paper, state.landscape) ?? sizeOf('A4', state.landscape);
  return [size.w, size.h];
}

/** Hoja, margen y área útil (hoja menos margen). */
export function area() {
  const [W, H] = sheetSize();
  const m = state.margin;
  return { W, H, m, aw: W - 2 * m, ah: H - 2 * m };
}

/** Ancho y alto en la hoja, ya rotado. */
export function dims(item) {
  const asset = assets.get(item.asset);
  const k = item.scale / 100;
  return item.r % 180 ? [asset.h * k, asset.w * k] : [asset.w * k, asset.h * k];
}

export const selectedItem = () => state.items.find((item) => item.id === state.selected) ?? null;
export const findItem = (id) => state.items.find((item) => item.id === id);

export function addAsset(asset) {
  const key = `a${nextAssetId++}`;
  assets.set(key, asset);
  return key;
}

export const newItem = (asset, props = {}) => ({ id: nextItemId++, asset, x: 0, y: 0, scale: 100, r: 0, ...props });
export const newId = () => nextItemId++;

export function rects(items, k = 1) {
  return items.map((item) => {
    const [w, h] = dims(item);
    return { id: item.id, w: w * k, h: h * k };
  });
}

// ---------- Deshacer / rehacer ----------

const undoStack = [];
const redoStack = [];
let editKey = null; // agrupa en un solo paso las ediciones continuas (tipear, slider, flechas)

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

function snapshot() {
  const { selected, paper, landscape, margin, gap } = state;
  return { items: state.items.map((item) => ({ ...item })), selected, paper, landscape, margin, gap };
}

/** Guarda el estado actual antes de modificarlo. Con `key`, ediciones seguidas comparten un paso. */
export function commit(key = null) {
  if (key && key === editKey) return;
  editKey = key;
  undoStack.push(snapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  status.flash = null;
  collectGarbage();
}

export const endEdit = () => (editKey = null);

function restore(snap) {
  state.items = snap.items.map((item) => ({ ...item }));
  state.selected = snap.selected;
  state.paper = snap.paper;
  state.landscape = snap.landscape;
  state.margin = snap.margin;
  state.gap = snap.gap;
  if (!selectedItem()) state.selected = null;
  status.flash = null;
}

/** Devuelve true si deshizo algo. No redibuja. */
export function undo() {
  if (state.busy || !undoStack.length) return false;
  endEdit();
  redoStack.push(snapshot());
  restore(undoStack.pop());
  return true;
}

/** Devuelve true si rehízo algo. No redibuja. */
export function redo() {
  if (state.busy || !redoStack.length) return false;
  endEdit();
  undoStack.push(snapshot());
  restore(redoStack.pop());
  return true;
}

// Libera los assets que ya no usa ni la hoja ni el historial.
function collectGarbage() {
  if (state.busy) return; // puede haber assets recién creados todavía sin item
  const used = new Set();
  for (const snap of [state, ...undoStack, ...redoStack]) {
    for (const item of snap.items) used.add(item.asset);
  }
  const dropped = [];
  for (const [key, asset] of assets) {
    if (!used.has(key)) {
      assets.delete(key);
      dropped.push(asset);
    }
  }
  const alive = [...assets.values()];
  for (const asset of dropped) {
    if (!alive.some((other) => other.url === asset.url)) URL.revokeObjectURL(asset.url);
    if (asset.pdf && !alive.some((other) => other.pdf === asset.pdf)) asset.pdf.destroy();
  }
}
