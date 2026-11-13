// Medidas para mostrar en la unidad elegida en «Preferencias» (mm, cm o in).
// El modelo es siempre mm: aquí solo se formatea (units.js hace la cuenta).

import { formatLength, stepLabel } from './core/units.js';
import { describe } from './core/papers.js';
import { state, settings } from './store.js';
import { slug } from './util.js';
import { t, numberLocale } from './copy/index.ts';

const locale = () => numberLocale;

/** Símbolo de la unidad elegida: «mm», «cm», «in». */
export const unitSymbol = () => t(`units.${settings.unit}`);

/** Nombre de la unidad para lectores de pantalla: «milímetros». */
export const unitName = () => t(`units.names.${settings.unit}`);

/** Solo el número, para un campo: «10,5». */
export const lengthValue = (mm) => formatLength(mm, settings.unit, { locale: locale(), withUnit: false });

/** Número y unidad: «10,5 mm». */
export const lengthText = (mm) => t('units.length', { value: lengthValue(mm), unit: unitSymbol() });

/** Medidas de un rectángulo: «210 × 297 mm». */
export const sizeText = (w, h) => t('units.size', { w: lengthValue(w), h: lengthValue(h), unit: unitSymbol() });

/** Pasos de las flechas para la ayuda: {fine, normal, coarse} → «0,1 mm», «1/16 in». */
export function stepTexts() {
  const text = (size) => t('units.length', { value: stepLabel(settings.unit, size, { locale: locale() }), unit: unitSymbol() });
  return { fine: text('fine'), normal: text('normal'), coarse: text('coarse') };
}

// ---------- Nombres del papel ----------

const presetName = (id) => t(`papers.names.${id}`);

/**
 * Nombre corto del papel, sin orientación: «A4», «Carta»; un personalizado con
 * las medidas de un preset se llama como el preset y si no, «Personalizado».
 */
export function paperTitle() {
  const info = describe(state.paper, state.landscape);
  if (!info) return presetName('A4');
  return info.match ? presetName(info.match) : t('papers.custom');
}

/**
 * Papel y orientación para una frase: «A4», «A4 horizontal»; un personalizado
 * sin preset que coincida, por sus medidas: «216 × 330 mm».
 */
export function paperName() {
  const info = describe(state.paper, state.landscape);
  if (info && !info.match) return sizeText(info.w, info.h);
  const name = paperTitle();
  return state.landscape ? t('sheet.landscapeName', { paper: name }) : name;
}

/** Para el nombre del archivo: «a4», «carta»; un personalizado, «216x330mm». */
export function paperSlug() {
  const info = describe(state.paper, state.landscape);
  if (info && !info.match) return `${Math.round(info.w)}x${Math.round(info.h)}mm`;
  return slug(paperTitle(), 'hoja');
}
