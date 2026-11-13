// Panel «Piezas»: zona para agregar y lista de piezas (listbox de selección
// única, con foco itinerante: una sola parada de Tab y flechas para recorrer).
// La selección de la lista y la de la hoja son la misma.

import { state, assets, dims, settings } from './store.js';
import { problemsById } from './notice.js';
import { printResolution } from './layout.js';
import { icon } from './icons.js';
import { $ } from './util.js';
import { t } from './copy/index.js';

// Distintivos de cada fila (el texto está en pieces.badges.<key>).
const BADGES = [
  { key: 'cut', icon: 'scissors' },
  { key: 'pastMargin', icon: 'square-dashed' },
  { key: 'overlap', icon: 'layers' },
  { key: 'lowRes', icon: 'triangle-alert' },
];

const rows = new Map(); // id → <li role="option">
let ui = {};
let handlers = {};

/**
 * `select(id)`: selecciona (sin mover el foco). `toSheet()`: foco a la pieza en
 * la hoja. `remove()`: quita la seleccionada (la selección pasa a la vecina).
 */
export function initPieceList(h) {
  handlers = h;
  ui = { list: $('piece-list'), empty: $('list-empty'), total: $('piece-total'), dockCount: $('dock-count') };
  ui.list.addEventListener('click', (e) => {
    const row = e.target.closest('[role="option"]');
    if (!row) return;
    handlers.select(Number(row.dataset.id));
    row.focus();
  });
  // Enfocar una fila la selecciona (como en la hoja).
  ui.list.addEventListener('focusin', (e) => {
    const row = e.target.closest('[role="option"]');
    if (row) handlers.select(Number(row.dataset.id));
  });
  ui.list.addEventListener('keydown', onKeyDown);
}

function onKeyDown(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const options = [...ui.list.querySelectorAll('[role="option"]')];
  const i = options.indexOf(document.activeElement);
  if (i < 0) return;
  const move = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: options.length - 1, PageDown: i + 8, PageUp: i - 8 }[e.key];
  if (move !== undefined) {
    e.preventDefault();
    e.stopPropagation();
    options[Math.max(0, Math.min(options.length - 1, move))].focus();
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
  return rows.get(state.selected) ?? ui.list.querySelector('[role="option"]');
}

/** Enfoca la fila seleccionada (o la primera). Devuelve false si la lista está vacía. */
export function focusList() {
  const row = listFocusTarget();
  if (!row) return false;
  row.focus();
  return true;
}

function createRow(item) {
  const row = document.createElement('li');
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
  const selected = item.id === state.selected;
  row.setAttribute('aria-selected', String(selected));
  const img = row.querySelector('img');
  if (img.getAttribute('src') !== asset.url) img.src = asset.url;
  img.style.transform = item.r ? `rotate(${item.r}deg)` : '';
  const paged = asset.kind === 'pdf' && asset.pdf?.numPages > 1;
  const name = row.querySelector('.row-name');
  if (name.textContent !== asset.name) name.textContent = asset.name;
  row.dataset.tip = asset.name;
  const size = t(paged ? 'pieces.rowSizePage' : 'pieces.rowSize', { size: t('units.size', { w, h }), page: asset.page });
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
  let prev = null;
  for (const item of state.items) {
    let row = rows.get(item.id);
    if (!row) {
      row = createRow(item);
      rows.set(item.id, row);
    }
    updateRow(row, item, problems.get(item.id));
    const expected = prev ? prev.nextSibling : ui.list.firstChild;
    if (expected !== row) ui.list.insertBefore(row, expected);
    prev = row;
  }
  // Foco itinerante: una sola fila en el orden de tabulación (la seleccionada o la primera).
  const current = rows.get(state.selected) ?? rows.get(state.items[0]?.id);
  for (const [, row] of rows) row.tabIndex = row === current ? 0 : -1;
  const active = rows.get(state.selected);
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
