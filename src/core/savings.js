// What a printed (or downloaded) PDF saves: how much of the printable area the
// pieces use, how many sheets it takes against printing each piece on a sheet
// of its own, and that difference in plain physical terms (paper weight, a
// stack, reams) when they are big enough to picture. Device-local totals with
// a few milestones. Pure module.
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
/** Fewer grams of paper than this get no equivalent in weight. */
export const MIN_GRAMS = 10;
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

const tenth = (value) => Math.round(value * 10) / 10;

/**
 * The physical facts of `saved` sheets of `w` × `h` mm that a person can
 * picture, in the order they take turns, each from 1 of its unit (below it,
 * the number makes the saving look smaller than it is): the weight, in grams
 * from MIN_GRAMS (a few grams is no amount of paper anyone pictures) and in
 * kg from 1 kg; the stack, in cm from 1 cm; and reams, from 1. Values come
 * rounded as they show: whole grams, tenths of the rest. [{kind, value}]
 */
export function tangibleFacts(saved, w, h) {
  const { grams, ream, stack } = paperFacts(saved, w, h);
  const facts = [];
  if (tenth(grams / 1000) >= 1) facts.push({ kind: 'kg', value: tenth(grams / 1000) });
  else if (Math.round(grams) >= MIN_GRAMS) facts.push({ kind: 'grams', value: Math.round(grams) });
  if (tenth(stack / 10) >= 1) facts.push({ kind: 'stack', value: tenth(stack / 10) });
  if (tenth(ream) >= 1) facts.push({ kind: 'reams', value: tenth(ream) });
  return facts;
}

/** The fact to show this time (they take turns), or null when there is none. */
export function equivalent(turn, facts) {
  return facts.length ? facts[((turn % facts.length) + facts.length) % facts.length] : null;
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

// ---------- Counting each PDF once ----------
//
// The browser doesn't say whether the person printed, so the total counts
// what goes out, once per PDF: printing or downloading the same document
// again adds nothing. A PDF is told apart by what it contains (its key), not
// by when it was made. A download is a file and counts at once; a print's
// sheets wait (pending) and join the total later: at the next page load, when
// another PDF goes out or when that one is downloaded. Whatever reaches a
// milestone, the next summary shows it.

/**
 * A short key for what a PDF contains, from any JSON-able description of it:
 * equal descriptions, equal keys (cyrb53, 53 bits). Tells apart the PDFs of
 * one device; not a security hash.
 */
export function pdfKey(description) {
  const text = JSON.stringify(description);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const highest = (a, b) => (a === null ? b : b === null ? a : Math.max(a, b));

/** Adds `n` sheets to the total, keeping the milestone they reach for the next summary. */
function addToTotal(savings, n) {
  const sheets = savings.sheets + n;
  return { ...savings, sheets, milestone: highest(savings.milestone, milestoneReached(savings.sheets, sheets)) };
}

/** The pending print joins the total and the PDFs counted (`savings` unchanged without one). */
export function settlePending(savings) {
  const { pending } = savings;
  if (!pending) return savings;
  return { ...addToTotal(savings, pending.sheets), counted: [...savings.counted, pending.key], pending: null };
}

/**
 * Counts a PDF that went out (`savings` as storedprefs.parseSavings reads
 * it), printed or downloaded (`how`). First the pending print settles, unless
 * it is this same PDF printed again. Then this PDF's `saved` sheets, unless it
 * was counted (or is pending) already: downloaded, into the total; printed,
 * pending. The next equivalent takes its turn either way. Returns the new
 * savings, the sheets this PDF `added` (now or once it settles) and the
 * `milestone` this summary shows: reached now or since the last summary (the
 * new savings keep none).
 */
export function countPdf(savings, key, saved, how) {
  const { pending } = savings;
  const settled = pending && (pending.key !== key || how === 'download') ? settlePending(savings) : savings;
  const known = settled.counted.includes(key) || settled.pending?.key === key;
  const added = known ? 0 : Math.max(0, saved);
  let next = { ...settled, turn: settled.turn + 1 };
  if (added && how === 'download') next = { ...addToTotal(next, added), counted: [...next.counted, key] };
  else if (added) next = { ...next, pending: { key, sheets: added } };
  return { savings: { ...next, milestone: null }, added, milestone: next.milestone };
}
