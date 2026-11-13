// Small stateless number and text helpers.

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const round1 = (v: number) => Math.round(v * 10) / 10 || 0;
export const tidy = (v: number) => Math.round(v * 100) / 100 || 0;
/** Rounds to 0.0001: drops floating point noise without drifting steps such as 1/16 in. */
export const fine = (v: number) => Math.round(v * 1e4) / 1e4 || 0;

/** For numeric inputs: «41.6» (for display, t() in src/copy). */
export const num = (v: number) => String(round1(v));

/** A safe file name from a text («Mi App» → «mi-app»). */
export const slug = (text: string, fallback: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
