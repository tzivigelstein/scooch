// Papeles: tamaños estándar (presets) y personalizados. Medidas en mm.
// Módulo puro y sin textos de interfaz: los nombres que se muestran los pone
// el texto de la interfaz a partir de los ids, que son estables.
//
// Un papel es el id de un preset ('A4', 'letter', …) o uno personalizado
// {custom: true, w, h}. La orientación va aparte (`landscape`), como hoy.

/** Grupos de presets, en el orden en que conviene mostrarlos. */
export const PAPER_GROUPS = Object.freeze(['iso-a', 'iso-b', 'us', 'photo']);

/**
 * Presets en vertical (w ≤ h), por grupo: serie A (ISO 216), B4 y B5 (ISO),
 * norteamericanos (carta, oficio/legal, tabloide) y papel fotográfico (sus
 * medidas reales en pulgadas: 'photo-10x15' es 4 × 6 in).
 */
export const PAPERS = Object.freeze(
  [
    { id: 'A0', w: 841, h: 1189, group: 'iso-a' },
    { id: 'A1', w: 594, h: 841, group: 'iso-a' },
    { id: 'A2', w: 420, h: 594, group: 'iso-a' },
    { id: 'A3', w: 297, h: 420, group: 'iso-a' },
    { id: 'A4', w: 210, h: 297, group: 'iso-a' },
    { id: 'A5', w: 148, h: 210, group: 'iso-a' },
    { id: 'A6', w: 105, h: 148, group: 'iso-a' },
    { id: 'B4', w: 250, h: 353, group: 'iso-b' },
    { id: 'B5', w: 176, h: 250, group: 'iso-b' },
    { id: 'letter', w: 215.9, h: 279.4, group: 'us' },
    { id: 'legal', w: 215.9, h: 355.6, group: 'us' },
    { id: 'tabloid', w: 279.4, h: 431.8, group: 'us' },
    { id: 'photo-9x13', w: 88.9, h: 127, group: 'photo' },
    { id: 'photo-10x15', w: 101.6, h: 152.4, group: 'photo' },
    { id: 'photo-13x18', w: 127, h: 177.8, group: 'photo' },
    { id: 'photo-15x20', w: 152.4, h: 203.2, group: 'photo' },
    { id: 'photo-20x30', w: 203.2, h: 304.8, group: 'photo' },
  ].map((paper) => Object.freeze(paper))
);

/** Límites de un lado de papel personalizado, en mm (inclusive). */
export const CUSTOM_MIN = 20;
export const CUSTOM_MAX = 2000;

/** Tolerancia de `matchPreset`, en mm. */
export const MATCH_TOLERANCE = 0.5;

/** El preset con ese id, o null. */
export const getPaper = (id) => (typeof id === 'string' && PAPERS.find((p) => p.id === id)) || null;

/**
 * Valida un lado de papel personalizado. Devuelve null si está bien o un
 * código: 'invalid' (no es un número finito), 'too-small' (< CUSTOM_MIN) o
 * 'too-large' (> CUSTOM_MAX).
 */
export function validateSide(mm) {
  if (typeof mm !== 'number' || !Number.isFinite(mm)) return 'invalid';
  if (mm < CUSTOM_MIN) return 'too-small';
  if (mm > CUSTOM_MAX) return 'too-large';
  return null;
}

/**
 * Valida un papel personalizado de w × h mm: null si está bien, o el código
 * de `validateSide` del primer lado que falla (primero el ancho).
 */
export const validateCustom = (w, h) => validateSide(w) ?? validateSide(h);

/**
 * Papel personalizado a partir de lo que cargó el usuario: lo guarda en
 * vertical y deduce la orientación (apaisado si w > h). Devuelve {paper,
 * landscape}, o null si las medidas no valen (ver validateCustom).
 */
export function customPaper(w, h) {
  if (validateCustom(w, h)) return null;
  return { paper: { custom: true, w: Math.min(w, h), h: Math.max(w, h) }, landscape: w > h };
}

// Medidas en vertical de un papel (preset o personalizado), o null si no vale.
function portrait(paper) {
  if (typeof paper === 'string') return getPaper(paper);
  if (paper && paper.custom === true && !validateCustom(paper.w, paper.h)) {
    return { w: Math.min(paper.w, paper.h), h: Math.max(paper.w, paper.h) };
  }
  return null;
}

/**
 * Ancho y alto de la hoja ({w, h} en mm) para un papel (id de preset o
 * {custom: true, w, h}) y una orientación: en vertical w ≤ h, apaisado w ≥ h.
 * Un personalizado se toma sin importar el orden de sus medidas (la
 * orientación la da `landscape`). null si el papel no existe o no es válido.
 */
export function sizeOf(paper, landscape = false) {
  const p = portrait(paper);
  if (!p) return null;
  return landscape ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

/**
 * ¿w × h coincide con algún preset, en cualquier orientación, a menos de
 * `tolerance` mm por lado? Devuelve {id, landscape} del más parecido, o null.
 */
export function matchPreset(w, h, tolerance = MATCH_TOLERANCE) {
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  let best = null;
  for (const p of PAPERS) {
    for (const landscape of [false, true]) {
      const [pw, ph] = landscape ? [p.h, p.w] : [p.w, p.h];
      const off = Math.max(Math.abs(w - pw), Math.abs(h - ph));
      if (off <= tolerance + 1e-9 && (!best || off < best.off)) best = { id: p.id, landscape, off };
    }
  }
  return best && { id: best.id, landscape: best.landscape };
}

/**
 * Datos para la etiqueta del papel, sin texto: {custom, id, match, group, w,
 * h, landscape}. `id` es el del preset (null si es personalizado); `match`, el
 * preset con esas medidas (el propio, o el que coincide con un personalizado;
 * null si ninguno) y `group`, el grupo de `match`. `w`, `h` y `landscape`
 * son los de la hoja tal como queda. null si el papel no es válido.
 */
export function describe(paper, landscape = false) {
  const size = sizeOf(paper, landscape);
  if (!size) return null;
  const custom = typeof paper !== 'string';
  const found = custom ? matchPreset(size.w, size.h) : { id: paper };
  const match = found ? getPaper(found.id) : null;
  return {
    custom,
    id: custom ? null : paper,
    match: match?.id ?? null,
    group: match?.group ?? null,
    w: size.w,
    h: size.h,
    landscape: size.w > size.h,
  };
}
