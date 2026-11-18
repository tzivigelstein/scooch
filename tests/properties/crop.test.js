import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { clampCrop, pieceSize, cropToAspect, drawParams, cssParams } from '../../src/core/crop.js';
import { prng } from '../support/prng.js';
import { PT_PER_MM, ROTATIONS, assertCropInside, close, cssPoint } from '../support/crop.js';

// What pdf-lib does with drawImage: translate(x, y) · rotate(θ) · scale(width,
// height), with θ in counterclockwise degrees. (u, v) is a point of the
// image’s unit square, with v up.
function pdfPoint(p, u, v) {
  const t = (p.rotate * Math.PI) / 180;
  const lx = u * p.width;
  const ly = v * p.height;
  return { x: p.x + lx * Math.cos(t) - ly * Math.sin(t), y: p.y + lx * Math.sin(t) + ly * Math.cos(t) };
}

// The corner of the piece where the top left corner of the image (or of the
// crop) ends up when turned r degrees clockwise: 0 → top left, 90 → top
// right, 180 → bottom right, 270 → bottom left.
const TOP_LEFT_GOES_TO = { 0: [0, 0], 90: [1, 0], 180: [1, 1], 270: [0, 1] };

describe('clampCrop', () => {
  test('always inside the image and at least MIN_CROP wide and high (fuzz)', () => {
    const rnd = prng(1);
    for (let i = 0; i < 300; i++) {
      const crop = { x: rnd() * 3 - 1, y: rnd() * 3 - 1, w: rnd() * 2 - 0.2, h: rnd() * 2 - 0.2 };
      assertCropInside(clampCrop(crop), `case ${i}`);
    }
  });
});

describe('cropToAspect', () => {
  test('exact proportions, always the whole width or the whole height', () => {
    const rnd = prng(2);
    for (let i = 0; i < 300; i++) {
      const W = 10 + rnd() * 500;
      const H = 10 + rnd() * 500;
      const aspect = 0.1 + rnd() * 5;
      const focus = { x: rnd() * 1.4 - 0.2, y: rnd() * 1.4 - 0.2 };
      const c = cropToAspect(W, H, aspect, focus);
      // With extreme proportions one side may fall below MIN_CROP: the proportion wins.
      assertCropInside(c, `case ${i}`, 0);
      assert.ok(close((c.w * W) / (c.h * H), aspect, 1e-12), `case ${i}: proportion`);
      assert.ok(c.w === 1 || c.h === 1, `case ${i}: largest`);
      // Centered on the focus unless an edge stops it.
      const cx = c.x + c.w / 2;
      if (c.x > 0 && c.x + c.w < 1) assert.ok(close(cx, focus.x), `case ${i}: focus x`);
    }
  });
});

describe('drawParams (PDF)', () => {
  test('the corners of the crop land on the piece, in the right order (fuzz)', () => {
    const rnd = prng(5);
    const sheetH = 297;
    for (let i = 0; i < 400; i++) {
      const asset = { w: 20 + rnd() * 300, h: 20 + rnd() * 300 };
      const r = ROTATIONS[i % 4];
      const random = clampCrop({ x: rnd() * 0.6, y: rnd() * 0.6, w: 0.05 + rnd() * 0.6, h: 0.05 + rnd() * 0.6 });
      const crop = i % 5 === 0 ? null : random;
      const item = { x: rnd() * 150, y: rnd() * 200, scale: 10 + rnd() * 200, r, crop };
      const p = drawParams(item, asset, sheetH);
      const { w, h } = pieceSize(asset, item);
      // The rectangle of the piece in PDF points (y up).
      const left = item.x * PT_PER_MM;
      const right = (item.x + w) * PT_PER_MM;
      const top = (sheetH - item.y) * PT_PER_MM;
      const bottom = (sheetH - item.y - h) * PT_PER_MM;
      if (crop) {
        assert.ok(close(p.clip.x, left) && close(p.clip.y, bottom), `case ${i}: clip`);
        assert.ok(close(p.clip.width, right - left) && close(p.clip.height, top - bottom), `case ${i}: clip`);
      } else assert.equal(p.clip, null);
      // The 4 corners of the cropped area (u to the right, v up).
      const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
      const u0 = c.x;
      const u1 = c.x + c.w;
      const vTop = 1 - c.y;
      const vBottom = 1 - c.y - c.h;
      const corners = [
        [u0, vTop, 0, 0], // top left of the cropped image
        [u1, vTop, 1, 0],
        [u1, vBottom, 1, 1],
        [u0, vBottom, 0, 1],
      ];
      // Turning r clockwise, the corner (cx, cy) of the image ends up at another corner of the piece.
      const turn = (cx, cy) => {
        let [a, b] = [cx, cy];
        for (let t = 0; t < r / 90; t++) [a, b] = [1 - b, a];
        return [a, b];
      };
      assert.deepEqual(turn(0, 0), TOP_LEFT_GOES_TO[r]);
      for (const [u, v, cx, cy] of corners) {
        const got = pdfPoint(p, u, v);
        const [ex, ey] = turn(cx, cy);
        const want = { x: ex ? right : left, y: ey ? bottom : top };
        const where = `case ${i} r${r}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`;
        assert.ok(close(got.x, want.x, 1e-9) && close(got.y, want.y, 1e-9), where);
      }
    }
  });
});

describe('cssParams (screen)', () => {
  test('the corners of the crop fill the container, in the right order (fuzz)', () => {
    const rnd = prng(6);
    for (let i = 0; i < 400; i++) {
      const asset = { w: 20 + rnd() * 300, h: 20 + rnd() * 300 };
      const r = ROTATIONS[i % 4];
      const crop = clampCrop({ x: rnd() * 0.6, y: rnd() * 0.6, w: 0.05 + rnd() * 0.6, h: 0.05 + rnd() * 0.6 });
      const item = { x: rnd() * 150, y: rnd() * 200, scale: 10 + rnd() * 200, r, crop };
      const zoom = 0.5 + rnd() * 4;
      const p = cssParams(item, asset, zoom);
      const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
      const corners = [
        [c.x, c.y, 0, 0],
        [c.x + c.w, c.y, 1, 0],
        [c.x + c.w, c.y + c.h, 1, 1],
        [c.x, c.y + c.h, 0, 1],
      ];
      for (const [u, v, cx, cy] of corners) {
        let [a, b] = [cx, cy];
        for (let t = 0; t < r / 90; t++) [a, b] = [1 - b, a];
        const got = cssPoint(p.img, u, v);
        const want = { x: a * p.width, y: b * p.height };
        const where = `case ${i} r${r}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`;
        assert.ok(close(got.x, want.x, 1e-9) && close(got.y, want.y, 1e-9), where);
      }
      // The `transform` string (with left/top 50 %) puts the center in the same place.
      const m = /^translate\(-50%, -50%\)(?: translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\))? rotate\((\d+)deg\)$/.exec(
        p.img.transform
      );
      assert.ok(m, p.img.transform);
      const tx = Number(m[1] ?? 0);
      const ty = Number(m[2] ?? 0);
      assert.equal(Number(m[3]), r);
      assert.ok(close(p.width / 2 + tx, p.img.left + p.img.width / 2, 1e-9), `case ${i}: transform x`);
      assert.ok(close(p.height / 2 + ty, p.img.top + p.img.height / 2, 1e-9), `case ${i}: transform y`);
    }
  });
});
