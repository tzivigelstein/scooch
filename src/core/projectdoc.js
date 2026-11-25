// The format of a saved project's document: serializing, deserializing,
// migrating older versions and validating. No DOM, no texts.
//
// RULE: the shape of a version that has ever been written to storage is
// frozen. Any change to the format (a new field included) is a new version
// with its migration, even during development: the app is used, and deployed
// from main, while it is being worked on. tests/fixtures/documents/ keeps one
// document per version and tests/core/documents.test.js loads them all.
//
// Reading is tolerant: a missing or invalid optional setting (cut lines,
// crop, paper, margins…) takes its default and out-of-range numbers are
// clamped (repair); only what can't be interpreted (no sheets, items or
// assets, pieces pointing nowhere) makes a document damaged.
//
// Shape (version 7):
//
//   {
//     version: 7,
//     paper: 'A4' | {custom: true, w, h},   // ids of papers.js; sizes in mm
//     landscape: false,
//     margin: 10, gap: 5,                  // mm
//     rotate: true,                        // «Rotación automática»
//     allowOverlap: false,                 // «Permitir superposición» (since 5; before, a device preference)
//     cuts: {mode: 'none', length: 4, offset: 1.5,   // cut lines (cutmarks.js): mode and mm,
//                                          // mode 'none' | 'corners' | 'outline' | 'contour' (since 6)
//            weight: 'thin', color: '#000000', dash: 'solid',   // their stroke (since 3)
//            margin: 0},                          // cut margin around each image (mm, −5…20; since 4)
//     sheets: [{id: 1}, {id: 2}],          // in order; at least one
//     items: [{id, asset, sheet, x, y, scale, r, crop}],   // in stacking order;
//                                          // crop: null or a normalized {x, y, w, h} (crop.js)
//     assets: {
//       a1: {kind: 'image', name, src, px: [w, h], format: 'jpg' | 'png', dpi, w, h, derived},
//       a2: {kind: 'pdf', name, src, page, pages, pageRotation, view: [x0, y0, x1, y1], px, w, h},
//       a3: {kind: 'qr', text, color: '#000000', background: '#ffffff' | null,   // since 7: a QR code,
//            dots: 'square' | 'rounded' | 'circle', eyes: 'square' | 'rounded',  // drawn from these
//            caption: '', logo: null | {src, format: 'jpg' | 'png', px: [w, h]},  // (qrshape.js)
//            w, h},
//     },
//   }
//
// `src` identifies the original file (the pages of one PDF share it). The
// binaries go apart, under these keys (fileKeys):
//   'src:N'      the original file (image or PDF; a QR code's logo)
//   'bytes:N'    what is embedded in the PDF when it isn't the original
//                (derived: true: a JPG with an EXIF orientation, or formats
//                pdf-lib can't embed)
//   'preview:aK' the rasterized preview (so opening needs no pdf.js); a QR
//                code has none: it is drawn again from its fields
//
// A QR code (since 7) is no file: `text` is its content (a link or any text),
// `color` the code's and its caption's, `background` null when transparent,
// `caption` the short text under it (at most 40 characters; '' for none) and
// `logo` an image of the person's over its middle. `w` is the side of its
// square at 100 % (quiet zone included) and `h` that plus its caption's band.
// Its pieces are never cropped. Editing it makes another asset, like another
// PDF page: assets never change once added. Here a QR code needs its text, its
// size and, if it has a logo, a readable one (repair drops it otherwise); what
// it looks like is read where it is drawn (qrshape.cleanQr: a style it can't
// read takes its default), which keeps this module, loaded at start, small.

import { sizeOf } from './papers.js';
import { MIN_CROP, clampCrop, isIdentity } from './crop.js';
import { CUT_DASHES, CUT_MODES, CUT_WEIGHTS, isHexColor } from './cutmarks.js';
import { clamp, isRecord } from './util.js';

export const DOC_VERSION = 7;

/** Cut lines of a new document: none, and thin solid black when turned on. */
export const DEFAULT_CUTS = Object.freeze({ mode: 'none', length: 4, offset: 1.5, margin: 0, weight: 'thin', color: '#000000', dash: 'solid' });

/** The stroke documents had before it could be chosen (version 2): 0.25 pt dark gray, solid. */
export const LEGACY_CUT_STYLE = Object.freeze({ weight: 'thin', color: '#333333', dash: 'solid' });
/** The marks' length, their distance from the corner and the cut margin, in mm (inclusive). */
export const CUT_LIMITS = Object.freeze({ length: [0.5, 20], offset: [0, 10], margin: [-5, 20] });

/** A clean copy of the cut lines, with the default stroke for what is missing. */
export function cleanCuts(cuts) {
  const { mode, length, offset, margin, weight, color, dash } = { ...DEFAULT_CUTS, ...cuts };
  return { mode, length, offset, margin, weight, color, dash };
}

/** A clean copy of a crop (null when there is none or it is the whole image). */
export const cleanCrop = (crop) => (isIdentity(crop) ? null : { x: crop.x, y: crop.y, w: crop.w, h: crop.h });

/** A document that can't be opened: `code` 'corrupt' or 'newer' ('missing' in projectstore.js). */
export class ProjectError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ProjectError';
    this.code = code;
  }
}

const IMAGE_FIELDS = ['kind', 'name', 'src', 'px', 'format', 'dpi', 'w', 'h'];
const PDF_FIELDS = ['kind', 'name', 'src', 'page', 'pages', 'pageRotation', 'view', 'px', 'w', 'h'];
const QR_FIELDS = ['kind', 'text', 'color', 'background', 'dots', 'eyes', 'caption', 'logo', 'w', 'h'];

const pick = (obj, fields) => Object.fromEntries(fields.map((key) => [key, Array.isArray(obj[key]) ? [...obj[key]] : obj[key]]));

/** What a stored document keeps of an app asset (no binaries): image, PDF page or QR code fields. */
export function assetMeta(asset) {
  if (asset.kind === 'pdf') return pick(asset, PDF_FIELDS);
  if (asset.kind !== 'qr') return { ...pick(asset, IMAGE_FIELDS), derived: !!asset.derived };
  const meta = pick(asset, QR_FIELDS);
  if (meta.logo) meta.logo = pick(meta.logo, ['src', 'format', 'px']);
  return meta;
}

/** The source file an asset's binaries come from (a QR code's logo), or 0 (a QR code without one). */
export const sourceOf = (asset) => (asset.kind === 'qr' ? asset.logo?.src || 0 : asset.src);

/**
 * The document to save from the state. `assets`: Map key → asset (the app's,
 * with their binaries); only those the pieces use are included. For images,
 * `derived` says whether what is embedded isn't the original file.
 */
export function serialize({ sheets, items, paper, landscape, margin, gap, rotate, allowOverlap, cuts = DEFAULT_CUTS }, assets) {
  const used = {};
  for (const item of items) {
    if (used[item.asset]) continue;
    const asset = assets.get(item.asset);
    if (!asset) throw new ProjectError('corrupt', `missing asset ${item.asset}`);
    used[item.asset] = assetMeta(asset);
  }
  return {
    version: DOC_VERSION,
    paper: typeof paper === 'string' ? paper : { custom: true, w: paper.w, h: paper.h },
    landscape: !!landscape,
    margin,
    gap,
    rotate: rotate !== false,
    allowOverlap: allowOverlap === true,
    cuts: cleanCuts(cuts),
    sheets: sheets.map((sheet) => ({ id: sheet.id })),
    items: items.map(({ id, asset, sheet, x, y, scale, r, crop }) => ({ id, asset, sheet, x, y, scale, r, crop: cleanCrop(crop) })),
    assets: used,
  };
}

/** The keys of the binaries asset `key` needs (see above). */
export function assetFileKeys(key, asset) {
  if (asset.kind === 'qr') return asset.logo ? [`src:${asset.logo.src}`] : [];
  const keys = [`src:${asset.src}`];
  if (asset.kind === 'image' && asset.derived) keys.push(`bytes:${asset.src}`);
  keys.push(`preview:${key}`);
  return keys;
}

/** The keys of the binaries the document needs (see above), each once. */
export function fileKeys(doc) {
  return [...new Set(Object.entries(doc.assets).flatMap(([key, asset]) => assetFileKeys(key, asset)))];
}

/** How many sheets and pieces (for the projects list). */
export const counts = (doc) => ({ sheets: doc.sheets.length, pieces: doc.items.length });

/** The next free ids for pieces, sheets, assets and sources. */
export function nextIds(doc) {
  const max = (values) => values.reduce((m, v) => Math.max(m, v), 0);
  return {
    item: max(doc.items.map((item) => item.id)) + 1,
    sheet: max(doc.sheets.map((sheet) => sheet.id)) + 1,
    asset: max(Object.keys(doc.assets).map((key) => Number(key.slice(1)) || 0)) + 1,
    src: max(Object.values(doc.assets).map(sourceOf)) + 1,
  };
}

// ---------- Migration ----------

// Papers from before papers.js (stored by name instead of id).
const LEGACY_PAPERS = { Carta: 'letter', Oficio: 'legal' };

/**
 * The steps from each version to the next. Version 0 is the single-sheet one
 * (no `sheets` nor `item.sheet`, papers by name: «Carta», «Oficio»).
 * `context`: what a step needs from outside the document (see migrate).
 */
const MIGRATIONS = {
  0: (doc) => ({
    ...doc,
    version: 1,
    paper: typeof doc.paper === 'string' ? (LEGACY_PAPERS[doc.paper] ?? doc.paper) : doc.paper,
    rotate: doc.rotate ?? true,
    sheets: [{ id: 1 }],
    items: (doc.items ?? []).map((item) => ({ ...item, sheet: 1 })),
  }),
  // Version 1 had neither crops nor cut lines.
  1: (doc) => ({
    ...doc,
    version: 2,
    cuts: { mode: 'none', length: 4, offset: 1.5 },
    items: Array.isArray(doc.items) ? doc.items.map((item) => ({ ...item, crop: null })) : doc.items,
  }),
  // Version 2 had no choice of stroke: it keeps the look it printed with.
  2: (doc) => ({
    ...doc,
    version: 3,
    cuts: doc.cuts && typeof doc.cuts === 'object' ? { ...doc.cuts, ...LEGACY_CUT_STYLE } : doc.cuts,
  }),
  // Version 3 had no cut margin. (Some version 3 documents written during
  // development already have one: it stays when it is a number.)
  3: (doc) => ({
    ...doc,
    version: 4,
    cuts: doc.cuts && typeof doc.cuts === 'object' ? { ...doc.cuts, margin: isFiniteNumber(doc.cuts.margin) ? doc.cuts.margin : 0 } : doc.cuts,
  }),
  // Until version 4, «Permitir superposición» was this browser's preference,
  // the same for every project: each project takes the value it had.
  4: (doc, context) => ({ ...doc, version: 5, allowOverlap: context.allowOverlap === true }),
  // Version 6 adds the cut mode 'contour': a version 5 document is a valid version 6 one.
  5: (doc) => ({ ...doc, version: 6 }),
  // Version 7 adds QR code assets: a version 6 document is a valid version 7 one.
  6: (doc) => ({ ...doc, version: 7 }),
};

/**
 * Brings a saved document to the current version (without changing the
 * original). Throws ProjectError 'newer' when it is from a later version and
 * 'corrupt' when it isn't shaped like a document. `context.allowOverlap`:
 * the device's «Permitir superposición», which documents before version 5
 * take.
 */
export function migrate(raw, context = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ProjectError('corrupt', 'not an object');
  let doc = structuredClone(raw);
  let version = doc.version ?? 0;
  if (!Number.isInteger(version) || version < 0) throw new ProjectError('corrupt', `version ${version}`);
  if (version > DOC_VERSION) throw new ProjectError('newer', `version ${version}`);
  while (version < DOC_VERSION) {
    doc = MIGRATIONS[version](doc, context);
    version = doc.version;
  }
  return doc;
}

// ---------- Validation ----------

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isPositive = (v) => isFiniteNumber(v) && v > 0;
const isId = (v) => Number.isInteger(v) && v > 0;
const isPair = (v) => Array.isArray(v) && v.length === 2 && v.every(isPositive);

const validLogo = (logo) => isRecord(logo) && isId(logo.src) && ['jpg', 'png'].includes(logo.format) && isPair(logo.px);

function assetProblem(key, asset) {
  if (!/^a\d+$/.test(key)) return `asset key ${key}`;
  if (!asset || typeof asset !== 'object') return `asset ${key}`;
  if (asset.kind === 'qr') return typeof asset.text === 'string' && isPositive(asset.w) && isPositive(asset.h) && (!asset.logo || validLogo(asset.logo)) ? null : `QR code ${key}`;
  if (typeof asset.name !== 'string' || !isId(asset.src) || !isPair(asset.px) || !isPositive(asset.w) || !isPositive(asset.h)) {
    return `asset ${key} incomplete`;
  }
  if (asset.kind === 'image') {
    if (!['jpg', 'png'].includes(asset.format) || !isPositive(asset.dpi)) return `image ${key}`;
    return null;
  }
  if (asset.kind === 'pdf') {
    if (!isId(asset.page) || !isId(asset.pages) || asset.page > asset.pages) return `page of ${key}`;
    if (!Number.isInteger(asset.pageRotation) || asset.pageRotation % 90) return `rotation of ${key}`;
    if (!Array.isArray(asset.view) || asset.view.length !== 4 || !asset.view.every(isFiniteNumber)) return `box of ${key}`;
    return null;
  }
  return `kind of ${key}`;
}

// A crop: sides between MIN_CROP and 1 and the area inside the image (with a hair of tolerance).
function validCrop(crop) {
  if (!crop || typeof crop !== 'object' || ![crop.x, crop.y, crop.w, crop.h].every(isFiniteNumber)) return false;
  const tol = 1e-9;
  return crop.x >= -tol && crop.y >= -tol && crop.w >= MIN_CROP - tol && crop.h >= MIN_CROP - tol && crop.x + crop.w <= 1 + tol && crop.y + crop.h <= 1 + tol;
}

/**
 * The problems of a migrated document: [] when it is fine, or a list of
 * descriptions (for the log; the interface only says it is damaged).
 */
export function validate(doc) {
  const problems = [];
  if (!doc || typeof doc !== 'object') return ['not an object'];
  if (doc.version !== DOC_VERSION) problems.push(`version ${doc.version}`);
  if (!sizeOf(doc.paper, false)) problems.push('paper');
  if (typeof doc.landscape !== 'boolean') problems.push('landscape');
  for (const key of ['margin', 'gap']) {
    if (!isFiniteNumber(doc[key]) || doc[key] < 0 || doc[key] > 50) problems.push(key);
  }
  if (typeof doc.rotate !== 'boolean') problems.push('rotate');
  if (typeof doc.allowOverlap !== 'boolean') problems.push('allowOverlap');
  const cuts = doc.cuts;
  if (!cuts || typeof cuts !== 'object' || !CUT_MODES.includes(cuts.mode)) problems.push('cut lines');
  else {
    for (const key of ['length', 'offset', 'margin']) {
      const [lo, hi] = CUT_LIMITS[key];
      if (!isFiniteNumber(cuts[key]) || cuts[key] < lo || cuts[key] > hi) problems.push(`cut lines: ${key}`);
    }
    if (!Object.hasOwn(CUT_WEIGHTS, cuts.weight)) problems.push('cut lines: weight');
    if (!isHexColor(cuts.color)) problems.push('cut lines: color');
    if (!CUT_DASHES.includes(cuts.dash)) problems.push('cut lines: dash');
  }
  const sheets = Array.isArray(doc.sheets) ? doc.sheets : null;
  if (!sheets || !sheets.length) problems.push('sheets');
  const sheetIds = new Set();
  for (const sheet of sheets ?? []) {
    if (!isId(sheet?.id) || sheetIds.has(sheet.id)) problems.push(`sheet ${sheet?.id}`);
    else sheetIds.add(sheet.id);
  }
  const assets = doc.assets && typeof doc.assets === 'object' && !Array.isArray(doc.assets) ? doc.assets : null;
  if (!assets) problems.push('assets');
  for (const [key, asset] of Object.entries(assets ?? {})) {
    const problem = assetProblem(key, asset);
    if (problem) problems.push(problem);
  }
  if (!Array.isArray(doc.items)) problems.push('items');
  const itemIds = new Set();
  for (const item of Array.isArray(doc.items) ? doc.items : []) {
    const where = `item ${item?.id}`;
    if (!isId(item?.id) || itemIds.has(item.id)) problems.push(where);
    else itemIds.add(item.id);
    if (!assets || !Object.hasOwn(assets, item?.asset)) problems.push(`${where}: asset`);
    if (!sheetIds.has(item?.sheet)) problems.push(`${where}: sheet`);
    if (!isFiniteNumber(item?.x) || !isFiniteNumber(item?.y)) problems.push(`${where}: position`);
    if (!isPositive(item?.scale)) problems.push(`${where}: scale`);
    if (![0, 90, 180, 270].includes(item?.r)) problems.push(`${where}: rotation`);
    // No `crop` (or null): no crop. A QR code is never cropped.
    if (item?.crop != null && (!validCrop(item.crop) || assets?.[item.asset]?.kind === 'qr')) problems.push(`${where}: crop`);
  }
  return problems;
}

const numberOr = (v, fallback, range) => (isFiniteNumber(v) ? clamp(v, ...range) : fallback);
const LENGTH_RANGE = [0, 50];

/**
 * Fills the optional settings of a migrated document that are missing or
 * can't be read with their defaults, and clamps out-of-range numbers (a new
 * document, not the original). What the document is made of (sheets, pieces,
 * assets) is left for validate.
 */
export function repair(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc;
  const out = { ...doc };
  if (!sizeOf(out.paper, false)) out.paper = 'A4';
  if (typeof out.landscape !== 'boolean') out.landscape = false;
  if (typeof out.rotate !== 'boolean') out.rotate = true;
  if (typeof out.allowOverlap !== 'boolean') out.allowOverlap = false;
  out.margin = numberOr(out.margin, 10, LENGTH_RANGE);
  out.gap = numberOr(out.gap, 5, LENGTH_RANGE);
  const cuts = out.cuts && typeof out.cuts === 'object' && !Array.isArray(out.cuts) ? out.cuts : {};
  out.cuts = {
    ...cuts,
    mode: CUT_MODES.includes(cuts.mode) ? cuts.mode : DEFAULT_CUTS.mode,
    length: numberOr(cuts.length, DEFAULT_CUTS.length, CUT_LIMITS.length),
    offset: numberOr(cuts.offset, DEFAULT_CUTS.offset, CUT_LIMITS.offset),
    margin: numberOr(cuts.margin, DEFAULT_CUTS.margin, CUT_LIMITS.margin),
    weight: Object.hasOwn(CUT_WEIGHTS, cuts.weight) ? cuts.weight : DEFAULT_CUTS.weight,
    color: isHexColor(cuts.color) ? cuts.color : DEFAULT_CUTS.color,
    dash: CUT_DASHES.includes(cuts.dash) ? cuts.dash : DEFAULT_CUTS.dash,
  };
  // A QR code's logo that can't be read is dropped.
  const assets = isRecord(out.assets) ? (out.assets = { ...out.assets }) : null;
  for (const key in assets) if (assets[key]?.kind === 'qr' && !validLogo(assets[key].logo)) assets[key] = { ...assets[key], logo: null };
  if (Array.isArray(out.items)) {
    out.items = out.items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const fixed = { ...item };
      // A crop that can't be read is no crop; one slightly outside the image is brought inside.
      if (item.crop != null) fixed.crop = typeof item.crop === 'object' ? clampCrop(item.crop) : null;
      // A QR code is never cropped.
      if (assets?.[item.asset]?.kind === 'qr') fixed.crop = null;
      if (isPositive(item.scale)) fixed.scale = clamp(item.scale, 1, 1000);
      return fixed;
    });
  }
  return out;
}

/**
 * A saved document → a document ready to use (migrated, repaired and
 * validated). Throws ProjectError ('corrupt' or 'newer') when it can't be
 * opened. `context`: see migrate.
 */
export function deserialize(raw, context = {}) {
  const doc = repair(migrate(raw, context));
  const problems = validate(doc);
  if (problems.length) throw new ProjectError('corrupt', problems.slice(0, 5).join('; '));
  return doc;
}
