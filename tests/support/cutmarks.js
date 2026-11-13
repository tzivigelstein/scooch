// Helpers shared by the cut line tests (unit, properties and performance).

import assert from 'node:assert/strict';

export const TOL = 1e-6;

/** An n×n grid of pieces of `size` mm, `gap` apart, from (x0, y0). */
export function grid(n, size, gap, x0 = 0, y0 = 0) {
  const out = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      out.push({ x: x0 + col * (size + gap), y: y0 + row * (size + gap), w: size, h: size });
    }
  }
  return out;
}

// Properties of any result: on an axis, positive length, in order and with no
// collinear segments that overlap or touch (they are already joined).
export function assertWellFormed(segments, label = '') {
  for (const s of segments) {
    const horizontal = s.y1 === s.y2;
    assert.ok(horizontal || s.x1 === s.x2, `${label}: neither horizontal nor vertical ${JSON.stringify(s)}`);
    assert.ok(s.x1 <= s.x2 && s.y1 <= s.y2, `${label}: ends reversed ${JSON.stringify(s)}`);
    assert.ok(s.x2 - s.x1 + (s.y2 - s.y1) > TOL, `${label}: zero length ${JSON.stringify(s)}`);
  }
  const keyed = segments.map((s) => (s.y1 === s.y2 ? ['h', s.y1, s.x1, s.x2] : ['v', s.x1, s.y1, s.y2]));
  for (let i = 1; i < keyed.length; i++) {
    const [d0, c0, a0, b0] = keyed[i - 1];
    const [d1, c1, a1] = keyed[i];
    const ordered = d0 < d1 || (d0 === d1 && (c0 < c1 - TOL || (Math.abs(c0 - c1) <= TOL && a0 <= a1)));
    assert.ok(ordered, `${label}: out of order at ${i}`);
    if (d0 === d1 && Math.abs(c0 - c1) <= TOL) assert.ok(a1 > b0 + TOL, `${label}: collinear ones not joined at ${i}`);
  }
}

// Is any point of the segment strictly inside the piece?
export function entersPiece(s, q) {
  if (s.y1 === s.y2) {
    if (!(s.y1 > q.y + TOL && s.y1 < q.y + q.h - TOL)) return false;
    return Math.min(s.x2, q.x + q.w) - Math.max(s.x1, q.x) > TOL;
  }
  if (!(s.x1 > q.x + TOL && s.x1 < q.x + q.w - TOL)) return false;
  return Math.min(s.y2, q.y + q.h) - Math.max(s.y1, q.y) > TOL;
}
