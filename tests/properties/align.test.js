import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { ALIGN_MODES, bounds, align, distribute, moveBy, scaleGroup, rotateGroup, snapGroup, validate } from '../../src/core/align.js';
import { prng } from '../support/prng.js';

const r = (id, x, y, w, h) => ({ id, x, y, w, h });
const TOL = 1e-9;

function assertRectsClose(actual, expected, label = '', tol = TOL) {
  assert.equal(actual.length, expected.length, `count ${label}`);
  actual.forEach((a, i) => {
    const e = expected[i];
    assert.equal(a.id, e.id, `id ${label}`);
    for (const k of ['x', 'y', 'w', 'h']) {
      assert.ok(Math.abs(a[k] - e[k]) <= tol, `${label} piece ${a.id}.${k}: ${a[k]} ≠ ${e[k]}`);
    }
  });
}

function randomGroup(rnd, n = 2 + Math.floor(rnd() * 6)) {
  return Array.from({ length: n }, (_, i) =>
    r(`p${i}`, rnd() * 200 - 20, rnd() * 300 - 20, 1 + rnd() * 60, 1 + rnd() * 60)
  );
}

describe('align', () => {
  test('idempotent: aligning twice changes nothing', () => {
    const rnd = prng(5);
    for (let n = 0; n < 50; n++) {
      const rects = randomGroup(rnd);
      const area = { x: 10, y: 10, w: 190, h: 277 };
      for (const mode of ALIGN_MODES) {
        const once = align(rects, mode);
        assertRectsClose(align(once, mode), once, `${mode} selection, case ${n}`);
        const onSheet = align(rects, mode, area);
        assertRectsClose(align(onSheet, mode, area), onSheet, `${mode} sheet, case ${n}`);
      }
    }
  });
});

describe('distribute', () => {
  test('keeps the order and the ends of each mode, and is idempotent (fuzz)', () => {
    const rnd = prng(9);
    for (let n = 0; n < 100; n++) {
      const rects = randomGroup(rnd, 3 + Math.floor(rnd() * 6));
      const axis = n % 2 ? 'x' : 'y';
      const [pos, size] = axis === 'x' ? ['x', 'w'] : ['y', 'h'];
      const sortedIds = (list) => [...list].sort((a, b) => a[pos] - b[pos] || a[size] - b[size]).map((p) => p.id);
      const first = rects.reduce((m, p) => Math.min(m, p[pos]), Infinity);

      const gap = Math.round(rnd() * 10);
      const g = distribute(rects, axis, { gap });
      assert.deepEqual(sortedIds(g), sortedIds(rects), `order with gap, case ${n}`);
      assert.ok(Math.abs(Math.min(...g.map((p) => p[pos])) - first) <= TOL, `anchor, case ${n}`);
      const ordered = [...g].sort((a, b) => a[pos] - b[pos]);
      for (let i = 1; i < ordered.length; i++) {
        const space = ordered[i][pos] - (ordered[i - 1][pos] + ordered[i - 1][size]);
        assert.ok(Math.abs(space - gap) <= 1e-9, `space ${space} ≠ ${gap}, case ${n}`);
      }
      assertRectsClose(distribute(g, axis, { gap }), g, `idempotent with gap, case ${n}`);

      const total = rects.reduce((s, p) => s + p[size], 0);
      const box = { x: -5, y: -5, w: total + 100, h: total + 100 };
      const w = distribute(rects, axis, { within: box });
      assert.deepEqual(sortedIds(w), sortedIds(rects), `order with within, case ${n}`);
      const wo = [...w].sort((a, b) => a[pos] - b[pos]);
      assert.equal(wo[0][pos], box[pos]);
      assert.equal(wo[wo.length - 1][pos] + wo[wo.length - 1][size], box[pos] + box[size]);
      const spaces = wo.slice(1).map((p, i) => p[pos] - (wo[i][pos] + wo[i][size]));
      for (const s of spaces) assert.ok(Math.abs(s - 100 / (wo.length - 1)) <= 1e-9, `space ${s}, case ${n}`);
      assertRectsClose(distribute(w, axis, { within: box }), w, `idempotent with within, case ${n}`);
    }
  });
});

describe('group transformations', () => {
  test('scaleGroup: k and then 1/k comes back to the start', () => {
    const rnd = prng(21);
    for (let n = 0; n < 50; n++) {
      const rects = randomGroup(rnd);
      const k = 0.2 + rnd() * 4;
      const anchor = ['center', 'top-left', 'bottom-right', 'left', { x: 12.5, y: -3 }][n % 5];
      const there = scaleGroup(rects, k, anchor).rects;
      // Named anchors fall on the same point of the scaled box.
      assertRectsClose(scaleGroup(there, 1 / k, anchor).rects, rects, `case ${n}`, 1e-9);
    }
  });

  test('rotateGroup: four turns come back to the start; clockwise and counterclockwise cancel out', () => {
    const rnd = prng(33);
    for (let n = 0; n < 50; n++) {
      const rects = randomGroup(rnd);
      let turned = rects;
      for (let i = 0; i < 4; i++) turned = rotateGroup(turned, n % 2 ? 'cw' : 'ccw').rects;
      assertRectsClose(turned, rects, `4 turns, case ${n}`, 1e-9);
      const back = rotateGroup(rotateGroup(rects, 'cw').rects, 'ccw').rects;
      assertRectsClose(back, rects, `there and back, case ${n}`, 1e-9);
      // Rotating does not change whether they overlap.
      assert.equal(validate(rotateGroup(rects).rects, []), validate(rects, []), `case ${n}`);
    }
  });

  test('snapGroup: the corner of the box lands on the grid without deforming the group (fuzz)', () => {
    const rnd = prng(44);
    for (let n = 0; n < 50; n++) {
      const rects = randomGroup(rnd);
      const step = [1, 2.5, 3.175, 5, 10][n % 5];
      const snapped = snapGroup(rects, step);
      const b = bounds(snapped);
      assert.ok(Math.abs(b.x / step - Math.round(b.x / step)) < 1e-9, `x on the grid, case ${n}`);
      assert.ok(Math.abs(b.y / step - Math.round(b.y / step)) < 1e-9, `y on the grid, case ${n}`);
      // The same delta for all: internal distances intact, delta ≤ half a step.
      const dx = snapped[0].x - rects[0].x;
      const dy = snapped[0].y - rects[0].y;
      assert.ok(Math.abs(dx) <= step / 2 + 1e-9 && Math.abs(dy) <= step / 2 + 1e-9, `case ${n}`);
      assertRectsClose(snapped, moveBy(rects, dx, dy), `case ${n}`, 1e-9);
      assertRectsClose(snapGroup(snapped, step), snapped, `idempotent, case ${n}`, 1e-9);
    }
  });
});
