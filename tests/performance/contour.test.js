import { describe, expect, test } from 'vitest';
import { countWork, traceShape } from '../../src/core/contour.js';
import { maskOf, starWithHole } from '../support/contour.ts';

// Work budget: traceShape counts the mask pixels it samples and the grid
// cells each pass visits, through the test-only `countWork` seam. The count
// is deterministic, so a slower tracer fails here whatever the machine's
// load; the budgets are about 1.25 × the current counts. The image is the
// largest preview the app keeps (1200 px, what a 4000 × 4000 px photo is
// traced from), with a 3 % margin. One generous wall-clock guard catches what
// the counter can't see; the app traces in a worker, off the main thread.

const preview = maskOf(1200, 1200, starWithHole(1200, 1200));

describe('traceShape work', () => {
  test('a 1200 × 1200 px preview stays within its work budget', async (t) => {
    const work = { pixels: 0, cells: 0 };
    countWork(work);
    let loops;
    try {
      loops = traceShape(preview, { w: 1, h: 1, margin: 0.03 });
    } finally {
      countWork(null);
    }
    // Now 2 584 927 pixels (a cell spans 1.7 of them: the ones on its edges are read by both neighbours) and 3 674 889 cells (9 passes over a 639 × 639 grid).
    await t.annotate(`traceShape 1200 px: ${work.pixels} pixels, ${work.cells} cells, ${loops.length} loops`);
    expect(loops).toHaveLength(3);
    expect(work.pixels).toBeLessThanOrEqual(3_230_000);
    expect(work.cells).toBeLessThanOrEqual(4_600_000);
  });
});

describe('traceShape time', () => {
  test('a 1200 × 1200 px preview in under 600 ms', async (t) => {
    traceShape(preview, { w: 1, h: 1, margin: 0.03 });
    const t0 = performance.now();
    const loops = traceShape(preview, { w: 1, h: 1, margin: 0.03 });
    const ms = performance.now() - t0;
    await t.annotate(`traceShape 1200 px: ${ms.toFixed(0)} ms, ${loops.length} loops`);
    expect(ms).toBeLessThan(600);
  });
});
