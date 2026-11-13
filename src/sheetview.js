// La hoja en pantalla: tamaño (zoom), piezas, marco de selección con su
// tirador, posición de la barra de la pieza y gestos con el puntero.

import { DRAG_THRESHOLD } from './config.js';
import { state, settings, assets, sheetSize, dims, findItem, commit, paperName } from './store.js';
import { overlapsAny, nearestFree, maxGrowth } from './collide.js';
import { $, clamp, round1, tidy, isTyping } from './util.js';
import { t } from './copy/index.js';
import { pickSpot, clip } from './placement.js';

const nodes = new Map(); // id → nodo de la pieza
let ui = {};
let handlers = {};
let zoom = 1; // px por mm
let gesture = null;
let animTimer = 0;

export const pieceNode = (id) => nodes.get(id) ?? null;
export const isDragging = () => !!gesture?.moved;

/**
 * `handlers.select(id)`: selecciona (sin mover el foco).
 * `handlers.background()`: click en la hoja vacía o alrededor.
 * `handlers.commitGesture(result)`: después de mover/escalar con el puntero.
 * `handlers.preview(draft)`: durante el gesto, con la copia del item (valores en vivo).
 */
export function initSheetView(h) {
  handlers = h;
  ui = {
    canvas: $('canvas'),
    stage: $('stage'),
    sheetBox: $('sheet-box'),
    sheet: $('sheet'),
    safe: $('safe'),
    grid: $('grid'),
    empty: $('empty'),
    frame: $('frame'),
    handle: $('handle'),
    paperLabel: $('paper-label'),
    piecebar: $('piecebar'),
    pieceSize: $('piece-size'),
  };
  ui.stage.addEventListener('pointerdown', onPointerDown);
  ui.stage.addEventListener('pointermove', onPointerMove);
  ui.stage.addEventListener('pointerup', onPointerUp);
  ui.stage.addEventListener('pointercancel', onPointerUp);
  // Enfocar una pieza la selecciona.
  ui.sheet.addEventListener('focusin', (e) => {
    const node = e.target.closest('.piece');
    if (node) handlers.select(Number(node.dataset.id));
  });
}

/** Anima el próximo cambio de posiciones (acomodar, deshacer…). */
export function animateNext() {
  ui.sheetBox.classList.add('is-animating');
  clearTimeout(animTimer);
  animTimer = setTimeout(() => ui.sheetBox.classList.remove('is-animating'), 320);
}

export function renderSheetView() {
  const [W, H] = sheetSize();
  const style = getComputedStyle(ui.stage);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const label = ui.paperLabel.offsetHeight + parseFloat(getComputedStyle(ui.paperLabel).marginTop || 0);
  const availW = ui.stage.clientWidth - padX;
  const availH = ui.stage.clientHeight - padY - label;
  zoom = Math.max(0.05, Math.min(availW / W, availH / H));

  const n = state.items.length;
  ui.sheetBox.style.width = `${W * zoom}px`;
  ui.sheetBox.style.height = `${H * zoom}px`;
  ui.safe.style.inset = `${state.margin * zoom}px`;
  ui.safe.hidden = state.margin <= 0 || !n; // con la hoja vacía, la zona para soltar ya marca el área
  renderGrid();
  ui.empty.hidden = n > 0;
  ui.empty.disabled = state.busy;
  ui.sheet.setAttribute('aria-label', n ? t('sheet.labelCount', { paper: paperName(), n }) : t('sheet.labelEmpty', { paper: paperName() }));
  ui.paperLabel.textContent = t('sheet.paperLabel', { paper: state.paper, w: W, h: H });

  renderPieces();
  renderSelection();
}

// ---------- Grilla (solo en pantalla) ----------

let gridKey = '';

/**
 * Líneas finas cada `size` mm y más marcadas cada 5 o 10 celdas, dibujadas con
 * gradientes escalados al zoom. Si las finas quedan a menos de ~6 px se omiten.
 */
function renderGrid() {
  const { show, size } = settings.grid;
  ui.grid.hidden = !show;
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
  ui.grid.style.backgroundImage = [
    line('to right', 'var(--grid-major)'),
    line('to bottom', 'var(--grid-major)'),
    line('to right', 'var(--grid-minor)'),
    line('to bottom', 'var(--grid-minor)'),
  ].join(', ');
  ui.grid.style.backgroundSize = [major, major, minor, minor].map((v) => `${v}px ${v}px`).join(', ');
}

// ---------- Piezas ----------

/** Sincroniza los hijos de `container` con `list`, reusando nodos por id. */
function reconcile(container, anchor, list, create, update) {
  const live = new Set(list.map((item) => item.id));
  for (const [id, node] of nodes) {
    if (!live.has(id)) {
      node.remove();
      nodes.delete(id);
    }
  }
  let prev = anchor;
  for (const item of list) {
    let node = nodes.get(item.id);
    if (!node) {
      node = create(item);
      nodes.set(item.id, node);
    }
    update(node, item);
    const expected = prev ? prev.nextSibling : container.firstChild;
    if (expected !== node) container.insertBefore(node, expected);
    prev = node;
  }
}

function renderPieces() {
  reconcile(ui.sheet, ui.empty, state.items, createPiece, updatePiece);
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
  const page = asset.kind === 'pdf' && asset.pdf?.numPages > 1 ? t('piece.a11yPage', { page: asset.page }) : '';
  const turned = item.r ? t('piece.a11yTurned', { deg: item.r }) : '';
  return t('piece.a11y', { name: asset.name, page, size: t('units.size', { w, h }), x: item.x, y: item.y, turned });
}

// También se usa durante el arrastre, con una copia modificada del item.
function updatePiece(node, item) {
  const asset = assets.get(item.asset);
  const [w, h] = dims(item);
  const k = item.scale / 100;
  node.classList.toggle('is-selected', item.id === state.selected);
  const label = pieceLabel(item);
  if (node.getAttribute('aria-label') !== label) node.setAttribute('aria-label', label);
  Object.assign(node.style, {
    left: `${item.x * zoom}px`,
    top: `${item.y * zoom}px`,
    width: `${w * zoom}px`,
    height: `${h * zoom}px`,
  });
  const img = node.firstChild;
  if (img.getAttribute('src') !== asset.url) img.src = asset.url;
  Object.assign(img.style, {
    width: `${asset.w * k * zoom}px`,
    height: `${asset.h * k * zoom}px`,
    transform: `translate(-50%, -50%) rotate(${item.r}deg)`,
  });
}

// ---------- Selección: marco, tirador y barra de la pieza ----------

function renderSelection(draft = null) {
  const item = draft ?? findItem(state.selected);
  ui.frame.hidden = !item;
  ui.piecebar.hidden = !item;
  if (!item) return;
  const [w, h] = dims(item);
  Object.assign(ui.frame.style, {
    left: `${item.x * zoom}px`,
    top: `${item.y * zoom}px`,
    width: `${w * zoom}px`,
    height: `${h * zoom}px`,
  });
  ui.pieceSize.textContent = t('units.size', { w, h });
  placePiecebar(item);
}

/**
 * Barra de la pieza: prueba arriba, abajo (centrada o alineada con un borde de la
 * pieza) y fuera de la hoja a cada costado, y se queda con la posición que tapa
 * menos piezas; a igualdad, en ese orden. Nunca sale del lienzo ni queda debajo
 * de un panel abierto encima del lienzo.
 */
function placePiecebar(item) {
  const bar = ui.piecebar;
  const canvas = ui.canvas.getBoundingClientRect();
  const box = ui.sheetBox.getBoundingClientRect();
  const sheet = { x: box.left - canvas.left, y: box.top - canvas.top, w: box.width, h: box.height };
  const onCanvas = (it) => {
    const [w, h] = dims(it);
    return { x: sheet.x + it.x * zoom, y: sheet.y + it.y * zoom, w: w * zoom, h: h * zoom };
  };
  const piece = onCanvas(item);
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
  // Lo que se ve de las otras piezas (la hoja recorta lo que se sale).
  const covers = state.items
    .filter((other) => other.id !== item.id)
    .map((other) => clip(onCanvas(other), sheet))
    .filter(Boolean);
  // Si no entra en ningún lado, encima de la pieza, dentro del lienzo.
  const spot = pickSpot(candidates, { bounds, covers, blocked: panels }) ?? {
    side: 'over',
    x: inX(xs[0]),
    y: clamp(above, edge, canvas.height - h - edge),
  };
  bar.style.transform = `translate(${Math.round(spot.x)}px, ${Math.round(spot.y)}px)`;
  bar.dataset.side = spot.side;
}

// ---------- Gestos con el puntero ----------

function onPointerDown(e) {
  if (state.busy || e.button !== 0) return;
  if (e.target.closest('.dropzone')) return;
  const onHandle = !!e.target.closest('.handle');
  const node = onHandle ? nodes.get(state.selected) : e.target.closest('.piece');
  if (!node) return handlers.background();
  const item = findItem(Number(node.dataset.id));
  if (!item) return;
  e.preventDefault(); // evita selección de texto (y por eso el foco se mueve a mano)
  if (isTyping(document.activeElement)) document.activeElement.blur();
  handlers.select(item.id);
  node.focus({ preventScroll: true });
  (onHandle ? ui.handle : node).setPointerCapture(e.pointerId);
  const others = state.items.filter((other) => other !== item).map(rectOf);
  gesture = {
    item,
    node,
    others,
    pointerId: e.pointerId,
    resize: onHandle,
    startX: e.clientX,
    startY: e.clientY,
    size: dims(item),
    // Sin superposición, el tirador frena al tocar a otra pieza.
    growth: onHandle && !settings.allowOverlap ? maxGrowth(rectOf(item), others, 'top-left') : Infinity,
    draft: { ...item },
    moved: false,
    blocked: false,
  };
}

/** Rectángulo de una pieza en la hoja, con su id. */
export function rectOf(item) {
  const [w, h] = dims(item);
  return { id: item.id, x: item.x, y: item.y, w, h };
}

function onPointerMove(e) {
  const g = gesture;
  if (!g || e.pointerId !== g.pointerId) return;
  const px = e.clientX - g.startX;
  const py = e.clientY - g.startY;
  if (!g.moved && Math.hypot(px, py) < DRAG_THRESHOLD) return;
  if (!g.moved) ui.canvas.classList.add('is-dragging');
  g.moved = true;
  const dx = px / zoom;
  const dy = py / zoom;
  if (g.resize) {
    // Proyección del arrastre sobre la diagonal: escala proporcional.
    const [w, h] = g.size;
    const factor = ((w + dx) * w + (h + dy) * h) / (w * w + h * h);
    let scale = clamp(round1(g.item.scale * factor), 1, 1000);
    if (scale > g.item.scale && Number.isFinite(g.growth)) {
      // Hacia abajo a 0,1 % para no pasarse del contacto.
      scale = Math.min(scale, Math.max(g.item.scale, Math.floor(g.item.scale * g.growth * 10) / 10));
    }
    g.draft.scale = scale;
  } else {
    // Imán: al múltiplo más cercano de la grilla, que nace en la esquina de la hoja.
    const step = settings.grid.size;
    const snap = settings.grid.snap ? (v) => tidy(Math.round(v / step) * step) : (v) => v;
    g.draft.x = snap(g.item.x + dx);
    g.draft.y = snap(g.item.y + dy);
    // Movimiento libre, pero se marca cuando soltar ahí no valdría.
    const blocked = !settings.allowOverlap && overlapsAny(rectOf(g.draft), g.others);
    if (blocked !== g.blocked) {
      g.blocked = blocked;
      g.node.classList.toggle('is-blocked', blocked);
      ui.frame.classList.toggle('is-blocked', blocked);
    }
  }
  updatePiece(g.node, g.draft);
  renderSelection(g.draft);
  handlers.preview?.(g.draft);
}

function onPointerUp(e) {
  const g = gesture;
  if (!g || e.pointerId !== g.pointerId) return;
  gesture = null;
  ui.canvas.classList.remove('is-dragging');
  g.node.classList.remove('is-blocked');
  ui.frame.classList.remove('is-blocked');
  let result = null;
  if (g.moved && e.type === 'pointerup' && findItem(g.item.id) === g.item) {
    let { x, y } = g.draft;
    if (g.blocked) {
      // Soltada sobre otra: al lugar libre más cercano; si no hay uno cerca, vuelve.
      const rect = rectOf(g.draft);
      const spot = nearestFree(rect, g.others, { maxDistance: Math.max(rect.w, rect.h, 15) });
      animateNext();
      if (spot) {
        x = tidy(spot.x);
        y = tidy(spot.y);
        result = 'moved-aside';
      } else {
        result = 'reverted';
      }
    }
    if (result !== 'reverted' && (x !== g.item.x || y !== g.item.y || g.draft.scale !== g.item.scale)) {
      commit();
      g.item.x = x;
      g.item.y = y;
      g.item.scale = g.draft.scale;
    }
  }
  handlers.commitGesture(result);
}
