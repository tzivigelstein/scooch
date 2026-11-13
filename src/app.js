// Pliego: acomodar imágenes y páginas de PDF en hojas a tamaño real y
// exportar un PDF listo para imprimir. Este módulo arma la interfaz y conecta
// las acciones; el estado vive en store.js y las hojas en sheetview.js.

import { MAX_ITEMS } from './config.js';
import { t, applyCopy, keyLabel } from './copy/index.js';
import {
  state,
  settings,
  status,
  assets,
  view,
  dims,
  selectedItem,
  addAsset,
  commit,
  endEdit,
  undo,
  redo,
  canUndo,
  canRedo,
  setRenderer,
  render,
  setGrid,
  area,
  newSheet,
  sheetIndex,
  itemsOn,
  currentSheet,
  boxOf,
} from './store.js';
import { sizeText as measureSize, lengthText, paperName, stepTexts, unitName } from './measure.js';
import { readFile, pdfPage, openPdf } from './assets.js';
import { makePdf, pdfFileName, downloadBytes, printBytes } from './output.js';
import { arrange, keepCenter, centerOnSheet, fitToSheet, placeNew, fillWithCopies, duplicatePiece, forgetSpill } from './layout.js';
import { spotOnSheet, keepCenterInside } from './sheets.js';
import { initNotice, renderNotice, say } from './notice.js';
import { initLive, announce } from './live.js';
import { hydrateIcons } from './icons.js';
import { initTooltips, refreshTooltip } from './tooltip.js';
import {
  initSheetView,
  renderSheetView,
  animateNext,
  pieceNode,
  sheetNode,
  isDragging,
  rectOf,
  revealPiece,
  revealSheet,
} from './sheetview.js';
import { overlapsAny, nextFreeInDirection, maxGrowth } from './collide.js';
import { initPanels, renderPanels, expandSection, firstPieceField, firstSheetField, setFrontEnabled } from './panels.js';
import { initPieceList, renderPieceList, focusList, listFocusTarget } from './piecelist.js';
import { initDrawers, closeDrawer, isDrawerOpen, isCollapsible, drawerOf, revealPanel } from './drawers.js';
import { initShortcuts, openShortcuts, syncShortcuts } from './shortcuts.js';
import { initPrefs, openPrefs } from './prefs.js';
import { initConfirm, confirmAction } from './confirm.js';
import { initDonate, shouldAskDonation, askDonation, isDonationOpen } from './donate.js';
import { initProjects, documentChanged, retry as retrySave, saveAsNew } from './projects.js';
import { initProjectsUi, renderProjectBar, openProjects, listChanged, removeWithUi, takeOverWithUi } from './projectsui.js';
import { initKeyboard } from './keyboard.js';
import { $, clamp, round1, tidy, fine } from './util.js';

const ui = {};

// ---------- Render ----------

let lastFocus = null;
let shownSelection = null;

function renderAll() {
  renderSheetView();
  renderTopbar();
  renderProjectBar();
  renderPanels();
  renderPieceList();
  renderNotice();
  rescueFocus();
  documentChanged(); // guardado automático del proyecto
  // La pieza recién seleccionada (con teclado, desde la lista, al agregar…) se lleva a la vista.
  if (state.selected !== shownSelection) {
    shownSelection = state.selected;
    if (state.selected !== null && !isDragging()) revealPiece(state.selected);
  }
}

function renderTopbar() {
  const empty = !state.items.length;
  const busy = state.busy;
  // Ocupado: se deshabilita todo menos el control enfocado (perdería el foco;
  // sus acciones ya se ignoran mientras dura).
  const off = (el, disabled) => (el.disabled = disabled && !(busy && document.activeElement === el && !empty));
  off(ui.arrange, busy || empty);
  off(ui.export, busy || empty);
  off(ui.print, busy || empty);
  off(ui.undo, busy || !canUndo());
  off(ui.redo, busy || !canRedo());
  off(ui.clear, busy || empty);
  const item = selectedItem();
  if (!item) return;
  ui.piecebar.setAttribute('aria-label', t('piecebar.labelFor', { name: assets.get(item.asset).name }));
  // «Traer al frente» solo sirve si pisa a otra: si no, queda deshabilitado (enfocable y explicado).
  setFrontEnabled(overlapsOthers(item));
}

// Las otras piezas de su misma hoja (las de otras hojas no chocan).
const othersOf = (item) => itemsOn(item.sheet).filter((other) => other !== item).map(rectOf);
const overlapsOthers = (item) => overlapsAny(rectOf(item), othersOf(item));
const nameOf = (rect) => assets.get(state.items.find((item) => item.id === rect.id)?.asset)?.name ?? t('pieces.other');
const sheetNumber = (id) => sheetIndex(id) + 1;

// ---------- Foco ----------

/** Enfoca la pieza seleccionada; si no hay, la zona para soltar o la hoja actual. */
function focusSheet() {
  const node = pieceNode(state.selected);
  if (node) return node.focus({ preventScroll: true });
  if (!state.items.length && !ui.empty.disabled) return ui.empty.focus({ preventScroll: true });
  sheetNode(currentSheet())?.focus({ preventScroll: true });
}

// Si el elemento enfocado desapareció o quedó deshabilitado, el foco no se pierde.
function rescueFocus() {
  const active = document.activeElement;
  const candidate = active && active !== document.body ? active : lastFocus;
  if (!candidate) return;
  const gone = !candidate.isConnected || candidate.disabled || !!candidate.closest('[hidden]');
  if (!gone || (active && active !== document.body && active !== candidate)) return;
  lastFocus = null;
  if (candidate === ui.undo && !ui.redo.disabled) return ui.redo.focus();
  if (candidate === ui.redo && !ui.undo.disabled) return ui.undo.focus();
  if (candidate.closest('#piece-list') && focusList()) return;
  focusSheet();
}

// ---------- Selección y edición ----------

function select(id) {
  if (state.selected === id) return;
  state.selected = id;
  const item = selectedItem();
  if (item) view.sheet = item.sheet;
  render();
}

const sizeText = (item) => {
  const [w, h] = dims(item);
  return measureSize(w, h);
};

/**
 * Aplica `change` a la pieza seleccionada como un paso de deshacer.
 * `focus`: deja el foco en la pieza; `announce`: texto (o función) a anunciar.
 */
function editSelected(change, { focus = false, announce: message = null } = {}) {
  const item = selectedItem();
  if (!item || state.busy) return false;
  commit();
  change(item);
  render();
  if (focus) focusSheet();
  if (message) announce(typeof message === 'function' ? message(selectedItem() ?? item) : message);
  return true;
}

const pieceActions = {
  rotate: (opts = {}, dir = 1) =>
    editSelected((item) => keepCenter(item, () => (item.r = (item.r + (dir > 0 ? 90 : 270)) % 360)), {
      ...opts,
      announce: (item) => t('announce.rotated', { deg: item.r, size: sizeText(item) }),
    }),
  /** La copia va al primer hueco libre desde la hoja de la original (o a una hoja nueva). */
  duplicate: (opts = {}) => {
    if (state.items.length >= MAX_ITEMS) return say(t('errors.maxPieces', { max: MAX_ITEMS }), { warn: true });
    let moved = false;
    editSelected(
      (item) => {
        const copy = duplicatePiece(item);
        moved = copy.sheet !== item.sheet;
        state.selected = copy.id;
        view.sheet = copy.sheet;
      },
      {
        ...opts,
        announce: (copy) =>
          moved
            ? t('announce.duplicatedTo', { n: state.items.length, i: sheetNumber(copy.sheet) })
            : t('announce.duplicated', { n: state.items.length }),
      }
    );
  },
  fit: (opts = {}) =>
    editSelected(fitToSheet, { ...opts, announce: (item) => t('announce.fitted', { size: sizeText(item) }) }),
  center: (opts = {}) => editSelected(centerOnSheet, { ...opts, announce: t('announce.centered') }),
  front: (opts = {}) => {
    const item = selectedItem();
    if (!item) return;
    if (!overlapsOthers(item)) return announce(t('announce.frontNotNeeded'));
    editSelected(
      (selected) => {
        state.items = [...state.items.filter((other) => other !== selected), selected];
      },
      { ...opts, announce: t('announce.front') }
    );
  },
  /**
   * Con teclado, la selección y el foco pasan a la vecina de la misma hoja (en
   * la hoja, o en la lista si se quitó desde ahí); con el mouse, se deselecciona.
   */
  remove: ({ focus = true, inList = false } = {}) => {
    const item = selectedItem();
    if (!item || state.busy) return;
    const sameSheet = itemsOn(item.sheet);
    const index = sameSheet.indexOf(item);
    const name = assets.get(item.asset).name;
    commit();
    state.items = state.items.filter((other) => other !== item);
    const rest = sameSheet.filter((other) => other !== item);
    const neighbor = focus ? (rest[index] ?? rest[index - 1] ?? null) : null;
    state.selected = neighbor?.id ?? null;
    view.sheet = item.sheet;
    render();
    if (inList && focusList()) {
      // el foco sigue en la lista
    } else if (focus) focusSheet();
    else sheetNode(item.sheet)?.focus({ preventScroll: true });
    announce(t(state.items.length ? 'announce.removed' : 'announce.removedLast', { name }));
  },
};

function nudge(dx, dy) {
  const item = selectedItem();
  if (!item || state.busy) return;
  let jumped = [];
  // Si el paso la deja pisando a otra, salta justo al otro lado.
  let next = settings.allowOverlap ? { x: item.x + dx, y: item.y + dy } : nextFreeInDirection(rectOf(item), othersOf(item), dx, dy);
  // Puede salirse de la hoja, pero no más de la mitad (el centro queda adentro).
  const { W, H } = area();
  const [w, h] = dims(item);
  const inside = keepCenterInside({ x: next.x, y: next.y, w, h }, W, H);
  if ((inside.x !== next.x || inside.y !== next.y) && !settings.allowOverlap && overlapsAny({ ...inside, w, h }, othersOf(item))) {
    next = { x: item.x, y: item.y }; // en el borde, del otro lado hay otra pieza: no se mueve
  } else {
    jumped = next.jumped ?? [];
    next = inside;
  }
  if (next.x === item.x && next.y === item.y) {
    focusSheet();
    return announce(t('announce.position', { x: lengthText(item.x), y: lengthText(item.y) }), { key: 'move', delay: 600 });
  }
  commit(`nudge:${item.id}`);
  // Redondeo fino (0,0001 mm): los pasos en pulgadas (1/16 in = 1,5875 mm) no se desvían.
  item.x = fine(next.x);
  item.y = fine(next.y);
  render();
  focusSheet();
  if (jumped.length) announce(t('announce.jumped', { names: jumped.map(nameOf).join(', ') }));
  announce(t('announce.position', { x: lengthText(item.x), y: lengthText(item.y) }), { key: 'move', delay: 600 });
}

function scaleBy(delta) {
  const item = selectedItem();
  if (!item || state.busy) return;
  let scale = clamp(round1(item.scale + delta), 1, 1000);
  if (delta > 0 && !settings.allowOverlap) {
    // Al agrandar, frena al tocar a otra (hacia abajo a 0,1 % para no pasarse).
    const growth = maxGrowth(rectOf(item), othersOf(item), 'center');
    if (Number.isFinite(growth)) scale = Math.min(scale, Math.max(item.scale, Math.floor(item.scale * growth * 10) / 10));
    if (scale <= item.scale) {
      focusSheet();
      return announce(t('announce.noRoom'), { key: 'scale' });
    }
  }
  commit(`scale-key:${item.id}`);
  keepCenter(item, () => (item.scale = scale));
  render();
  focusSheet();
  announce(t('announce.scaled', { scale: item.scale, size: sizeText(item) }), { key: 'scale', delay: 600 });
}

function doUndo() {
  const onSheet = !!document.activeElement?.closest?.('#sheets');
  if (!undo()) return;
  animateNext();
  render();
  if (onSheet) focusSheet();
  announce(t('announce.undone'));
}

function doRedo() {
  const onSheet = !!document.activeElement?.closest?.('#sheets');
  if (!redo()) return;
  animateNext();
  render();
  if (onSheet) focusSheet();
  announce(t('announce.redone'));
}

function doArrange() {
  const result = arrange();
  // Acomodar dos veces seguidas no cambia nada: igual se confirma.
  if (result === 'same') announce(status.flash?.text ?? '');
}

function setOrientation(landscape) {
  if (state.landscape === landscape || state.busy) return render();
  commit();
  state.landscape = landscape;
  animateNext();
  render();
  announce(t('announce.sheet', { paper: paperName() }));
}

function setGridVisible(show) {
  setGrid({ show });
  render();
  announce(show ? t('announce.gridShown', { size: lengthText(settings.grid.size) }) : t('announce.gridHidden'));
}

function sheetChanged() {
  animateNext();
  render();
  announce(t('announce.sheet', { paper: paperName() }));
}

/** «Quitar todas»: quita las piezas de todas las hojas y deja una hoja vacía. */
function clearSheet() {
  if (!state.items.length || state.busy) return;
  commit();
  state.items = [];
  state.sheets = [state.sheets[0]];
  state.selected = null;
  view.sheet = state.sheets[0].id;
  render();
  announce(t('announce.cleared'));
}

// ---------- Hojas ----------

/** Agrega una hoja vacía al final (un paso de deshacer). */
function addSheet() {
  if (state.busy) return;
  commit();
  forgetSpill();
  const sheet = newSheet();
  state.sheets.push(sheet);
  state.selected = null;
  view.sheet = sheet.id;
  render();
  revealSheet(sheet.id);
  announce(t('announce.sheetAdded', { i: state.sheets.length }));
}

/** Quita una hoja (si tiene piezas, pregunta antes); siempre queda al menos una. */
async function removeSheet(id, { viaKeyboard = false } = {}) {
  if (state.busy || state.sheets.length < 2) return;
  const index = sheetIndex(id);
  if (index < 0) return;
  const n = itemsOn(id).length;
  if (n) {
    const ok = await confirmAction({
      title: t('confirm.removeSheetTitle', { i: index + 1 }),
      body: t('confirm.removeSheetBody', { n }),
      confirm: t('confirm.removeSheet'),
      returnTo: document.activeElement,
    });
    if (!ok || sheetIndex(id) !== index) return;
  }
  commit();
  forgetSpill();
  state.items = state.items.filter((item) => item.sheet !== id);
  state.sheets = state.sheets.filter((sheet) => sheet.id !== id);
  if (!selectedItem()) state.selected = null;
  const next = state.sheets[Math.min(index, state.sheets.length - 1)];
  view.sheet = next.id;
  render();
  if (viaKeyboard || n) {
    // El foco sigue en la hoja que ocupa su lugar.
    revealSheet(next.id);
    sheetNode(next.id)?.focus({ preventScroll: true });
  }
  announce(n ? t('announce.sheetRemoved', { i: index + 1, n }) : t('announce.sheetRemovedEmpty', { i: index + 1 }));
}

/** Re Pág / Av Pág: el foco pasa a la hoja anterior o siguiente (a su primera pieza). */
function gotoSheet(dir) {
  const index = sheetIndex(currentSheet());
  const target = index + dir;
  if (target < 0 || target >= state.sheets.length) {
    return announce(t(dir > 0 ? 'announce.lastSheet' : 'announce.firstSheet'));
  }
  const sheet = state.sheets[target];
  // La primera pieza en orden de lectura (de arriba abajo, de izquierda a derecha).
  const first = itemsOn(sheet.id).sort((a, b) => a.y - b.y || a.x - b.x)[0];
  view.sheet = sheet.id;
  if (first) {
    select(first.id);
    pieceNode(first.id)?.focus({ preventScroll: true });
    revealPiece(first.id);
  } else {
    state.selected = null;
    render();
    revealSheet(sheet.id);
    sheetNode(sheet.id)?.focus({ preventScroll: true });
  }
}

/**
 * Shift + Re Pág / Av Pág: muda la pieza a la hoja anterior o siguiente, a un
 * hueco libre. Si ahí no entra, o si no hay hoja siguiente, va a una hoja
 * nueva justo al lado. Si no entra ni sola en una hoja, conserva su posición.
 */
function sendToSheet(dir) {
  const item = selectedItem();
  if (!item || state.busy) return;
  const index = sheetIndex(item.sheet);
  const target = index + dir;
  if (target < 0) return announce(t('announce.firstSheet'));
  const { m, aw, ah } = area();
  const rect = { id: item.id, ...rectOf(item) };
  const opts = { area: { w: aw, h: ah }, margin: m, gap: state.gap };
  commit();
  let sheet = state.sheets[target];
  let spot = sheet && aw > 0 && ah > 0 ? spotOnSheet(rect, itemsOn(sheet.id).map(boxOf), opts) : null;
  if (!spot) {
    // Una hoja nueva al lado: después de la actual (siguiente) o antes (anterior).
    sheet = newSheet();
    state.sheets.splice(dir > 0 ? index + 1 : index, 0, sheet);
    spot = aw > 0 && ah > 0 ? spotOnSheet(rect, [], opts) : null;
  }
  item.sheet = sheet.id;
  if (spot) {
    item.x = tidy(spot.x);
    item.y = tidy(spot.y);
  }
  view.sheet = sheet.id;
  animateNext();
  render();
  focusSheet();
  revealPiece(item.id);
  announce(t('announce.movedToSheet', { i: sheetNumber(sheet.id), total: state.sheets.length }));
}

// Cambiar la página crea (o reusa) otro asset: así deshacer vuelve a la anterior.
async function changePage(n) {
  const item = selectedItem();
  const asset = item && assets.get(item.asset);
  if (!asset || asset.kind !== 'pdf' || asset.page === n || state.busy) return;
  setBusy(true, t('busy.loadingPage', { page: n }));
  try {
    // En un proyecto restaurado, pdf.js se abre recién ahora (y queda para las otras páginas).
    if (!asset.pdf) {
      const pdf = await openPdf(asset.bytes);
      for (const other of assets.values()) if (other.kind === 'pdf' && other.src === asset.src) other.pdf = pdf;
    }
    let key = [...assets].find(([, a]) => a.kind === 'pdf' && a.src === asset.src && a.page === n)?.[0];
    key ??= addAsset(await pdfPage(asset, n));
    commit();
    item.asset = key;
    setBusy(false);
  } catch (err) {
    console.error(err);
    setBusy(false);
    say(t('errors.page', { page: n }), { warn: true });
  }
}

function fill() {
  fillWithCopies();
}

// ---------- Paneles desde el teclado ----------

/** M: al primer campo de la sección Pieza (X). */
function focusPieceFields() {
  if (!selectedItem()) return announce(t('announce.needSelection'));
  revealPanel('props');
  const field = firstPieceField();
  field?.focus({ preventScroll: false });
  field?.select?.();
}

/** H: al primer control de la sección Hoja. */
function focusSheetSettings() {
  revealPanel('props');
  expandSection('sheet');
  firstSheetField().focus();
}

/** P: a la lista de piezas (o a la zona para agregar si está vacía). */
function focusPieces() {
  revealPanel('pieces');
  if (!focusList()) ui.addzone.focus();
}

// ---------- Carga de archivos ----------

function setBusy(on, text = '') {
  state.busy = on;
  status.busyText = text;
  render();
}

function openFiles() {
  if (state.busy) return;
  ui.file.click();
}

async function loadFiles(files) {
  if (!files.length || state.busy) return;
  const errors = [];
  const keys = [];
  let skipped = 0; // los que no entran por el máximo de piezas
  setBusy(true, t('busy.loading'));
  for (const [i, file] of files.entries()) {
    if (state.items.length + keys.length >= MAX_ITEMS) {
      skipped = files.length - i;
      break;
    }
    status.busyText = files.length > 1 ? t('busy.loadingCount', { i: i + 1, n: files.length }) : t('busy.loadingFile', { name: file.name });
    renderNotice();
    try {
      keys.push(addAsset(await readFile(file)));
    } catch (err) {
      console.warn(file.name, err);
      errors.push(t('errors.loadItem', { name: file.name || t('errors.unnamedFile'), reason: err.message }));
    }
  }
  const sheetsBefore = state.sheets.length;
  if (keys.length) {
    commit(); // todavía "busy": la limpieza no toca los assets recién creados
    placeNew(keys);
  }
  state.busy = false;
  const failed = errors.length + skipped;
  if (skipped) errors.push(t('errors.maxReached', { max: MAX_ITEMS, n: skipped }));
  if (errors.length) say(t('errors.load', { n: failed, list: errors.join(t('errors.loadSeparator')) }), { warn: true });
  else render();
  if (keys.length) {
    const added = state.sheets.length - sheetsBefore;
    const sheets = t('announce.newSheets', { n: added });
    announce(added ? t('announce.addedSheets', { n: keys.length, sheets }) : t('announce.added', { n: keys.length }));
  }
}

const filesFrom = (dataTransfer) => (dataTransfer ? [...dataTransfer.files] : []);

function setupDropZone(zone) {
  let depth = 0;
  zone.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    depth++;
    zone.classList.add('is-drop-target');
  });
  zone.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  zone.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) zone.classList.remove('is-drop-target');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    zone.classList.remove('is-drop-target');
    // Soltados sobre una hoja: empiezan por esa hoja.
    const page = e.target.closest?.('.page');
    if (page) {
      view.sheet = Number(page.dataset.sheet);
      state.selected = null;
    }
    loadFiles(filesFrom(e.dataTransfer));
  });
}

// ---------- Exportar ----------

/**
 * Arranca el PDF ya mismo y, si corresponde, muestra el modal de donación
 * mientras se genera. Devuelve los bytes (o null si no se pudo armar), después
 * de que el modal se cierra por cualquier vía: la exportación sigue siempre.
 */
async function preparePdf(busyText) {
  const job = makePdf();
  job.catch(() => {}); // se maneja abajo, después del modal
  if (shouldAskDonation()) await askDonation();
  setBusy(true, busyText);
  try {
    return await job;
  } catch (err) {
    console.error(err);
    setBusy(false);
    say(t('errors.pdf'), { warn: true });
    return null;
  }
}

const canExport = () => state.items.length > 0 && !state.busy && !isDonationOpen();

async function exportPdf() {
  if (!canExport()) return;
  const fileName = pdfFileName();
  const bytes = await preparePdf(t('busy.pdf'));
  if (!bytes) return;
  downloadBytes(bytes, fileName);
  setBusy(false);
  say(t('notices.downloaded', { file: fileName }));
}

/** Imprime el mismo PDF que se descarga, sin pasar por la descarga. */
async function printPdf() {
  if (!canExport()) return;
  const fileName = pdfFileName();
  const bytes = await preparePdf(t('busy.print'));
  if (!bytes) return;
  setBusy(false);
  const how = await printBytes(bytes, fileName);
  const key = { dialog: 'notices.printDialog', tab: 'notices.printTab' }[how] ?? 'notices.printDownload';
  say(t(key, { paper: paperName(), file: fileName }), { persist: true });
}

// ---------- Barra de la pieza (toolbar con foco itinerante) ----------

function setupPiecebar() {
  const buttons = [...ui.piecebar.querySelectorAll('button')];
  const setRoving = (index) => buttons.forEach((b, i) => (b.tabIndex = i === index ? 0 : -1));
  setRoving(0);
  ui.piecebar.addEventListener('focusin', (e) => {
    const i = buttons.indexOf(e.target);
    if (i >= 0) setRoving(i);
  });
  ui.piecebar.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const n = buttons.length;
    const next = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    setRoving(next);
    buttons[next].focus();
  });
  ui.piecebar.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    const viaKeyboard = e.detail === 0;
    const action = button.dataset.action;
    if (action === 'remove') return pieceActions.remove({ focus: viaKeyboard });
    if (action === 'rotate-left') return pieceActions.rotate({ focus: false }, -1);
    if (action === 'rotate-right') return pieceActions.rotate({ focus: false }, 1);
    pieceActions[action]?.({ focus: false });
  });
  return () => buttons.find((b) => b.tabIndex === 0) ?? buttons[0];
}

// ---------- Atajos de una tecla: lo que se muestra y anuncia ----------

function syncSingleKeys() {
  for (const el of document.querySelectorAll('[data-aks]')) {
    const single = el.dataset.single !== undefined;
    if (single && !settings.singleKeys) el.removeAttribute('aria-keyshortcuts');
    else el.setAttribute('aria-keyshortcuts', el.dataset.aks);
  }
  ui.pieceHint.textContent = t(settings.singleKeys ? 'piecebar.hint' : 'piecebar.hintNoKeys', stepTexts());
  document.body.classList.toggle('single-keys-off', !settings.singleKeys);
  ui.emptyText.textContent = t(settings.singleKeys ? 'sheet.drop' : 'sheet.dropNoKeys');
  syncShortcuts();
  refreshTooltip();
}

// Cambiar de unidad no toca el documento: solo cómo se muestran y cargan las medidas.
function unitChanged() {
  render();
  syncSingleKeys();
  announce(t('prefs.unitChanged', { unit: unitName() }));
}

// ---------- Proyectos ----------

const isQuota = (err) => err?.name === 'QuotaExceededError' || err?.inner?.name === 'QuotaExceededError';

/** Avisos de projects.js (guardado, apertura, otras pestañas). */
function projectNotice(kind, { error = null, record = null } = {}) {
  if (kind === 'unavailable') return say(t('projects.unavailable'), { warn: true, persist: true });
  if (kind === 'saveFailed') {
    if (isQuota(error)) return say(t('notices.quota'), { warn: true, action: { label: t('notices.seeProjects'), run: openProjects } });
    return say(t('notices.saveFailed'), { warn: true, action: { label: t('projects.retry'), run: retrySave } });
  }
  if (kind === 'openFailed') return openFailed(record, error);
  if (kind === 'takenOver') return say(t('notices.takenOver'), { warn: true, action: { label: t('projects.takeOver'), run: takeOverWithUi } });
  if (kind === 'deletedElsewhere') return say(t('notices.deletedElsewhere'), { warn: true, action: { label: t('notices.saveAsNew'), run: saveAsNew } });
}

// No se pudo abrir un proyecto: si está dañado, se ofrece eliminarlo.
function openFailed(record, error) {
  console.warn(error);
  const name = record?.name ?? t('projects.untitled');
  if (error?.code === 'newer') return say(t('notices.openNewer', { name }), { warn: true });
  if (error?.code === 'corrupt' && record?.id) {
    return say(t('notices.openFailed', { name }), {
      warn: true,
      action: {
        label: t('notices.deleteProject'),
        run: async () => {
          const ok = await confirmAction({
            title: t('projects.deleteTitle', { name }),
            body: t('projects.deleteBody'),
            confirm: t('projects.deleteConfirm'),
            focus: 'cancel',
          });
          if (ok) await removeWithUi(record.id, name);
        },
      },
    });
  }
  say(t(record ? 'notices.openError' : 'notices.projectError'), { warn: true });
}

/** Después de abrir, crear o reemplazar el proyecto abierto. */
function projectOpened(record, how, previous) {
  shownSelection = null;
  forgetSpill();
  render();
  if (how === 'replaced') return announce(t('announce.projectReplaced', { name: record.name }));
  focusSheet();
  if (how === 'new') announce(t('announce.projectCreated', { name: previous ?? t('projects.untitled') }));
  else announce(t('announce.projectOpened', { name: record.name }));
}

/** Al empezar: restaura el último proyecto, con estado de carga accesible y sin parpadeos. */
async function startProjects() {
  // Si tarda, la píldora lo dice; mientras tanto el lienzo queda oculto (sin la zona vacía).
  const slow = setTimeout(() => setBusy(true, t('busy.openingProject')), 400);
  ui.canvas.setAttribute('aria-busy', 'true');
  await initProjects({
    statusChanged: ({ recovered }) => {
      renderProjectBar();
      if (recovered) announce(t('announce.projectSaved'));
    },
    notify: projectNotice,
    listChanged,
    thumbImage: (item) => pieceNode(item.id)?.firstChild ?? null,
  });
  clearTimeout(slow);
  state.busy = false;
  status.busyText = '';
  document.body.classList.remove('is-loading');
  ui.canvas.removeAttribute('aria-busy');
  render();
}

// ---------- Cableado ----------

function wire() {
  Object.assign(ui, {
    add: $('add'),
    arrange: $('arrange'),
    undo: $('undo'),
    redo: $('redo'),
    help: $('help'),
    export: $('export'),
    print: $('print'),
    clear: $('clear'),
    addzone: $('addzone'),
    file: $('file'),
    canvas: $('canvas'),
    empty: $('empty'),
    emptyText: $('empty-text'),
    piecebar: $('piecebar'),
    pieceHint: $('piece-hint'),
    skip: $('skip'),
  });

  // El HTML ya llega con los textos (Vite los completa); esto aplica lo que depende
  // del dispositivo, como ⌘ en lugar de Ctrl.
  applyCopy();
  for (const el of document.querySelectorAll('[data-kbd]')) el.dataset.kbd = el.dataset.kbd.split(' ').map(keyLabel).join(' ');
  hydrateIcons();

  initLive();
  initNotice({ onArrange: doArrange });
  initConfirm();
  initPrefs({ trigger: $('prefs-open'), onSingleKeysChange: syncSingleKeys, onUnitChange: unitChanged });
  initShortcuts({ trigger: ui.help, openPrefs });
  initDonate();
  initProjectsUi({
    busy: (on, text) => setBusy(on, text),
    opened: projectOpened,
    failed: openFailed,
  });
  initTooltips({ showShortcut: (el) => el.dataset.single === undefined || settings.singleKeys });
  initSheetView({
    select,
    background: (sheetId) => {
      if (sheetId !== null) view.sheet = sheetId;
      if (state.selected === null) return render();
      select(null);
      sheetNode(currentSheet())?.focus({ preventScroll: true });
    },
    commitGesture: (result, { sheetChanged, item }) => {
      if (result === 'reverted') say(t('notices.reverted'));
      else render();
      if (sheetChanged) announce(t('announce.movedToSheet', { i: sheetNumber(item.sheet), total: state.sheets.length }));
    },
    preview: (draft) => renderPanels(draft),
    removeSheet,
    addSheet,
  });
  initPanels({
    sheetChanged,
    setOrientation,
    editSelected,
    changePage,
    fill,
    setGridVisible,
    fit: () => pieceActions.fit({ focus: false }),
    center: () => pieceActions.center({ focus: false }),
    front: () => pieceActions.front({ focus: false }),
    remove: ({ viaKeyboard }) => pieceActions.remove({ focus: viaKeyboard }),
  });
  initPieceList({
    select,
    toSheet: () => {
      if (isDrawerOpen('pieces')) closeDrawer('pieces', { focus: 'none' });
      focusSheet();
    },
    remove: () => pieceActions.remove({ focus: true, inList: true }),
  });
  initDrawers({
    initialFocus: (name) => (name === 'pieces' ? (listFocusTarget() ?? ui.addzone) : (firstPieceField() ?? firstSheetField())),
    changed: () => render(),
  });
  const piecebarFocusTarget = setupPiecebar();

  // Barra superior
  ui.add.addEventListener('click', openFiles);
  ui.arrange.addEventListener('click', doArrange);
  ui.undo.addEventListener('click', doUndo);
  ui.redo.addEventListener('click', doRedo);
  ui.export.addEventListener('click', exportPdf);
  ui.print.addEventListener('click', printPdf);
  ui.empty.addEventListener('click', openFiles);
  ui.addzone.addEventListener('click', openFiles);
  ui.clear.addEventListener('click', clearSheet);
  ui.skip.addEventListener('click', (e) => {
    e.preventDefault();
    focusSheet();
  });

  // Archivos
  ui.file.addEventListener('change', () => {
    const files = [...ui.file.files];
    ui.file.value = '';
    loadFiles(files);
  });
  setupDropZone($('workspace'));
  // Que soltar un archivo fuera de la zona no abra el archivo en la pestaña.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  document.addEventListener('paste', (e) => {
    const files = filesFrom(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    loadFiles(files);
  });

  // Teclado
  const withFocus = (fn) => () => fn({ focus: true });
  initKeyboard({
    undo: doUndo,
    redo: doRedo,
    exportPdf,
    print: printPdf,
    arrange: doArrange,
    openFiles,
    openSheet: focusSheetSettings,
    focusList: focusPieces,
    toggleOrientation: () => setOrientation(!state.landscape),
    toggleGrid: () => setGridVisible(!settings.grid.show),
    help: openShortcuts,
    openProjects,
    hasSelection: () => !!selectedItem() && !state.busy,
    endEdit,
    nudge,
    scaleBy,
    gotoSheet,
    sendToSheet,
    rotate: (dir) => pieceActions.rotate({ focus: true }, dir),
    duplicate: withFocus(pieceActions.duplicate),
    fit: withFocus(pieceActions.fit),
    center: withFocus(pieceActions.center),
    front: withFocus(pieceActions.front),
    remove: withFocus(pieceActions.remove),
    measures: focusPieceFields,
    toolbar: () => piecebarFocusTarget().focus(),
    escape: (target) => {
      // Desde un panel: si es superpuesto, se cierra; si no, el foco vuelve a la pieza.
      const panel = drawerOf(target);
      if (panel) {
        if (isCollapsible(panel) && isDrawerOpen(panel)) closeDrawer(panel);
        else focusSheet();
        return true;
      }
      for (const name of ['pieces', 'props']) {
        if (isDrawerOpen(name)) {
          closeDrawer(name, { focus: 'none' });
          return true;
        }
      }
      if (target.closest('#piecebar') && pieceNode(state.selected)) {
        focusSheet();
        return true;
      }
      if (state.selected === null) return false;
      const onPiece = !!target.closest('.piece');
      const sheet = selectedItem()?.sheet;
      select(null);
      if (onPiece && sheet) sheetNode(sheet)?.focus({ preventScroll: true });
      announce(t('announce.deselected'));
      return true;
    },
  });

  document.addEventListener('focusin', (e) => (lastFocus = e.target));
  // Al salir de un campo, se reformatea con lo que quedó en el estado.
  document.addEventListener('focusout', (e) => {
    if (e.target.matches?.('input[type="number"], input[inputmode="decimal"]')) setTimeout(render);
  });

  new ResizeObserver(() => {
    if (!isDragging()) render();
  }).observe($('stage'));

  syncSingleKeys();
  setRenderer(renderAll);
}

wire();
render();
startProjects();
