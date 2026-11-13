import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { MENU_LEVELS, PX_PER_MM_AT_100, ZOOM_LEVELS, ZOOM_MAX, ZOOM_MIN, canStep, clampPercent, fromPercent, stepPercent, toPercent, wheelFactor } from '../../src/core/zoom.js';

describe('zoom percent', () => {
  test('100 % is 96 CSS px per inch', () => {
    assert.equal(PX_PER_MM_AT_100 * 25.4, 96);
    assert.equal(toPercent(PX_PER_MM_AT_100), 100);
    assert.ok(Math.abs(fromPercent(250) - 2.5 * PX_PER_MM_AT_100) < 1e-12);
    assert.ok(Math.abs(toPercent(fromPercent(37)) - 37) < 1e-9);
  });

  test('the levels go from the minimum to the maximum and include the menu ones', () => {
    assert.equal(ZOOM_LEVELS[0], ZOOM_MIN);
    assert.equal(ZOOM_LEVELS.at(-1), ZOOM_MAX);
    for (const level of MENU_LEVELS) assert.ok(ZOOM_LEVELS.includes(level));
    assert.deepEqual([...ZOOM_LEVELS].sort((a, b) => a - b), [...ZOOM_LEVELS]);
  });
});

describe('clampPercent', () => {
  test('inside the range, as is', () => {
    assert.equal(clampPercent(116), 116);
  });
  test('outside, to the nearest end', () => {
    assert.equal(clampPercent(5), ZOOM_MIN);
    assert.equal(clampPercent(1200), ZOOM_MAX);
  });
  test('from a fitted zoom outside the range it never jumps the wrong way', () => {
    assert.equal(clampPercent(7, 6), 7); // zooming in from 6 %
    assert.equal(clampPercent(5, 6), 6); // zooming out: it stays
    assert.equal(clampPercent(900, 1000), 900);
  });
});

describe('stepPercent', () => {
  test('to the next level, from a level or between two', () => {
    assert.equal(stepPercent(100, 1), 125);
    assert.equal(stepPercent(100, -1), 75);
    assert.equal(stepPercent(116, 1), 125);
    assert.equal(stepPercent(116, -1), 100);
    assert.equal(stepPercent(60.3, -1), 50);
  });
  test('almost on a level counts as on it', () => {
    assert.equal(stepPercent(99.8, 1), 125);
    assert.equal(stepPercent(200.3, -1), 150);
  });
  test('at the ends it stays', () => {
    assert.equal(stepPercent(ZOOM_MAX, 1), ZOOM_MAX);
    assert.equal(stepPercent(ZOOM_MIN, -1), ZOOM_MIN);
    assert.equal(canStep(ZOOM_MAX, 1), false);
    assert.equal(canStep(ZOOM_MIN, -1), false);
    assert.equal(canStep(100, 1), true);
  });
  test('beyond the range (a fitted zoom) it doesn’t go further out', () => {
    assert.equal(stepPercent(6, -1), 6);
    assert.equal(stepPercent(6, 1), 10);
  });
});

describe('wheelFactor', () => {
  test('down zooms out, up zooms in, symmetric', () => {
    assert.ok(wheelFactor(100) < 1);
    assert.ok(wheelFactor(-100) > 1);
    assert.ok(Math.abs(wheelFactor(30) * wheelFactor(-30) - 1) < 1e-12);
  });
  test('a mouse notch is bounded; a pinch step is small', () => {
    assert.equal(wheelFactor(500), wheelFactor(60));
    assert.ok(wheelFactor(-1000) < 1.5);
    assert.ok(Math.abs(wheelFactor(2) - 1) < 0.02);
  });
  test('lines and pages are turned into pixels', () => {
    assert.equal(wheelFactor(1, 1), wheelFactor(20));
    assert.equal(wheelFactor(1, 2), wheelFactor(60));
  });
});
