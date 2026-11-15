import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { EDGE_SPEED, EDGE_ZONE, MAX_FRAMES, edgeScroll, newSheetRoom } from '../../src/core/dragscroll.js';

// A stage from 100 to 900 px on the axis, scrolled to 500 of at most 1000.
const at = (pointer, scroll = 500, max = 1000) => edgeScroll(pointer, 100, 900, scroll, max);

describe('edgeScroll', () => {
  test('away from the edges, the scroll stays', () => {
    assert.equal(at(500), 500);
    assert.equal(at(100 + EDGE_ZONE), 500);
    assert.equal(at(900 - EDGE_ZONE), 500);
  });

  test('inside the zone it scrolls toward that edge, faster the closer the pointer is', () => {
    assert.equal(at(900 - EDGE_ZONE / 2), 500 + EDGE_SPEED / 2);
    assert.equal(at(100 + EDGE_ZONE / 2), 500 - EDGE_SPEED / 2);
    assert.equal(at(899), 500 + Math.ceil(((EDGE_ZONE - 1) / EDGE_ZONE) * EDGE_SPEED));
    assert.equal(at(901 - EDGE_ZONE), 501);
  });

  test('on the edge or past it (outside the window), the fastest step', () => {
    for (const pointer of [900, 950, 5000]) assert.equal(at(pointer), 500 + EDGE_SPEED);
    for (const pointer of [100, 40, -5000]) assert.equal(at(pointer), 500 - EDGE_SPEED);
  });

  test('never past the end of what there is to see, nor before its start', () => {
    assert.equal(at(5000, 995), 1000);
    assert.equal(at(5000, 1000), 1000);
    assert.equal(at(-5000, 7), 0);
    assert.equal(at(-5000, 0), 0);
    // Nothing to scroll (max 0, or less when the content is shorter than the stage).
    assert.equal(at(5000, 0, 0), 0);
    assert.equal(at(5000, 0, -300), 0);
  });

  test('a scroll already past the end comes back to it', () => {
    assert.equal(at(500, 1400), 1000);
    assert.equal(at(5000, 1400), 1000);
  });

  test('its speed goes by the time: half a step per frame of a 120 Hz screen, more steps for frames that come late, at most MAX_FRAMES of them', () => {
    const step = (frames) => edgeScroll(5000, 100, 900, 500, 1000, frames) - 500;
    assert.equal(step(1), EDGE_SPEED);
    assert.equal(step(0.5), EDGE_SPEED / 2);
    assert.equal(step(3), 3 * EDGE_SPEED);
    assert.equal(step(60), MAX_FRAMES * EDGE_SPEED);
    assert.equal(step(-1), 0);
    assert.equal(edgeScroll(5000, 100, 900, 990, 1000, 4), 1000);
  });
});

describe('newSheetRoom', () => {
  test('a placeholder below what the area holds: the area grows to show it with the padding below', () => {
    assert.equal(newSheetRoom({ bottom: 1468, pad: 64, height: 844 }), 688);
    assert.equal(newSheetRoom({ bottom: 1000.2, pad: 64, height: 844 }), 221);
  });

  test('one that already shows with its padding (few sheets, small zoom): no room', () => {
    assert.equal(newSheetRoom({ bottom: 500, pad: 64, height: 844 }), 0);
    assert.equal(newSheetRoom({ bottom: 780, pad: 64, height: 844 }), 0);
  });
});
