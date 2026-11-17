// What the content pages are written with. The same in every language: the
// real packer (core/capacity.js) for every count and drawing, the links that
// open the editor set up, and the HTML blocks. In each language (createKit):
// the app's own names for its buttons, papers and photo sizes (from
// src/copy, so a renamed button renames it in the guides too), and numbers
// and measures written as that language writes them. No number on a page is
// typed by hand: the packer works it out and the kit writes it.

import { APP_NAME, MAX_ITEMS } from '../config.ts';
import { sheetCapacity, type SheetCapacity } from '../core/capacity.js';
import { photoSize } from '../core/crop.js';
import { deepLinkSearch, type DeepLinkRequest } from '../core/deeplink.js';
import { getPaper, sizeOf } from '../core/papers.js';
import type { PaperId } from '../core/types.ts';
import { CATALOGUES } from '../copy/all.ts';
import { textsFor, type CopyKey, type CopyParams } from '../copy/index.ts';
import { sheetSvg } from './drawing.ts';
import { esc, tableHtml } from './html.ts';
import type { Lang } from './langs.ts';

export { APP_NAME as app, MAX_ITEMS };

const NBSP = ' ';

/** The words a language writes after a measure's numbers («mm», «pulgadas», «in»). */
export interface Units {
  mm: string;
  cm: string;
  in: string;
}

export type Unit = keyof Units;

/** One millimetre in each unit. */
const MM: Readonly<Record<Unit, number>> = { mm: 1, cm: 10, in: 25.4 };

/** What a page writes in its language: names from the app's texts, numbers and measures. */
export interface Kit {
  lang: Lang;
  /** An interface text of the app («Acomodar», «Rellenar con copias»). */
  ui: (key: CopyKey, params?: CopyParams) => string;
  /** A number as the app writes it in this language (at most one decimal, never grouped: «1189»). */
  num: (v: number) => string;
  /** A length in mm, with a space that doesn't break. */
  mm: (v: number) => string;
  /** «101,6 × 152,4 mm», «2 × 2 pulgadas»: the numbers in `unit`, as written. */
  size: (w: number, h: number, unit?: Unit) => string;
  paperName: (id: PaperId) => string;
  /** A photo size's name; `turned`, with its sides the other way round («15 × 10»). */
  photoName: (id: string, options?: { turned?: boolean }) => string;
  /** A list for a sentence: «1, 2 y 3». */
  list: (items: readonly string[]) => string;
}

/** Marks a fact in probe mode (createKit): «⟦n:3⟧», «⟦size:101.6×152.4⟧», «⟦photo:10x15⟧». */
export const PROBE = /⟦[^⟦⟧]*⟧/g;

const round = (v: number) => Math.round(v * 100) / 100 || 0;

/** «10 × 15» → «15 × 10»: the two numbers around the multiplication sign swap places. */
const turnName = (name: string) => name.replace(/(\d+(?:[.,]\d+)?)(\s*×\s*)(\d+(?:[.,]\d+)?)/u, '$3$2$1');

/**
 * The kit of one language. `probe`: instead of the text, each number,
 * measure, paper and photo name is a mark that says which fact it is
 * («⟦mm:5⟧»), and each interface name without parameters says its key: the
 * tests compare the facts a page uses in every language, and find numbers
 * typed by hand (tests/site/languages.test.ts).
 */
export function createKit({ lang, units }: { lang: Lang; units: Units }, { probe = false } = {}): Kit {
  const catalogue = CATALOGUES[lang];
  const texts = textsFor(catalogue);
  const numbers = new Intl.NumberFormat(catalogue.meta.numberLocale, { maximumFractionDigits: 1, useGrouping: false, numberingSystem: 'latn' });
  const num = (v: number) => numbers.format(Math.round(v * 10) / 10 || 0);
  const ui = (key: CopyKey, params?: CopyParams) => texts.t(key, params);
  const paperName = (id: PaperId) => ui(`papers.names.${id}` as CopyKey);
  const photoName = (id: string, { turned = false } = {}) => {
    const name = ui(`crop.names.${id}` as CopyKey);
    return turned ? turnName(name) : name;
  };
  const size = (w: number, h: number, unit: Unit = 'mm') => `${num(w)}${NBSP}×${NBSP}${num(h)}${NBSP}${units[unit]}`;
  const list = (items: readonly string[]) => texts.formatList(items);
  if (!probe) return { lang, ui, num, mm: (v) => `${num(v)}${NBSP}${units.mm}`, size, paperName, photoName, list };
  return {
    lang,
    ui: (key, params) => (params ? ui(key, params) : `⟦ui:${key}⟧`),
    num: (v) => `⟦n:${Math.round(v * 10) / 10 || 0}⟧`,
    mm: (v) => `⟦mm:${round(v)}⟧`,
    size: (w, h, unit = 'mm') => `⟦size:${round(w * MM[unit])}×${round(h * MM[unit])}⟧`,
    paperName: (id) => `⟦paper:${id}⟧`,
    photoName: (id, { turned = false } = {}) => `⟦photo:${id}${turned ? ':turned' : ''}⟧`,
    list,
  };
}

export function photo(id: string) {
  const found = photoSize(id);
  if (!found) throw new Error(`No photo size «${id}» in src/core/crop.js`);
  return found;
}

export function paper(id: PaperId) {
  const found = getPaper(id);
  if (!found) throw new Error(`No paper «${id}» in src/core/papers.js`);
  return found;
}

/** The editor's address with a deep link (core/deeplink.js) that sets this up. */
export const editorHref = (request: DeepLinkRequest) => `/${deepLinkSearch(request)}`;

export interface Layout {
  paper: PaperId;
  landscape?: boolean;
  margin: number;
  gap: number;
  rotate?: boolean;
}

// Packing takes tens of milliseconds: each answer is worked out once per build
// (or per dev server), however many pages show it.
const answers = new Map<string, SheetCapacity>();

/** How many copies of `piece` fit on one sheet laid out like this, and where they go. */
export function capacity(piece: { w: number; h: number }, { paper: id, landscape = false, margin, gap, rotate = true }: Layout): SheetCapacity {
  const key = [piece.w, piece.h, id, landscape, margin, gap, rotate].join('|');
  let answer = answers.get(key);
  if (!answer) {
    const sheet = sizeOf(id, landscape)!;
    answer = sheetCapacity(piece, { aw: sheet.w - 2 * margin, ah: sheet.h - 2 * margin }, { gap, rotate, limit: MAX_ITEMS });
    answers.set(key, answer);
  }
  return answer;
}

/** A fact a sentence relies on: if the packer ever says otherwise, the build stops instead of publishing a wrong sentence. */
export function expect(actual: number, expected: number, what: string) {
  if (actual !== expected) throw new Error(`A page says ${what} is ${expected}, but the packer now says ${actual}: rewrite the sentence in every language`);
  return actual;
}

/**
 * Where «Rellenar con copias» puts the copies: its grid, centered on the
 * sheet like the editor does (in printable-area coordinates).
 */
function gridPlacements(piece: { w: number; h: number }, layout: Layout) {
  const sheet = sizeOf(layout.paper, layout.landscape)!;
  const { cols, rows, rotated } = capacity(piece, layout).grid;
  const [cw, ch] = rotated ? [piece.h, piece.w] : [piece.w, piece.h];
  const x0 = (sheet.w - (cols * cw + (cols - 1) * layout.gap)) / 2 - layout.margin;
  const y0 = (sheet.h - (rows * ch + (rows - 1) * layout.gap)) / 2 - layout.margin;
  return Array.from({ length: cols * rows }, (_, i) => ({ x: x0 + (i % cols) * (cw + layout.gap), y: y0 + Math.floor(i / cols) * (ch + layout.gap), w: cw, h: ch }));
}

/** A drawing of a sheet with copies: what it shows is the same in every language, only its caption changes. */
export interface Figure {
  piece: { w: number; h: number };
  layout: Layout;
  /** Where «Rellenar con copias» puts them; otherwise where «Acomodar» does. */
  fill?: boolean;
}

/** A figure: a sheet with as many copies of the piece as fit, with its caption. */
export function sheetFigure({ piece, layout, fill = false }: Figure, caption: string) {
  const sheet = sizeOf(layout.paper, layout.landscape)!;
  const placements = fill ? gridPlacements(piece, layout) : capacity(piece, layout).placements;
  const svg = sheetSvg({ w: sheet.w, h: sheet.h, margin: layout.margin, placements, label: caption });
  return `<figure class="sheet-figure">${svg}<figcaption>${esc(caption)}</figcaption></figure>`;
}

export interface Column {
  head: string;
  /** Right-aligned numbers. */
  num?: boolean;
}

/** A table with a header row and each row's name first (see tableHtml); cells are HTML. The caption says what the numbers assume. */
export function table(columns: readonly Column[], rows: readonly (readonly string[])[], caption: string) {
  return tableHtml(columns.map((c) => ({ ...c, head: esc(c.head) })), rows, { caption, rowHeads: true });
}

/** Steps, numbered. */
export const steps = (items: readonly string[]) => `<ol class="steps">${items.map((item) => `<li>${item}</li>`).join('')}</ol>`;

/** A paragraph of each text. */
export const paragraphs = (...items: string[]) => items.map((item) => `<p>${item}</p>`).join('');

/** A highlighted note (requirements, caveats). */
export const note = (html: string) => `<p class="note">${html}</p>`;

/** A link to another page of the site. */
export const link = (href: string, text: string) => `<a href="${esc(href)}">${text}</a>`;
