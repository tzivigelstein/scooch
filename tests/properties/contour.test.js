import { describe, expect, test } from 'vitest';
import { GRID_MAX, insideLoop, loopArea, placeLoops, traceShape } from '../../src/core/contour.js';
import { cutBox } from '../../src/core/cutmarks.js';
import { prng } from '../support/prng.js';
import { distanceToLoops, ellipse, maskOf } from '../support/contour.ts';

// Generated shapes (unions of ellipses, some with holes, some under a soft
// halo the threshold ignores), crops on whole pixels, margins from −1.5 to
// 6 mm and every rotation, checked against the mask itself: the line goes
// round everything opaque, the margin away from it, inside the cut box.

const THRESHOLD = 64;

function randomCase(rnd) {
  const big = rnd() < 0.1; // coarser than the grid: a cell covers several pixels
  const W = Math.round(big ? 900 + rnd() * 500 : 60 + rnd() * 240);
  const H = Math.round(big ? 600 + rnd() * 500 : 60 + rnd() * 240);
  const px = 0.1 + rnd() * 0.4; // mm per pixel
  const blobs = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () =>
    ellipse(rnd() * W, rnd() * H, 3 + rnd() * W * 0.3, 3 + rnd() * H * 0.3, rnd() * Math.PI)
  );
  const holes = Array.from({ length: rnd() < 0.4 ? 1 + Math.floor(rnd() * 2) : 0 }, () =>
    ellipse(rnd() * W, rnd() * H, 2 + rnd() * W * 0.1, 2 + rnd() * H * 0.1, rnd() * Math.PI)
  );
  const solid = (x, y) => blobs.some((b) => b(x, y)) && !holes.some((h) => h(x, y));
  const mask = maskOf(W, H, solid);
  if (rnd() < 0.3) {
    // A soft halo (under the threshold) around the shape.
    const halo = ellipse(W / 2, H / 2, W * 0.6, H * 0.6);
    mask.alpha.forEach((a, i) => {
      if (!a && halo((i % W) + 0.5, Math.floor(i / W) + 0.5)) mask.alpha[i] = THRESHOLD - 1 - Math.floor(rnd() * 40);
    });
  }
  let crop = null;
  let [cx, cy, cw, ch] = [0, 0, W, H];
  if (rnd() < 0.5) {
    cx = Math.floor(rnd() * W * 0.3);
    cy = Math.floor(rnd() * H * 0.3);
    cw = Math.max(8, Math.floor((W - cx) * (0.5 + rnd() * 0.5)));
    ch = Math.max(8, Math.floor((H - cy) * (0.5 + rnd() * 0.5)));
    crop = { x: cx / W, y: cy / H, w: cw / W, h: ch / H };
  }
  const margin = rnd() < 0.25 ? 0 : -1.5 + rnd() * 7.5;
  const r = [0, 90, 180, 270][Math.floor(rnd() * 4)];
  return { mask, crop, view: { cx, cy, cw, ch }, px, w: cw * px, h: ch * px, margin, r };
}

// The visible pixels: opaque (1), background the border reaches (0) or a hole (2),
// with specks (blobs the tracer drops) marked as background.
function visible({ mask, view }, least) {
  const { cx, cy, cw, ch } = view;
  const out = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) out[y * cw + x] = mask.alpha[(cy + y) * mask.width + cx + x] >= THRESHOLD ? 1 : 0;
  const flood = (start, match, mark, neighbours) => {
    const stack = [start];
    const seen = [start];
    out[start] = mark;
    while (stack.length) {
      const p = stack.pop();
      const x = p % cw;
      const y = (p - x) / cw;
      for (const [dx, dy] of neighbours) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= cw || yy >= ch) continue;
        const q = yy * cw + xx;
        if (out[q] === match) {
          out[q] = mark;
          stack.push(q);
          seen.push(q);
        }
      }
    }
    return seen;
  };
  const eight = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => [dx, dy])).filter(([dx, dy]) => dx || dy);
  const four = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const blobs = [];
  for (let p = 0; p < out.length; p++) if (out[p] === 1) blobs.push(flood(p, 1, 3, eight));
  const biggest = Math.max(0, ...blobs.map((b) => b.length));
  for (const blob of blobs) for (const p of blob) out[p] = blob.length < least && biggest >= least ? 0 : 1;
  // Background the border reaches: 4; the rest of the background is a hole.
  for (let p = 0; p < out.length; p++) {
    const x = p % cw;
    const y = (p - x) / cw;
    if (out[p] === 0 && (x === 0 || y === 0 || x === cw - 1 || y === ch - 1)) flood(p, 0, 4, four);
  }
  for (let p = 0; p < out.length; p++) out[p] = out[p] === 4 ? 0 : out[p] === 0 ? 2 : 1;
  return out;
}

// Distance (pixels) from (u, v) (pixels from the visible part's corner) to the
// nearest centre of a pixel whose value is `kind`, within `reach`.
function nearest(cells, cw, ch, u, v, kind, reach) {
  let best = Infinity;
  const x0 = Math.max(0, Math.floor(u - reach));
  const x1 = Math.min(cw - 1, Math.ceil(u + reach));
  const y0 = Math.max(0, Math.floor(v - reach));
  const y1 = Math.min(ch - 1, Math.ceil(v + reach));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (cells[y * cw + x] === kind) best = Math.min(best, Math.hypot(x + 0.5 - u, y + 0.5 - v));
  return best;
}

describe('traceShape (fuzz)', () => {
  test('the line goes round everything opaque in view, the margin away from it, and inside the cut box; null only without transparency or without anything opaque', () => {
    let traced = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const rnd = prng(seed);
      const c = randomCase(rnd);
      const label = `seed ${seed}`;
      const { cw, ch } = c.view;
      // The grid's cell (mm) as traceShape picks it, and the tolerance: two cells and a pixel.
      const cell = Math.max(c.px, (Math.max(c.w, c.h) + 2 * Math.max(0, c.margin)) / (GRID_MAX - 6));
      const tol = 2 * cell + c.px;
      const least = Math.max(2, 1e-4 * Math.ceil(c.w / cell - 1e-9) * Math.ceil(c.h / cell - 1e-9)) * (cell / c.px) ** 2;
      const cells = visible(c, least);
      const opaque = cells.reduce((n, v) => n + (v === 1 ? 1 : 0), 0);
      const background = cells.reduce((n, v) => n + (v === 0 ? 1 : 0), 0);
      const loops = traceShape(c.mask, { crop: c.crop, w: c.w, h: c.h, margin: c.margin });
      expect(traceShape(c.mask, { crop: c.crop, w: c.w, h: c.h, margin: c.margin }), `${label}: the same every time`).toEqual(loops);
      if (cell === c.px) expect(loops === null, `${label}: null`).toBe(opaque === 0 || (background === 0 && cells.every((v) => v === 1)));
      if (!loops) continue;
      traced++;
      const out = Math.max(0, c.margin);
      for (const [i, loop] of loops.entries()) {
        expect(loop.length, `${label}: loop ${i} has points`).toBeGreaterThanOrEqual(6);
        expect(loopArea(loop), `${label}: loop ${i} clockwise`).toBeGreaterThan(0);
        for (let k = 0; k < loop.length; k += 2) {
          const [u, v] = [loop[k], loop[k + 1]];
          expect(Number.isFinite(u) && Number.isFinite(v), `${label}: finite`).toBe(true);
          expect(u > -out - tol && u < c.w + out + tol && v > -out - tol && v < c.h + out + tol, `${label}: (${u}, ${v}) in the cut box`).toBe(true);
          // The margin away from the shape's edge (pixel squares: centres half a pixel in).
          if (c.margin >= 0) {
            const d = nearest(cells, cw, ch, u / c.px, v / c.px, 1, (c.margin + tol) / c.px + 1) * c.px - c.px / 2;
            expect(Math.abs(Math.max(0, d) - c.margin), `${label}: (${u}, ${v}) ${d} from the shape, margin ${c.margin}`).toBeLessThan(tol);
          } else {
            const toBackground = nearest(cells, cw, ch, u / c.px, v / c.px, 0, (-c.margin + tol) / c.px + 1) * c.px - c.px / 2;
            const d = Math.min(toBackground, u, v, c.w - u, c.h - v);
            expect(Math.abs(d + c.margin), `${label}: (${u}, ${v}) ${d} inside the shape, margin ${c.margin}`).toBeLessThan(tol);
          }
        }
        for (const [j, other] of loops.entries()) {
          if (j !== i) expect(insideLoop(other, loop[0], loop[1]), `${label}: loop ${i} not inside loop ${j}`).toBe(false);
        }
      }
      // Nothing opaque is left outside the line (where it goes out, at a sharp tip, by less than the tolerance).
      if (c.margin >= 0) {
        const step = Math.max(1, Math.floor(opaque / 400));
        let n = 0;
        for (let p = 0; p < cells.length; p++) {
          if (cells[p] !== 1 || n++ % step) continue;
          const u = ((p % cw) + 0.5) * c.px;
          const v = (Math.floor(p / cw) + 0.5) * c.px;
          if (!loops.some((loop) => insideLoop(loop, u, v))) expect(distanceToLoops(loops, u, v), `${label}: opaque (${u}, ${v}) outside the line`).toBeLessThan(tol);
        }
      }
    }
    expect(traced).toBeGreaterThan(80);
  });

  test('placed on the sheet, turned with the piece, the line stays inside the piece’s cut box and keeps its shape', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rnd = prng(1000 + seed);
      const c = randomCase(rnd);
      const loops = traceShape(c.mask, { crop: c.crop, w: c.w, h: c.h, margin: c.margin });
      if (!loops?.length) continue;
      const k = 0.5 + rnd() * 2;
      const at = { x: rnd() * 100, y: rnd() * 100 };
      const placed = placeLoops(loops, { ...at, r: c.r, uw: c.w * k, uh: c.h * k, k });
      const [bw, bh] = c.r % 180 ? [c.h * k, c.w * k] : [c.w * k, c.h * k];
      const box = cutBox({ ...at, w: bw, h: bh }, Math.max(0, c.margin) * k);
      const cell = Math.max(c.px, (Math.max(c.w, c.h) + 2 * Math.max(0, c.margin)) / (GRID_MAX - 6));
      const tol = (2 * cell + c.px) * k;
      placed.forEach((loop, i) => {
        expect(loopArea(loop)).toBeCloseTo(loopArea(loops[i]) * k * k, 6);
        for (let p = 0; p < loop.length; p += 2) {
          expect(loop[p] > box.x - tol && loop[p] < box.x + box.w + tol, `seed ${seed}: x`).toBe(true);
          expect(loop[p + 1] > box.y - tol && loop[p + 1] < box.y + box.h + tol, `seed ${seed}: y`).toBe(true);
        }
      });
    }
  });
});
