import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { planGroup, containScaleRange } from '../../src/core/group.js';
import { align, distribute, moveBy, rotateGroup, scaleGroup, bounds } from '../../src/core/align.js';
import { overlaps } from '../../src/core/collide.js';
import { prng } from '../support/prng.js';

const b = (id, sheet, x, y, w, h) => ({ id, sheet, x, y, w, h });
const A4 = { W: 210, H: 297 };

describe('planGroup', () => {
  test('fuzz: when valid, nothing overlaps and the centers stay on the sheet', () => {
    const rnd = prng(8);
    const ops = [
      (rects) => align(rects, ['left', 'centerX', 'right', 'top', 'centerY', 'bottom'][Math.floor(rnd() * 6)]),
      (rects) => distribute(rects, rnd() < 0.5 ? 'x' : 'y', { gap: rnd() * 10 }),
      (rects) => distribute(rects, rnd() < 0.5 ? 'x' : 'y', { within: bounds(rects) }),
      (rects) => moveBy(rects, rnd() * 300 - 150, rnd() * 300 - 150),
      (rects) => rotateGroup(rects, rnd() < 0.5 ? 'cw' : 'ccw').rects,
      (rects) => scaleGroup(rects, 0.3 + rnd() * 2, 'center').rects,
    ];
    let valid = 0;
    for (let n = 0; n < 400; n++) {
      const list = Array.from({ length: 2 + Math.floor(rnd() * 8) }, (_, i) =>
        b(i + 1, 1 + Math.floor(rnd() * 2), rnd() * 190, rnd() * 270, 5 + rnd() * 40, 5 + rnd() * 40)
      );
      const chosen = new Set(list.filter(() => rnd() < 0.6).map((x) => x.id));
      if (!chosen.size) continue;
      const snap = rnd() < 0.5 ? { step: [1, 3.175, 5][n % 3] } : null;
      const plan = planGroup(list, chosen, ops[n % ops.length], { ...A4, snap });
      if (!plan.ok) continue;
      valid++;
      const final = list.map((x) => (plan.rects.has(x.id) ? { ...x, ...plan.rects.get(x.id) } : x));
      for (const r of final) {
        if (!chosen.has(r.id)) continue;
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        assert.ok(cx >= -1e-6 && cx <= 210 + 1e-6 && cy >= -1e-6 && cy <= 297 + 1e-6, `case ${n}: center outside`);
        for (const o of final) {
          if (o === r || o.sheet !== r.sheet) continue;
          assert.equal(overlaps(r, o), false, `case ${n}: ${r.id} overlaps ${o.id}`);
        }
      }
    }
    assert.ok(valid > 50, `valid cases: ${valid}`);
  });
});

describe('containScaleRange', () => {
  test('within the range every center stays on the sheet (fuzz)', () => {
    const rnd = prng(3);
    for (let n = 0; n < 200; n++) {
      const list = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, i) => b(i, 1, rnd() * 200 - 10, rnd() * 290 - 10, 1 + rnd() * 30, 1 + rnd() * 30));
      const anchor = { x: rnd() * 210, y: rnd() * 297 };
      const { min, max } = containScaleRange(list, anchor, 210, 297);
      if (min > max) continue;
      for (const k of [Math.max(min, 1e-3), Math.min(max, 10)]) {
        for (const r of scaleGroup(list, k, anchor).rects) {
          const cx = r.x + r.w / 2;
          const cy = r.y + r.h / 2;
          assert.ok(cx >= -1e-6 && cx <= 210 + 1e-6 && cy >= -1e-6 && cy <= 297 + 1e-6, `case ${n}`);
        }
      }
    }
  });
});
