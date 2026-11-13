// Tooltips propios para los elementos con `data-tip` (y `data-kbd` para el
// atajo). Aparecen con el mouse (con una pequeña demora) y con el foco de
// teclado; se pueden recorrer con el puntero y se cierran con Esc sin mover
// el foco (WCAG 1.4.13).

import { $, clamp } from './util.js';

let tip;
let target = null;
let showTimer = 0;
let hideTimer = 0;
let shortcutFilter = () => true;
let lastPointer = -Infinity; // si el foco llega por un toque o click, no hace falta tooltip

/** `filter(el)` decide si se muestra el atajo (p. ej. si los de una tecla están apagados). */
export function initTooltips({ showShortcut } = {}) {
  tip = $('tooltip');
  if (showShortcut) shortcutFilter = showShortcut;

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest?.('[data-tip]');
    if (el === target) return cancelHide();
    if (tip.contains(e.target)) return cancelHide();
    if (!el) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => show(el), target ? 0 : 300);
  });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest?.('[data-tip]');
    const to = e.relatedTarget;
    if (el && el.contains(to)) return;
    if (!el && !tip.contains(e.target)) return;
    clearTimeout(showTimer);
    if (to && (tip.contains(to) || (target && target.contains(to)))) return;
    scheduleHide();
  });
  document.addEventListener('focusin', (e) => {
    clearTimeout(showTimer); // el foco manda sobre un hover pendiente
    const el = e.target.closest?.('[data-tip]');
    const fromPointer = performance.now() - lastPointer < 800;
    if (el && el.matches(':focus-visible') && !fromPointer) show(el);
    else if (target) hide();
  });
  document.addEventListener('focusout', () => hide());
  document.addEventListener(
    'pointerdown',
    () => {
      lastPointer = performance.now();
      hide();
    },
    true
  );
  // Con el teclado, el foco que sigue sí es «de teclado».
  document.addEventListener('keydown', () => (lastPointer = -Infinity), true);
  // Esc cierra el tooltip sin mover el foco: no deselecciona ni hace nada más.
  // En un panel o en el diálogo, Esc además hace lo suyo (volver a la pieza,
  // cerrar), y con eso el tooltip también se va.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !target) return;
      const inOverlay = e.target.closest?.('.panel, dialog') || target.closest('.panel, dialog');
      hide();
      if (inOverlay) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true
  );
  window.addEventListener('scroll', () => hide(), true);
}

function cancelHide() {
  clearTimeout(hideTimer);
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, 120);
}

export function hide() {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  if (!target) return;
  target = null;
  tip.hidden = true;
}

function show(el) {
  clearTimeout(hideTimer);
  if (!el.isConnected || el.closest('[hidden]')) return;
  target = el;
  const label = document.createElement('span');
  label.textContent = el.dataset.tip;
  const parts = [label];
  if (el.dataset.kbd && shortcutFilter(el)) {
    for (const key of el.dataset.kbd.split(' ')) {
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      parts.push(kbd);
    }
  }
  const line = document.createElement('span');
  line.className = 'tip-line';
  line.append(...parts);
  const rows = [line];
  if (el.dataset.tipNote) {
    const note = document.createElement('span');
    note.className = 'tip-note';
    note.textContent = el.dataset.tipNote;
    rows.push(note);
  }
  tip.replaceChildren(...rows);
  tip.hidden = false;
  place(el);
}

function place(el) {
  const r = el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const gap = 8;
  // Abajo si es de la barra superior o no hay lugar arriba; si no, arriba.
  const below = el.closest('.topbar') || r.top - h - gap < 4;
  const top = below ? r.bottom + gap : r.top - h - gap;
  const left = clamp(r.left + r.width / 2 - w / 2, 6, vw - w - 6);
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

/** Vuelve a dibujar el tooltip visible (p. ej. si cambió la preferencia de atajos). */
export function refreshTooltip() {
  if (target) show(target);
}
