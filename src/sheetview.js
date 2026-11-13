// Las hojas en pantalla, una debajo de otra (como páginas): tamaño (zoom),
// piezas, marco de selección con su tirador, barra de la pieza, hoja actual y
// gestos con el puntero (también para pasar una pieza de una hoja a otra).
//
// Rendimiento: render solo toca lo que cambió (cada nodo recuerda con qué se
// dibujó); durante un arrastre se mueve únicamente la pieza arrastrada y el
// marco, y el scroll solo reubica la barra y marca la hoja actual.

import { DRAG_THRESHOLD, NARROW_QUERY } from './config.js';
import { state, settings, assets, view, sheetSize, dims, findItem, commit, itemsOn, currentSheet, sheetIndex } from './store.js';
import { overlapsAny, nearestFree, maxGrowth } from './collide.js';
import { sheetAt } from './sheets.js';
import { paperTitle, sizeText, lengthText } from './measure.js';
import { icon } from './icons.js';
import { $, clamp, round1, tidy, isTyping } from './util.js';
import { t } from './copy/index.js';
import { pickSpot, clip } from './placement.js';

const nodes = new Map(); // id de pieza → nodo
const pages = new Map(); // id de hoja → {page, label, remove, box, sheet, grid, safe, hint}
let boxes = new Map(); // id de hoja → {left, top} de su caja dentro de #sheets
let ui = {};
let handlers = {};
let zoom = 1; // px por mm
let gesture = null;
let animTimer = 0;

export const pieceNode = (id) => nodes.get(id) ?? null;
export const isDragging = () => !!gesture?.moved;
/** El elemento de la hoja (role="group", enfocable con tabindex -1). */
export const sheetNode = (id) => pages.get(id)?.sheet ?? null;

/**
 * `handlers.select(id)`: selecciona (sin mover el foco).
 * `handlers.background(sheetId)`: click en una hoja vacía o alrededor (null).
 * `handlers.commitGesture(result, {sheetChanged, item})`: después de mover/escalar.
 * `handlers.preview(draft)`: durante el gesto, con la copia del item (valores en vivo).
 * `handlers.removeSheet(id, {viaKeyboard})` y `handlers.addSheet()`.
 * `handlers.currentChanged()`: la hoja actual cambió por el scroll o el foco.
 */
export function initSheetView(h) {
  handlers = h;
  ui = {
    canvas: $('canvas'),
    stage: $('stage'),
    sheets: $('sheets'),
    dragLayer: $('drag-layer'),
    foot: document.querySelector('.sheets-foot'),
    addSheet: $('add-sheet'),
    empty: $('empty'),
    frame: $('frame'),
    handle: $('handle'),
    paperLabel: $('paper-label'),
    piecebar: $('piecebar'),
    pieceSize: $('piece-size'),
    narrow: window.matchMedia(NARROW_QUERY),
  };
  ui.stage.addEventListener('pointerdown', onPointerDown);
  ui.stage.addEventListener('pointermove', onPointerMove);
  ui.stage.addEventListener('pointerup', onPointerUp);
  ui.stage.addEventListener('pointercancel', onPointerUp);
  ui.stage.addEventListener('scroll', onScroll, { passive: true });
  // Enfocar una pieza la selecciona; enfocar algo de una hoja la vuelve la actual.
  ui.sheets.addEventListener('focusin', (e) => {
    const node = e.target.closest('.piece');
    if (node) return handlers.select(Number(node.dataset.id));
    const page = e.target.closest('.page');
    if (page) setViewSheet(Number(page.dataset.sheet));
  });
  ui.sheets.addEventListener('click', (e) => {
    const remove = e.target.closest('.page-remove');
    if (remove) handlers.removeSheet(Number(remove.closest('.page').dataset.sheet), { viaKeyboard: e.detail === 0 });
  });
  ui.addSheet.addEventListener('click', () => handlers.addSheet());
}

/** Anima el próximo cambio de posiciones (acomodar, deshacer…). */
export function animateNext() {
  ui.sheets.classList.add('is-animating');
  clearTimeout(animTimer);
  animTimer = setTimeout(() => ui.sheets.classList.remove('is-animating'), 320);
}

// ---------- Render ----------

export function renderSheetView() {
  const [W, H] = sheetSize();
  syncPages();
  computeZoom(W, H);

  const total = state.sheets.length;
  const counts = new Map(state.sheets.map((s) => [s.id, 0]));
  for (const item of state.items) counts.set(item.sheet, (counts.get(item.sheet) ?? 0) + 1);
  const empty = state.items.length === 0;
  state.sheets.forEach((sheet, i) => {
    const p = pages.get(sheet.id);
    const n = counts.get(sheet.id) ?? 0;
    p.box.style.width = `${W * zoom}px`;
    p.box.style.height = `${H * zoom}px`;
    p.page.style.width = `${W * zoom}px`;
    p.safe.style.inset = `${state.margin * zoom}px`;
    p.safe.hidden = state.margin <= 0 || empty; // con todo vacío, la zona para soltar ya marca el área
    const label = t('sheet.numbered', { i: i + 1, total });
    if (p.label.textContent !== label) p.label.textContent = label;
    const groupLabel = n ? t('sheet.groupLabel', { label, n }) : t('sheet.groupEmpty', { label });
    if (p.sheet.getAttribute('aria-label') !== groupLabel) p.sheet.setAttribute('aria-label', groupLabel);
    p.remove.hidden = total < 2;
    const removeLabel = t('sheet.removeLabel', { i: i + 1 });
    if (p.remove.getAttribute('aria-label') !== removeLabel) p.remove.setAttribute('aria-label', removeLabel);
    p.hint.hidden = n > 0 || (empty && i === 0);
  });
  markCurrent();
  renderGrid();

  // La zona para soltar, en la primera hoja mientras no haya piezas.
  const first = pages.get(state.sheets[0].id);
  if (empty && ui.empty.parentNode !== first.sheet) first.sheet.insertBefore(ui.empty, first.hint);
  ui.empty.hidden = !empty;
  ui.empty.disabled = state.busy;
  ui.addSheet.disabled = state.busy;
  ui.paperLabel.textContent = t('sheet.paperLabel', { paper: paperTitle(), size: sizeText(W, H) });

  measureBoxes();
  renderPieces();
  renderSelection();
}

/** Crea, ordena y quita los elementos de las hojas según state.sheets. */
function syncPages() {
  const live = new Set(state.sheets.map((s) => s.id));
  for (const [id, p] of pages) {
    if (live.has(id)) continue;
    if (p.sheet.contains(ui.empty)) ui.sheets.prepend(ui.empty);
    p.page.remove();
    pages.delete(id);
  }
  let prev = null;
  for (const sheet of state.sheets) {
    let p = pages.get(sheet.id);
    if (!p) {
      p = createPage(sheet.id);
      pages.set(sheet.id, p);
    }
    const before = prev ? prev.nextSibling : ui.sheets.firstChild;
    if (before !== p.page) ui.sheets.insertBefore(p.page, before);
    prev = p.page;
  }
}

function createPage(id) {
  const page = document.createElement('div');
  page.className = 'page';
  page.dataset.sheet = id;
  const head = document.createElement('div');
  head.className = 'page-head';
  const label = document.createElement('span');
  label.className = 'page-label';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn small page-remove';
  remove.dataset.tip = t('sheet.remove');
  remove.innerHTML = icon('trash-2');
  head.append(label, remove);
  const box = document.createElement('div');
  box.className = 'sheet-box';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'group');
  sheet.tabIndex = -1;
  const grid = document.createElement('div');
  grid.className = 'grid-layer';
  grid.setAttribute('aria-hidden', 'true');
  const safe = document.createElement('div');
  safe.className = 'safe';
  safe.setAttribute('aria-hidden', 'true');
  const hint = document.createElement('p');
  hint.className = 'sheet-empty';
  hint.setAttribute('aria-hidden', 'true');
  hint.textContent = t('sheet.emptyHint');
  sheet.append(grid, safe, hint);
  box.append(sheet);
  page.append(head, box);
  gridKey = ''; // la grilla nueva necesita su fondo
  return { page, label, remove, box, sheet, grid, safe, hint };
}

/**
 * Zoom para que una hoja (con su encabezado y, debajo, el botón para agregar
 * otra) entre cómoda en el alto visible; el resto se ve con scroll.
 */
function computeZoom(W, H) {
  const style = getComputedStyle(ui.stage);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const head = pages.get(state.sheets[0].id).page.firstChild.offsetHeight;
  const gap = parseFloat(getComputedStyle(ui.sheets).rowGap) || 0;
  const foot = ui.foot.offsetHeight + gap + parseFloat(getComputedStyle(ui.foot).marginTop || 0);
  const availW = ui.stage.clientWidth - padX;
  const availH = ui.stage.clientHeight - padY - head - foot;
  zoom = Math.max(0.05, Math.min(availW / W, availH / H));
}

/** Posición de cada caja de hoja dentro de #sheets (para el marco y los arrastres). */
function measureBoxes() {
  boxes = new Map();
  for (const sheet of state.sheets) {
    const box = pages.get(sheet.id).box;
    boxes.set(sheet.id, { left: box.offsetLeft, top: box.offsetTop });
  }
}

// ---------- Grilla (solo en pantalla) ----------

let gridKey = '';

/**
 * Líneas finas cada `size` mm y más marcadas cada 5 o 10 celdas, dibujadas con
 * gradientes escalados al zoom. Si las finas quedan a menos de ~6 px se omiten.
 */
function renderGrid() {
  const { show, size } = settings.grid;
  for (const p of pages.values()) p.grid.hidden = !show;
  if (!show) return;
  const key = `${size}|${zoom}`;
  if (key === gridKey) return;
  gridKey = key;
  const MIN_PX = 6;
  let minor = size * zoom;
  let major = minor * (size >= 5 ? 5 : 10);
  while (major < MIN_PX) major *= 2;
  if (minor < MIN_PX) minor = major;
  const line = (dir, color) => `linear-gradient(${dir}, ${color} 1px, transparent 1px)`;
  const image = [
    line('to right', 'var(--grid-major)'),
    line('to bottom', 'var(--grid-major)'),
    line('to right', 'var(--grid-minor)'),
    line('to bottom', 'var(--grid-minor)'),
  ].join(', ');
  const sizes = [major, major, minor, minor].map((v) => `${v}px ${v}px`).join(', ');
  for (const p of pages.values()) {
    p.grid.style.backgroundImage = image;
    p.grid.style.backgroundSize = sizes;
  }
}

// ---------- Piezas ----------

// Mueve un nodo conservando el foco donde el navegador lo permite (moveBefore).
function place(container, node, before) {
  if (node.parentNode === container && node.nextSibling === before) return;
  if (container.moveBefore && node.isConnected) {
    try {
      container.moveBefore(node, before);
      return;
    } catch {
      // cae a insertBefore
    }
  }
  container.insertBefore(node, before);
}

/** Sincroniza las piezas de cada hoja con state.items, reusando nodos por id. */
function renderPieces() {
  const live = new Set(state.items.map((item) => item.id));
  for (const [id, node] of nodes) {
    if (!live.has(id)) {
      node.remove();
      nodes.delete(id);
    }
  }
  const bySheet = new Map(state.sheets.map((s) => [s.id, []]));
  for (const item of state.items) bySheet.get(item.sheet)?.push(item);
  for (const [sheetId, list] of bySheet) {
    const p = pages.get(sheetId);
    let prev = p.hint;
    for (const item of list) {
      let node = nodes.get(item.id);
      if (!node) {
        node = createPiece(item);
        nodes.set(item.id, node);
      }
      updatePiece(node, item);
      place(p.sheet, node, prev.nextSibling);
      prev = node;
    }
  }
}

function createPiece(item) {
  const node = document.createElement('div');
  node.className = 'piece';
  node.dataset.id = item.id;
  node.tabIndex = 0;
  node.setAttribute('role', 'button');
  node.setAttribute('aria-roledescription', t('piece.roleDescription'));
  node.setAttribute('aria-describedby', 'piece-hint');
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  node.append(img);
  return node;
}

/** Nombre accesible: archivo, medidas, posición y giro. */
export function pieceLabel(item) {
  const asset = assets.get(item.asset);
  const [w, h] = dims(item);
  const page = asset.kind === 'pdf' && asset.pages > 1 ? t('piece.a11yPage', { page: asset.page }) : '';
  const turned = item.r ? t('piece.a11yTurned', { deg: item.r }) : '';
  return t('piece.a11y', { name: asset.name, page, size: sizeText(w, h), x: lengthText(item.x), y: lengthText(item.y), turned });
}

/**
 * Dibuja la pieza (`offset`: {left, top} de la hoja si va en la capa de
 * arrastre, en coordenadas de #sheets). Si nada cambió desde la última vez,
 * no toca el DOM.
 */
function updatePiece(node, item, offset = null) {
  const asset = assets.get(item.asset);
  const [w, h] = dims(item);
  const k = item.scale / 100;
  const left = (offset?.left ?? 0) + item.x * zoom;
  const top = (offset?.top ?? 0) + item.y * zoom;
  const selected = item.id === state.selected;
  const key = `${left}|${top}|${w}|${h}|${zoom}|${item.r}|${asset.url}|${selected}|${settings.unit}|${asset.name}|${asset.page}`;
  if (node.dataset.key === key) return;
  node.dataset.key = key;
  node.classList.toggle('is-selected', selected);
  const label = pieceLabel(item);
  if (node.getAttribute('aria-label') !== label) node.setAttribute('aria-label', label);
  Object.assign(node.style, { left: `${left}px`, top: `${top}px`, width: `${w * zoom}px`, height: `${h * zoom}px` });
  const img = node.firstChild;
  if (img.getAttribute('src') !== asset.url) img.src = asset.url;
  Object.assign(img.style, {
    width: `${asset.w * k * zoom}px`,
    height: `${asset.h * k * zoom}px`,
    transform: `translate(-50%, -50%) rotate(${item.r}deg)`,
  });
}

/** Rectángulo de una pieza en su hoja, con su id. */
export function rectOf(item) {
  const [w, h] = dims(item);
  return { id: item.id, x: item.x, y: item.y, w, h };
}

// ---------- Selección: marco, tirador y barra de la pieza ----------

function renderSelection(draft = null) {
  const item = draft ?? findItem(state.selected);
  const box = item && boxes.get(item.sheet);
  ui.frame.hidden = !box;
  ui.piecebar.hidden = !box;
  if (!box) return;
  const [w, h] = dims(item);
  Object.assign(ui.frame.style, {
    left: `${box.left + item.x * zoom}px`,
    top: `${box.top + item.y * zoom}px`,
    width: `${w * zoom}px`,
    height: `${h * zoom}px`,
  });
  ui.pieceSize.textContent = sizeText(w, h);
  if (!gesture?.moved) placePiecebar(item);
}

/**
 * Barra de la pieza. En pantallas angostas va anclada abajo, encima de los botones
 * «Piezas» y «Propiedades» (lo resuelve el CSS). Si no, prueba arriba, abajo (centrada
 * o alineada con un borde de la pieza) y fuera de la hoja a cada costado, y se queda
 * con la posición que tapa menos piezas; a igualdad, en ese orden. Nunca sale del
 * lienzo ni queda debajo de un panel abierto encima del lienzo. Si la pieza quedó
 * fuera de la vista (por el scroll), la barra se oculta hasta que vuelva.
 */
function placePiecebar(item) {
  const bar = ui.piecebar;
  if (ui.narrow.matches) {
    bar.style.transform = '';
    bar.dataset.side = 'docked';
    bar.classList.remove('is-offscreen');
    return;
  }
  const page = pages.get(item.sheet);
  if (!page) return;
  const canvas = ui.canvas.getBoundingClientRect();
  const stage = ui.stage.getBoundingClientRect();
  const box = page.box.getBoundingClientRect();
  const sheet = { x: box.left - canvas.left, y: box.top - canvas.top, w: box.width, h: box.height };
  const onCanvas = (it) => {
    const [w, h] = dims(it);
    return { x: sheet.x + it.x * zoom, y: sheet.y + it.y * zoom, w: w * zoom, h: h * zoom };
  };
  const piece = onCanvas(item);
  const visible = { x: stage.left - canvas.left, y: stage.top - canvas.top, w: stage.width, h: stage.height };
  const offscreen = !clip(piece, visible) && !bar.contains(document.activeElement);
  bar.classList.toggle('is-offscreen', offscreen);
  if (offscreen) return;
  const w = bar.offsetWidth;
  const h = bar.offsetHeight;
  const gap = 12;
  const edge = 8;
  // Zona disponible: el lienzo, menos el panel de piezas si está abierto encima (desde la
  // izquierda). Con offset*: la posición final, aunque el panel todavía esté entrando animado.
  const panels = [...document.querySelectorAll('.panel.is-open')].map((panel) => ({
    x: panel.offsetLeft - ui.canvas.offsetLeft,
    y: panel.offsetTop - ui.canvas.offsetTop,
    w: panel.offsetWidth,
    h: panel.offsetHeight,
  }));
  const minX = Math.max(edge, ...panels.filter((r) => r.x <= edge).map((r) => r.x + r.w + edge));
  const bounds = { x: minX, y: edge, w: canvas.width - edge - minX, h: canvas.height - 2 * edge };
  const inX = (x) => clamp(x, bounds.x, Math.max(bounds.x, bounds.x + bounds.w - w));
  const above = piece.y - h - gap;
  const below = piece.y + piece.h + gap + 6; // deja lugar para el tirador
  const beside = clamp(piece.y, edge, canvas.height - h - edge);
  const xs = [piece.x + piece.w / 2 - w / 2, piece.x, piece.x + piece.w - w];
  const candidates = [
    ...xs.map((x) => ({ side: 'above', x: inX(x), y: above, w, h })),
    ...xs.map((x) => ({ side: 'below', x: inX(x), y: below, w, h })),
    { side: 'left', x: sheet.x - w - gap, y: beside, w, h },
    { side: 'right', x: sheet.x + sheet.w + gap, y: beside, w, h },
  ];
  // Lo que se ve de las otras piezas de la hoja (la hoja recorta lo que se sale)
  // y el encabezado de la hoja (con su botón para quitarla).
  const head = page.page.firstChild.getBoundingClientRect();
  const covers = itemsOn(item.sheet)
    .filter((other) => other.id !== item.id)
    .map((other) => clip(onCanvas(other), sheet))
    .filter(Boolean)
    .concat({ x: head.left - canvas.left, y: head.top - canvas.top, w: head.width, h: head.height });
  // Si no entra en ningún lado, encima de la pieza, dentro del lienzo.
  const spot = pickSpot(candidates, { bounds, covers, blocked: panels }) ?? {
    side: 'over',
    x: inX(xs[0]),
    y: clamp(above, edge, canvas.height - h - edge),
  };
  bar.style.transform = `translate(${Math.round(spot.x)}px, ${Math.round(spot.y)}px)`;
  bar.dataset.side = spot.side;
}

// ---------- Scroll: hoja actual y visibilidad ----------

let scrollFrame = 0;

function onScroll() {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    if (gesture?.moved) return;
    if (state.selected === null) {
      const id = visibleSheet();
      if (id !== null) setViewSheet(id);
    } else {
      const item = findItem(state.selected);
      if (item) placePiecebar(item);
    }
  });
}

/** Cambia la hoja actual de la vista (sin pieza seleccionada) y la marca. */
function setViewSheet(id) {
  if (view.sheet === id || sheetIndex(id) < 0) return;
  view.sheet = id;
  markCurrent();
  handlers.currentChanged?.();
}

function markCurrent() {
  const current = currentSheet();
  ui.sheets.toggleAttribute('data-many', state.sheets.length > 1);
  for (const [id, p] of pages) p.page.classList.toggle('is-current', id === current);
}

/** La hoja que más se ve en el lienzo ahora (id), o null. */
export function visibleSheet() {
  const [, H] = sheetSize();
  const top = ui.stage.scrollTop - ui.sheets.offsetTop;
  const bottom = top + ui.stage.clientHeight;
  let best = null;
  let most = -Infinity;
  for (const sheet of state.sheets) {
    const box = boxes.get(sheet.id);
    if (!box) continue;
    const seen = Math.min(bottom, box.top + H * zoom) - Math.max(top, box.top);
    if (seen > most + 0.5) {
      best = sheet.id;
      most = seen;
    }
  }
  return best;
}

// Lleva el scroll para que el rango [top, bottom] (en coordenadas de #sheets) se vea.
function scrollToRange(top, bottom) {
  const margin = 16;
  const offset = ui.sheets.offsetTop;
  const viewTop = ui.stage.scrollTop;
  const viewBottom = viewTop + ui.stage.clientHeight;
  const a = offset + top - margin;
  const b = offset + bottom + margin;
  if (a < viewTop) ui.stage.scrollTop = a;
  else if (b > viewBottom) ui.stage.scrollTop = Math.min(a, b - ui.stage.clientHeight);
}

/** Muestra la pieza si quedó fuera de la vista (con teclado, al agregar, al moverla de hoja…). */
export function revealPiece(id) {
  const item = findItem(id);
  const box = item && boxes.get(item.sheet);
  if (!box) return;
  const [, h] = dims(item);
  scrollToRange(box.top + item.y * zoom, box.top + (item.y + h) * zoom);
}

/** Muestra la hoja (con su encabezado). */
export function revealSheet(id) {
  const p = pages.get(id);
  const box = boxes.get(id);
  if (!p || !box) return;
  const [, H] = sheetSize();
  scrollToRange(box.top - p.page.firstChild.offsetHeight, box.top + H * zoom);
}

// ---------- Gestos con el puntero ----------

function onPointerDown(e) {
  if (state.busy || e.button !== 0) return;
  if (e.target.closest('.dropzone, .page-head, .sheets-foot')) return;
  const onHandle = !!e.target.closest('.handle');
  const node = onHandle ? nodes.get(state.selected) : e.target.closest('.piece');
  if (!node) {
    const page = e.target.closest('.page');
    return handlers.background(page ? Number(page.dataset.sheet) : null);
  }
  const item = findItem(Number(node.dataset.id));
  if (!item) return;
  e.preventDefault(); // evita selección de texto (y por eso el foco se mueve a mano)
  if (isTyping(document.activeElement)) document.activeElement.blur();
  handlers.select(item.id);
  node.focus({ preventScroll: true });
  // La captura va en #sheets, que no se mueve: la pieza puede cambiar de hoja.
  try {
    ui.sheets.setPointerCapture(e.pointerId);
  } catch {
    // Puntero que ya no está activo (o evento sintético): el gesto sigue sin captura.
  }
  measureBoxes();
  gesture = {
    item,
    node,
    pointerId: e.pointerId,
    resize: onHandle,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    scroll0: ui.stage.scrollTop,
    size: dims(item),
    others: new Map(), // id de hoja → rectángulos de las otras piezas de esa hoja
    // Sin superposición, el tirador frena al tocar a otra pieza.
    growth: onHandle && !settings.allowOverlap ? maxGrowth(rectOf(item), othersOn(item.sheet, item), 'top-left') : Infinity,
    draft: { ...item },
    moved: false,
    blocked: false,
    target: item.sheet,
  };
}

function othersOn(sheetId, item) {
  return itemsOn(sheetId)
    .filter((other) => other !== item)
    .map(rectOf);
}

function cachedOthers(g, sheetId) {
  if (!g.others.has(sheetId)) g.others.set(sheetId, othersOn(sheetId, g.item));
  return g.others.get(sheetId);
}

function onPointerMove(e) {
  const g = gesture;
  if (!g || e.pointerId !== g.pointerId) return;
  g.lastX = e.clientX;
  g.lastY = e.clientY;
  updateGesture();
}

function updateGesture() {
  const g = gesture;
  const px = g.lastX - g.startX;
  const py = g.lastY - g.startY;
  if (!g.moved && Math.hypot(px, py) < DRAG_THRESHOLD) return;
  if (!g.moved) {
    ui.canvas.classList.add('is-dragging');
    // Para moverla entre hojas, la pieza viaja en una capa sin recorte.
    if (!g.resize) place(ui.dragLayer, g.node, null);
    startAutoScroll();
  }
  g.moved = true;
  const dy = py + (ui.stage.scrollTop - g.scroll0);
  if (g.resize) {
    // Proyección del arrastre sobre la diagonal: escala proporcional.
    const [w, h] = g.size;
    const factor = ((w + px / zoom) * w + (h + dy / zoom) * h) / (w * w + h * h);
    let scale = clamp(round1(g.item.scale * factor), 1, 1000);
    if (scale > g.item.scale && Number.isFinite(g.growth)) {
      // Hacia abajo a 0,1 % para no pasarse del contacto.
      scale = Math.min(scale, Math.max(g.item.scale, Math.floor(g.item.scale * g.growth * 10) / 10));
    }
    g.draft.scale = scale;
    updatePiece(g.node, g.draft);
  } else {
    // Dónde queda la pieza en #sheets y a qué hoja pertenece (la que contiene su centro).
    const [, H] = sheetSize();
    const start = boxes.get(g.item.sheet);
    const ax = start.left + g.item.x * zoom + px;
    const ay = start.top + g.item.y * zoom + dy;
    const [w, h] = g.size;
    const tops = state.sheets.map((s) => boxes.get(s.id).top);
    const target = state.sheets[sheetAt(ay + (h * zoom) / 2, tops, H * zoom)].id;
    const box = boxes.get(target);
    // Imán: al múltiplo más cercano de la grilla, que nace en la esquina de la hoja.
    const step = settings.grid.size;
    const snap = settings.grid.snap ? (v) => tidy(Math.round(v / step) * step) : (v) => v;
    g.draft.x = snap((ax - box.left) / zoom);
    g.draft.y = snap((ay - box.top) / zoom);
    g.draft.sheet = target;
    if (target !== g.target) {
      pages.get(g.target)?.page.classList.remove('is-drop-target');
      g.target = target;
    }
    pages.get(target).page.classList.toggle('is-drop-target', target !== g.item.sheet);
    // Movimiento libre, pero se marca cuando soltar ahí no valdría.
    const blocked = !settings.allowOverlap && overlapsAny({ x: g.draft.x, y: g.draft.y, w, h }, cachedOthers(g, target));
    if (blocked !== g.blocked) {
      g.blocked = blocked;
      g.node.classList.toggle('is-blocked', blocked);
      ui.frame.classList.toggle('is-blocked', blocked);
    }
    updatePiece(g.node, g.draft, box);
  }
  renderSelection(g.draft);
  handlers.preview?.(g.draft);
}

// Mientras se arrastra cerca del borde de arriba o de abajo del lienzo, se hace
// scroll (para llevar una pieza a una hoja que no se ve).
let autoFrame = 0;

function startAutoScroll() {
  cancelAnimationFrame(autoFrame);
  const tick = () => {
    const g = gesture;
    if (!g?.moved) return;
    const r = ui.stage.getBoundingClientRect();
    const zone = 48;
    const speed = (d) => Math.ceil(((zone - d) / zone) * 18);
    let delta = 0;
    if (g.lastY < r.top + zone) delta = -speed(Math.max(0, g.lastY - r.top));
    else if (g.lastY > r.bottom - zone) delta = speed(Math.max(0, r.bottom - g.lastY));
    if (delta) {
      const before = ui.stage.scrollTop;
      ui.stage.scrollTop += delta;
      if (ui.stage.scrollTop !== before) updateGesture();
    }
    autoFrame = requestAnimationFrame(tick);
  };
  autoFrame = requestAnimationFrame(tick);
}

function onPointerUp(e) {
  const g = gesture;
  if (!g || e.pointerId !== g.pointerId) return;
  gesture = null;
  cancelAnimationFrame(autoFrame);
  ui.canvas.classList.remove('is-dragging');
  g.node.classList.remove('is-blocked');
  ui.frame.classList.remove('is-blocked');
  pages.get(g.target)?.page.classList.remove('is-drop-target');
  let result = null;
  let sheetChanged = false;
  if (g.moved && e.type === 'pointerup' && findItem(g.item.id) === g.item) {
    let { x, y } = g.draft;
    const sheet = g.draft.sheet;
    if (g.blocked) {
      // Soltada sobre otra: al lugar libre más cercano de esa hoja; si no hay uno cerca, vuelve.
      const rect = rectOf(g.draft);
      const spot = nearestFree(rect, cachedOthers(g, sheet), { maxDistance: Math.max(rect.w, rect.h, 15) });
      animateNext();
      if (spot) {
        x = tidy(spot.x);
        y = tidy(spot.y);
        result = 'moved-aside';
      } else {
        result = 'reverted';
      }
    }
    const changed = x !== g.item.x || y !== g.item.y || g.draft.scale !== g.item.scale || sheet !== g.item.sheet;
    if (result !== 'reverted' && changed) {
      commit();
      sheetChanged = sheet !== g.item.sheet;
      g.item.x = x;
      g.item.y = y;
      g.item.scale = g.draft.scale;
      g.item.sheet = sheet;
    }
  }
  const hadFocus = document.activeElement === g.node || document.activeElement === document.body;
  handlers.commitGesture(result, { sheetChanged, item: g.item });
  // Si el navegador le quitó el foco al moverla de capa, vuelve.
  if (hadFocus && g.node.isConnected && document.activeElement !== g.node) g.node.focus({ preventScroll: true });
}
