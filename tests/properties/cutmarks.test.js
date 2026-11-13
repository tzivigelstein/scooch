import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { cutLines } from '../../src/core/cutmarks.js';
import { prng, shuffled } from '../support/prng.js';
import { TOL, assertWellFormed, entersPiece, grid } from '../support/cutmarks.js';

const insideBounds = (s, b) =>
  s.x1 >= b.x - TOL && s.x2 <= b.x + b.w + TOL && s.y1 >= b.y - TOL && s.y2 <= b.y + b.h + TOL;

describe('cutLines (fuzz)', () => {
  function randomCase(rnd) {
    const W = 100 + rnd() * 200;
    const Hh = 100 + rnd() * 250;
    const n = 1 + Math.floor(rnd() * 25);
    const integer = rnd() < 0.5; // whole measures: more aligned edges and exact contacts
    const num = (v) => (integer ? Math.round(v) : v);
    const pieces = Array.from({ length: n }, () => ({
      x: num(-10 + rnd() * W),
      y: num(-10 + rnd() * Hh),
      w: Math.max(1, num(1 + rnd() * 60)),
      h: Math.max(1, num(1 + rnd() * 60)),
    }));
    // Sometimes a grid (aligned pieces, with small and large gaps).
    if (rnd() < 0.3)
      pieces.push(
        ...grid(1 + Math.floor(rnd() * 4), num(5 + rnd() * 30), num(rnd() * 12), num(rnd() * 50), num(rnd() * 50))
      );
    const opts = { length: 1 + rnd() * 8, offset: rnd() * 4 };
    return { pieces, bounds: { x: 0, y: 0, w: W, h: Hh }, opts };
  }

  test("'corners': nothing inside a piece or outside the sheet", () => {
    let total = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const { pieces, bounds, opts } = randomCase(prng(seed));
      const label = `seed ${seed}`;
      const segments = cutLines(pieces, { ...opts, mode: 'corners', bounds });
      assertWellFormed(segments, label);
      total += segments.length;
      for (const s of segments) {
        assert.ok(insideBounds(s, bounds), `${label}: outside ${JSON.stringify(s)}`);
        for (const q of pieces)
          assert.ok(!entersPiece(s, q), `${label}: ${JSON.stringify(s)} enters ${JSON.stringify(q)}`);
      }
      // Without bounds none enters a piece either, and the input order doesn't matter.
      const free = cutLines(pieces, opts);
      assertWellFormed(free, `${label} without bounds`);
      for (const s of free) for (const q of pieces) assert.ok(!entersPiece(s, q), `${label} without bounds`);
      assert.deepEqual(cutLines(shuffled(pieces, prng(seed)), opts), free, `${label}: order`);
    }
    assert.ok(total > 1000, `only ${total} segments`);
  });

  test("'corners': every mark survives except where another piece covers it", () => {
    // Loose, separate pieces: every mark whole.
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = prng(seed * 3);
      const n = 1 + Math.floor(rnd() * 5);
      const pieces = Array.from({ length: n }, (_, i) => ({
        x: i * 100 + rnd() * 10,
        y: rnd() * 100,
        w: 5 + rnd() * 30,
        h: 5 + rnd() * 30,
      }));
      const segments = cutLines(pieces);
      assert.equal(segments.length, 8 * n, `seed ${seed}`);
      for (const s of segments) assert.ok(Math.abs(s.x2 - s.x1 + (s.y2 - s.y1) - 4) < 1e-9, `seed ${seed}: length`);
    }
  });

  test("'outline': every edge of every piece is covered by a single segment", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { pieces } = randomCase(prng(seed * 7));
      const segments = cutLines(pieces, { mode: 'outline' });
      assertWellFormed(segments, `seed ${seed}`);
      const covered = (dir, c, a, b) =>
        segments.some((s) =>
          dir === 'h'
            ? s.y1 === s.y2 && Math.abs(s.y1 - c) <= TOL && s.x1 <= a + TOL && s.x2 >= b - TOL
            : s.x1 === s.x2 && Math.abs(s.x1 - c) <= TOL && s.y1 <= a + TOL && s.y2 >= b - TOL
        );
      // Every edge of a piece that no piece above it overlaps (an overlapped one is checked apart).
      const overlapped = (q, i) => pieces.slice(i + 1).some((o) => q.x < o.x + o.w - TOL && o.x < q.x + q.w - TOL && q.y < o.y + o.h - TOL && o.y < q.y + q.h - TOL);
      pieces.forEach((q, i) => {
        if (overlapped(q, i)) return;
        assert.ok(covered('h', q.y, q.x, q.x + q.w) && covered('h', q.y + q.h, q.x, q.x + q.w), `seed ${seed}`);
        assert.ok(covered('v', q.x, q.y, q.y + q.h) && covered('v', q.x + q.w, q.y, q.y + q.h), `seed ${seed}`);
      });
      // Whatever runs inside a piece is the edge of a piece stacked above it.
      const onEdge = (s, o) => (s.y1 === s.y2 ? [o.y, o.y + o.h].some((y) => Math.abs(y - s.y1) <= TOL) : [o.x, o.x + o.w].some((x) => Math.abs(x - s.x1) <= TOL));
      for (const s of segments) {
        pieces.forEach((q, i) => {
          if (entersPiece(s, q)) assert.ok(pieces.slice(i + 1).some((o) => onEdge(s, o)), `seed ${seed}: an outline under a piece above it ${JSON.stringify(s)}`);
        });
      }
      // No segment leaves the union of the edges: the total length doesn't exceed the sum of the perimeters.
      const length = segments.reduce((s, g) => s + (g.x2 - g.x1) + (g.y2 - g.y1), 0);
      const perimeters = pieces.reduce((s, q) => s + 2 * (q.w + q.h), 0);
      assert.ok(length <= perimeters + 1e-6, `seed ${seed}`);
    }
  });
});
