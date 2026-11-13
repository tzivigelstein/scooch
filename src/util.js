// Utilidades chicas, sin estado.

export const $ = (id) => document.getElementById(id);

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round1 = (v) => Math.round(v * 10) / 10 || 0;
export const tidy = (v) => Math.round(v * 100) / 100 || 0;

const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
/** Para mostrar: «41,6». */
export const fmt = (v) => numberFormat.format(round1(v));
/** Para inputs numéricos: «41.6». */
export const num = (v) => String(round1(v));
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Nombre de archivo seguro a partir de un texto («Mi App» → «mi-app»). */
export const slug = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'hoja';

export const isMac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform ?? navigator.platform ?? '');
/** Etiqueta del modificador principal: ⌘ en Mac, Ctrl en el resto. */
export const MOD = isMac ? '⌘' : 'Ctrl';

export const isTyping = (el) =>
  (el?.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range'].includes(el.type)) ||
  el?.tagName === 'SELECT' ||
  el?.tagName === 'TEXTAREA' ||
  !!el?.isContentEditable;

export function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Modo privado o almacenamiento bloqueado: el ajuste dura lo que la pestaña.
  }
}
