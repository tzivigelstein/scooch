import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { FRAME_HANDLES, cropFrame, cssParams, frameToSize, pieceFromFrame, pieceSize, resizeFrame, rotateCrop, unrotateCrop, zoomFrame } from '../../src/core/crop.js';
import { prng } from '../support/prng.js';
import { ROTATIONS, assertRect, close as near, inside } from '../support/crop.js';

function randomItem(rnd) {
  const asset = { w: 20 + rnd() * 200, h: 20 + rnd() * 200 };
  const w = 0.05 + rnd() * 0.95;
  const h = 0.05 + rnd() * 0.95;
  const crop = rnd() < 0.2 ? null : { x: rnd() * (1 - w), y: rnd() * (1 - h), w, h };
  const item = { x: rnd() * 150, y: rnd() * 200, scale: 10 + rnd() * 200, r: ROTATIONS[Math.floor(rnd() * 4)], crop };
  return { asset, item };
}

describe('rotateCrop and unrotateCrop', () => {
  test('are inverses and keep the area', () => {
    const rnd = prng(11);
    for (let i = 0; i < 200; i++) {
      const w = 0.01 + rnd() * 0.99;
      const h = 0.01 + rnd() * 0.99;
      const crop = { x: rnd() * (1 - w), y: rnd() * (1 - h), w, h };
      for (const r of ROTATIONS) {
        const seen = rotateCrop(crop, r);
        assert.ok(near(seen.w * seen.h, crop.w * crop.h));
        assertRect(unrotateCrop(seen, r), crop, `r=${r}`);
      }
    }
  });
});

describe('cropFrame and pieceFromFrame', () => {
  test('round trip: frame and image give back the same piece (fuzz)', () => {
    const rnd = prng(7);
    for (let i = 0; i < 400; i++) {
      const { asset, item } = randomItem(rnd);
      const frames = cropFrame(item, asset);
      const back = pieceFromFrame(asset, item.r, frames);
      assert.ok(near(back.x, item.x) && near(back.y, item.y), 'position');
      assert.ok(near(back.scale, item.scale, 1e-9), `scale ${back.scale} ≠ ${item.scale}`);
      if (item.crop === null) assert.equal(back.crop, null);
      else assertRect(back.crop, item.crop, 'crop', 1e-9);
    }
  });

  test('the frame is the piece and the image is where the screen draws the whole image', () => {
    const rnd = prng(3);
    for (let i = 0; i < 200; i++) {
      const { asset, item } = randomItem(rnd);
      const { frame, image } = cropFrame(item, asset);
      const size = pieceSize(asset, item);
      assertRect(frame, { x: item.x, y: item.y, w: size.w, h: size.h }, 'frame');
      assert.ok(inside(frame, image, 1e-9), 'frame inside image');
      // cssParams at 1 px/mm: the unrotated image box, rotated around its center.
      const p = cssParams(item, asset, 1);
      const cx = p.left + p.img.left + p.img.width / 2;
      const cy = p.top + p.img.top + p.img.height / 2;
      const [w, h] = item.r % 180 ? [p.img.height, p.img.width] : [p.img.width, p.img.height];
      assertRect(image, { x: cx - w / 2, y: cy - h / 2, w, h }, `image r=${item.r}`, 1e-9);
    }
  });
});

describe('zoomFrame', () => {
  test('the piece keeps its printed size and its scale follows the factor (fuzz)', () => {
    const rnd = prng(5);
    for (let i = 0; i < 300; i++) {
      const { asset, item } = randomItem(rnd);
      const frames = cropFrame(item, asset);
      const factor = 0.5 + rnd() * 1.5;
      const next = zoomFrame(frames, factor, { x: frames.frame.x + rnd() * frames.frame.w, y: frames.frame.y + rnd() * frames.frame.h });
      const piece = pieceFromFrame(asset, item.r, next);
      const size = pieceSize(asset, { ...piece, r: item.r });
      assert.ok(near(size.w, frames.frame.w, 1e-6) && near(size.h, frames.frame.h, 1e-6), 'printed size');
      assert.ok(near(piece.scale / item.scale, next.image.w / frames.image.w, 1e-9), 'scale');
      assert.ok(inside(next.frame, next.image, 1e-9), 'inside');
    }
  });
});

describe('resizeFrame', () => {
  test('locked: keeps the proportion around the anchor and stays inside (fuzz)', () => {
    const rnd = prng(9);
    for (let i = 0; i < 500; i++) {
      const { asset, item } = randomItem(rnd);
      const frames = cropFrame(item, asset);
      const handle = FRAME_HANDLES[Math.floor(rnd() * FRAME_HANDLES.length)];
      const scale = Math.max(frames.image.w, frames.image.h);
      const next = resizeFrame(frames, handle, (rnd() - 0.5) * scale, (rnd() - 0.5) * scale, { lock: true });
      const { frame } = next;
      assert.ok(near(frame.w / frame.h, frames.frame.w / frames.frame.h, 1e-9), `${handle}: proportion`);
      assert.ok(inside(frame, frames.image, 1e-7), `${handle}: inside ${JSON.stringify({ frame, image: frames.image })}`);
      // The anchor (opposite corner or opposite edge's middle) stays.
      const f0 = frames.frame;
      const ax = handle.includes('e') ? [f0.x, frame.x] : handle.includes('w') ? [f0.x + f0.w, frame.x + frame.w] : [f0.x + f0.w / 2, frame.x + frame.w / 2];
      const ay = handle.includes('s') ? [f0.y, frame.y] : handle.includes('n') ? [f0.y + f0.h, frame.y + frame.h] : [f0.y + f0.h / 2, frame.y + frame.h / 2];
      assert.ok(near(ax[0], ax[1], 1e-9) && near(ay[0], ay[1], 1e-9), `${handle}: anchor`);
    }
  });
});

describe('frameToSize', () => {
  test('brings the frame to an exact size around its center, keeping the crop', () => {
    const rnd = prng(13);
    for (let i = 0; i < 200; i++) {
      const { asset, item } = randomItem(rnd);
      const frames = cropFrame(item, asset);
      const size = { w: 101.6, h: (101.6 * frames.frame.h) / frames.frame.w };
      const next = frameToSize(frames, size);
      assert.ok(near(next.frame.w, size.w) && near(next.frame.h, size.h, 1e-9));
      assert.ok(near(next.frame.x + next.frame.w / 2, frames.frame.x + frames.frame.w / 2, 1e-9));
      const before = pieceFromFrame(asset, item.r, frames).crop;
      const after = pieceFromFrame(asset, item.r, next).crop;
      if (before === null) assert.equal(after, null);
      else assertRect(after, before, 'crop', 1e-9);
    }
  });
});
