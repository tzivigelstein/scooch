// Panel «Piezas»: zona para agregar y lista de piezas (listbox de selección
// múltiple, con foco itinerante: una sola parada de Tab y flechas para
// recorrer). Las flechas eligen la pieza enfocada; con Shift extienden la
// selección desde la última elegida (como Shift+clic); con Ctrl/Cmd solo
// mueven el foco, y Ctrl+Espacio (o Shift+Espacio) agrega o quita la enfocada
// (como Ctrl/Cmd+clic). Con varias hojas, las piezas se agrupan por hoja
// (role="group" con su encabezado y contador); las flechas pasan de un grupo
// al siguiente. La selección de la lista y la de la hoja son la misma.

import { state, assets, dims, settings, isSelected } from './store.js';
import { rangeBetween } from './core/group.js';
import { problemsById } from './notice.js';
import { printResolution } from './layout.js';
import { icon } from './icons.js';
import { sizeText } from './measure.js';
import { $ } from './util.js';
import { t } from './copy/index.ts';

// Distintivos de cada fila (el texto está en pieces.badges.<key>).
const BADGES = [
  { key: 'cut', icon: 'scissors' },
  { key: 'pastMargin', icon: 'square-dashed' },
  { key: 'overlap', icon: 'layers' },
  { key: 'lowRes', icon: 'triangle-alert' },
];

const rows = new Map(); // id de pieza → <div role="option">
const groups = new Map(); // id de hoja → {group, head, title, count, items}
let ui = {};
let handlers = {};
let anchor = null; // desde dónde se extiende la selección con Shift (la última elegida a mano)
let focusMode = null; // qué hace el próximo foco de una fila: 'replace', 'extend', 'move' o null

/**
 * `select(id)`: elige solo esa (sin mover el foco). `toggle(id)`: la agrega o
 * la quita. `setRange(ids, primary)`: elige esas (la principal, al final).
 * `focusPiece(id)`: se enfocó una fila (como enfocar la pieza en la hoja).
 * `toSheet()`: foco a la pieza en la hoja. `remove()`: quita las elegidas.
 */
export function initPieceList(h) {
  handlers = h;
  ui = { list: $('piece-list'), empty: $('list-empty'), total: $('piece-total'), dockCount: $('dock-count') };
  // El foco lo pone el clic (después de decidir qué elegir): si llegara antes, en
  // el mousedown, elegiría solo esa y Shift o Ctrl + clic no podrían sumar.
  ui.list.addEventListener('mousedown', (e) => {
    if (e.target.closest('[role="option"]')) e.preventDefault();
  });
  ui.list.addEventListener('click', (e) => {
    const row = e.target.closest('[role="option"]');
    if (!row) return;
    const id = Number(row.dataset.id);
    focusMode = 'move';
    if (e.shiftKey) extendTo(id);
    else if (e.ctrlKey || e.metaKey) toggle(id);
    else {
      anchor = id;
      handlers.select(id);
    }
    row.focus();
    focusMode = null;
  });
  ui.list.addEventListener('focusin', (e) => {
    const row = e.target.closest('[role="option"]');
    if (!row) return;
    const id = Number(row.dataset.id);
    const mode = focusMode;
    focusMode = null;
    if (mode === 'move') return;
    if (mode === 'extend') return extendTo(id);
    if (mode === 'replace') {
      anchor = id;
      return handlers.select(id);
    }
    // Con Tab o al volver a la lista: como enfocar la pieza en la hoja.
    handlers.focusPiece(id);
  });
  ui.list.addEventListener('keydown', onKeyDown);
}

const order = () => [...ui.list.querySelectorAll('[role="option"]')].map((row) => Number(row.dataset.id));

function extendTo(id) {
  const from = anchor !== null && rows.has(anchor) ? anchor : (state.selection.at(-1) ?? id);
  const ids = rangeBetween(order(), from, id);
  handlers.setRange(ids, id);
}

function toggle(id) {
  anchor = id;
  handlers.toggle(id);
}

function onKeyDown(e) {
  if (e.altKey) return;
  const options = [...ui.list.querySelectorAll('[role="option"]')];
  const i = options.indexOf(document.activeElement);
  if (i < 0) return;
  const mod = e.ctrlKey || e.metaKey;
  const move = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: options.length - 1, PageDown: i + 8, PageUp: i - 8 }[e.key];
  if (move !== undefined) {
    e.preventDefault();
    e.stopPropagation();
    const target = options[Math.max(0, Math.min(options.length - 1, move))];
    if (target === document.activeElement) return;
    focusMode = e.shiftKey ? 'extend' : mod ? 'move' : 'replace';
    target.focus();
    focusMode = null;
  } else if (e.key === ' ' && (mod || e.shiftKey)) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) toggle(Number(document.activeElement.dataset.id));
  } else if (mod) {
    return;
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
    handlers.toSheet();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) handlers.remove();
  }
}

/** La fila a enfocar (la seleccionada o la primera); null si la lista está vacía. */
export function listFocusTarget() {
  if (ui.list.hidden) return null;
  return rows.get(state.selection.at(-1)) ?? ui.list.querySelector('[role="option"]');
}

/** Enfoca la fila seleccionada (o la primera). Devuelve false si la lista está vacía. */
export function focusList() {
  const row = listFocusTarget();
  if (!row) return false;
  row.focus();
  return true;
}

function createRow(item) {
  const row = document.createElement('div');
  row.setAttribute('role', 'option');
  row.className = 'piece-row';
  row.dataset.id = item.id;
  row.innerHTML =
    '<span class="thumb"><img alt="" draggable="false"></span>' +
    '<span class="row-text"><span class="row-name"></span><span class="row-dims"></span></span>' +
    '<span class="row-badges"></span>';
  return row;
}

function updateRow(row, item, problems = {}) {
  const asset = assets.get(item.asset);
  const [w, h] = dims(item);
  const selected = isSelected(item.id);
  row.setAttribute('aria-selected', String(selected));
  const img = row.querySelector('img');
  if (img.getAttribute('src') !== asset.url) img.src = asset.url;
  img.style.transform = item.r ? `rotate(${item.r}deg)` : '';
  const paged = asset.kind === 'pdf' && asset.pages > 1;
  const name = row.querySelector('.row-name');
  if (name.textContent !== asset.name) name.textContent = asset.name;
  row.dataset.tip = asset.name;
  const size = t(paged ? 'pieces.rowSizePage' : 'pieces.rowSize', { size: sizeText(w, h), page: asset.page });
  const dimsEl = row.querySelector('.row-dims');
  if (dimsEl.textContent !== size) dimsEl.textContent = size;

  const res = printResolution(item);
  const flags = {
    ...problems,
    overlap: problems.overlap && !settings.allowOverlap,
    lowRes: !res.vector && res.level === 'low',
  };
  const shown = BADGES.filter((b) => flags[b.key]);
  const key = shown.map((b) => b.key).join(',');
  const badges = row.querySelector('.row-badges');
  if (badges.dataset.key !== key) {
    badges.dataset.key = key;
    badges.replaceChildren(
      ...shown.map((b) => {
        const text = t(`pieces.badges.${b.key}`);
        const badge = document.createElement('span');
        badge.className = 'row-badge';
        badge.dataset.kind = b.key;
        badge.dataset.tip = text;
        badge.innerHTML = icon(b.icon);
        const spoken = document.createElement('span');
        spoken.className = 'sr-only';
        spoken.textContent = `, ${text.toLowerCase()}`;
        badge.append(spoken);
        return badge;
      })
    );
  }
}

// Grupo de una hoja: role="group" con su encabezado y sus filas.
function createGroup(id) {
  const group = document.createElement('div');
  group.setAttribute('role', 'group');
  group.className = 'list-group';
  const head = document.createElement('div');
  head.className = 'group-head';
  head.id = `list-group-${id}`;
  head.setAttribute('role', 'presentation');
  const title = document.createElement('span');
  title.className = 'group-title';
  const count = document.createElement('span');
  count.className = 'group-count';
  head.append(title, count);
  const items = document.createElement('div');
  items.className = 'group-items';
  group.setAttribute('aria-labelledby', head.id);
  group.append(head, items);
  return { group, head, title, count, items };
}

// Pone `nodes` como hijos de `container`, en ese orden, sin recrearlos.
function sync(container, nodes) {
  let prev = null;
  for (const node of nodes) {
    const expected = prev ? prev.nextSibling : container.firstChild;
    if (expected !== node) container.insertBefore(node, expected);
    prev = node;
  }
  while (prev ? prev.nextSibling : container.firstChild) (prev ? prev.nextSibling : container.firstChild).remove();
}

export function renderPieceList() {
  const n = state.items.length;
  ui.empty.hidden = n > 0;
  ui.list.hidden = n === 0;
  ui.total.textContent = t('pieces.count', { n });
  ui.dockCount.textContent = n ? String(n) : '';

  const problems = problemsById();
  const live = new Set(state.items.map((item) => item.id));
  for (const [id, row] of rows) {
    if (!live.has(id)) {
      row.remove();
      rows.delete(id);
    }
  }
  const rowOf = (item) => {
    let row = rows.get(item.id);
    if (!row) {
      row = createRow(item);
      rows.set(item.id, row);
    }
    updateRow(row, item, problems.get(item.id));
    return row;
  };

  if (state.sheets.length < 2) {
    // Una sola hoja: lista plana, como siempre.
    sync(ui.list, state.items.map(rowOf));
    groups.clear();
  } else {
    const liveSheets = new Set(state.sheets.map((sheet) => sheet.id));
    for (const id of groups.keys()) if (!liveSheets.has(id)) groups.delete(id);
    const bySheet = new Map(state.sheets.map((sheet) => [sheet.id, []]));
    for (const item of state.items) bySheet.get(item.sheet)?.push(item);
    const nodes = state.sheets.map((sheet, i) => {
      let g = groups.get(sheet.id);
      if (!g) {
        g = createGroup(sheet.id);
        groups.set(sheet.id, g);
      }
      const list = bySheet.get(sheet.id);
      const title = t('pieces.groupTitle', { i: i + 1 });
      const count = list.length ? t('pieces.count', { n: list.length }) : t('pieces.groupEmpty');
      if (g.title.textContent !== title) g.title.textContent = title;
      if (g.count.textContent !== count) g.count.textContent = count;
      sync(g.items, list.map(rowOf));
      return g.group;
    });
    sync(ui.list, nodes);
  }

  // Foco itinerante: una sola fila en el orden de tabulación (la seleccionada o la primera).
  const first = ui.list.querySelector('[role="option"]');
  const current = rows.get(state.selection.at(-1)) ?? first;
  for (const [, row] of rows) row.tabIndex = row === current ? 0 : -1;
  const active = rows.get(state.selection.at(-1));
  if (active && active !== lastScrolled) scrollIntoList(active);
  lastScrolled = active ?? null;
}

let lastScrolled = null;

// Como scrollIntoView, pero solo dentro de la lista.
function scrollIntoList(row) {
  const box = ui.list.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  if (r.top < box.top) ui.list.scrollTop -= box.top - r.top;
  else if (r.bottom > box.bottom) ui.list.scrollTop += r.bottom - box.bottom;
}
