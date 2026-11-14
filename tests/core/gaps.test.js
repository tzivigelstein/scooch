import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { neighborGaps } from '../../src/core/gaps.js';

// Exact cases of the gaps between neighbors (what hovering «Separación»
// marks). The rules over generated layouts are in tests/properties/gaps.test.js.

const r = (x, y, w, h) => ({ x, y, w, h });

describe('neighborGaps', () => {
  test('side by side: the space between the facing edges, over the span they share', () => {
    assert.deepEqual(neighborGaps([r(0, 0, 10, 10), r(15, 4, 10, 10)], 10), [r(10, 4, 5, 6)]);
  });

  test('one above the other: the space between the bottom and the top edge', () => {
    assert.deepEqual(neighborGaps([r(0, 0, 10, 10), r(2, 13, 20, 5)], 10), [r(2, 10, 8, 3)]);
  });

  test('each pair once, whatever their order', () => {
    assert.deepEqual(neighborGaps([r(15, 0, 10, 10), r(0, 0, 10, 10)], 10), [r(10, 0, 5, 10)]);
  });

  test('touching: a gap with no width', () => {
    assert.deepEqual(neighborGaps([r(0, 0, 10, 10), r(10, 0, 10, 10)], 5), [r(10, 0, 0, 10)]);
  });

  test('a grid of four: the four gaps between neighbors, none across the diagonal', () => {
    const grid = [r(0, 0, 10, 10), r(15, 0, 10, 10), r(0, 15, 10, 10), r(15, 15, 10, 10)];
    const gaps = neighborGaps(grid, 5);
    assert.equal(gaps.length, 4);
    assert.deepEqual(gaps, [r(10, 0, 5, 10), r(0, 10, 10, 5), r(15, 10, 10, 5), r(10, 15, 5, 10)]);
  });

  test('farther than `max`, not facing, overlapping or with another in between: no gap', () => {
    assert.deepEqual(neighborGaps([r(0, 0, 10, 10), r(21, 0, 10, 10)], 10), [], 'farther');
    assert.deepEqual(neighborGaps([r(0, 0, 10, 10), r(12, 10, 10, 10)], 10), [], 'corner to corner');
    assert.deepEqual(neighborGaps([r(0, 0, 10, 10), r(5, 5, 10, 10)], 10), [], 'overlapping');
    assert.deepEqual(neighborGaps([r(0, 0, 10, 10), r(30, 0, 10, 10), r(14, 2, 4, 4)], 30), [r(10, 2, 4, 4), r(18, 2, 12, 4)], 'only the ones next to the middle one');
  });

  test('nothing or one box: no gaps', () => {
    assert.deepEqual(neighborGaps([], 5), []);
    assert.deepEqual(neighborGaps([r(0, 0, 10, 10)], 5), []);
  });
});
