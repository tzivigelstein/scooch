// Pieces that change size (a standard photo size, a crop) and where they end
// up. Pure: the state works these plans out from the document, shows them on
// the sheet before anything is chosen (state/preview.ts) and applies the very
// same plan (state/actions/crop.ts, state/actions/layout.ts), so what shows
// and what happens can't differ.
//
// Rules: each piece keeps its center, which stays on its sheet; unless
// overlaps are allowed, one that would land on another moves to the closest
// free spot of its sheet or, without room there, to the free gaps of the next
// sheets (adding sheets at the end). One that doesn't fit even alone on an
// empty sheet stays where it is.

import { overlapsAny } from './collide.js';
import { fitToSize, pieceSize } from './crop.js';
import { SCALE_RANGE } from './group.js';
import { packedRotation } from './pack.js';
import { freeSpotNear, keepCenterInside, pieceProblems, placeIntoSheets } from './sheets.js';
import { tidy } from './util.js';

const same = (a, b) => Math.abs(a - b) < 1e-9;
const sameCrop = (a, b) => (!a || !b ? a === b : same(a.x, b.x) && same(a.y, b.y) && same(a.w, b.w) && same(a.h, b.h));

/** `item` with `patch` applied, moved so its center stays where it was. */
export function withCenterKept(item, patch, asset) {
  const before = pieceSize(asset, item);
  const next = { ...item, ...patch };
  const after = pieceSize(asset, next);
  return { ...next, x: item.x + before.w / 2 - after.w / 2, y: item.y + before.h / 2 - after.h / 2 };
}

/** The piece's layout box: its image with `pad` mm around it. */
function boxOf(item, asset, pad) {
  const { w, h } = pieceSize(asset, item);
  return { id: item.id, sheet: item.sheet, x: item.x - pad, y: item.y - pad, w: w + 2 * pad, h: h + 2 * pad };
}

/**
 * Where pieces that changed size go (see the rules above). `changed`: those
 * pieces with their new crop and scale, centered where they were; `items`:
 * every piece as it is now, in stacking order. Options: `assetOf(item)` (its
 * size at 100 %), the sheet (`W`, `H`, `margin`, `gap`), the cut margin
 * around each image (`pad`), `allowOverlap` and `newSheet()`, the id of each
 * sheet to add. Returns the changed pieces where they go (in the order of
 * `changed`), the ids that moved aside (to a free spot or another sheet) and
 * the sheets to add.
 */
export function settleResized(changed, items, sheetIds, { assetOf, W, H, margin = 0, gap = 0, pad = 0, allowOverlap = false, newSheet }) {
  const box = (item) => boxOf(item, assetOf(item), pad);
  const next = new Map(changed.map((item) => [item.id, { ...item }]));
  for (const item of next.values()) {
    const { w, h } = pieceSize(assetOf(item), item);
    Object.assign(item, keepCenterInside({ x: item.x, y: item.y, w, h }, W, H));
  }
  const all = items.map((item) => next.get(item.id) ?? item);
  const moved = [];
  const homeless = new Set();
  if (!allowOverlap) {
    for (const item of next.values()) {
      const rect = box(item);
      const others = all.filter((other) => other.sheet === item.sheet && other.id !== item.id && !homeless.has(other.id)).map(box);
      if (!overlapsAny(rect, others)) continue;
      const spot = freeSpotNear(rect, others, { W, H, margin });
      if (spot) {
        item.x = tidy(spot.x + pad);
        item.y = tidy(spot.y + pad);
        moved.push(item.id);
      } else homeless.add(item.id);
    }
  }
  let sheets = [];
  const aw = W - 2 * margin;
  const ah = H - 2 * margin;
  if (homeless.size && aw > 0 && ah > 0) {
    // Without room on their sheet: placed like new pieces from that sheet on, unrotated.
    const away = all.filter((item) => homeless.has(item.id));
    const rects = away.map((item) => {
      const { w, h } = pieceSize(assetOf(item), item);
      return { id: item.id, w: w + 2 * pad, h: h + 2 * pad };
    });
    const rest = all.filter((item) => !homeless.has(item.id)).map(box);
    const plan = placeIntoSheets(rects, rest, sheetIds, { from: sheetIds.indexOf(away[0].sheet), area: { w: aw, h: ah }, margin, gap, rotate: false, newId: newSheet });
    const byId = new Map(plan.placements.map((p) => [p.id, p]));
    for (const item of away) {
      const p = byId.get(item.id);
      if (!p) continue;
      Object.assign(item, { sheet: p.sheet, x: tidy(p.x + pad), y: tidy(p.y + pad), r: packedRotation(item.r, p.rotated) });
      moved.push(item.id);
    }
    sheets = plan.sheets;
  }
  return { items: [...next.values()], moved, sheets };
}

/**
 * What choosing a standard photo size does to `selected` (a size {w, h} in
 * mm: EXACTLY that size on the sheet, cropping the overflow centered, never
 * distorting, turned to the image as it is seen; null: «Original», no crop),
 * without changing anything. Options: those of settleResized plus `items`
 * (every piece) and `sheetIds`. Returns:
 * - `changed`: the pieces that change, where they go (settleResized);
 * - `refused`: the pieces whose scale would leave 1 %–1000 %, as they would
 *   be (they don't change);
 * - `moved` and `sheets`, as settleResized;
 * - `problems`: the ids of changed pieces that end up off the sheet or, with
 *   overlaps not allowed, on another piece (one that doesn't fit anywhere).
 */
export function planPhotoSize(selected, size, { items, sheetIds, ...options }) {
  const { assetOf, W, H, margin = 0, pad = 0, allowOverlap = false } = options;
  const resized = [];
  const refused = [];
  for (const item of selected) {
    const asset = assetOf(item);
    if (!size) {
      if (item.crop) resized.push(withCenterKept(item, { crop: null }, asset));
      continue;
    }
    const fit = fitToSize(asset, item.r, size);
    const next = withCenterKept(item, { crop: fit.crop, scale: fit.scale }, asset);
    if (fit.scale < SCALE_RANGE.min || fit.scale > SCALE_RANGE.max) refused.push(next);
    else if (!sameCrop(next.crop, item.crop) || !same(next.scale, item.scale)) resized.push(next);
  }
  if (!resized.length) return { changed: [], refused, moved: [], sheets: [], problems: [] };
  const settled = settleResized(resized, items, sheetIds, options);
  const placed = new Map(settled.items.map((item) => [item.id, item]));
  const after = items.map((item) => boxOf(placed.get(item.id) ?? item, assetOf(item), pad));
  const found = pieceProblems(after, { W, H, margin });
  const problems = settled.items.filter(({ id }) => found.get(id).cut || (!allowOverlap && found.get(id).overlap)).map((item) => item.id);
  return { changed: settled.items, refused, moved: settled.moved, sheets: settled.sheets, problems };
}
