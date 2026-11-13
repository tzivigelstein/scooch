import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { FRAME_HANDLES, MIN_CROP, PHOTO_SIZES, matchPhotoSize, panFrame, resizeFrame, rotateCrop, zoomFrame } from '../../src/core/crop.js';
import { freeSpotNear } from '../../src/core/sheets.js';
import { assertRect, close as near, inside } from '../support/crop.js';

// Exact cases of the crop frame. The properties checked over generated pieces
// are in tests/properties/crop-frame.test.js.

describe('matchPhotoSize', () => {
  test('finds a standard size in either orientation, within the tolerance', () => {
    assert.equal(matchPhotoSize(101.6, 152.4)?.id, '10x15');
    assert.equal(matchPhotoSize(152.4, 101.6)?.id, '10x15');
    assert.equal(matchPhotoSize(101.64, 152.36)?.id, '10x15');
    assert.equal(matchPhotoSize(101.7, 152.4), null);
    assert.equal(matchPhotoSize(35, 45)?.id, 'passport-35x45');
    for (const size of PHOTO_SIZES) assert.equal(matchPhotoSize(size.h, size.w)?.id, size.id);
  });
});

describe('rotateCrop and unrotateCrop', () => {
  test('the image’s top left corner goes where the rotation takes it', () => {
    const corner = { x: 0, y: 0, w: 0.25, h: 0.5 };
    assertRect(rotateCrop(corner, 90), { x: 0.5, y: 0, w: 0.5, h: 0.25 });
    assertRect(rotateCrop(corner, 180), { x: 0.75, y: 0.5, w: 0.25, h: 0.5 });
    assertRect(rotateCrop(corner, 270), { x: 0, y: 0.75, w: 0.5, h: 0.25 });
    assertRect(rotateCrop(null, 90), { x: 0, y: 0, w: 1, h: 1 });
  });
});

describe('panFrame', () => {
  test('moves the image under the frame and stops at its edges', () => {
    const start = { frame: { x: 10, y: 10, w: 20, h: 10 }, image: { x: 0, y: 0, w: 50, h: 40 } };
    assertRect(panFrame(start, 5, 3).image, { x: 5, y: 3, w: 50, h: 40 });
    assertRect(panFrame(start, 50, 50).image, { x: 10, y: 10, w: 50, h: 40 });
    assertRect(panFrame(start, -100, -100).image, { x: -20, y: -20, w: 50, h: 40 });
    assert.equal(panFrame(start, 5, 3).frame, start.frame);
  });
});

describe('zoomFrame', () => {
  test('keeps the frame, scales the image around the focus and keeps the frame inside', () => {
    const start = { frame: { x: 10, y: 10, w: 20, h: 10 }, image: { x: 0, y: 0, w: 50, h: 40 } };
    const zoomed = zoomFrame(start, 2, { x: 20, y: 15 });
    assert.equal(zoomed.frame, start.frame);
    assertRect(zoomed.image, { x: -20, y: -15, w: 100, h: 80 });
    // Out: never smaller than the frame (here the width binds: 20 / 50).
    const out = zoomFrame(start, 0.01);
    assert.ok(near(out.image.w, 20) && inside(start.frame, out.image));
    // In: at most until the frame is MIN_CROP of the image.
    const closest = zoomFrame(start, 1e6);
    assert.ok(near(Math.min(start.frame.w / closest.image.w, start.frame.h / closest.image.h), MIN_CROP));
    assert.throws(() => zoomFrame(start, 0), RangeError);
  });
});

describe('resizeFrame', () => {
  const start = { frame: { x: 10, y: 10, w: 20, h: 10 }, image: { x: 0, y: 0, w: 50, h: 40 } };

  test('free: each handle moves only its own edges, inside the image', () => {
    assertRect(resizeFrame(start, 'e', 5, 99).frame, { x: 10, y: 10, w: 25, h: 10 });
    assertRect(resizeFrame(start, 'w', -4, 0).frame, { x: 6, y: 10, w: 24, h: 10 });
    assertRect(resizeFrame(start, 'n', 3, -2).frame, { x: 10, y: 8, w: 20, h: 12 });
    assertRect(resizeFrame(start, 's', 0, 100).frame, { x: 10, y: 10, w: 20, h: 30 });
    assertRect(resizeFrame(start, 'nw', -100, -100).frame, { x: 0, y: 0, w: 30, h: 20 });
    // Never thinner than MIN_CROP of the image.
    const thin = resizeFrame(start, 'e', -100, 0).frame;
    assert.ok(near(thin.w, 50 * MIN_CROP) && thin.x === 10);
    for (const handle of FRAME_HANDLES) assert.equal(resizeFrame(start, handle, 1, 1).image, start.image);
  });

  test('locked corner: growing along the diagonal grows both sides', () => {
    const next = resizeFrame(start, 'se', 4, 2, { lock: true }).frame;
    assertRect(next, { x: 10, y: 10, w: 24, h: 12 });
  });
});

describe('freeSpotNear', () => {
  const sheet = { W: 210, H: 297, margin: 10 };
  test('keeps a free position and moves an overlapping one to the closest free spot', () => {
    assert.deepEqual(freeSpotNear({ x: 20, y: 20, w: 50, h: 50 }, [], sheet), { x: 20, y: 20 });
    const spot = freeSpotNear({ x: 20, y: 20, w: 50, h: 50 }, [{ x: 60, y: 20, w: 50, h: 50 }], sheet);
    assert.deepEqual(spot, { x: 10, y: 20 }); // touching is not overlapping
  });

  test('prefers the printable area, then the whole sheet; null without room', () => {
    assert.deepEqual(freeSpotNear({ x: 0, y: 0, w: 200, h: 50 }, [], sheet), { x: 0, y: 0 });
    assert.deepEqual(freeSpotNear({ x: 5, y: 5, w: 100, h: 50 }, [], sheet), { x: 10, y: 10 });
    assert.equal(freeSpotNear({ x: 0, y: 0, w: 220, h: 50 }, [], sheet), null);
    assert.equal(freeSpotNear({ x: 0, y: 0, w: 200, h: 280 }, [{ x: 0, y: 0, w: 210, h: 297 }], sheet), null);
  });
});
