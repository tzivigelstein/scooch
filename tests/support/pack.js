// Helpers shared by the packing tests (unit, properties and performance):
// generated pieces and cases, and checkers of what `pack`, `packSheets` and
// `packInto` return.

import assert from 'node:assert/strict';

export const TOL = 1e-6;

/** `n` equal pieces `w` × `h`, with ids `${prefix}0`, `${prefix}1`, … */
export const copies = (n, w, h, prefix = 'p') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, w, h }));

/** The pieces scaled by `k` (same ids). */
export const scaled = (rects, k) => rects.map((r) => ({ id: r.id, w: r.w * k, h: r.h * k }));

/** The distinct values (to 1e-6), sorted. */
export const sortedUnique = (values) => [...new Set(values.map((v) => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);

/** Euclidean distance between two rectangles (0 when they touch or overlap). */
export function distance(a, b) {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

export const overlaps = (a, b) =>
  a.x < b.x + b.w - TOL && b.x < a.x + a.w - TOL && a.y < b.y + b.h - TOL && b.y < a.y + a.h - TOL;

/**
 * Checks every invariant of a `pack` result and returns the final boxes
 * ({id, x, y, w, h}, with the orientation applied).
 */
export function assertValid(rects, W, H, result, { gap = 0, rotate = true, obstacles = [] } = {}, label = '') {
  const where = label ? ` [${label}]` : '';
  assert.ok(Array.isArray(result), `expected an array${where}`);
  assert.equal(result.length, rects.length, `number of pieces${where}`);

  const byId = new Map(rects.map((r) => [r.id, r]));
  const seen = new Set();
  const boxes = result.map((p) => {
    const r = byId.get(p.id);
    assert.ok(r, `unknown id ${p.id}${where}`);
    assert.ok(!seen.has(p.id), `repeated id ${p.id}${where}`);
    seen.add(p.id);
    assert.equal(typeof p.rotated, 'boolean', `rotated is not a boolean${where}`);
    if (!rotate) assert.equal(p.rotated, false, `piece ${p.id} rotated with rotate:false${where}`);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `invalid position ${p.id}${where}`);
    const w = p.rotated ? r.h : r.w;
    const h = p.rotated ? r.w : r.h;
    const box = { id: p.id, x: p.x, y: p.y, w, h };
    assert.ok(
      box.x >= -TOL && box.y >= -TOL && box.x + w <= W + TOL && box.y + h <= H + TOL,
      `piece ${p.id} outside the area: ${JSON.stringify(box)} in ${W}×${H}${where}`
    );
    return box;
  });

  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      assert.ok(!overlaps(a, b), `${a.id} and ${b.id} overlap${where}`);
      assert.ok(
        distance(a, b) >= gap - TOL,
        `${a.id} and ${b.id} at ${distance(a, b)} < gap ${gap}${where}`
      );
    }
    for (const o of obstacles) {
      assert.ok(!overlaps(a, o), `${a.id} overlaps the obstacle ${JSON.stringify(o)}${where}`);
      assert.ok(
        distance(a, o) >= gap - TOL,
        `${a.id} at ${distance(a, o)} from the obstacle < gap ${gap}${where}`
      );
    }
  }
  return boxes;
}

/** A random `pack` case: area, pieces and options (gap, rotation, obstacles). */
export function randomCase(rnd) {
  const integer = rnd() < 0.4; // whole measures: more exact contacts
  const num = (v) => (integer ? Math.max(1, Math.round(v)) : v);
  const W = num(40 + rnd() * 400);
  const H = num(40 + rnd() * 400);
  const n = 1 + Math.floor(rnd() * 40);
  const gap = rnd() < 0.3 ? 0 : num(rnd() * 10);
  const rotate = rnd() < 0.6;
  const big = rnd() < 0.5 ? 0.15 : 0.45;
  const rects = Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    w: num(1 + rnd() * W * big),
    h: num(1 + rnd() * H * big),
  }));
  const obstacles =
    rnd() < 0.5
      ? Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => ({
          x: num(-30 + rnd() * (W + 30)),
          y: num(-30 + rnd() * (H + 30)),
          w: num(1 + rnd() * W * 0.4),
          h: num(1 + rnd() * H * 0.4),
        }))
      : [];
  return { W, H, rects, opts: { gap, rotate, obstacles } };
}

/** `n` random pieces with sides from 5 to 5 + `maxSide`, ids `r0`, `r1`, … */
export function randomPieces(rnd, n, maxSide) {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, w: 5 + rnd() * maxSide, h: 5 + rnd() * maxSide }));
}

/** Lower bound of sheets by area (each piece reserves its gap to the right and below). */
export function areaBound(rects, W, H, gap) {
  const area = rects.reduce((s, r) => s + (r.w + gap) * (r.h + gap), 0);
  return Math.ceil(area / ((W + gap) * (H + gap)) - 1e-9);
}

/** The area the placed pieces take. */
export const areaOf = (rects, placements) => {
  const byId = new Map(rects.map((r) => [r.id, r]));
  return placements.reduce((s, p) => s + byId.get(p.id).w * byId.get(p.id).h, 0);
};

/**
 * Invariants of packSheets: every sheet valid, every id exactly once (on a
 * sheet or in unplaced) and sheets from the fullest to the emptiest.
 */
export function assertSheets(rects, W, H, result, opts = {}, label = '') {
  const where = label ? ` [${label}]` : '';
  assert.ok(Array.isArray(result.sheets) && Array.isArray(result.unplaced), `shape of the result${where}`);
  const byId = new Map(rects.map((r) => [r.id, r]));
  const seen = new Set();
  const note = (id) => {
    assert.ok(byId.has(id), `unknown id ${id}${where}`);
    assert.ok(!seen.has(id), `id ${id} twice${where}`);
    seen.add(id);
  };
  result.sheets.forEach((sheet, i) => {
    assert.ok(sheet.length > 0, `sheet ${i} empty${where}`);
    const mine = sheet.map((p) => byId.get(p.id));
    assertValid(mine, W, H, sheet, opts, `sheet ${i}${label ? `, ${label}` : ''}`);
    for (const p of sheet) note(p.id);
  });
  for (const id of result.unplaced) note(id);
  assert.equal(seen.size, rects.length, `missing pieces${where}`);
  const areas = result.sheets.map((sheet) => areaOf(rects, sheet));
  for (let i = 1; i < areas.length; i++) {
    assert.ok(areas[i] <= areas[i - 1] + 1e-6, `sheet ${i} fuller than the one before: ${areas}${where}`);
  }
  return areas;
}

/** Invariants of packInto against the existing sheets. */
export function assertInto(rects, W, H, sheets, result, { gap = 0, rotate = true } = {}, label = '') {
  const where = label ? ` [${label}]` : '';
  const byId = new Map(rects.map((r) => [r.id, r]));
  const seen = new Set();
  for (const id of [...result.placements.map((p) => p.id), ...result.unplaced]) {
    assert.ok(byId.has(id), `unknown id ${id}${where}`);
    assert.ok(!seen.has(id), `id ${id} twice${where}`);
    seen.add(id);
  }
  assert.equal(seen.size, rects.length, `missing pieces${where}`);
  const bySheet = new Map();
  for (const p of result.placements) {
    assert.ok(Number.isInteger(p.sheet) && p.sheet >= 0, `invalid sheet ${p.sheet}${where}`);
    if (!bySheet.has(p.sheet)) bySheet.set(p.sheet, []);
    bySheet.get(p.sheet).push(p);
  }
  const fresh = [...bySheet.keys()].filter((s) => s >= sheets.length).sort((a, b) => a - b);
  fresh.forEach((s, i) => assert.equal(s, sheets.length + i, `new sheets skipped${where}`));
  for (const [s, list] of bySheet) {
    const obstacles = s < sheets.length ? sheets[s] : [];
    const mine = list.map((p) => byId.get(p.id));
    const placements = list.map(({ id, x, y, rotated }) => ({ id, x, y, rotated }));
    assertValid(mine, W, H, placements, { gap, rotate, obstacles }, `sheet ${s}${label ? `, ${label}` : ''}`);
  }
  return bySheet;
}
