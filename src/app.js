// Pliego: acomodar imágenes y páginas de PDF en una hoja a tamaño real y
// exportar un PDF listo para imprimir. Este módulo arma la interfaz y conecta
// las acciones; el estado vive en store.js y la hoja en sheetview.js.

import { APP_NAME, APP_TAGLINE, MAX_ITEMS } from './config.js';
import {
  state,
  settings,
  status,
  assets,
  dims,
  selectedItem,
  addAsset,
  newId,
  paperName,
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
} from './store.js';
import { readFile, pdfPage } from './assets.js';
import { makePdf, pdfFileName, downloadBytes, printBytes } from './output.js';
import { arrange, keepCenter, centerOnSheet, fitToSheet, placeNew, fillWithCopies } from './layout.js';
import { initNotice, renderNotice, say } from './notice.js';
import { initLive, announce } from './live.js';
import { hydrateIcons } from './icons.js';
import { initTooltips, refreshTooltip } from './tooltip.js';
import { initSheetView, renderSheetView, animateNext, pieceNode, isDragging, rectOf } from './sheetview.js';
import { overlapsAny, nearestFree, nextFreeInDirection, maxGrowth } from './collide.js';
import { initPanels, renderPanels, expandSection, firstPieceField, firstSheetField, setFrontEnabled } from './panels.js';
import { initPieceList, renderPieceList, focusList, listFocusTarget } from './piecelist.js';
import { initDrawers, closeDrawer, isDrawerOpen, isCollapsible, drawerOf, revealPanel } from './drawers.js';
import { initShortcuts, openShortcuts } from './shortcuts.js';
import { initDonate, shouldAskDonation, askDonation, isDonationOpen } from './donate.js';
import { initKeyboard } from './keyboard.js';
import { $, clamp, round1, tidy, fmt, plural, MOD } from './util.js';

const ui = {};

// ---------- Render ----------

let lastFocus = null;

function renderAll() {
  renderSheetView();
  renderTopbar();
  renderPanels();
  renderPieceList();
  renderNotice();
  rescueFocus();
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
  ui.piecebar.setAttribute('aria-label', `Acciones de la pieza ${assets.get(item.asset).name}`);
  // «Traer al frente» solo sirve si pisa a otra: si no, queda deshabilitado (enfocable y explicado).
  setFrontEnabled(overlapsOthers(item));
}

const othersOf = (item) => state.items.filter((other) => other !== item).map(rectOf);
const overlapsOthers = (item) => overlapsAny(rectOf(item), othersOf(item));
const nameOf = (rect) => assets.get(state.items.find((item) => item.id === rect.id)?.asset)?.name ?? 'otra pieza';

// ---------- Foco ----------

/** Enfoca la pieza seleccionada; si no hay, la zona para soltar o la hoja. */
function focusSheet() {
  const node = pieceNode(state.selected);
  if (node) return node.focus({ preventScroll: true });
  if (!state.items.length && !ui.empty.disabled) return ui.empty.focus({ preventScroll: true });
  ui.sheet.focus({ preventScroll: true });
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
  render();
}

const sizeText = (item) => {
  const [w, h] = dims(item);
  return `${fmt(w)} × ${fmt(h)} mm`;
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

/**
 * Dónde va una copia: sin superposición, al hueco libre más cercano a la
 * original (primero dentro del margen, después en la hoja); si no hay, o si
 * se permite superponer, 5 mm abajo a la derecha (queda superpuesta y avisada).
 */
function duplicateSpot(item) {
  const offset = { x: item.x + 5, y: item.y + 5 };
  if (settings.allowOverlap) return offset;
  const rect = rectOf(item);
  const others = state.items.map(rectOf); // incluida la original
  const { W, H, m, aw, ah } = area();
  const inMargin = aw > 0 && ah > 0 ? nearestFree(rect, others, { bounds: { x: m, y: m, w: aw, h: ah } }) : null;
  const spot = inMargin ?? nearestFree(rect, others, { bounds: { x: 0, y: 0, w: W, h: H } });
  return spot ? { x: tidy(spot.x), y: tidy(spot.y) } : offset;
}

const pieceActions = {
  rotate: (opts = {}, dir = 1) =>
    editSelected((item) => keepCenter(item, () => (item.r = (item.r + (dir > 0 ? 90 : 270)) % 360)), {
      ...opts,
      announce: (item) => `Rotada a ${item.r}°: ${sizeText(item)}.`,
    }),
  duplicate: (opts = {}) => {
    if (state.items.length >= MAX_ITEMS) return say(`Hay un máximo de ${MAX_ITEMS} elementos por hoja.`, { warn: true });
    editSelected(
      (item) => {
        const copy = { ...item, id: newId(), ...duplicateSpot(item) };
        state.items.push(copy);
        state.selected = copy.id;
      },
      { ...opts, announce: () => `Duplicada. Ahora hay ${plural(state.items.length, 'pieza', 'piezas')}.` }
    );
  },
  fit: (opts = {}) =>
    editSelected(fitToSheet, { ...opts, announce: (item) => `Ajustada a la hoja: ${sizeText(item)}.` }),
  center: (opts = {}) => editSelected(centerOnSheet, { ...opts, announce: 'Centrada en la hoja.' }),
  front: (opts = {}) => {
    const item = selectedItem();
    if (!item) return;
    if (!overlapsOthers(item)) return announce('No hace falta traerla al frente: no pisa a ninguna otra pieza.');
    editSelected(
      (selected) => {
        state.items = [...state.items.filter((other) => other !== selected), selected];
      },
      { ...opts, announce: 'Traída al frente.' }
    );
  },
  /**
   * Con teclado, la selección y el foco pasan a la vecina (en la hoja, o en la
   * lista si se quitó desde ahí); con el mouse, se deselecciona.
   */
  remove: ({ focus = true, inList = false } = {}) => {
    const item = selectedItem();
    if (!item || state.busy) return;
    const index = state.items.indexOf(item);
    const name = assets.get(item.asset).name;
    commit();
    state.items = state.items.filter((other) => other !== item);
    const neighbor = focus ? (state.items[index] ?? state.items[index - 1] ?? null) : null;
    state.selected = neighbor?.id ?? null;
    render();
    if (inList && focusList()) {
      // el foco sigue en la lista
    } else if (focus) focusSheet();
    else ui.sheet.focus({ preventScroll: true });
    announce(`Quitada: ${name}.${state.items.length ? '' : ' La hoja está vacía.'}`);
  },
};

function nudge(dx, dy) {
  const item = selectedItem();
  if (!item || state.busy) return;
  commit(`nudge:${item.id}`);
  let jumped = [];
  if (settings.allowOverlap) {
    item.x = tidy(item.x + dx);
    item.y = tidy(item.y + dy);
  } else {
    // Si el paso la deja pisando a otra, salta justo al otro lado.
    const next = nextFreeInDirection(rectOf(item), othersOf(item), dx, dy);
    item.x = tidy(next.x);
    item.y = tidy(next.y);
    jumped = next.jumped;
  }
  render();
  focusSheet();
  if (jumped.length) announce(`Saltó sobre ${jumped.map(nameOf).join(', ')}.`);
  announce(`A ${fmt(item.x)} mm del borde izquierdo y ${fmt(item.y)} mm del superior.`, { key: 'move', delay: 600 });
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
      return announce('No hay más lugar para agrandar.', { key: 'scale' });
    }
  }
  commit(`scale-key:${item.id}`);
  keepCenter(item, () => (item.scale = scale));
  render();
  focusSheet();
  announce(`Escala ${fmt(item.scale)} %: ${sizeText(item)}.`, { key: 'scale', delay: 600 });
}

function doUndo() {
  const onSheet = !!document.activeElement?.closest?.('#sheet');
  if (!undo()) return;
  animateNext();
  render();
  if (onSheet) focusSheet();
  announce('Se deshizo el último cambio.');
}

function doRedo() {
  const onSheet = !!document.activeElement?.closest?.('#sheet');
  if (!redo()) return;
  animateNext();
  render();
  if (onSheet) focusSheet();
  announce('Se rehízo el cambio.');
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
  announce(`Hoja ${paperName()}.`);
}

function setGridVisible(show) {
  setGrid({ show });
  render();
  announce(show ? `Grilla visible, cada ${fmt(settings.grid.size)} mm.` : 'Grilla oculta.');
}

function sheetChanged() {
  animateNext();
  render();
  announce(`Hoja ${paperName()}.`);
}

function clearSheet() {
  if (!state.items.length || state.busy) return;
  commit();
  state.items = [];
  state.selected = null;
  render();
  announce('Se vació la hoja.');
}

// Cambiar la página crea (o reusa) otro asset: así deshacer vuelve a la anterior.
async function changePage(n) {
  const item = selectedItem();
  const asset = item && assets.get(item.asset);
  if (!asset || asset.kind !== 'pdf' || asset.page === n || state.busy) return;
  setBusy(true, `Cargando la página ${n}…`);
  try {
    let key = [...assets].find(([, a]) => a.pdf === asset.pdf && a.page === n)?.[0];
    key ??= addAsset(await pdfPage(asset, n));
    commit();
    item.asset = key;
    setBusy(false);
  } catch (err) {
    console.error(err);
    setBusy(false);
    say(`No se pudo cargar la página ${n}.`, { warn: true });
  }
}

function fill() {
  fillWithCopies();
}

// ---------- Paneles desde el teclado ----------

/** M: al primer campo de la sección Pieza (X). */
function focusPieceFields() {
  if (!selectedItem()) return announce('Primero seleccioná una pieza.');
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
  setBusy(true, 'Cargando…');
  for (const [i, file] of files.entries()) {
    if (state.items.length + keys.length >= MAX_ITEMS) {
      errors.push(`se llegó al máximo de ${MAX_ITEMS} elementos y ${files.length - i} quedaron afuera`);
      break;
    }
    status.busyText = files.length > 1 ? `Cargando ${i + 1} de ${files.length}…` : `Cargando ${file.name}…`;
    renderNotice();
    try {
      keys.push(addAsset(await readFile(file)));
    } catch (err) {
      console.warn(file.name, err);
      errors.push(`${file.name || 'archivo'}: ${err.message}`);
    }
  }
  if (keys.length) {
    commit(); // todavía "busy": la limpieza no toca los assets recién creados
    placeNew(keys);
  }
  state.busy = false;
  if (errors.length) say(`No se pudo cargar: ${errors.join(' · ')}`, { warn: true });
  else render();
  if (keys.length) announce(keys.length === 1 ? 'Se agregó 1 archivo.' : `Se agregaron ${keys.length} archivos.`);
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
    say(`No se pudo armar el PDF: ${err.message}`, { warn: true });
    return null;
  }
}

const canExport = () => state.items.length > 0 && !state.busy && !isDonationOpen();

async function exportPdf() {
  if (!canExport()) return;
  const fileName = pdfFileName();
  const bytes = await preparePdf('Armando el PDF…');
  if (!bytes) return;
  downloadBytes(bytes, fileName);
  setBusy(false);
  say(`PDF descargado (${fileName}). Al imprimir, elegí «Tamaño real» o «100 %».`);
}

/** Imprime el mismo PDF que se descarga, sin pasar por la descarga. */
async function printPdf() {
  if (!canExport()) return;
  const fileName = pdfFileName();
  const bytes = await preparePdf('Preparando la impresión…');
  if (!bytes) return;
  setBusy(false);
  const how = await printBytes(bytes, fileName);
  const tip = `elegí «Tamaño real» o «100 %» y el mismo tamaño de papel (${paperName()}).`;
  if (how === 'dialog') say(`En el diálogo de impresión, ${tip}`, { persist: true });
  else if (how === 'tab') say(`Se abrió el PDF: imprimilo desde ahí. Al imprimir, ${tip}`, { persist: true });
  else say(`Se descargó ${fileName}: imprimilo desde ahí. Al imprimir, ${tip}`, { persist: true });
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
  ui.pieceHint.textContent = settings.singleKeys
    ? 'Flechas: mover (Shift: 10 mm; Alt: 0,1 mm). Más y menos: escalar. R y Shift+R: girar. D: duplicar. ' +
      'M: editar medidas. Enter: barra de acciones. Supr: quitar.'
    : 'Flechas: mover (Shift: 10 mm; Alt: 0,1 mm). Enter: barra de acciones. Supr: quitar.';
  document.body.classList.toggle('single-keys-off', !settings.singleKeys);
  ui.emptyText.textContent = settings.singleKeys
    ? 'Soltá imágenes o PDF, pegá con Ctrl+V o apretá O'
    : 'Soltá imágenes o PDF, pegá con Ctrl+V o hacé clic acá';
  refreshTooltip();
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
    sheet: $('sheet'),
    empty: $('empty'),
    emptyText: $('empty-text'),
    piecebar: $('piecebar'),
    pieceHint: $('piece-hint'),
    skip: $('skip'),
  });

  document.title = `${APP_NAME} — ${APP_TAGLINE}`;
  for (const el of document.querySelectorAll('[data-app-name]')) el.textContent = APP_NAME;
  for (const el of document.querySelectorAll('[data-kbd]')) el.dataset.kbd = el.dataset.kbd.replaceAll('Ctrl+', `${MOD}+`);
  hydrateIcons();

  initLive();
  initNotice({ onArrange: doArrange });
  initShortcuts({ trigger: ui.help, onSingleKeysChange: syncSingleKeys });
  initDonate();
  initTooltips({ showShortcut: (el) => el.dataset.single === undefined || settings.singleKeys });
  initSheetView({
    select,
    background: () => {
      if (state.selected === null) return;
      select(null);
      ui.sheet.focus({ preventScroll: true });
    },
    commitGesture: (result) => {
      if (result === 'reverted') say('Ahí no había lugar libre: la pieza volvió a su lugar.');
      else render();
    },
    preview: (draft) => renderPanels(draft),
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
    hasSelection: () => !!selectedItem() && !state.busy,
    endEdit,
    nudge,
    scaleBy,
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
      select(null);
      if (onPiece) ui.sheet.focus({ preventScroll: true });
      announce('Ninguna pieza seleccionada.');
      return true;
    },
  });

  document.addEventListener('focusin', (e) => (lastFocus = e.target));
  // Al salir de un campo, se reformatea con lo que quedó en el estado.
  document.addEventListener('focusout', (e) => {
    if (e.target.matches?.('input[type="number"]')) setTimeout(render);
  });

  new ResizeObserver(() => {
    if (!isDragging()) render();
  }).observe($('stage'));

  syncSingleKeys();
  setRenderer(renderAll);
}

wire();
render();
