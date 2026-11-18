// Papers: standard sizes (presets) and custom ones, in mm. No interface
// texts: the interface names them from their ids, which are stable.
//
// A paper is a preset's id ('A4', 'letter', …) or a custom one {custom: true,
// w, h}. The orientation goes apart (`landscape`).

/** Preset groups, in the order they are best shown in. */
export const PAPER_GROUPS = Object.freeze(['iso-a', 'iso-b', 'us', 'photo']);

/**
 * Presets upright (w ≤ h), by group: the A series (ISO 216), B4 and B5 (ISO),
 * US sizes (letter, legal, folio and tabloid) and photo paper (its real sizes
 * in inches: 'photo-10x15' is 4 × 6 in).
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
    { id: 'folio', w: 216, h: 330, group: 'us' },
    { id: 'tabloid', w: 279.4, h: 431.8, group: 'us' },
    { id: 'photo-9x13', w: 88.9, h: 127, group: 'photo' },
    { id: 'photo-10x15', w: 101.6, h: 152.4, group: 'photo' },
    { id: 'photo-13x18', w: 127, h: 177.8, group: 'photo' },
    { id: 'photo-15x20', w: 152.4, h: 203.2, group: 'photo' },
    { id: 'photo-20x30', w: 203.2, h: 304.8, group: 'photo' },
  ].map((paper) => Object.freeze(paper))
);

/** The limits of a custom paper's side, in mm (inclusive). */
export const CUSTOM_MIN = 20;
export const CUSTOM_MAX = 2000;

/** The tolerance of `matchPreset`, in mm. */
export const MATCH_TOLERANCE = 0.5;

export const getPaper = (id) => (typeof id === 'string' && PAPERS.find((p) => p.id === id)) || null;

/**
 * Checks a custom paper's side: null when it is fine, or a code: 'invalid'
 * (not a finite number), 'too-small' (< CUSTOM_MIN) or 'too-large'
 * (> CUSTOM_MAX).
 */
export function validateSide(mm) {
  if (typeof mm !== 'number' || !Number.isFinite(mm)) return 'invalid';
  if (mm < CUSTOM_MIN) return 'too-small';
  if (mm > CUSTOM_MAX) return 'too-large';
  return null;
}

/**
 * Checks a custom paper of w × h mm: null when it is fine, or the
 * `validateSide` code of the first side that fails (the width first).
 */
export const validateCustom = (w, h) => validateSide(w) ?? validateSide(h);

/**
 * A custom paper from what the person typed: stored upright, with the
 * orientation it implies (landscape when w > h). Gives {paper, landscape},
 * or null when the sizes aren't valid (see validateCustom).
 */
export function customPaper(w, h) {
  if (validateCustom(w, h)) return null;
  return { paper: { custom: true, w: Math.min(w, h), h: Math.max(w, h) }, landscape: w > h };
}

// A paper's upright size (preset or custom), or null when it isn't valid.
function portrait(paper) {
  if (typeof paper === 'string') return getPaper(paper);
  if (paper && paper.custom === true && !validateCustom(paper.w, paper.h)) {
    return { w: Math.min(paper.w, paper.h), h: Math.max(paper.w, paper.h) };
  }
  return null;
}

/**
 * The sheet's width and height ({w, h} in mm) for a paper (a preset's id or
 * {custom: true, w, h}) and an orientation: portrait w ≤ h, landscape w ≥ h.
 * A custom paper's sides are taken in any order (`landscape` gives the
 * orientation). null when the paper doesn't exist or isn't valid.
 */
export function sizeOf(paper, landscape = false) {
  const p = portrait(paper);
  if (!p) return null;
  return landscape ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

/**
 * Does w × h match a preset, in either orientation, within `tolerance` mm per
 * side? Gives {id, landscape} of the closest, or null.
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
 * What the paper's label needs, without text: {custom, id, match, group, w,
 * h, landscape}. `id` is the preset's (null when custom); `match`, the
 * preset with those sizes (its own, or the one a custom paper matches; null
 * when none) and `group`, the group of `match`. `w`, `h` and `landscape` are
 * the sheet's as it ends up. null when the paper isn't valid.
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
