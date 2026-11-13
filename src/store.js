// Estado del documento (hojas y piezas), assets cargados e historial de
// deshacer/rehacer. Todas las medidas internas en mm.
//
// El documento tiene una lista ordenada de hojas (siempre al menos una), todas
// con el mismo papel, orientación y margen; cada pieza pertenece a una hoja
// (`sheet`, el id) y sus x/y son relativas a esa hoja.

import { MAX_UNDO, GRID_STORAGE, GRID_DEFAULTS, GRID_MIN, GRID_MAX, PIECES_STORAGE, UNIT_STORAGE } from './config.js';
import { sizeOf } from './papers.js';
import { isUnit } from './units.js';
import { nextIds } from './projectdoc.js';
import { storageGet, storageSet, clamp } from './util.js';

export const assets = new Map();

export const state = {
  sheets: [{ id: 1 }],
  items: [], // {id, asset, sheet, x, y, scale, r}, en orden de apilado
  // Piezas elegidas (ids), en el orden en que se eligieron: la última es la
  // principal (la de la barra, la hoja actual y el foco).
  selection: [],
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

/**
 * Vista (no entra en el historial): la hoja actual cuando no hay pieza
 * seleccionada y si la selección está «fijada» (se armó con Shift o Ctrl, un
 * recuadro o Ctrl+A: enfocar otra pieza ya no la reemplaza).
 */
export const view = { sheet: 1, pinned: false };

let nextItemId = 1;
let nextAssetId = 1;
let nextSheetId = 2;

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

export const findItem = (id) => state.items.find((item) => item.id === id);

// ---------- Selección ----------

export const isSelected = (id) => state.selection.includes(id);
/** Las piezas elegidas, en orden de apilado. */
export const selectedItems = () => state.items.filter((item) => state.selection.includes(item.id));
/** La pieza principal de la selección (la última elegida), o null. */
export const primaryItem = () => findItem(state.selection.at(-1)) ?? null;
/** La pieza elegida si es una sola; con ninguna o con varias, null. */
export const selectedItem = () => (state.selection.length === 1 ? primaryItem() : null);
export const selectionSize = () => state.selection.length;

/**
 * Reemplaza la selección (sin redibujar). `pinned`: la selección queda fijada
 * (ver `view`); vacía, nunca.
 */
export function setSelection(ids, { pinned = false } = {}) {
  state.selection = [...new Set(ids)].filter((id) => findItem(id));
  view.pinned = pinned && state.selection.length > 0;
}

// ---------- Hojas ----------

export const newSheet = () => ({ id: nextSheetId++ });
export const newSheetId = () => nextSheetId++;
/** Posición de la hoja en la lista (desde 0), o −1. */
export const sheetIndex = (id) => state.sheets.findIndex((sheet) => sheet.id === id);
/** Piezas de una hoja, en orden de apilado. */
export const itemsOn = (id) => state.items.filter((item) => item.sheet === id);

/** La hoja actual: la de la pieza principal de la selección o, si no hay, la de la vista. */
export function currentSheet() {
  const item = primaryItem();
  if (item) return item.sheet;
  return sheetIndex(view.sheet) >= 0 ? view.sheet : state.sheets[0].id;
}

/** Rectángulo de una pieza en su hoja: {id, sheet, x, y, w, h}. */
export function boxOf(item) {
  const [w, h] = dims(item);
  return { id: item.id, sheet: item.sheet, x: item.x, y: item.y, w, h };
}

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
  const { paper, landscape, margin, gap } = state;
  return {
    sheets: state.sheets.map((sheet) => ({ ...sheet })),
    items: state.items.map((item) => ({ ...item })),
    selection: [...state.selection],
    paper,
    landscape,
    margin,
    gap,
  };
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

/**
 * Anula la edición continua en curso con esa clave: vuelve a como estaba antes
 * de empezarla, sin dejarla para rehacer (p. ej. si al confirmar un campo el
 * valor no vale). Devuelve false si no había nada que anular.
 */
export function cancelEdit(key) {
  if (!key || key !== editKey || !undoStack.length) return false;
  editKey = null;
  restore(undoStack.pop());
  return true;
}

function restore(snap) {
  state.sheets = snap.sheets.map((sheet) => ({ ...sheet }));
  state.items = snap.items.map((item) => ({ ...item }));
  state.selection = snap.selection.filter((id) => findItem(id));
  if (state.selection.length < 2) view.pinned = false;
  state.paper = snap.paper;
  state.landscape = snap.landscape;
  state.margin = snap.margin;
  state.gap = snap.gap;
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

// ---------- Documento entero (proyectos) ----------

/** Lo que se guarda del documento (para projectdoc.serialize). */
export function docState() {
  const { sheets, items, paper, landscape, margin, gap } = state;
  return { sheets, items, paper, landscape, margin, gap, rotate: settings.rotate };
}

// Suelta los binarios de un asset que ya nadie usa (URL de la vista previa y,
// si ningún otro lo comparte, el documento de pdf.js).
function release(dropped, alive) {
  for (const asset of dropped) {
    if (!alive.some((other) => other.url === asset.url)) URL.revokeObjectURL(asset.url);
    if (asset.pdf && !alive.some((other) => other.pdf === asset.pdf)) asset.pdf.destroy();
  }
}

/**
 * Reemplaza el documento entero, al abrir o crear un proyecto: libera todos
 * los assets de antes, empieza un historial nuevo y deja los contadores de ids
 * después de los del documento. `doc`: de projectdoc; `loaded`: Map clave →
 * asset (restoreAssets).
 */
export function replaceDocument(doc, loaded = new Map()) {
  const dropped = [...assets.values()];
  assets.clear();
  for (const [key, asset] of loaded) assets.set(key, asset);
  release(dropped, [...assets.values()]);
  state.sheets = doc.sheets.map((sheet) => ({ ...sheet }));
  state.items = doc.items.map((item) => ({ ...item }));
  state.paper = typeof doc.paper === 'string' ? doc.paper : { ...doc.paper };
  state.landscape = doc.landscape;
  state.margin = doc.margin;
  state.gap = doc.gap;
  state.selection = [];
  view.pinned = false;
  settings.rotate = doc.rotate;
  view.sheet = state.sheets[0].id;
  undoStack.length = 0;
  redoStack.length = 0;
  editKey = null;
  status.flash = null;
  const ids = nextIds(doc);
  nextItemId = ids.item;
  nextSheetId = ids.sheet;
  nextAssetId = ids.asset;
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
  release(dropped, [...assets.values()]);
}
