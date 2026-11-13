// Las hojas en pantalla, una debajo de otra (como páginas): tamaño (zoom),
// piezas, marco de selección con su tirador (uno por hoja con varias
// elegidas), barra de la pieza, hoja actual y gestos con el puntero: mover y
// escalar una pieza o el grupo (también de una hoja a otra) y elegir con un
// recuadro.
//
// Rendimiento: render solo toca lo que cambió (cada nodo recuerda con qué se
// dibujó); durante un arrastre se mueven únicamente las piezas arrastradas y
// los marcos, y el scroll solo reubica la barra y marca la hoja actual.

import { DRAG_THRESHOLD, NARROW_QUERY } from './config.js';
import {
  state,
  settings,
  assets,
  view,
  sheetSize,
  dims,
  findItem,
  commit,
  itemsOn,
  currentSheet,
  sheetIndex,
  isSelected,
  selectedItems,
  primaryItem,
} from './store.js';
import { overlapsAny, nearestFree, maxGrowth } from './collide.js';
import { bounds, scaleGroup } from './align.js';
import { touchedBy } from './group.js';
import { sheetAt, keepCenterInside } from './sheets.js';
import { paperTitle, sizeText, lengthText } from './measure.js';
import { icon } from './icons.js';
import { $, clamp, round1, tidy, isTyping } from './util.js';
import { t } from './copy/index.js';
import { pickSpot, clip } from './placement.js';
import { cssParams } from './crop.js';

const nodes = new Map(); // id de pieza → nodo
const pages = new Map(); // id de hoja → {page, label, remove, box, sheet, grid, safe, hint}
const groupFrames = new Map(); // id de hoja → {frame, handle}: marcos de la selección múltiple
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
 * `handlers.select(id)`: selecciona solo esa (sin mover el foco).
 * `handlers.focusPiece(id)`: se enfocó una pieza (la selección la sigue si no está fijada).
 * `handlers.toggle(id)`: Shift o Ctrl + clic; devuelve si quedó elegida.
 * `handlers.makePrimary(id)`: la pieza (ya elegida) pasa a ser la principal.
 * `handlers.selectArea(ids, additive)`: lo que tocó el recuadro.
 * `handlers.background(sheetId)`: click en una hoja vacía o alrededor (null).
 * `handlers.commitGesture(result, {sheetChanged, item, group})`: después de mover/escalar.
 * `handlers.preview(drafts)`: durante el gesto, con copias de las piezas (valores en vivo).
 * `handlers.planDrag`, `dropGroup`, `groupScaleBounds`, `applyGroupScale`: el grupo (groupactions.js).
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
    marquee: document.createElement('div'),
  };
  ui.marquee.className = 'marquee';
  ui.marquee.hidden = true;
  ui.marquee.setAttribute('aria-hidden', 'true');
  ui.sheets.append(ui.marquee);
  ui.stage.addEventListener('pointerdown', onPointerDown);
  ui.stage.addEventListener('pointermove', onPointerMove);
  ui.stage.addEventListener('pointerup', onPointerUp);
  ui.stage.addEventListener('pointercancel', onPointerUp);
  ui.stage.addEventListener('scroll', onScroll, { passive: true });
  // Enfocar una pieza la selecciona (salvo que la selección esté fijada);
  // enfocar algo de una hoja la vuelve la actual.
  ui.sheets.addEventListener('focusin', (e) => {
    const node = e.target.closest('.piece');
    if (node) return handlers.focusPiece(Number(node.dataset.id));
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
  // Contenedor (la pieza, que recorta) e imagen entera adentro, girada: crop.cssParams.
  const p = cssParams(item, asset, zoom);
  const left = (offset?.left ?? 0) + p.left;
  const top = (offset?.top ?? 0) + p.top;
  const crop = item.crop ? `${item.crop.x},${item.crop.y},${item.crop.w},${item.crop.h}` : '';
  const selected = isSelected(item.id);
  const grouped = selected && state.selection.length > 1;
  // Con varias elegidas (o la selección fijada), el nombre dice si está elegida.
  const marked = selected && (grouped || view.pinned);
  const key = `${left}|${top}|${w}|${h}|${zoom}|${item.r}|${crop}|${asset.url}|${selected}|${grouped}|${marked}|${settings.unit}|${asset.name}|${asset.page}`;
  if (node.dataset.key === key) return;
  node.dataset.key = key;
  node.classList.toggle('is-selected', selected);
  node.classList.toggle('is-grouped', grouped);
  const label = pieceLabel(item) + (marked ? t('piece.a11ySelected') : '');
  if (node.getAttribute('aria-label') !== label) node.setAttribute('aria-label', label);
  Object.assign(node.style, { left: `${left}px`, top: `${top}px`, width: `${p.width}px`, height: `${p.height}px` });
  const img = node.firstChild;
  if (img.getAttribute('src') !== asset.url) img.src = asset.url;
  Object.assign(img.style, { width: `${p.img.width}px`, height: `${p.img.height}px`, transform: p.img.transform });
}

/** Rectángulo de una pieza en su hoja, con su id. */
export function rectOf(item) {
  const [w, h] = dims(item);
  return { id: item.id, x: item.x, y: item.y, w, h };
}

// ---------- Selección: marcos, tirador y barra de la pieza ----------

/**
 * Lo que marca la selección: con una pieza, su marco (#frame); con varias, un
 * marco alrededor de las elegidas de cada hoja, cada uno con su tirador. La
 * barra va junto a la pieza o junto al marco de la hoja de la principal.
 * `drafts`: Map id → copia de la pieza durante un gesto (valores en vivo).
 */
function renderSelection(drafts = null) {
  const list = drafts ? [...drafts.values()] : selectedItems();
  const group = list.length > 1;
  const single = !group ? list[0] : null;
  const box = single && boxes.get(single.sheet);
  ui.frame.hidden = !box;
  if (box) {
    const [w, h] = dims(single);
    Object.assign(ui.frame.style, {
      left: `${box.left + single.x * zoom}px`,
      top: `${box.top + single.y * zoom}px`,
      width: `${w * zoom}px`,
      height: `${h * zoom}px`,
    });
  }
  const bySheet = group ? groupBoxes(list) : new Map();
  for (const [id, f] of groupFrames) {
    if (bySheet.has(id) && pages.has(id)) continue;
    f.frame.remove();
    groupFrames.delete(id);
  }
  for (const [sheetId, b] of bySheet) {
    const offset = boxes.get(sheetId);
    if (!offset) continue;
    Object.assign(frameFor(sheetId).frame.style, {
      left: `${offset.left + b.x * zoom}px`,
      top: `${offset.top + b.y * zoom}px`,
      width: `${b.w * zoom}px`,
      height: `${b.h * zoom}px`,
    });
  }
  const target = selectionTarget(list, bySheet);
  ui.piecebar.hidden = !target;
  if (!target) return;
  ui.pieceSize.textContent = group ? t('pieces.count', { n: list.length }) : sizeText(target.w, target.h);
  if (!gesture?.moved) placePiecebar(target);
}

/** Caja de las elegidas de cada hoja (en mm, en su hoja): Map hoja → {x, y, w, h}. */
function groupBoxes(list) {
  const bySheet = new Map();
  for (const item of list) {
    if (!bySheet.has(item.sheet)) bySheet.set(item.sheet, []);
    bySheet.get(item.sheet).push(rectOf(item));
  }
  return new Map([...bySheet].map(([id, rects]) => [id, bounds(rects)]));
}

function frameFor(sheetId) {
  let f = groupFrames.get(sheetId);
  if (!f) {
    const frame = document.createElement('div');
    frame.className = 'group-frame';
    frame.setAttribute('aria-hidden', 'true');
    const handle = document.createElement('span');
    handle.className = 'handle';
    handle.dataset.sheet = sheetId;
    frame.append(handle);
    ui.sheets.insertBefore(frame, ui.frame);
    f = { frame, handle };
    groupFrames.set(sheetId, f);
  }
  return f;
}

/**
 * Dónde va la barra: {sheet, x, y, w, h, ids} con la pieza elegida o, con
 * varias, la caja de las elegidas en la hoja de la principal. null sin selección.
 */
function selectionTarget(list = selectedItems(), bySheet = list.length > 1 ? groupBoxes(list) : null) {
  if (!list.length) return null;
  const primaryId = state.selection.at(-1);
  const primary = list.find((item) => item.id === primaryId) ?? list.at(-1);
  if (!boxes.get(primary.sheet)) return null;
  const rect = list.length > 1 ? bySheet.get(primary.sheet) : rectOf(primary);
  return { sheet: primary.sheet, x: rect.x, y: rect.y, w: rect.w, h: rect.h, ids: new Set(list.map((item) => item.id)) };
}

/**
 * Barra de la pieza. En pantallas angostas va anclada abajo, encima de los botones
 * «Piezas» y «Propiedades» (lo resuelve el CSS). Si no, prueba arriba, abajo (centrada
 * o alineada con un borde de la pieza) y fuera de la hoja a cada costado, y se queda
 * con la posición que tapa menos piezas; a igualdad, en ese orden. Nunca sale del
 * lienzo ni queda debajo de un panel abierto encima del lienzo. Si la pieza quedó
 * fuera de la vista (por el scroll), la barra se oculta hasta que vuelva.
 */
function placePiecebar(target) {
  const bar = ui.piecebar;
  if (ui.narrow.matches) {
    bar.style.transform = '';
    bar.dataset.side = 'docked';
    bar.classList.remove('is-offscreen');
    return;
  }
  const page = pages.get(target.sheet);
  if (!page) return;
  const canvas = ui.canvas.getBoundingClientRect();
  const stage = ui.stage.getBoundingClientRect();
  const box = page.box.getBoundingClientRect();
  const sheet = { x: box.left - canvas.left, y: box.top - canvas.top, w: box.width, h: box.height };
  const onCanvas = (r) => ({ x: sheet.x + r.x * zoom, y: sheet.y + r.y * zoom, w: r.w * zoom, h: r.h * zoom });
  const piece = onCanvas(target);
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
  const covers = itemsOn(target.sheet)
    .filter((other) => !target.ids.has(other.id))
    .map((other) => clip(onCanvas(rectOf(other)), sheet))
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
  // El lienzo nunca se corre a los costados (algo que sobresale de las hojas,
  // como el marco de una pieza que se sale, no tiene que descentrarlas).
  if (ui.stage.scrollLeft) ui.stage.scrollLeft = 0;
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    if (gesture?.moved) return;
    const target = selectionTarget();
    if (!target) {
      const id = visibleSheet();
      if (id !== null) setViewSheet(id);
    } else placePiecebar(target);
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
//
// Sobre una pieza: la elige y la arrastra (si ya estaba entre varias
// elegidas, arrastra el grupo; un clic sin mover deja elegida solo esa). Con
// Shift o Ctrl/Cmd, la agrega o la quita. Sobre un tirador: escala la pieza o
// el grupo. En un lugar vacío: recuadro para elegir (un clic, sin arrastrar,
// anula la selección).

function capture(e) {
  // La captura va en #sheets, que no se mueve: las piezas pueden cambiar de hoja.
  try {
    ui.sheets.setPointerCapture(e.pointerId);
  } catch {
    // Puntero que ya no está activo (o evento sintético): el gesto sigue sin captura.
  }
}

const pointer = (e) => ({ pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, scroll0: ui.stage.scrollTop });

function onPointerDown(e) {
  if (state.busy || e.button !== 0) return;
  if (e.target.closest('.dropzone, .page-head, .sheets-foot')) return;
  const additive = e.shiftKey || e.ctrlKey || e.metaKey;
  const handle = e.target.closest('.handle');
  if (handle) return startResize(e, handle);
  const node = e.target.closest('.piece');
  if (!node) return startMarquee(e, additive);
  const item = findItem(Number(node.dataset.id));
  if (!item) return;
  e.preventDefault(); // evita selección de texto (y por eso el foco se mueve a mano)
  if (isTyping(document.activeElement)) document.activeElement.blur();
  let collapse = false;
  if (additive) {
    if (!handlers.toggle(item.id)) return node.focus({ preventScroll: true });
  } else if (isSelected(item.id) && state.selection.length > 1) {
    collapse = true;
    handlers.makePrimary(item.id);
  } else {
    handlers.select(item.id);
  }
  node.focus({ preventScroll: true });
  capture(e);
  measureBoxes();
  if (state.selection.length > 1) return startGroupMove(e, item, collapse);
  gesture = {
    kind: 'move',
    item,
    node,
    ...pointer(e),
    size: dims(item),
    others: new Map(), // id de hoja → rectángulos de las otras piezas de esa hoja
    draft: { ...item },
    moved: false,
    blocked: false,
    target: item.sheet,
  };
}

function startResize(e, handle) {
  e.preventDefault();
  if (isTyping(document.activeElement)) document.activeElement.blur();
  measureBoxes();
  if (state.selection.length > 1) {
    const sheet = Number(handle.dataset.sheet);
    const items = selectedItems();
    const frame = groupBoxes(items).get(sheet);
    if (!frame) return;
    capture(e);
    pieceNode(state.selection.at(-1))?.focus({ preventScroll: true });
    gesture = {
      kind: 'group-resize',
      ...pointer(e),
      frame,
      items,
      // Factores posibles: límites de escala, centros en la hoja y, sin superposición, sin pisar a otras.
      range: handlers.groupScaleBounds('top-left'),
      drafts: new Map(items.map((item) => [item.id, { ...item }])),
      k: 1,
      moved: false,
    };
    return;
  }
  const item = primaryItem();
  const node = item && nodes.get(item.id);
  if (!node) return;
  node.focus({ preventScroll: true });
  capture(e);
  gesture = {
    kind: 'resize',
    item,
    node,
    ...pointer(e),
    size: dims(item),
    // Sin superposición, el tirador frena al tocar a otra pieza.
    growth: !settings.allowOverlap ? maxGrowth(rectOf(item), othersOn(item.sheet, item), 'top-left') : Infinity,
    draft: { ...item },
    moved: false,
  };
}

function startGroupMove(e, item, collapse) {
  const items = selectedItems();
  const sheets = new Set(items.map((other) => other.sheet));
  gesture = {
    kind: 'group-move',
    item,
    items,
    ...pointer(e),
    collapse,
    // En una sola hoja, el grupo puede pasar a otra; en varias, cada parte queda en la suya.
    oneSheet: sheets.size === 1 ? item.sheet : null,
    box: bounds(items.map(rectOf)),
    drafts: new Map(items.map((other) => [other.id, { ...other }])),
    drag: null,
    moved: false,
    blocked: false,
    target: item.sheet,
  };
}

function startMarquee(e, additive) {
  const page = e.target.closest('.page');
  capture(e);
  measureBoxes();
  const origin = toSheets(e.clientX, e.clientY);
  gesture = { kind: 'marquee', ...pointer(e), origin, additive, sheetId: page ? Number(page.dataset.sheet) : null, touched: [], moved: false };
}

// De coordenadas de la ventana a las de #sheets (las de los marcos y la capa de arrastre).
function toSheets(clientX, clientY) {
  const r = ui.sheets.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
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
  const first = !g.moved;
  g.moved = true;
  if (g.kind === 'marquee') return updateMarquee(g, first);
  if (first) {
    ui.canvas.classList.add('is-dragging');
    // Para moverlas entre hojas, las piezas viajan en una capa sin recorte.
    if (g.kind === 'move') place(ui.dragLayer, g.node, null);
    if (g.kind === 'group-move') for (const item of g.items) place(ui.dragLayer, nodes.get(item.id), null);
    startAutoScroll();
  }
  const dy = py + (ui.stage.scrollTop - g.scroll0);
  if (g.kind === 'resize') updateResize(g, px, dy);
  else if (g.kind === 'move') updateMove(g, px, dy);
  else if (g.kind === 'group-resize') updateGroupResize(g, px, dy);
  else updateGroupMove(g, px, dy);
}

function updateResize(g, px, dy) {
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
  renderSelection(new Map([[g.item.id, g.draft]]));
  handlers.preview?.([g.draft]);
}

function updateMove(g, px, dy) {
  // Dónde queda la pieza en #sheets y a qué hoja pertenece (la que contiene su centro).
  const [W, H] = sheetSize();
  const start = boxes.get(g.item.sheet);
  const ax = start.left + g.item.x * zoom + px;
  const ay = start.top + g.item.y * zoom + dy;
  const [w, h] = g.size;
  const target = sheetUnder(ay + (h * zoom) / 2);
  const box = boxes.get(target);
  // Imán: al múltiplo más cercano de la grilla, que nace en la esquina de la hoja.
  // Puede salirse de la hoja, pero no más de la mitad (el centro queda adentro).
  const step = settings.grid.size;
  const snap = settings.grid.snap ? (v) => tidy(Math.round(v / step) * step) : (v) => v;
  const spot = keepCenterInside({ x: snap((ax - box.left) / zoom), y: snap((ay - box.top) / zoom), w, h }, W, H);
  g.draft.x = spot.x;
  g.draft.y = spot.y;
  g.draft.sheet = target;
  markTarget(g, target);
  // Movimiento libre, pero se marca cuando soltar ahí no valdría.
  setBlocked(g, !settings.allowOverlap && overlapsAny({ x: g.draft.x, y: g.draft.y, w, h }, cachedOthers(g, target)), [g.node]);
  updatePiece(g.node, g.draft, box);
  renderSelection(new Map([[g.item.id, g.draft]]));
  handlers.preview?.([g.draft]);
}

function updateGroupMove(g, px, dy) {
  let target = null;
  let offsetY = 0;
  if (g.oneSheet !== null) {
    // La hoja que contiene el centro de la caja del grupo.
    const start = boxes.get(g.oneSheet);
    target = sheetUnder(start.top + (g.box.y + g.box.h / 2) * zoom + dy);
    offsetY = (start.top - boxes.get(target).top) / zoom;
    markTarget(g, target);
  }
  g.drag = handlers.planDrag(px / zoom, dy / zoom, target, offsetY);
  g.dropTarget = target;
  const { plan } = g.drag;
  for (const item of g.items) {
    const draft = g.drafts.get(item.id);
    const r = plan.rects.get(item.id);
    draft.x = r.x;
    draft.y = r.y;
    draft.sheet = target ?? item.sheet;
    updatePiece(nodes.get(item.id), draft, boxes.get(draft.sheet));
  }
  setBlocked(g, !plan.ok, g.items.map((item) => nodes.get(item.id)));
  renderSelection(g.drafts);
  handlers.preview?.([...g.drafts.values()]);
}

function updateGroupResize(g, px, dy) {
  const { w, h } = g.frame;
  const wanted = ((w + px / zoom) * w + (h + dy / zoom) * h) / (w * w + h * h);
  const k = g.range.min <= g.range.max ? Math.min(Math.max(wanted, g.range.min), g.range.max) : 1;
  g.k = k;
  // Cada parte desde la esquina superior izquierda de su caja, en su hoja.
  const bySheet = new Map();
  for (const item of g.items) {
    if (!bySheet.has(item.sheet)) bySheet.set(item.sheet, []);
    bySheet.get(item.sheet).push(item);
  }
  for (const list of bySheet.values()) {
    const scaled = scaleGroup(list.map(rectOf), k, 'top-left').rects;
    list.forEach((item, i) => {
      const draft = g.drafts.get(item.id);
      draft.scale = item.scale * k;
      draft.x = scaled[i].x;
      draft.y = scaled[i].y;
      updatePiece(nodes.get(item.id), draft);
    });
  }
  renderSelection(g.drafts);
  handlers.preview?.([...g.drafts.values()]);
}

function updateMarquee(g, first) {
  if (first) {
    ui.marquee.hidden = false;
    startAutoScroll();
  }
  const now = toSheets(g.lastX, g.lastY);
  const area = { x: Math.min(g.origin.x, now.x), y: Math.min(g.origin.y, now.y), w: Math.abs(now.x - g.origin.x), h: Math.abs(now.y - g.origin.y) };
  Object.assign(ui.marquee.style, { left: `${area.x}px`, top: `${area.y}px`, width: `${area.w}px`, height: `${area.h}px` });
  const placed = state.items
    .filter((item) => boxes.has(item.sheet))
    .map((item) => {
      const r = rectOf(item);
      const box = boxes.get(item.sheet);
      return { id: item.id, x: box.left + r.x * zoom, y: box.top + r.y * zoom, w: r.w * zoom, h: r.h * zoom };
    });
  g.touched = touchedBy(area, placed);
  const marked = new Set(g.touched);
  for (const [id, node] of nodes) node.classList.toggle('is-marked', marked.has(id));
}

// La hoja que contiene la altura `y` (en #sheets) o la más cercana.
function sheetUnder(y) {
  const [, H] = sheetSize();
  const tops = state.sheets.map((s) => boxes.get(s.id).top);
  return state.sheets[sheetAt(y, tops, H * zoom)].id;
}

function markTarget(g, target) {
  if (target !== g.target) {
    pages.get(g.target)?.page.classList.remove('is-drop-target');
    g.target = target;
  }
  const origin = g.oneSheet ?? g.item?.sheet;
  pages.get(target)?.page.classList.toggle('is-drop-target', target !== origin);
}

function setBlocked(g, blocked, pieceNodes) {
  if (blocked === g.blocked) return;
  g.blocked = blocked;
  for (const node of pieceNodes) node?.classList.toggle('is-blocked', blocked);
  ui.frame.classList.toggle('is-blocked', blocked);
  for (const f of groupFrames.values()) f.frame.classList.toggle('is-blocked', blocked);
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
  ui.frame.classList.remove('is-blocked');
  for (const f of groupFrames.values()) f.frame.classList.remove('is-blocked');
  pages.get(g.target)?.page.classList.remove('is-drop-target');
  const done = e.type === 'pointerup';
  if (g.kind === 'marquee') return endMarquee(g, done);
  if (g.kind === 'group-move' || g.kind === 'group-resize') return endGroupGesture(g, done);
  g.node.classList.remove('is-blocked');
  let result = null;
  let sheetChanged = false;
  if (g.moved && done && findItem(g.item.id) === g.item) {
    let { x, y } = g.draft;
    const sheet = g.draft.sheet ?? g.item.sheet;
    if (g.blocked) {
      // Soltada sobre otra: al lugar libre más cercano de esa hoja (también con el
      // centro adentro); si no hay uno cerca, vuelve.
      const rect = rectOf(g.draft);
      const [W, H] = sheetSize();
      const bounds = { x: -rect.w / 2, y: -rect.h / 2, w: W + rect.w, h: H + rect.h };
      const spot = nearestFree(rect, cachedOthers(g, sheet), { maxDistance: Math.max(rect.w, rect.h, 15), bounds });
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

function endGroupGesture(g, done) {
  const focused = pieceNode(state.selection.at(-1));
  const hadFocus = !!focused && (document.activeElement === focused || document.activeElement === document.body);
  for (const item of g.items) nodes.get(item.id)?.classList.remove('is-blocked');
  let result = null;
  let sheetChanged = false;
  const alive = g.items.every((item) => findItem(item.id) === item);
  if (!g.moved) {
    // Clic sin arrastrar sobre una de varias elegidas: queda elegida solo esa.
    if (g.collapse && done) return handlers.select(g.item.id);
  } else if (done && alive && g.kind === 'group-move' && g.drag) {
    const before = g.item.sheet;
    if (!g.drag.plan.ok) animateNext();
    result = handlers.dropGroup(g.drag, g.dropTarget ?? null);
    sheetChanged = result !== 'reverted' && result !== null && g.item.sheet !== before;
  } else if (done && alive && g.kind === 'group-resize' && Math.abs(g.k - 1) > 1e-9) {
    result = handlers.applyGroupScale(g.k) ? 'scaled' : null;
  }
  handlers.commitGesture(result, { sheetChanged, item: g.item, group: true });
  if (hadFocus && focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
}

function endMarquee(g, done) {
  ui.marquee.hidden = true;
  for (const node of nodes.values()) node.classList.remove('is-marked');
  if (!done) return;
  if (g.moved) return handlers.selectArea(g.touched, g.additive);
  if (!g.additive) handlers.background(g.sheetId);
}
