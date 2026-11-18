// Several sheets: sharing pieces out, placing new ones, which sheet a dropped
// piece belongs to, and problems per sheet. No DOM, no texts.
//
// Model: the document has an ordered list of sheets (ids) and each piece
// belongs to one (`sheet`), with x/y relative to ITS sheet, in mm. Every
// sheet has the same paper, orientation and margin. Pieces come here as
// boxes {id, sheet, x, y, w, h} (w/h with the orientation applied).

import { packSheets, packInto } from './pack.js';
import { overlaps, EPS, nearestFree } from './collide.js';

const sameNumber = (a, b) => Math.abs(a - b) < 1e-9;

/**
 * Arranges ALL the pieces on as many sheets as needed (`packSheets`).
 * `boxes`: the pieces; `sheetIds`: the current sheets in order; `area`: the
 * printable {w, h} (the sheet minus the margin) and `margin`; `newId()`: an
 * id for each new sheet.
 *
 * The resulting sheets reuse the current ones in order (the first shared out
 * is the first sheet from before, and so on) and the missing ones are
 * created; the ones left over are removed. Pieces that don't fit even alone
 * on an empty sheet (`unplaced`) keep their x/y, on sheets of their own at
 * the end (those that shared a sheet, together).
 *
 * Gives {sheets, placements, unplaced, packed}: `sheets`, the final ids in
 * order; `placements`, Map id → {sheet, x, y, rotated} with x/y on the sheet
 * (margin included); `unplaced`, the ids that didn't fit; `packed`, how many
 * sheets the others took.
 */
export function arrangeSheets(boxes, sheetIds, { area, margin = 0, gap = 0, rotate = true, newId }) {
  const result = packSheets(
    boxes.map((b) => ({ id: b.id, w: b.w, h: b.h })),
    area.w,
    area.h,
    { gap, rotate }
  );
  const ids = [];
  const take = (i) => ids[i] ?? (ids[i] = sheetIds[i] ?? newId());
  const placements = new Map();
  result.sheets.forEach((sheet, i) => {
    const id = take(i);
    for (const p of sheet) placements.set(p.id, { sheet: id, x: margin + p.x, y: margin + p.y, rotated: p.rotated });
  });
  const packed = result.sheets.length;

  // Those that don't fit: in their position, on sheets of their own at the end.
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const groups = new Map(); // sheet before → new sheet
  const sheets = ids.slice(0, packed);
  for (const id of result.unplaced) {
    const box = byId.get(id);
    if (!groups.has(box.sheet)) {
      const reuse = sheetIds.includes(box.sheet) && !sheets.includes(box.sheet) ? box.sheet : newId();
      groups.set(box.sheet, reuse);
      sheets.push(reuse);
    }
    placements.set(id, { sheet: groups.get(box.sheet), x: box.x, y: box.y, rotated: false });
  }
  if (!sheets.length) sheets.push(sheetIds[0] ?? newId());
  return { sheets, placements, unplaced: result.unplaced, packed };
}

/**
 * Would applying `plan` (from arrangeSheets) leave everything as it is?
 * Compares the list of sheets and, for each piece, its sheet and position,
 * with nothing turned. `round(v)`: the rounding the position would be
 * applied with.
 */
export function samePlan(plan, boxes, sheetIds, round = (v) => v) {
  if (plan.sheets.length !== sheetIds.length || plan.sheets.some((id, i) => id !== sheetIds[i])) return false;
  return boxes.every((b) => {
    const p = plan.placements.get(b.id);
    return p && !p.rotated && p.sheet === b.sheet && sameNumber(round(p.x), b.x) && sameNumber(round(p.y), b.y);
  });
}

// Arranged positions are stored rounded to 0.01 mm, so an exact space (what
// an equal piece left) can end a few thousandths narrower. Obstacles shrink
// by this (half on each side) so the piece fits again where it was; it is
// less than any visible tolerance.
const ROUND_SLACK = 0.012;

const asObstacle = (b, margin) => ({
  x: b.x - margin + ROUND_SLACK / 2,
  y: b.y - margin + ROUND_SLACK / 2,
  w: Math.max(0, b.w - ROUND_SLACK),
  h: Math.max(0, b.h - ROUND_SLACK),
});

/** Each sheet's obstacles (what is taken), in printable area coordinates. */
export function obstaclesBySheet(boxes, sheetIds, margin = 0) {
  return sheetIds.map((id) => boxes.filter((b) => b.sheet === id).map((b) => asObstacle(b, margin)));
}

/**
 * Places NEW pieces (`rects`: {id, w, h}) without moving those already there
 * (`boxes`), with `packInto`: fills the spaces from sheet `from` (an index in
 * `sheetIds`) on through the following ones; what doesn't fit goes to new
 * sheets at the end (`newId()` for each). The sheets before `from` aren't
 * touched.
 *
 * Gives {placements, sheets, unplaced}: `placements`, [{id, sheet, x, y,
 * rotated}] with x/y on the sheet; `sheets`, the new sheets' ids, in order;
 * `unplaced`, the ids that don't fit even alone on an empty sheet.
 */
export function placeIntoSheets(rects, boxes, sheetIds, { from = 0, area, margin = 0, gap = 0, rotate = true, newId }) {
  const start = Math.min(Math.max(0, from), Math.max(0, sheetIds.length - 1));
  const targets = sheetIds.slice(start);
  const result = packInto(rects, area.w, area.h, {
    gap,
    rotate,
    sheets: obstaclesBySheet(boxes, targets, margin),
    from: 0,
  });
  const fresh = new Map(); // new sheet's index → id
  const placements = result.placements.map((p) => {
    let sheet = targets[p.sheet];
    if (sheet === undefined) {
      if (!fresh.has(p.sheet)) fresh.set(p.sheet, newId());
      sheet = fresh.get(p.sheet);
    }
    return { id: p.id, sheet, x: margin + p.x, y: margin + p.y, rotated: p.rotated };
  });
  const sheets = [...fresh.entries()].sort((a, b) => a[0] - b[0]).map(([, id]) => id);
  return { placements, sheets, unplaced: result.unplaced };
}

/**
 * A free place for ONE piece (`rect`: {id, w, h}) on a sheet with those
 * obstacles (`boxes` of that sheet), without turning it. Gives {x, y} on the
 * sheet, or null when it doesn't fit there.
 */
export function spotOnSheet(rect, boxes, { area, margin = 0, gap = 0 }) {
  const result = packInto([rect], area.w, area.h, {
    gap,
    rotate: false,
    sheets: [boxes.map((b) => asObstacle(b, margin))],
  });
  const p = result.placements[0];
  return p && p.sheet === 0 ? { x: margin + p.x, y: margin + p.y } : null;
}

/**
 * The position nearest to (x, y) for a w × h piece with its center on the
 * W × H sheet: up to half of it may stick out, never all of it (so its frame
 * and toolbar always stay by the sheet). Gives {x, y}.
 */
export function keepCenterInside({ x, y, w, h }, W, H) {
  const fit = (v, size, total) => Math.min(Math.max(v, -size / 2), total - size / 2);
  return { x: fit(x, w, W), y: fit(y, h, H) };
}

/**
 * Where a box dropped on a new, empty W × H sheet goes ({x, y} of the box,
 * mm): its image corner (`pad` mm inside the box) snapped to the grid
 * (`snapStep`, 0: none), then the box inside the printable area (the sheet
 * minus `margin`) if it fits there, else inside the sheet; a box larger than
 * the sheet keeps its center inside.
 */
export function placeOnNewSheet({ x, y, w, h }, W, H, { snapStep = 0, pad = 0, margin = 0 } = {}) {
  const snap = (v) => (snapStep > 0 ? Math.round((v + pad) / snapStep) * snapStep - pad : v);
  const fit = (v, size, total) => {
    if (size <= total - 2 * margin) return Math.min(Math.max(v, margin), total - margin - size);
    if (size <= total) return Math.min(Math.max(v, 0), total - size);
    return Math.min(Math.max(v, -size / 2), total - size / 2);
  };
  return { x: fit(snap(x), w, W), y: fit(snap(y), h, H) };
}

/**
 * The closest free spot for `rect` ({x, y, w, h} mm) on a W × H sheet with
 * those `others`: inside the printable area (the sheet minus `margin`) if it
 * fits there, else anywhere on the sheet. Its own position when already free.
 * null when there is no room on that sheet.
 */
export function freeSpotNear(rect, others, { W, H, margin = 0 }) {
  const areas = [
    { x: margin, y: margin, w: W - 2 * margin, h: H - 2 * margin },
    { x: 0, y: 0, w: W, h: H },
  ];
  for (const bounds of areas) {
    if (bounds.w + EPS < rect.w || bounds.h + EPS < rect.h) continue;
    const spot = nearestFree(rect, others, { bounds });
    if (spot) return spot;
  }
  return null;
}

/**
 * Which sheet something whose center is at `y` (in the same system as
 * `tops`) belongs to: the one containing it or, when it falls between sheets
 * or outside, the nearest. `tops`: each sheet's top edge, in order;
 * `height`: the sheets' height. Gives the index (−1 without sheets).
 */
export function sheetAt(y, tops, height) {
  let best = -1;
  let bestDistance = Infinity;
  tops.forEach((top, i) => {
    const distance = y < top ? top - y : y > top + height ? y - top - height : 0;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Each piece's problems on its sheet (W×H, margin `margin`): it sticks out of
 * the sheet (`cut`), passes the margin (`pastMargin`) or overlaps another of
 * the SAME sheet (`overlap`). Gives Map id → {cut, pastMargin, overlap}.
 */
export function pieceProblems(boxes, { W, H, margin = 0 }) {
  const outside = (b, inset) =>
    b.x < inset - EPS || b.y < inset - EPS || b.x + b.w > W - inset + EPS || b.y + b.h > H - inset + EPS;
  const bySheet = new Map();
  for (const b of boxes) {
    if (!bySheet.has(b.sheet)) bySheet.set(b.sheet, []);
    bySheet.get(b.sheet).push(b);
  }
  const result = new Map();
  for (const b of boxes) {
    const cut = outside(b, 0);
    result.set(b.id, {
      cut,
      pastMargin: !cut && outside(b, margin),
      overlap: bySheet.get(b.sheet).some((o) => o !== b && overlaps(b, o)),
    });
  }
  return result;
}

/**
 * `pieceProblems` summed up by kind: how many pieces and on which sheets
 * (indices in `sheetIds`, ascending). {cut: {count, sheets}, pastMargin,
 * overlap}.
 */
export function problemSummary(problems, boxes, sheetIds) {
  const summary = {};
  for (const kind of ['cut', 'pastMargin', 'overlap']) {
    const hit = boxes.filter((b) => problems.get(b.id)?.[kind]);
    const sheets = [...new Set(hit.map((b) => sheetIds.indexOf(b.sheet)))].filter((i) => i >= 0).sort((a, b) => a - b);
    summary[kind] = { count: hit.length, sheets };
  }
  return summary;
}
