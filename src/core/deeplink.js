// Deep links: URL parameters that open the editor with a new project already
// set up (paper, orientation, margin, gap, cut lines and their cut margin,
// Auto-rotate) and a photo size for the images added to it. Pure: parsing and
// building query strings. What applying one does is in
// state/actions/deeplink.ts; the parameters are documented in
// docs/deep-links.md.
//
// Every value is validated on its own: an unknown or unreadable one is
// ignored, a number out of range is clamped, and the rest still applies.

import { PHOTO_SIZES } from './crop.js';
import { CUT_MODES } from './cutmarks.js';
import { CUSTOM_MAX, CUSTOM_MIN, PAPERS, sizeOf } from './papers.js';
import { clamp, tidy } from './util.js';

/** The parameters a deep link reads, in the order a built link writes them. */
export const DEEP_LINK_KEYS = Object.freeze(['paper', 'orientation', 'margin', 'gap', 'photo', 'cuts', 'cutmargin', 'rotate']);

/** Margin and gap, in mm: the range of the sheet's fields. */
export const LENGTH_RANGE = Object.freeze([0, 50]);
/** A custom photo size's sides, in mm. */
export const PHOTO_RANGE = Object.freeze([5, 1000]);
/**
 * The cut margin, in mm (negative: the cut goes inside the image): the range
 * of its field, projectdoc.js CUT_LIMITS.margin (not imported: the site's
 * calculator, which loads this module, would carry projectdoc's constants).
 */
export const CUT_MARGIN_RANGE = Object.freeze([-5, 20]);

/** Names the interface (or a person typing a link) uses for some papers. */
const PAPER_ALIASES = Object.freeze({ carta: 'letter', oficio: 'legal', tabloide: 'tabloid' });
const ORIENTATIONS = Object.freeze({ portrait: false, vertical: false, landscape: true, horizontal: true });
const SWITCH = Object.freeze({ on: true, true: true, 1: true, off: false, false: false, 0: false });

const NUMBER = /^-?\d+(?:[.,]\d+)?$/;
const SIZE_MM = /^(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)mm$/;

const toNumber = (text) => Number(text.replace(',', '.'));

// Lengths are kept in hundredths of a mm (tidy): what a link can say, and what it writes back.
const lengthOf = (text, range = LENGTH_RANGE) => (NUMBER.test(text) ? tidy(clamp(toNumber(text), ...range)) : undefined);

function sizeOfText(text, range) {
  const match = SIZE_MM.exec(text);
  return match ? { w: tidy(clamp(toNumber(match[1]), ...range)), h: tidy(clamp(toNumber(match[2]), ...range)) } : null;
}

function paperOf(text) {
  const id = PAPER_ALIASES[text] ?? text;
  const preset = PAPERS.find((p) => p.id.toLowerCase() === id);
  if (preset) return { paper: preset.id };
  const size = sizeOfText(text, [CUSTOM_MIN, CUSTOM_MAX]);
  // Custom papers are stored portrait; the orientation comes from the size unless the link says it.
  return size && { paper: { custom: true, w: Math.min(size.w, size.h), h: Math.max(size.w, size.h) }, landscape: size.w > size.h };
}

function photoOf(text) {
  const preset = PHOTO_SIZES.find((size) => size.id.toLowerCase() === text);
  if (preset) return { id: preset.id, w: preset.w, h: preset.h };
  const size = sizeOfText(text, PHOTO_RANGE);
  return size && { id: null, ...size };
}

/**
 * Reads a query string («?paper=A4&margin=5»). Returns null when it has none
 * of DEEP_LINK_KEYS; otherwise {keys, settings, photo}: `keys` are the deep
 * link parameters present (valid or not), `settings` what the new project
 * takes (paper, landscape, margin, gap, cutMode, cutMargin, rotate: only the
 * valid ones) and `photo` the size for the images added to it ({id, w, h},
 * `id` null for a custom size), or null. `defaults.paper` is the paper a
 * margin is checked against when the link sets none: a margin that leaves no
 * printable area is ignored.
 */
export function parseDeepLink(search, { paper: defaultPaper = 'A4' } = {}) {
  const params = new URLSearchParams(search);
  const keys = DEEP_LINK_KEYS.filter((key) => params.has(key));
  if (!keys.length) return null;
  const value = (key) => (params.get(key) ?? '').trim().toLowerCase();
  const settings = {};

  const paper = keys.includes('paper') ? paperOf(value('paper')) : null;
  if (paper) Object.assign(settings, paper);
  const landscape = ORIENTATIONS[value('orientation')];
  if (keys.includes('orientation') && landscape !== undefined) settings.landscape = landscape;

  for (const key of ['margin', 'gap']) {
    const mm = keys.includes(key) ? lengthOf(value(key)) : undefined;
    if (mm !== undefined) settings[key] = mm;
  }
  if (settings.margin !== undefined) {
    const sheet = sizeOf(settings.paper ?? defaultPaper, false);
    if (!sheet || 2 * settings.margin >= Math.min(sheet.w, sheet.h)) delete settings.margin;
  }

  const cutMode = value('cuts');
  if (keys.includes('cuts') && CUT_MODES.includes(cutMode)) settings.cutMode = cutMode;
  // Kept with or without `cuts`: it shows once the project has cut lines.
  const cutMargin = keys.includes('cutmargin') ? lengthOf(value('cutmargin'), CUT_MARGIN_RANGE) : undefined;
  if (cutMargin !== undefined) settings.cutMargin = cutMargin;
  const rotate = SWITCH[value('rotate')];
  if (keys.includes('rotate') && rotate !== undefined) settings.rotate = rotate;

  const photo = keys.includes('photo') ? photoOf(value('photo')) : null;
  return { keys, settings, photo };
}

/** Whether a parsed link sets anything up (some of its values may have been ignored). */
export const setsUp = (link) => !!link && (Object.keys(link.settings).length > 0 || link.photo !== null);

const sizeText = ({ w, h }) => `${tidy(w)}x${tidy(h)}mm`;

/**
 * The query string («?paper=A4&margin=5») of a link that sets these up; what
 * is missing is left out. `paper`: a preset id or {custom, w, h}; `photo`: a
 * PHOTO_SIZES id or {w, h} in mm.
 */
export function deepLinkSearch({ paper, landscape, margin, gap, photo, cutMode, cutMargin, rotate } = {}) {
  const params = new URLSearchParams();
  if (typeof paper === 'string') params.set('paper', paper);
  else if (paper) params.set('paper', sizeText(paper));
  if (landscape !== undefined) params.set('orientation', landscape ? 'landscape' : 'portrait');
  if (margin !== undefined) params.set('margin', String(tidy(margin)));
  if (gap !== undefined) params.set('gap', String(tidy(gap)));
  if (typeof photo === 'string') params.set('photo', photo);
  else if (photo) params.set('photo', sizeText(photo));
  if (cutMode !== undefined) params.set('cuts', cutMode);
  if (cutMargin !== undefined) params.set('cutmargin', String(tidy(cutMargin)));
  if (rotate !== undefined) params.set('rotate', rotate ? 'on' : 'off');
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** The query string without the deep link parameters (the others stay, in their order). */
export function withoutDeepLink(search) {
  const params = new URLSearchParams(search);
  for (const key of DEEP_LINK_KEYS) params.delete(key);
  const text = params.toString();
  return text ? `?${text}` : '';
}
