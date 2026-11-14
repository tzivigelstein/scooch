// Lengths for display in the unit chosen in «Preferencias» (mm, cm or in).
// The model is always mm: this only formats (core/units.js does the math).

import { describe } from '../core/papers.js';
import type { PaperId } from '../core/types.ts';
import { formatLength, stepLabel, type StepSize } from '../core/units.js';
import { slug } from '../core/util.ts';
import { numberLocale, t } from '../copy/index.ts';
import { OUTPUT_TEXTS, outputText } from '../copy/output.ts';
import { getDocument } from '../state/document.ts';
import { getPrefs } from '../state/prefs.ts';

const unit = () => getPrefs().unit;

/** Symbol of the chosen unit: «mm», «cm», «in». */
export const unitSymbol = () => t(`units.${unit()}`);

/** Name of the unit for screen readers: «milímetros». */
export const unitName = () => t(`units.names.${unit()}`);

/** Just the number, for a field: «10,5». */
export const lengthValue = (mm: number) => formatLength(mm, unit(), { locale: numberLocale(), withUnit: false });

/** Number and unit: «10,5 mm». */
export const lengthText = (mm: number) => t('units.length', { value: lengthValue(mm), unit: unitSymbol() });

/** Size of a rectangle: «210 × 297 mm». */
export const sizeText = (w: number, h: number) => t('units.size', { w: lengthValue(w), h: lengthValue(h), unit: unitSymbol() });

/** Arrow steps for the help texts: {fine, normal, coarse} → «0,1 mm», «1/16 in». */
export function stepTexts() {
  const text = (size: StepSize) => t('units.length', { value: stepLabel(unit(), size, { locale: numberLocale() }), unit: unitSymbol() });
  return { fine: text('fine'), normal: text('normal'), coarse: text('coarse') };
}

// ---------- Paper names ----------

/** How a paper is named: on screen, in the interface's language; in the PDF and its file, always the same (copy/output.ts). */
interface PaperWords {
  name: (id: PaperId) => string;
  custom: () => string;
  landscape: (paper: string) => string;
  size: (w: number, h: number) => string;
}

const SHOWN: PaperWords = {
  name: (id) => t(`papers.names.${id}`),
  custom: () => t('papers.custom'),
  landscape: (paper) => t('sheet.landscapeName', { paper }),
  size: sizeText,
};

const writtenLength = (mm: number) => formatLength(mm, unit(), { locale: OUTPUT_TEXTS.numberLocale, withUnit: false });

const WRITTEN: PaperWords = {
  name: (id) => OUTPUT_TEXTS.papers[id],
  custom: () => OUTPUT_TEXTS.fallbackName,
  landscape: (paper) => outputText(OUTPUT_TEXTS.landscape, { paper }),
  size: (w, h) => outputText(OUTPUT_TEXTS.size, { w: writtenLength(w), h: writtenLength(h), unit: unit() }),
};

function titleIn(words: PaperWords) {
  const { paper, landscape } = getDocument();
  const info = describe(paper, landscape);
  if (!info) return words.name('A4');
  return info.match ? words.name(info.match) : words.custom();
}

function nameIn(words: PaperWords) {
  const { paper, landscape } = getDocument();
  const info = describe(paper, landscape);
  if (info && !info.match) return words.size(info.w, info.h);
  const name = titleIn(words);
  return landscape ? words.landscape(name) : name;
}

/**
 * Short paper name, without orientation: «A4», «Carta»; a custom paper with
 * the size of a preset is named like it, otherwise «Personalizado».
 */
export const paperTitle = () => titleIn(SHOWN);

/**
 * Paper and orientation for a sentence: «A4», «A4 horizontal»; a custom paper
 * matching no preset, by its size: «216 × 330 mm».
 */
export const paperName = () => nameIn(SHOWN);

/** The paper in the PDF's title, the same in every language: «A4 horizontal», «Carta», «216 × 330 mm». */
export const writtenPaperName = () => nameIn(WRITTEN);

/**
 * For the file name, the same in every language: «a4», «carta»; a custom
 * paper by its size in the chosen unit, like the PDF's title: «216x330mm»
 * (whole mm), «21,6x33cm», «8,5x13in».
 */
export function paperSlug() {
  const { paper, landscape } = getDocument();
  const info = describe(paper, landscape);
  if (info && !info.match) {
    const side = (mm: number) => (unit() === 'mm' ? String(Math.round(mm)) : writtenLength(mm));
    return `${side(info.w)}x${side(info.h)}${unit()}`;
  }
  return slug(titleIn(WRITTEN), OUTPUT_TEXTS.fallbackName);
}
