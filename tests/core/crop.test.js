import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  MIN_CROP,
  PHOTO_SIZES,
  photoSize,
  isIdentity,
  clampCrop,
  pieceSize,
  cropToAspect,
  fitToSize,
  drawParams,
  cssParams,
} from '../../src/core/crop.js';
import { PT_PER_MM, ROTATIONS, assertCropInside, close } from '../support/crop.js';

// Exact cases of the crop geometry. The properties checked over generated
// crops are in tests/properties/crop.test.js.

function assertCropClose(actual, expected, label = '') {
  for (const k of ['x', 'y', 'w', 'h']) {
    assert.ok(close(actual[k], expected[k], 1e-12), `${label} ${k}: ${actual[k]} ≠ ${expected[k]}`);
  }
}

// The geometry of export.js as it is today (a piece without a crop).
function currentPlacement({ x, y, w, h, uw, uh, r }, sheetHeight) {
  return {
    x: (x + (r === 180 || r === 270 ? w : 0)) * PT_PER_MM,
    y: (sheetHeight - y - (r === 90 || r === 180 ? 0 : h)) * PT_PER_MM,
    width: uw * PT_PER_MM,
    height: uh * PT_PER_MM,
    rotate: -r,
  };
}

const assets = [
  { w: 150, h: 100 }, // landscape
  { w: 80, h: 120 }, // portrait
  { w: 90, h: 90 }, // square
  { w: 210, h: 297 }, // A4
];

describe('photo sizes', () => {
  test('stable ids, portrait sizes and groups', () => {
    assert.deepEqual(
      PHOTO_SIZES.map((s) => s.id),
      ['9x13', '10x15', '13x18', '15x20', '20x25', '20x30', '10x10', 'id-4x4', 'passport-35x45', 'visa-5x5', 'instant']
    );
    assert.equal(new Set(PHOTO_SIZES.map((s) => s.id)).size, PHOTO_SIZES.length);
    for (const s of PHOTO_SIZES) {
      assert.ok(s.w > 0 && s.w <= s.h, s.id);
      assert.ok(['print', 'id', 'instant'].includes(s.group), s.id);
    }
    assert.deepEqual(photoSize('10x15'), { id: '10x15', w: 101.6, h: 152.4, group: 'print' });
    assert.deepEqual(photoSize('passport-35x45'), { id: 'passport-35x45', w: 35, h: 45, group: 'id' });
    assert.deepEqual(photoSize('instant'), { id: 'instant', w: 88, h: 107, group: 'instant' });
    assert.equal(photoSize('nope'), null);
    assert.ok(Object.isFrozen(PHOTO_SIZES) && Object.isFrozen(PHOTO_SIZES[0]));
  });
});

describe('isIdentity and clampCrop', () => {
  test('isIdentity', () => {
    assert.equal(isIdentity(null), true);
    assert.equal(isIdentity(undefined), true);
    assert.equal(isIdentity({ x: 0, y: 0, w: 1, h: 1 }), true);
    assert.equal(isIdentity({ x: 1e-9, y: 0, w: 1 - 1e-9, h: 1 }), true);
    assert.equal(isIdentity({ x: 0, y: 0, w: 0.5, h: 1 }), false);
    assert.equal(isIdentity({ x: 0.1, y: 0, w: 1, h: 1 }), false);
  });

  test('clampCrop', () => {
    assert.equal(clampCrop(null), null);
    assert.equal(clampCrop({ x: 0, y: 0, w: 1, h: 1 }), null);
    assert.equal(clampCrop({ x: -1, y: -1, w: 5, h: 5 }), null);
    assert.deepEqual(clampCrop({ x: 0.8, y: -0.2, w: 0.5, h: 0.5 }), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
    assert.deepEqual(clampCrop({ x: 0.5, y: 0.5, w: 0, h: 0.2 }), { x: 0.5, y: 0.5, w: MIN_CROP, h: 0.2 });
    assert.equal(clampCrop({ x: NaN, y: 0, w: 0.5, h: 0.5 }), null);
    assert.equal(clampCrop({ x: 0, y: 0, w: Infinity, h: 0.5 }), null);
  });
});

describe('cropToAspect', () => {
  test('cases', () => {
    assertCropClose(cropToAspect(300, 200, 1), { x: 1 / 6, y: 0, w: 2 / 3, h: 1 });
    assertCropClose(cropToAspect(300, 200, 1, { x: 0, y: 0 }), { x: 0, y: 0, w: 2 / 3, h: 1 });
    assertCropClose(cropToAspect(300, 200, 1, { x: 1, y: 1 }), { x: 1 / 3, y: 0, w: 2 / 3, h: 1 });
    assert.deepEqual(cropToAspect(200, 400, 1), { x: 0, y: 0.25, w: 1, h: 0.5 });
    assert.deepEqual(cropToAspect(150, 100, 1.5), { x: 0, y: 0, w: 1, h: 1 });
    // 10×15 portrait on a 3:2 landscape photo.
    const c = cropToAspect(150, 100, 101.6 / 152.4);
    assert.ok(close(c.w, 4 / 9) && c.h === 1);
  });

  test('invalid sizes → RangeError', () => {
    for (const args of [
      [0, 100, 1],
      [100, -1, 1],
      [100, 100, 0],
      [100, 100, NaN],
      [Infinity, 100, 1],
    ]) {
      assert.throws(() => cropToAspect(...args), RangeError, JSON.stringify(args));
    }
  });
});

describe('fitToSize', () => {
  test('fills the exact target in every rotation and orientation', () => {
    const targets = [...PHOTO_SIZES, { w: 152.4, h: 101.6 }, { w: 30, h: 90 }, { w: 200, h: 50 }];
    for (const asset of assets) {
      for (const r of ROTATIONS) {
        for (const target of targets) {
          for (const autoOrient of [true, false]) {
            const label = `${asset.w}×${asset.h} r${r} → ${target.w}×${target.h} auto:${autoOrient}`;
            const fit = fitToSize(asset, r, target, { autoOrient });
            assert.equal(fit.r, r, label);
            assertCropInside(fit.crop, label);
            const size = pieceSize(asset, fit);
            // With autoOrient the target may end up rotated; never distorted.
            const straight = close(size.w, target.w) && close(size.h, target.h);
            const turned = close(size.w, target.h) && close(size.h, target.w);
            assert.ok(autoOrient ? straight || turned : straight, `${label}: ${size.w}×${size.h}`);
            // The crop keeps the proportion of the image (no distortion).
            const c = fit.crop ?? { w: 1, h: 1 };
            assert.ok(close((c.w * asset.w) / (c.h * asset.h), size.uw / size.uh, 1e-12), `${label}: proportion`);
            assert.ok(c.w === 1 || c.h === 1, `${label}: largest crop`);
          }
        }
      }
    }
  });

  test('autoOrient: the target follows the orientation of the image as seen', () => {
    const landscape = { w: 150, h: 100 };
    const target = photoSize('10x15'); // portrait
    const lying = pieceSize(landscape, fitToSize(landscape, 0, target));
    assert.ok(close(lying.w, 152.4) && close(lying.h, 101.6), 'landscape → 15×10');
    // Rotated 90°, the image looks portrait: the target stays as it is.
    const standing = pieceSize(landscape, fitToSize(landscape, 90, target));
    assert.ok(close(standing.w, 101.6) && close(standing.h, 152.4), 'rotated → 10×15');
    // Without autoOrient, always the target as is (cropping more).
    const forced = fitToSize(landscape, 0, target, { autoOrient: false });
    const forcedSize = pieceSize(landscape, forced);
    assert.ok(close(forcedSize.w, 101.6) && close(forcedSize.h, 152.4));
    assert.ok(forced.crop.w < 0.5);
    // A square target: never rotated.
    const square = pieceSize(landscape, fitToSize(landscape, 0, photoSize('id-4x4')));
    assert.ok(close(square.w, 40) && close(square.h, 40));
  });

  test('no crop when the proportion already matches; focus', () => {
    const fit = fitToSize({ w: 150, h: 100 }, 0, { w: 75, h: 50 });
    assert.deepEqual(fit, { crop: null, scale: 50, r: 0 });
    const left = fitToSize({ w: 150, h: 100 }, 0, { w: 50, h: 50 }, { focus: { x: 0, y: 0.5 } });
    assert.equal(left.crop.x, 0);
    const right = fitToSize({ w: 150, h: 100 }, 0, { w: 50, h: 50 }, { focus: { x: 1, y: 0.5 } });
    assert.ok(close(right.crop.x + right.crop.w, 1));
    assert.equal(fitToSize({ w: 150, h: 100 }, 450, { w: 10, h: 10 }).r, 90, 'normalized rotation');
  });
});

describe('drawParams (PDF)', () => {
  test('without a crop it is identical to export.js', () => {
    for (const asset of assets) {
      for (const r of ROTATIONS) {
        for (const scale of [100, 37.5, 250]) {
          const item = { x: 12.3, y: 45.6, scale, r };
          const k = scale / 100;
          const [w, h] = r % 180 ? [asset.h * k, asset.w * k] : [asset.w * k, asset.h * k];
          const expected = currentPlacement({ x: item.x, y: item.y, w, h, uw: asset.w * k, uh: asset.h * k, r }, 297);
          for (const crop of [undefined, null, { x: 0, y: 0, w: 1, h: 1 }]) {
            const p = drawParams({ ...item, crop }, asset, 297);
            assert.equal(p.clip, null);
            assert.deepEqual({ x: p.x, y: p.y, width: p.width, height: p.height, rotate: p.rotate }, {
              ...expected,
              rotate: expected.rotate || 0,
            });
          }
        }
      }
    }
  });
});

describe('cssParams (screen)', () => {
  test('without a crop it is identical to sheetview.js', () => {
    for (const asset of assets) {
      for (const r of ROTATIONS) {
        const item = { x: 10, y: 20, scale: 55, r };
        const zoom = 2.7;
        const k = item.scale / 100;
        const [w, h] = r % 180 ? [asset.h * k, asset.w * k] : [asset.w * k, asset.h * k];
        const p = cssParams(item, asset, zoom);
        assert.equal(p.left, item.x * zoom);
        assert.equal(p.top, item.y * zoom);
        assert.equal(p.width, w * zoom);
        assert.equal(p.height, h * zoom);
        assert.equal(p.img.width, asset.w * k * zoom);
        assert.equal(p.img.height, asset.h * k * zoom);
        assert.equal(p.img.transform, `translate(-50%, -50%) rotate(${r}deg)`);
        assert.ok(close(p.img.left + p.img.width / 2, p.width / 2), 'centered in x');
        assert.ok(close(p.img.top + p.img.height / 2, p.height / 2), 'centered in y');
      }
    }
  });

  test('pieceSize matches the container', () => {
    const asset = { w: 120, h: 80 };
    const item = { x: 0, y: 0, scale: 50, r: 90, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } };
    assert.deepEqual(pieceSize(asset, item), { w: 10, h: 30, uw: 30, uh: 10 });
    const p = cssParams(item, asset, 2);
    assert.ok(close(p.width, 20) && close(p.height, 60));
    assert.deepEqual(pieceSize(asset, { scale: 100 }), { w: 120, h: 80, uw: 120, uh: 80 });
  });
});
