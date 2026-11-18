// Small stateless helpers for numbers, text and ids.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round1 = (v) => Math.round(v * 10) / 10 || 0;
export const tidy = (v) => Math.round(v * 100) / 100 || 0;
/** Rounds to 0.0001: drops floating point noise without drifting steps such as 1/16 in. */
export const fine = (v) => Math.round(v * 1e4) / 1e4 || 0;

/** For numeric inputs: «41.6» (for display, t() in src/copy). */
export const num = (v) => String(round1(v));

/** Equal but for floating point noise. */
export const sameNumber = (a, b) => Math.abs(a - b) < 1e-9;

/** A plain object (not null, not an array): what a stored setting has to be to be read. */
export const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

/** Orders ids of mixed types: by type first, then by value. */
export const compareIds = (a, b) => {
  if (typeof a !== typeof b) return typeof a < typeof b ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

/** A safe file name from a text («Mi App» → «mi-app»). */
export const slug = (text, fallback) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
