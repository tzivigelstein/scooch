// What a printed (or downloaded) PDF saves: how much of the printable area the
// pieces use, how many sheets it takes against printing each piece on a sheet
// of its own, and that difference in plain physical terms (paper weight, a
// ream, a stack). Device-local totals with a few milestones. Pure module.
//
// Only facts that don't need estimates: 80 g/m² office paper, about 0.1 mm
// thick, sold in reams of 500. No ink, water, trees or CO₂.

/** Grams per square metre of ordinary office paper. */
export const PAPER_GSM = 80;
/** The thickness of one sheet of it, in mm (about). */
export const SHEET_MM = 0.1;
/** Sheets in a ream. */
export const REAM = 500;
/** Running totals that get a line of their own when reached. */
export const MILESTONES = Object.freeze([10, 50, 100, 500]);
/** The practical equivalents, in the order they take turns. */
export const EQUIVALENTS = Object.freeze(['grams', 'ream', 'stack']);
/** Below this share of the printable area, a fuller arrangement may be suggested. */
export const LOW_USAGE = 0.5;

/** The area covered by rectangles ({x, y, w, h}), each place counted once. */
export function unionArea(rects) {
  const boxes = rects.filter((r) => r.w > 0 && r.h > 0);
  if (!boxes.length) return 0;
  const xs = [...new Set(boxes.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const [x0, x1] = [xs[i], xs[i + 1]];
    // The vertical extent covered in this slice: merged intervals.
    const spans = boxes
      .filter((r) => r.x <= x0 && r.x + r.w >= x1)
      .map((r) => [r.y, r.y + r.h])
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let [start, end] = [-Infinity, -Infinity];
    for (const [y0, y1] of spans) {
      if (y0 > end) {
        if (end > start) covered += end - start;
        [start, end] = [y0, y1];
      } else end = Math.max(end, y1);
    }
    if (end > start) covered += end - start;
    area += covered * (x1 - x0);
  }
  return area;
}

const clip = (r, area) => {
  const x0 = Math.max(r.x, area.x);
  const y0 = Math.max(r.y, area.y);
  const x1 = Math.min(r.x + r.w, area.x + area.w);
  const y1 = Math.min(r.y + r.h, area.y + area.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
};

/**
 * How much of the printable area the pieces use, over the sheets that print
 * (the ones with pieces): each sheet's pieces' footprints (their layout boxes,
 * cut margin included), clipped to its printable area and counted once where
 * they overlap, over the printable area of those sheets together — a big
 * sheet counts for more than a nearly empty one, like the paper it is.
 * `sheets`: [[{x, y, w, h}]] per sheet; `area`: the printable area {x, y, w, h}.
 * Returns the share (0–1) or null with nothing to print.
 */
export function sheetUsage(sheets, area) {
  const printed = sheets.filter((boxes) => boxes.length);
  const total = printed.length * area.w * area.h;
  if (!total) return null;
  const used = printed.reduce((sum, boxes) => sum + unionArea(boxes.map((r) => clip(r, area))), 0);
  return Math.min(1, used / total);
}

/**
 * Sheets used against printing each piece on its own sheet (the baseline):
 * {used, baseline, saved}.
 */
export function sheetSavings(pieces, sheetsUsed) {
  return { used: sheetsUsed, baseline: pieces, saved: Math.max(0, pieces - sheetsUsed) };
}

/**
 * What `saved` sheets of `w` × `h` mm are in physical terms: grams of paper
 * (at PAPER_GSM), the share of a ream and the height of the stack (mm).
 */
export function paperFacts(saved, w, h) {
  return {
    grams: saved * ((w * h) / 1e6) * PAPER_GSM,
    ream: saved / REAM,
    stack: saved * SHEET_MM,
  };
}

/** The equivalent to show this time (they take turns): {kind, value}. */
export function equivalent(turn, facts) {
  const kind = EQUIVALENTS[((turn % EQUIVALENTS.length) + EQUIVALENTS.length) % EQUIVALENTS.length];
  return { kind, value: facts[kind] };
}

/** The milestone a total reached going from `before` to `after` (the highest one), or null. */
export function milestoneReached(before, after) {
  return [...MILESTONES].reverse().find((m) => before < m && after >= m) ?? null;
}

/**
 * Should a fuller arrangement be suggested? Only when little of the area is
 * used and packing the same pieces takes fewer sheets for sure (`packed`: how
 * many sheets a packing check needed, null when it couldn't place them all).
 */
export const suggestArrange = (share, used, packed) => share !== null && share < LOW_USAGE && packed !== null && packed < used;

// ---------- The running total (scooch:savings) ----------
//
// Version 1: {v: 1, sheets, turn}: the sheets saved so far on this device
// and whose turn the next equivalent is.

export function parseSavings(raw) {
  const saved = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  return { sheets: count(saved.sheets), turn: count(saved.turn) };
}

export const serializeSavings = ({ sheets, turn }) => ({ v: 1, sheets, turn });
