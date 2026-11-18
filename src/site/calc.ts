// The «¿Cuántas fotos caben en una hoja?» calculator: from what the form
// says to the result (count, summary, note, drawing and the editor's link).
// Pure and light: the page renders it once on the server, and the
// calculator's script (calculator.ts) again on every change, with the same
// texts (the page carries them as JSON) and the same result.

import { sheetCapacity } from '../core/capacity.js';
import { photoSize } from '../core/crop.js';
import { deepLinkSearch, LENGTH_RANGE, PHOTO_RANGE } from '../core/deeplink.js';
import { sizeOf } from '../core/papers.js';
import type { PaperId } from '../core/types.ts';
import { sheetSvg } from './drawing.ts';
import { esc, joinWords } from './html.ts';

export interface CalcState {
  paper: PaperId;
  landscape: boolean;
  /** A PHOTO_SIZES id, or 'custom' for `w` × `h`. */
  photo: string;
  w: number;
  h: number;
  margin: number;
  gap: number;
  rotate: boolean;
}

/**
 * The texts the result is written with; `{n}`-style parameters. `count` and
 * `figure` take the language's plural form for the count (Intl.PluralRules
 * of `locale`: French and Hindi say «one» for 0 too; a language with one
 * form gives both the same text).
 */
export interface CalcTexts {
  /** The language's number locale (its catalogue's meta.numberLocale). */
  locale: string;
  max: number;
  papers: Record<string, string>;
  photos: Record<string, string>;
  orientation: { portrait: string; landscape: string };
  count: { one: string; other: string; capped: string };
  photoPreset: string;
  summary: string;
  noRotate: string;
  noteNone: string;
  /** When exactly one copy fits, and when several do: not a plural form. */
  noteSame: { one: string; other: string };
  noteMore: string;
  noteCapped: string;
  figure: { one: string; other: string };
}

export interface CalcResult {
  count: number;
  capped: boolean;
  grid: number;
  countHtml: string;
  summary: string;
  note: string;
  svg: string;
  href: string;
}

const fill = (template: string, params: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
const clamp = (v: number, [lo, hi]: readonly number[]) => Math.min(hi, Math.max(lo, v));

/** The form's values made valid: lengths and sizes clamped to what a deep link accepts. */
export function validState(state: CalcState): CalcState {
  const preset = state.photo !== 'custom' && photoSize(state.photo);
  return {
    ...state,
    photo: preset ? preset.id : 'custom',
    w: clamp(state.w, PHOTO_RANGE),
    h: clamp(state.h, PHOTO_RANGE),
    margin: clamp(state.margin, LENGTH_RANGE),
    gap: clamp(state.gap, LENGTH_RANGE),
  };
}

export function calc(input: CalcState, texts: CalcTexts): CalcResult {
  const state = validState(input);
  // As the kit writes them (kit.ts): no thousands separator in a measure.
  const number = new Intl.NumberFormat(texts.locale, { maximumFractionDigits: 1, useGrouping: false, numberingSystem: 'latn' });
  const n = (v: number) => number.format(Math.round(v * 10) / 10 || 0);
  const mm = (v: number) => `${n(v)} mm`;
  const size = (w: number, h: number) => `${n(w)} × ${n(h)} mm`;

  const preset = state.photo === 'custom' ? null : photoSize(state.photo)!;
  const piece = preset ?? { w: state.w, h: state.h };
  const sheet = sizeOf(state.paper, state.landscape) ?? { w: 210, h: 297 };
  const result = sheetCapacity(piece, { aw: sheet.w - 2 * state.margin, ah: sheet.h - 2 * state.margin }, { gap: state.gap, rotate: state.rotate, limit: texts.max });

  const rules = new Intl.PluralRules(texts.locale);
  const plural = (forms: { one: string; other: string }, count: number) => (rules.select(count) === 'one' ? forms.one : forms.other);
  const photoText = preset ? fill(texts.photoPreset, { name: texts.photos[preset.id], size: size(preset.w, preset.h) }) : size(piece.w, piece.h);
  const paperText = joinWords([texts.papers[state.paper], state.landscape ? texts.orientation.landscape : texts.orientation.portrait]);
  const count = result.capped ? fill(texts.count.capped, { n: n(texts.max) }) : n(result.count);
  const countHtml = joinWords([`<strong>${esc(count)}</strong>`, esc(result.capped ? texts.count.other : plural(texts.count, result.count))]);
  const summary = fill(texts.summary, { photo: photoText, paper: paperText, margin: mm(state.margin), gap: mm(state.gap) }) + (state.rotate ? '' : texts.noRotate);

  let note = texts.noteNone;
  if (result.count > 0) {
    note = result.grid.count < result.count ? fill(texts.noteMore, { grid: n(result.grid.count), n: n(result.count) }) : fill(result.count === 1 ? texts.noteSame.one : texts.noteSame.other, { n: n(result.count) });
    if (result.capped) note = joinWords([note, fill(texts.noteCapped, { max: n(texts.max) })]);
  }

  const label = fill(plural(texts.figure, result.count), { n: count, paper: paperText });
  const svg = sheetSvg({ w: sheet.w, h: sheet.h, margin: state.margin, placements: result.placements, label });
  const href = `/${deepLinkSearch({
    paper: state.paper,
    landscape: state.landscape,
    margin: state.margin,
    gap: state.gap,
    photo: preset ? preset.id : { w: piece.w, h: piece.h },
    rotate: state.rotate,
  })}`;
  return { count: result.count, capped: result.capped, grid: result.grid.count, countHtml, summary, note, svg, href };
}
