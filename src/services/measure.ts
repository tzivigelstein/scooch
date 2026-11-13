// Lengths for display in the unit chosen in «Preferencias» (mm, cm or in).
// The model is always mm: this only formats (core/units.js does the math).

import { describe } from '../core/papers.js';
import { formatLength, stepLabel, type StepSize } from '../core/units.js';
import { slug } from '../core/util.ts';
import { numberLocale, t } from '../copy/index.ts';
import { getDocument } from '../state/document.ts';
import { getPrefs } from '../state/prefs.ts';

const unit = () => getPrefs().unit;

/** Symbol of the chosen unit: «mm», «cm», «in». */
export const unitSymbol = () => t(`units.${unit()}`);

/** Name of the unit for screen readers: «milímetros». */
export const unitName = () => t(`units.names.${unit()}`);

/** Just the number, for a field: «10,5». */
export const lengthValue = (mm: number) => formatLength(mm, unit(), { locale: numberLocale, withUnit: false });

/** Number and unit: «10,5 mm». */
export const lengthText = (mm: number) => t('units.length', { value: lengthValue(mm), unit: unitSymbol() });

/** Size of a rectangle: «210 × 297 mm». */
export const sizeText = (w: number, h: number) => t('units.size', { w: lengthValue(w), h: lengthValue(h), unit: unitSymbol() });

/** Arrow steps for the help texts: {fine, normal, coarse} → «0,1 mm», «1/16 in». */
export function stepTexts() {
  const text = (size: StepSize) => t('units.length', { value: stepLabel(unit(), size, { locale: numberLocale }), unit: unitSymbol() });
  return { fine: text('fine'), normal: text('normal'), coarse: text('coarse') };
}

// ---------- Paper names ----------

/**
 * Short paper name, without orientation: «A4», «Carta»; a custom paper with
 * the size of a preset is named like it, otherwise «Personalizado».
 */
export function paperTitle() {
  const { paper, landscape } = getDocument();
  const info = describe(paper, landscape);
  if (!info) return t('papers.names.A4');
  return info.match ? t(`papers.names.${info.match}`) : t('papers.custom');
}

/**
 * Paper and orientation for a sentence: «A4», «A4 horizontal»; a custom paper
 * matching no preset, by its size: «216 × 330 mm».
 */
export function paperName() {
  const { paper, landscape } = getDocument();
  const info = describe(paper, landscape);
  if (info && !info.match) return sizeText(info.w, info.h);
  const name = paperTitle();
  return landscape ? t('sheet.landscapeName', { paper: name }) : name;
}

/** For the file name: «a4», «carta»; a custom paper, «216x330mm». */
export function paperSlug() {
  const { paper, landscape } = getDocument();
  const info = describe(paper, landscape);
  if (info && !info.match) return `${Math.round(info.w)}x${Math.round(info.h)}mm`;
  return slug(paperTitle(), 'hoja');
}
