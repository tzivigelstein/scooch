// Helpers shared by the crop tests (unit and properties).

import assert from 'node:assert/strict';
import { MIN_CROP } from '../../src/core/crop.js';

export const PT_PER_MM = 72 / 25.4;
export const ROTATIONS = [0, 90, 180, 270];

/** Equal within a relative tolerance (absolute below 1). */
export const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

export const assertRect = (actual, expected, label = '', tol = 1e-9) => {
  for (const k of ['x', 'y', 'w', 'h']) assert.ok(close(actual[k], expected[k], tol), `${label} ${k}: ${actual[k]} ≠ ${expected[k]}`);
};

export const inside = (r, b, tol = 1e-9) => r.x >= b.x - tol && r.y >= b.y - tol && r.x + r.w <= b.x + b.w + tol && r.y + r.h <= b.y + b.h + tol;

/** A crop (null: none) within the image, finite and at least `min` wide and high. */
export function assertCropInside(crop, label = '', min = MIN_CROP) {
  if (crop === null) return;
  for (const k of ['x', 'y', 'w', 'h']) assert.ok(Number.isFinite(crop[k]), `${label}: ${k} not finite`);
  assert.ok(crop.w > 0 && crop.h > 0, `${label}: empty ${JSON.stringify(crop)}`);
  assert.ok(crop.w >= min - 1e-12 && crop.h >= min - 1e-12, `${label}: too small ${JSON.stringify(crop)}`);
  assert.ok(crop.x >= 0 && crop.y >= 0, `${label}: goes out at the top or left ${JSON.stringify(crop)}`);
  assert.ok(crop.x + crop.w <= 1 + 1e-12 && crop.y + crop.h <= 1 + 1e-12, `${label}: goes out ${JSON.stringify(crop)}`);
}

// What the browser does: an unrotated box at (left, top), rotated `rotate`
// degrees clockwise around its center (y down). (u, v) normalized in the
// image, v down.
export function cssPoint(img, u, v) {
  const t = (img.rotate * Math.PI) / 180;
  const cx = img.left + img.width / 2;
  const cy = img.top + img.height / 2;
  const dx = u * img.width - img.width / 2;
  const dy = v * img.height - img.height / 2;
  return { x: cx + dx * Math.cos(t) - dy * Math.sin(t), y: cy + dx * Math.sin(t) + dy * Math.cos(t) };
}
