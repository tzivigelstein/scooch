// Avisos: una píldora flotante abajo al centro que solo aparece cuando hay
// algo que decir. Los resultados de una acción se van solos (se pausan con
// el puntero o el foco encima, y se pueden cerrar); los problemas vigentes
// quedan mientras existan. Todo se anuncia en las regiones vivas.

import { state, settings, status, area, render, boxOf } from './store.js';
import { pieceProblems, problemSummary } from './core/sheets.js';
import { announce, cancelAnnounce } from './live.js';
import { icon } from './icons.js';
import { $ } from './util.js';
import { t, asSentence, formatList } from './copy/index.ts';

const INFO_MS = 5000;
const WARN_MS = 9000;

let ui = {};
let currentAction = null;
let signature = '';
let arrangeAction = () => {};

// Cierre automático de los resultados de acciones.
let timedFlash = null;
let timer = 0;
let remaining = 0;
let startedAt = 0;
let hovering = false;
let focusInside = false;

export function initNotice({ onArrange }) {
  ui = { pill: $('pill'), icon: $('pill-icon'), text: $('pill-text'), action: $('pill-action'), close: $('pill-close') };
  arrangeAction = onArrange;
  ui.action.addEventListener('click', () => currentAction?.run());
  ui.close.addEventListener('click', () => dismiss());
  ui.pill.addEventListener('pointerenter', () => ((hovering = true), pause()));
  ui.pill.addEventListener('pointerleave', () => ((hovering = false), resume()));
  ui.pill.addEventListener('focusin', () => ((focusInside = true), pause()));
  ui.pill.addEventListener('focusout', (e) => {
    if (ui.pill.contains(e.relatedTarget)) return;
    focusInside = false;
    resume();
  });
}

/** Aviso de resultado de una acción: queda hasta la próxima acción o hasta que se va solo. */
export function say(text, options = {}) {
  status.flash = { text, ...options };
  render();
}

function pause() {
  if (!timer) return;
  clearTimeout(timer);
  timer = 0;
  remaining -= performance.now() - startedAt;
}

function resume() {
  if (!timedFlash || timer || hovering || focusInside) return;
  startedAt = performance.now();
  timer = setTimeout(expire, Math.max(1200, remaining));
}

function startTimer(flash, ms) {
  clearTimeout(timer);
  timer = 0;
  timedFlash = flash;
  remaining = ms;
  resume();
}

function stopTimer() {
  clearTimeout(timer);
  timer = 0;
  timedFlash = null;
}

function expire() {
  timer = 0;
  if (status.flash && status.flash === timedFlash) dismiss();
  timedFlash = null;
}

/** Cierra el aviso de resultado (lo que quede, p. ej. un problema vigente, se sigue mostrando). */
function dismiss() {
  stopTimer();
  status.flash = null;
  render();
}

/** Problemas de cada pieza en su hoja: {cut, pastMargin, overlap} por id. */
export function problemsById() {
  const { W, H, m } = area();
  return pieceProblems(state.items.map(boxOf), { W, H, margin: m });
}

/** Cuántas piezas tienen cada problema y en qué hojas (índices). */
export function sheetProblems() {
  return problemSummary(
    problemsById(),
    state.items.map(boxOf),
    state.sheets.map((sheet) => sheet.id)
  );
}

// Con varias hojas, el aviso dice en cuáles: «Hoja 2: …», «Hojas 1 y 3: …».
function inSheets(text, sheets) {
  if (state.sheets.length < 2) return text;
  return t('notices.inSheets', { n: sheets.length, list: formatList(sheets.map((i) => i + 1)), text });
}

/** Qué aviso corresponde ahora, en orden de prioridad (null: nada que decir). */
function currentNotice() {
  if (state.busy) return status.busyText ? { text: status.busyText, busy: true } : null;
  if (status.flash) return { ...status.flash, flash: true };
  if (!state.items.length) return null;
  const { cut, pastMargin, overlap } = sheetProblems();
  if (cut.count) {
    return { text: inSheets(t('notices.cut', { n: cut.count }), cut.sheets), warn: true };
  }
  if (pastMargin.count) {
    return { text: inSheets(t('notices.pastMargin', { n: pastMargin.count }), pastMargin.sheets), warn: true };
  }
  if (overlap.count && !settings.allowOverlap) {
    const text = state.sheets.length > 1 ? inSheets(t('notices.overlapIn'), overlap.sheets) : t('notices.overlap');
    return { text, action: { label: t('bar.arrange'), run: arrangeAction } };
  }
  return null;
}

export function renderNotice() {
  const notice = currentNotice();
  const { text = '', warn = false, action = null, busy = false, flash = false } = notice ?? {};
  const next = notice ? [text, warn, action?.label, busy, flash].join('|') : '';
  currentAction = action;
  if (next === signature) return;
  signature = next;

  ui.pill.hidden = !notice;
  if (!notice) {
    // Si un problema se resolvió antes de anunciarse, ya no se anuncia.
    cancelAnnounce('notice');
    return stopTimer();
  }
  ui.pill.dataset.tone = warn ? 'warning' : busy ? 'busy' : 'info';
  ui.icon.innerHTML = icon(warn ? 'triangle-alert' : busy ? 'loader-circle' : 'circle-check', 'icon pill-glyph');
  ui.text.textContent = text;
  ui.action.hidden = !action;
  ui.action.textContent = action ? action.label : '';
  ui.close.hidden = !flash;

  // Los resultados sin botón se van solos; con botón (o marcados `persist`, como el
  // consejo de impresión) quedan hasta la próxima acción o hasta cerrarlos.
  if (flash && !action && !status.flash.persist) startTimer(status.flash, warn ? WARN_MS : INFO_MS);
  else stopTimer();

  // Los resultados de una acción se anuncian enseguida (los warnings, con
  // prioridad); los problemas que aparecen solos (p. ej. al mover una pieza),
  // con demora para no repetir cada paso.
  const spoken = action && !busy ? t('notices.withAction', { text: asSentence(text), action: action.label }) : text;
  if (flash) announce(spoken, { assertive: warn, key: 'notice' });
  else announce(spoken, { key: 'notice', delay: busy ? 250 : 900 });
}
