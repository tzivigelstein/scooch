// What the content pages are written with: the app's own names for its
// buttons, papers and photo sizes (from src/copy, so a renamed button renames
// it in the guides too), measures written like the app writes them, links
// that open the editor set up, and numbers and drawings computed with the
// real packer (core/capacity.js): no number on a page is typed by hand.

import { APP_NAME, MAX_ITEMS } from '../config.ts';
import { sheetCapacity, type SheetCapacity } from '../core/capacity.js';
import { photoSize } from '../core/crop.js';
import { deepLinkSearch, type DeepLinkRequest } from '../core/deeplink.js';
import { getPaper, sizeOf } from '../core/papers.js';
import type { PaperId } from '../core/types.ts';
import { formatNumber, t, type CopyKey } from '../copy/index.ts';
import { sheetSvg } from './drawing.ts';
import { esc, tableHtml } from './html.ts';

export { APP_NAME as app, MAX_ITEMS };

const NBSP = ' ';

/** An interface text of the app («Acomodar», «Rellenar con copias»). */
export const ui = (key: CopyKey) => t(key);
/** A number as the app writes it: decimal comma, at most one decimal. */
export const num = (v: number) => formatNumber(v);
export const mm = (v: number) => `${num(v)}${NBSP}mm`;
export const size = (w: number, h: number, unit = 'mm') => `${num(w)}${NBSP}×${NBSP}${num(h)}${NBSP}${unit}`;
export const paperName = (id: PaperId) => t(`papers.names.${id}` as CopyKey);
export const photoName = (id: string) => t(`crop.names.${id}` as CopyKey);

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

/**
 * A figure: a sheet with as many copies of `piece` as fit, with its caption.
 * `fill`: where «Rellenar con copias» puts them; otherwise where «Acomodar» does.
 */
export function sheetFigure(piece: { w: number; h: number }, layout: Layout, caption: string, { fill = false } = {}) {
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
