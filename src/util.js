// Utilidades chicas, sin estado.

export const $ = (id) => document.getElementById(id);

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round1 = (v) => Math.round(v * 10) / 10 || 0;
export const tidy = (v) => Math.round(v * 100) / 100 || 0;
/** Redondeo a 0,0001: quita el ruido de coma flotante sin desviar pasos como 1/16 in. */
export const fine = (v) => Math.round(v * 1e4) / 1e4 || 0;

/** Para inputs numéricos: «41.6» (para mostrar, t() en src/copy). */
export const num = (v) => String(round1(v));

/** Nombre de archivo seguro a partir de un texto («Mi App» → «mi-app»). */
export const slug = (text, fallback) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;

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
