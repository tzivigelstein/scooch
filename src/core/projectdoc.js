// Formato del documento de un proyecto guardado: serializar, deserializar,
// migrar versiones viejas y validar. Módulo puro (sin DOM ni textos).
//
// Forma (versión 3):
//
//   {
//     version: 3,
//     paper: 'A4' | {custom: true, w, h},   // ids de papers.js; medidas en mm
//     landscape: false,
//     margin: 10, gap: 5,                  // mm
//     rotate: true,                        // «Girar si conviene»
//     cuts: {mode: 'none', length: 4, offset: 1.5,   // líneas de corte (cutmarks.js): modo y mm,
//            margin: 0,                           // cut margin around each image (mm, −5…20)
//            weight: 'thin', color: '#000000', dash: 'solid'},  // and their stroke
//     sheets: [{id: 1}, {id: 2}],          // en orden; al menos una
//     items: [{id, asset, sheet, x, y, scale, r, crop}],   // en orden de apilado;
//                                          // crop: null o {x, y, w, h} normalizado (crop.js)
//     assets: {
//       a1: {kind: 'image', name, src, px: [w, h], format: 'jpg' | 'png', dpi, w, h, derived},
//       a2: {kind: 'pdf', name, src, page, pages, pageRotation, view: [x0, y0, x1, y1], px, w, h},
//     },
//   }
//
// `src` identifica el archivo original (las páginas de un mismo PDF lo
// comparten). Los binarios van aparte, con estas claves (fileKeys):
//   'src:N'      el archivo original (imagen o PDF)
//   'bytes:N'    lo que se embebe en el PDF si no es el original (derived: true:
//                JPG con orientación EXIF o formatos que pdf-lib no embebe)
//   'preview:aK' la vista previa ya rasterizada (así no hace falta pdf.js al abrir)

import { sizeOf } from './papers.js';
import { MIN_CROP, isIdentity } from './crop.js';
import { CUT_DASHES, CUT_MODES, CUT_WEIGHTS, isHexColor } from './cutmarks.js';

export const DOC_VERSION = 3;

/** Cut lines of a new document: none, and thin solid black when turned on. */
export const DEFAULT_CUTS = Object.freeze({ mode: 'none', length: 4, offset: 1.5, margin: 0, weight: 'thin', color: '#000000', dash: 'solid' });

/** The stroke documents had before it could be chosen (version 2): 0.25 pt dark gray, solid. */
export const LEGACY_CUT_STYLE = Object.freeze({ weight: 'thin', color: '#333333', dash: 'solid' });
/** Largo de las marcas, separación de la esquina and the cut margin, in mm (inclusive). */
export const CUT_LIMITS = Object.freeze({ length: [0.5, 20], offset: [0, 10], margin: [-5, 20] });

/** A clean copy of the cut lines, with the default stroke for what is missing. */
export function cleanCuts(cuts) {
  const { mode, length, offset, margin, weight, color, dash } = { ...DEFAULT_CUTS, ...cuts };
  return { mode, length, offset, margin, weight, color, dash };
}

/** Copia limpia de un recorte (o null si no hay o es la imagen entera). */
export const cleanCrop = (crop) => (isIdentity(crop) ? null : { x: crop.x, y: crop.y, w: crop.w, h: crop.h });

/** Error de un documento que no se puede abrir: `code` 'corrupt' o 'newer'. */
export class ProjectError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ProjectError';
    this.code = code;
  }
}

const IMAGE_FIELDS = ['kind', 'name', 'src', 'px', 'format', 'dpi', 'w', 'h'];
const PDF_FIELDS = ['kind', 'name', 'src', 'page', 'pages', 'pageRotation', 'view', 'px', 'w', 'h'];

const pick = (obj, fields) => Object.fromEntries(fields.map((key) => [key, Array.isArray(obj[key]) ? [...obj[key]] : obj[key]]));

/**
 * Documento a guardar a partir del estado. `assets`: Map clave → asset (los
 * de la app, con sus binarios); solo se incluyen los que usan las piezas.
 * Para imágenes, `derived` dice si lo que se embebe no es el archivo original.
 */
export function serialize({ sheets, items, paper, landscape, margin, gap, rotate, cuts = DEFAULT_CUTS }, assets) {
  const used = {};
  for (const item of items) {
    if (used[item.asset]) continue;
    const asset = assets.get(item.asset);
    if (!asset) throw new ProjectError('corrupt', `falta el asset ${item.asset}`);
    used[item.asset] =
      asset.kind === 'pdf' ? pick(asset, PDF_FIELDS) : { ...pick(asset, IMAGE_FIELDS), derived: !!asset.derived };
  }
  return {
    version: DOC_VERSION,
    paper: typeof paper === 'string' ? paper : { custom: true, w: paper.w, h: paper.h },
    landscape: !!landscape,
    margin,
    gap,
    rotate: rotate !== false,
    cuts: cleanCuts(cuts),
    sheets: sheets.map((sheet) => ({ id: sheet.id })),
    items: items.map(({ id, asset, sheet, x, y, scale, r, crop }) => ({ id, asset, sheet, x, y, scale, r, crop: cleanCrop(crop) })),
    assets: used,
  };
}

/** Claves de los binarios que necesita el documento (ver arriba), sin repetir. */
export function fileKeys(doc) {
  const keys = new Set();
  for (const [key, asset] of Object.entries(doc.assets)) {
    keys.add(`src:${asset.src}`);
    if (asset.kind === 'image' && asset.derived) keys.add(`bytes:${asset.src}`);
    keys.add(`preview:${key}`);
  }
  return [...keys];
}

/** Cantidad de hojas y de piezas (para la lista de proyectos). */
export const counts = (doc) => ({ sheets: doc.sheets.length, pieces: doc.items.length });

/** Próximos ids libres para piezas, hojas, assets y orígenes. */
export function nextIds(doc) {
  const max = (values) => values.reduce((m, v) => Math.max(m, v), 0);
  return {
    item: max(doc.items.map((item) => item.id)) + 1,
    sheet: max(doc.sheets.map((sheet) => sheet.id)) + 1,
    asset: max(Object.keys(doc.assets).map((key) => Number(key.slice(1)) || 0)) + 1,
    src: max(Object.values(doc.assets).map((asset) => asset.src)) + 1,
  };
}

// ---------- Migración ----------

// Papeles de antes de papers.js (nombres en lugar de ids).
const LEGACY_PAPERS = { Carta: 'letter', Oficio: 'legal' };

/**
 * Pasos de una versión a la siguiente. La 0 es la de una sola hoja (sin
 * `sheets` ni `item.sheet`, con los papeles por nombre: «Carta», «Oficio»).
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
  // La 1 no tenía recorte ni líneas de corte.
  1: (doc) => ({
    ...doc,
    version: 2,
    cuts: { mode: 'none', length: 4, offset: 1.5 },
    items: Array.isArray(doc.items) ? doc.items.map((item) => ({ ...item, crop: null })) : doc.items,
  }),
  // Version 2 had no cut margin nor choice of stroke: it keeps the look it printed with.
  2: (doc) => ({
    ...doc,
    version: 3,
    cuts: doc.cuts && typeof doc.cuts === 'object' ? { ...doc.cuts, margin: 0, ...LEGACY_CUT_STYLE } : doc.cuts,
  }),
};

/**
 * Lleva un documento guardado a la versión actual (sin modificar el
 * original). Lanza ProjectError 'newer' si es de una versión futura y
 * 'corrupt' si no tiene forma de documento.
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ProjectError('corrupt', 'no es un objeto');
  let doc = structuredClone(raw);
  let version = doc.version ?? 0;
  if (!Number.isInteger(version) || version < 0) throw new ProjectError('corrupt', `versión ${version}`);
  if (version > DOC_VERSION) throw new ProjectError('newer', `versión ${version}`);
  while (version < DOC_VERSION) {
    doc = MIGRATIONS[version](doc);
    version = doc.version;
  }
  return doc;
}

// ---------- Validación ----------

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isPositive = (v) => isFiniteNumber(v) && v > 0;
const isId = (v) => Number.isInteger(v) && v > 0;
const isPair = (v) => Array.isArray(v) && v.length === 2 && v.every(isPositive);

function assetProblem(key, asset) {
  if (!/^a\d+$/.test(key)) return `clave de asset ${key}`;
  if (!asset || typeof asset !== 'object') return `asset ${key}`;
  if (typeof asset.name !== 'string' || !isId(asset.src) || !isPair(asset.px) || !isPositive(asset.w) || !isPositive(asset.h)) {
    return `asset ${key} incompleto`;
  }
  if (asset.kind === 'image') {
    if (!['jpg', 'png'].includes(asset.format) || !isPositive(asset.dpi)) return `imagen ${key}`;
    return null;
  }
  if (asset.kind === 'pdf') {
    if (!isId(asset.page) || !isId(asset.pages) || asset.page > asset.pages) return `página de ${key}`;
    if (!Number.isInteger(asset.pageRotation) || asset.pageRotation % 90) return `giro de ${key}`;
    if (!Array.isArray(asset.view) || asset.view.length !== 4 || !asset.view.every(isFiniteNumber)) return `caja de ${key}`;
    return null;
  }
  return `tipo de ${key}`;
}

// Recorte: lados entre MIN_CROP y 1 y la zona dentro de la imagen (con un pelo de tolerancia).
function validCrop(crop) {
  if (!crop || typeof crop !== 'object' || ![crop.x, crop.y, crop.w, crop.h].every(isFiniteNumber)) return false;
  const tol = 1e-9;
  return crop.x >= -tol && crop.y >= -tol && crop.w >= MIN_CROP - tol && crop.h >= MIN_CROP - tol && crop.x + crop.w <= 1 + tol && crop.y + crop.h <= 1 + tol;
}

/**
 * Problemas de un documento ya migrado: [] si está bien, o una lista de
 * descripciones (para el registro; la interfaz solo dice «dañado»).
 */
export function validate(doc) {
  const problems = [];
  if (!doc || typeof doc !== 'object') return ['no es un objeto'];
  if (doc.version !== DOC_VERSION) problems.push(`versión ${doc.version}`);
  if (!sizeOf(doc.paper, false)) problems.push('papel');
  if (typeof doc.landscape !== 'boolean') problems.push('orientación');
  for (const key of ['margin', 'gap']) {
    if (!isFiniteNumber(doc[key]) || doc[key] < 0 || doc[key] > 50) problems.push(key);
  }
  if (typeof doc.rotate !== 'boolean') problems.push('rotate');
  const cuts = doc.cuts;
  if (!cuts || typeof cuts !== 'object' || !CUT_MODES.includes(cuts.mode)) problems.push('líneas de corte');
  else {
    for (const key of ['length', 'offset', 'margin']) {
      const [lo, hi] = CUT_LIMITS[key];
      if (!isFiniteNumber(cuts[key]) || cuts[key] < lo || cuts[key] > hi) problems.push(`líneas de corte: ${key}`);
    }
    if (!Object.hasOwn(CUT_WEIGHTS, cuts.weight)) problems.push('cut lines: weight');
    if (!isHexColor(cuts.color)) problems.push('cut lines: color');
    if (!CUT_DASHES.includes(cuts.dash)) problems.push('cut lines: dash');
  }
  const sheets = Array.isArray(doc.sheets) ? doc.sheets : null;
  if (!sheets || !sheets.length) problems.push('hojas');
  const sheetIds = new Set();
  for (const sheet of sheets ?? []) {
    if (!isId(sheet?.id) || sheetIds.has(sheet.id)) problems.push(`hoja ${sheet?.id}`);
    else sheetIds.add(sheet.id);
  }
  const assets = doc.assets && typeof doc.assets === 'object' && !Array.isArray(doc.assets) ? doc.assets : null;
  if (!assets) problems.push('assets');
  for (const [key, asset] of Object.entries(assets ?? {})) {
    const problem = assetProblem(key, asset);
    if (problem) problems.push(problem);
  }
  if (!Array.isArray(doc.items)) problems.push('piezas');
  const itemIds = new Set();
  for (const item of Array.isArray(doc.items) ? doc.items : []) {
    const where = `pieza ${item?.id}`;
    if (!isId(item?.id) || itemIds.has(item.id)) problems.push(where);
    else itemIds.add(item.id);
    if (!assets || !Object.hasOwn(assets, item?.asset)) problems.push(`${where}: asset`);
    if (!sheetIds.has(item?.sheet)) problems.push(`${where}: hoja`);
    if (!isFiniteNumber(item?.x) || !isFiniteNumber(item?.y)) problems.push(`${where}: posición`);
    if (!isPositive(item?.scale)) problems.push(`${where}: escala`);
    if (![0, 90, 180, 270].includes(item?.r)) problems.push(`${where}: giro`);
    // Sin `crop` (o null): sin recorte.
    if (item?.crop != null && !validCrop(item.crop)) problems.push(`${where}: recorte`);
  }
  return problems;
}

/**
 * Documento guardado → documento listo para usar (migrado y validado). Lanza
 * ProjectError ('corrupt' o 'newer') si no se puede abrir.
 */
export function deserialize(raw) {
  const doc = migrate(raw);
  const problems = validate(doc);
  if (problems.length) throw new ProjectError('corrupt', problems.slice(0, 5).join('; '));
  return doc;
}
