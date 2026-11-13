import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { cutLines, countWork } from '../../src/core/cutmarks.js';
import { grid } from '../support/cutmarks.js';

// Work budget: cutLines counts the boxes it compares each segment against
// (`checks`, what its time grows with) through the test-only `countWork`
// seam. The count is deterministic, so a slower cutLines fails here whatever
// the machine's load; the budget is about 1.25 × the current count. One
// generous wall-clock guard (3 × the old budget) catches what the counter
// can't see.

describe('cutLines work', () => {
  test('cutLines with 196 pieces stays within its work budget', async (t) => {
    const pieces = grid(14, 12, 2);
    const work = { checks: 0 };
    countWork(work);
    let segments;
    try {
      segments = cutLines(pieces);
    } finally {
      countWork(null);
    }
    // Now 614 656 checks: 8 marks per piece, each against every image and cut box.
    await t.annotate(`cutLines 196 pieces: ${work.checks} checks, ${segments.length} segments`);
    assert.ok(segments.length > 0);
    assert.ok(work.checks <= 770_000, `${work.checks} checks > 770000`);
  });
});

describe('cutLines time', () => {
  test('cutLines with 196 pieces in under 900 ms', async (t) => {
    const pieces = grid(14, 12, 2);
    const t0 = performance.now();
    const segments = cutLines(pieces);
    const ms = performance.now() - t0;
    await t.annotate(`cutLines 196 pieces: ${ms.toFixed(0)} ms, ${segments.length} segments`);
    assert.ok(ms < 900, `took ${ms.toFixed(0)} ms`);
  });
});
