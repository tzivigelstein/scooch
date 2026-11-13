import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { CUT_MODES, cutLines } from '../../src/core/cutmarks.js';
import { TOL, assertWellFormed, entersPiece, grid } from '../support/cutmarks.js';

// Exact cases of the cut lines. The properties checked over generated cases
// are in tests/properties/cutmarks.test.js; the work and time budgets, in
// tests/performance/cutmarks.test.js.

const H = (y, x1, x2) => ({ x1, y1: y, x2, y2: y });
const V = (x, y1, y2) => ({ x1: x, y1, x2: x, y2 });

/** The edge lines of a grid, each with the same spans, in output order. */
function expectedGrid(lines, spans) {
  return [
    ...lines.flatMap((y) => spans.map(([a, b]) => H(y, a, b))),
    ...lines.flatMap((x) => spans.map(([a, b]) => V(x, a, b))),
  ];
}

describe('modes', () => {
  test("'none' and unknown modes", () => {
    assert.deepEqual(CUT_MODES, ['none', 'corners', 'outline']);
    assert.deepEqual(cutLines(grid(2, 10, 5), { mode: 'none' }), []);
    assert.throws(() => cutLines([], { mode: 'cross' }), RangeError);
    assert.deepEqual(cutLines([]), []);
    assert.deepEqual(cutLines([], { mode: 'outline' }), []);
  });

  test('invalid pieces are ignored; zero length draws nothing; a negative offset counts as 0', () => {
    const bad = [
      { x: 0, y: 0, w: 0, h: 10 },
      { x: 0, y: 0, w: 10, h: -1 },
      { x: NaN, y: 0, w: 10, h: 10 },
    ];
    assert.deepEqual(cutLines(bad), []);
    const one = [{ x: 10, y: 20, w: 30, h: 40 }];
    assert.deepEqual(cutLines(one, { length: 0 }), []);
    assert.deepEqual(cutLines(one, { length: -3 }), []);
    assert.deepEqual(cutLines(one, { offset: -2 }), cutLines(one, { offset: 0 }));
    assert.equal(cutLines(one, { offset: 0 })[0].x2, 10, 'starts at the corner');
  });
});

describe("'corners': exact cases", () => {
  test('one piece: 8 marks', () => {
    const one = [{ x: 10, y: 20, w: 30, h: 40 }];
    assert.deepEqual(cutLines(one), [
      H(20, 4.5, 8.5),
      H(20, 41.5, 45.5),
      H(60, 4.5, 8.5),
      H(60, 41.5, 45.5),
      V(10, 14.5, 18.5),
      V(10, 61.5, 65.5),
      V(40, 14.5, 18.5),
      V(40, 61.5, 65.5),
    ]);
    // Own length and offset.
    assert.deepEqual(cutLines(one, { length: 10, offset: 3 })[0], H(20, -3, 7));
  });

  test('two touching pieces share the marks of their common edge, and none is drawn over the neighbor', () => {
    const two = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 10, y: 0, w: 10, h: 10 },
    ];
    assert.deepEqual(cutLines(two), [
      H(0, -5.5, -1.5),
      H(0, 21.5, 25.5),
      H(10, -5.5, -1.5),
      H(10, 21.5, 25.5),
      V(0, -5.5, -1.5),
      V(0, 11.5, 15.5),
      V(10, -5.5, -1.5),
      V(10, 11.5, 15.5),
      V(20, -5.5, -1.5),
      V(20, 11.5, 15.5),
    ]);
  });

  test('aligned in a column: the mark between them is shared when they overlap', () => {
    const column = (gap) => [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 0, y: 10 + gap, w: 10, h: 10 },
    ];
    // gap 20 > 2 × (1.5 + 4): separate marks.
    const far = cutLines(column(20)).filter((s) => s.x1 === 0 && s.x2 === 0);
    assert.deepEqual(far, [V(0, -5.5, -1.5), V(0, 11.5, 15.5), V(0, 24.5, 28.5), V(0, 41.5, 45.5)]);
    // gap 8: the two marks overlap and become one.
    const near = cutLines(column(8)).filter((s) => s.x1 === 0 && s.x2 === 0);
    assert.deepEqual(near, [V(0, -5.5, -1.5), V(0, 11.5, 16.5), V(0, 29.5, 33.5)]);
  });

  test('a 3×3 grid with a gap larger than 2 × (offset + length): 72 separate marks', () => {
    const segments = cutLines(grid(3, 10, 12));
    assert.equal(segments.length, 72);
    const lines = [0, 10, 22, 32, 44, 54];
    assert.deepEqual(
      segments,
      expectedGrid(lines, [
        [-5.5, -1.5],
        [11.5, 15.5],
        [16.5, 20.5],
        [33.5, 37.5],
        [38.5, 42.5],
        [55.5, 59.5],
      ])
    );
  });

  test('a 3×3 grid with a gap between offset + length and twice that: facing marks join', () => {
    const segments = cutLines(grid(3, 10, 8));
    assert.equal(segments.length, 48);
    assert.deepEqual(
      segments,
      expectedGrid(
        [0, 10, 18, 28, 36, 46],
        [
          [-5.5, -1.5],
          [11.5, 16.5],
          [29.5, 34.5],
          [47.5, 51.5],
        ]
      )
    );
  });

  test('a 3×3 grid with a gap smaller than offset + length: the mark crosses the whole gap', () => {
    const segments = cutLines(grid(3, 10, 3));
    assert.equal(segments.length, 48);
    assert.deepEqual(
      segments,
      expectedGrid(
        [0, 10, 13, 23, 26, 36],
        [
          [-5.5, -1.5],
          [10, 13],
          [23, 26],
          [37.5, 41.5],
        ]
      )
    );
  });

  test('a 3×3 grid with a gap smaller than offset: only the outer marks', () => {
    const segments = cutLines(grid(3, 10, 1));
    assert.equal(segments.length, 24);
    assert.deepEqual(
      segments,
      expectedGrid(
        [0, 10, 11, 21, 22, 32],
        [
          [-5.5, -1.5],
          [33.5, 37.5],
        ]
      )
    );
  });

  test('a touching 3×3 grid: one mark per cut line and side', () => {
    assert.deepEqual(
      cutLines(grid(3, 10, 0)),
      expectedGrid(
        [0, 10, 20, 30],
        [
          [-5.5, -1.5],
          [31.5, 35.5],
        ]
      )
    );
  });

  test('a piece against the edge of the sheet', () => {
    const sheet = { x: 0, y: 0, w: 100, h: 100 };
    // In the corner: what falls outside and what runs on the edge are dropped.
    assert.deepEqual(cutLines([{ x: 0, y: 0, w: 50, h: 30 }], { bounds: sheet }), [
      H(30, 51.5, 55.5),
      V(50, 31.5, 35.5),
    ]);
    // Against the right edge and 2 mm from the top one: the top marks are cut at the edge.
    assert.deepEqual(cutLines([{ x: 60, y: 2, w: 40, h: 20 }], { bounds: sheet }), [
      H(2, 54.5, 58.5),
      H(22, 54.5, 58.5),
      V(60, 0, 0.5),
      V(60, 23.5, 27.5),
    ]);
    // Offset bounds (the printable area, with a margin).
    const area = { x: 10, y: 10, w: 80, h: 80 };
    assert.deepEqual(cutLines([{ x: 10, y: 10, w: 80, h: 80 }], { bounds: area }), []);
  });
});

describe("'outline'", () => {
  test('one piece, two touching ones and grids', () => {
    assert.deepEqual(cutLines([{ x: 1, y: 2, w: 3, h: 4 }], { mode: 'outline' }), [
      H(2, 1, 4),
      H(6, 1, 4),
      V(1, 2, 6),
      V(4, 2, 6),
    ]);
    const two = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 10, y: 0, w: 10, h: 10 },
    ];
    assert.deepEqual(cutLines(two, { mode: 'outline' }), [
      H(0, 0, 20),
      H(10, 0, 20),
      V(0, 0, 10),
      V(10, 0, 10),
      V(20, 0, 10),
    ]);
    assert.deepEqual(cutLines(grid(3, 10, 0), { mode: 'outline' }), expectedGrid([0, 10, 20, 30], [[0, 30]]));
    assert.deepEqual(
      cutLines(grid(3, 10, 5), { mode: 'outline' }),
      expectedGrid(
        [0, 10, 15, 25, 30, 40],
        [
          [0, 10],
          [15, 25],
          [30, 40],
        ]
      )
    );
  });

  test('partly shared edges', () => {
    // B, shorter, leaning on the right of A: the edge x = 10 runs from 0 to 20.
    const pieces = [
      { x: 0, y: 0, w: 10, h: 20 },
      { x: 10, y: 5, w: 10, h: 10 },
    ];
    const v10 = cutLines(pieces, { mode: 'outline' }).filter((s) => s.x1 === 10 && s.x2 === 10);
    assert.deepEqual(v10, [V(10, 0, 20)]);
  });

  test('clipped to the sheet', () => {
    const sheet = { x: 0, y: 0, w: 100, h: 100 };
    assert.deepEqual(cutLines([{ x: 0, y: 0, w: 50, h: 30 }], { mode: 'outline', bounds: sheet }), [
      H(30, 0, 50),
      V(50, 0, 30),
    ]);
    assert.deepEqual(cutLines([{ x: 80, y: 90, w: 40, h: 40 }], { mode: 'outline', bounds: sheet }), [
      H(90, 80, 100),
      V(80, 90, 100),
    ]);
  });
});

describe('outline with overlapping pieces and the stroke style', () => {
  test('an outline doesn’t run over the image of a piece stacked above it', () => {
    const lower = { x: 0, y: 0, w: 40, h: 40 };
    const upper = { x: 20, y: 20, w: 40, h: 40 };
    const lines = cutLines([lower, upper], { mode: 'outline' });
    // The lower piece's right and bottom edges stop where the upper one starts; the upper one is whole.
    assert.ok(lines.some((s) => s.x1 === 40 && s.x2 === 40 && s.y1 === 0 && s.y2 === 20), JSON.stringify(lines));
    assert.ok(!lines.some((s) => s.x1 === 40 && s.y2 > 20 + TOL && s.y1 < 40 - TOL), 'nothing inside the upper piece');
    assert.ok(lines.some((s) => s.y1 === 20 && s.y2 === 20 && s.x1 <= 20 && s.x2 >= 60), 'the upper piece’s top edge');
    // The other order: the upper (now lower) piece’s edges under the first are left out.
    const flipped = cutLines([upper, lower], { mode: 'outline' });
    assert.ok(!flipped.some((s) => s.y1 === 20 && s.y2 === 20 && s.x1 < 40 - TOL && s.x2 > 20 + TOL), JSON.stringify(flipped));
  });

  test('touching pieces share one line', () => {
    const lines = cutLines([{ x: 0, y: 0, w: 20, h: 10 }, { x: 20, y: 0, w: 20, h: 10 }], { mode: 'outline' });
    assert.deepEqual(lines.filter((s) => s.x1 === 20 && s.x2 === 20), [V(20, 0, 10)]);
    assert.deepEqual(lines.filter((s) => s.y1 === 0 && s.y2 === 0), [H(0, 0, 40)]);
  });

  test('cutStyle: weights in points, colors and the dotted pattern', async () => {
    const { cutStyle, CUT_WEIGHTS, dotPattern } = await import('../../src/core/cutmarks.js');
    assert.deepEqual(CUT_WEIGHTS, { thin: 0.25, medium: 0.5, thick: 1 });
    assert.deepEqual(cutStyle({}), { width: 0.25, hex: '#000000', rgb: [0, 0, 0], dash: null });
    const style = cutStyle({ weight: 'thick', color: '#FF8000', dash: 'dotted' });
    assert.equal(style.width, 1);
    assert.equal(style.hex, '#ff8000');
    assert.deepEqual(style.rgb, [1, 128 / 255, 0]);
    assert.deepEqual(style.dash, dotPattern(1));
    assert.deepEqual(cutStyle({ color: 'nope', weight: 'x' }), { width: 0.25, hex: '#000000', rgb: [0, 0, 0], dash: null });
  });
});

describe('cut margin', () => {
  test('cutBox grows (or shrinks) a box on every side, never inverting it', async () => {
    const { cutBox } = await import('../../src/core/cutmarks.js');
    assert.deepEqual(cutBox({ x: 10, y: 20, w: 30, h: 40 }, 2), { x: 8, y: 18, w: 34, h: 44 });
    assert.deepEqual(cutBox({ x: 10, y: 20, w: 30, h: 40 }, -1), { x: 11, y: 21, w: 28, h: 38 });
    assert.deepEqual(cutBox({ x: 10, y: 20, w: 30, h: 40 }, -50), { x: 25, y: 35, w: 0, h: 10 }, 'shrinks to a line at most');
    assert.deepEqual(cutBox({ x: 10, y: 20, w: 30, h: 40 }), { x: 10, y: 20, w: 30, h: 40 });
  });

  test('cut boxes of rotated and cropped pieces follow their size on the sheet', async () => {
    const { cutBox } = await import('../../src/core/cutmarks.js');
    const { pieceSize } = await import('../../src/core/crop.js');
    const asset = { w: 150, h: 100 };
    for (const r of [0, 90, 180, 270]) {
      for (const crop of [null, { x: 0.1, y: 0.2, w: 0.5, h: 0.4 }]) {
        const { w, h } = pieceSize(asset, { scale: 50, r, crop });
        const box = cutBox({ x: 20, y: 30, w, h }, 3);
        assert.ok(Math.abs(box.w - (w + 6)) < 1e-9 && Math.abs(box.h - (h + 6)) < 1e-9 && box.x === 17 && box.y === 27, `r=${r} crop=${!!crop}`);
      }
    }
  });

  test('lines go on the cut boxes; equal margins that touch share one line', () => {
    // 2 mm margins and a 4 mm gap: the cut boxes touch at x = 52.
    const a = { x: 10, y: 10, w: 40, h: 30 };
    const b = { x: 54, y: 10, w: 40, h: 30 };
    const outline = cutLines([a, b], { mode: 'outline', margin: 2 });
    assert.deepEqual(outline.filter((s) => s.x1 === s.x2 && Math.abs(s.x1 - 52) < TOL), [V(52, 8, 42)]);
    assert.ok(outline.some((s) => s.y1 === 8 && s.y2 === 8 && Math.abs(s.x1 - 8) < TOL && Math.abs(s.x2 - 96) < TOL), 'the top edges continue as one line');
    const corners = cutLines([a, b], { mode: 'corners', margin: 2, length: 4, offset: 1 });
    assertWellFormed(corners, 'corners with margin');
    // The marks start at the cut box corners (8, 8): the first horizontal one ends at 8 − 1.
    assert.ok(corners.some((s) => s.y1 === 8 && Math.abs(s.x2 - 7) < TOL && Math.abs(s.x1 - 3) < TOL), JSON.stringify(corners.slice(0, 4)));
    // Nothing inside an image box nor a cut box.
    for (const q of [a, b, { x: 8, y: 8, w: 44, h: 34 }, { x: 52, y: 8, w: 44, h: 34 }]) assert.ok(!corners.some((s) => entersPiece(s, q)), JSON.stringify(q));
  });

  test('a negative margin draws the outline inside the image; a degenerate cut box draws nothing', () => {
    const lines = cutLines([{ x: 10, y: 10, w: 40, h: 30 }], { mode: 'outline', margin: -1 });
    assert.deepEqual(lines, [H(11, 11, 49), H(39, 11, 49), V(11, 11, 39), V(49, 11, 39)]);
    assert.deepEqual(cutLines([{ x: 10, y: 10, w: 40, h: 30 }], { mode: 'outline', margin: -20 }), []);
    assert.deepEqual(cutLines([{ x: 10, y: 10, w: 40, h: 30 }], { mode: 'corners', margin: -20 }), []);
  });

  test('footprintPad: the margin only while cut lines are on and it is positive', async () => {
    const { footprintPad } = await import('../../src/core/cutmarks.js');
    assert.equal(footprintPad({ mode: 'corners', margin: 2 }), 2);
    assert.equal(footprintPad({ mode: 'outline', margin: 2 }), 2);
    assert.equal(footprintPad({ mode: 'none', margin: 2 }), 0);
    assert.equal(footprintPad({ mode: 'corners', margin: -1 }), 0);
    assert.equal(footprintPad({ mode: 'corners', margin: 0 }), 0);
    assert.equal(footprintPad(null), 0);
  });
});
