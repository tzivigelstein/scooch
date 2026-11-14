import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { EDGE_SPEED, edgeScroll, newSheetRoom } from '../../src/core/dragscroll.js';
import { prng } from '../support/prng.js';

// A stage of any height showing 1 to 8 sheets of any paper at any zoom (10 %
// to 800 %), laid out as the canvas does it: each sheet under its heading,
// gaps between them, a footer and padding around, the column centered when it
// is shorter than the stage. Something is held for a long time with the
// pointer anywhere, also far past an edge (outside the window).
const rnd = prng(4711);
const PX_PER_MM = 96 / 25.4;
const pick = (lo, hi) => lo + rnd() * (hi - lo);

const cases = Array.from({ length: 600 }, () => {
  const zoom = pick(0.1, 8) * PX_PER_MM;
  const H = pick(90, 600) * zoom;
  const n = 1 + Math.floor(rnd() * 8);
  const head = 36;
  const gap = 20;
  const foot = 26;
  const pad = { top: rnd() < 0.5 ? 20 : 68, bottom: rnd() < 0.5 ? 64 : 132 };
  const client = pick(300, 1500);
  const column = n * (head + H) + n * gap + foot;
  const height = Math.max(client, pad.top + column + pad.bottom);
  const top = pad.top + Math.max(0, (height - pad.top - pad.bottom - column) / 2);
  // The placeholder: one more sheet, under its heading, after the last one.
  const bottom = top + (n + 1) * (head + H) + n * gap;
  const pointer = rnd() < 0.3 ? pick(-3000, 3000) : pick(-60, client + 60);
  return { H, n, pad, client, height, top, bottom, pointer, scroll: pick(0, height - client) };
});

describe('scrolling while something is held near an edge', () => {
  test('the room for the new sheet shows its placeholder whole, with the padding below it, and adds no more', () => {
    for (const [i, c] of cases.entries()) {
      const room = newSheetRoom({ bottom: c.bottom, pad: c.pad.bottom, height: c.height });
      assert.ok(room >= 0 && Number.isInteger(room), `case ${i}: ${room}`);
      assert.ok(c.bottom + c.pad.bottom <= c.height + room, `case ${i}: the placeholder is cut`);
      assert.ok(room === 0 || c.bottom + c.pad.bottom > c.height + room - 1, `case ${i}: ${room} px more than needed`);
    }
  });

  test('held for any time, with the pointer anywhere, the scroll stays within [0, max], moves at most EDGE_SPEED a frame and, past the bottom edge, stops with the placeholder in view', () => {
    for (const [i, c] of cases.entries()) {
      const room = newSheetRoom({ bottom: c.bottom, pad: c.pad.bottom, height: c.height });
      const max = c.height + room - c.client;
      let scroll = Math.min(c.scroll, max);
      // Long enough to reach either end at the fastest step, and then some.
      const held = Math.ceil(max / EDGE_SPEED) + 300;
      for (let frame = 0; frame < held; frame++) {
        const next = edgeScroll(c.pointer, 0, c.client, scroll, max);
        assert.ok(next >= 0 && next <= max, `case ${i}, frame ${frame}: ${next} outside [0, ${max}]`);
        assert.ok(Math.abs(next - scroll) <= EDGE_SPEED + 1e-9, `case ${i}, frame ${frame}: a step of ${next - scroll}`);
        scroll = next;
      }
      if (c.pointer >= c.client) {
        assert.equal(scroll, max, `case ${i}: held past the bottom edge, it reaches the end`);
        assert.ok(c.bottom <= scroll + c.client + 1e-9, `case ${i}: the placeholder's bottom shows`);
      }
      if (c.pointer <= 0) assert.equal(scroll, 0, `case ${i}: held past the top edge, it reaches the start`);
    }
  });
});
