// Contour cut lines (src/core/contour.js): tracing the opaque shape of an
// image's visible part, placing it on the sheet with its piece, and what of
// it is drawn next to other pieces.
import { describe, expect, test } from 'vitest';
import { ALPHA_THRESHOLD, clipLoop, contourCuts, insideLoop, loopArea, pathData, placeLoops, traceShape } from '../../src/core/contour.js';
import { rotateCrop } from '../../src/core/crop.js';
import { cutLines } from '../../src/core/cutmarks.js';
import { disc, distanceToLoops, maskOf, radii } from '../support/contour.ts';

// 400 × 400 px over 100 × 100 mm: a pixel is 0.25 mm, and so is a cell.
const PX = 0.25;
const round = maskOf(400, 400, disc(200, 200, 120)); // a disc of radius 30 mm at (50, 50)

describe('traceShape', () => {
  test.each([
    { margin: 0, radius: 30 },
    { margin: 3, radius: 33 },
    { margin: -3, radius: 27 },
    { margin: 12.5, radius: 42.5 },
  ])('a disc: one clockwise loop, $margin mm off its edge', ({ margin, radius }) => {
    const loops = traceShape(round, { w: 100, h: 100, margin });
    expect(loops).toHaveLength(1);
    expect(loopArea(loops[0])).toBeGreaterThan(0);
    const [min, max] = radii(loops, 50, 50);
    expect(min).toBeGreaterThan(radius - 1.5 * PX);
    expect(max).toBeLessThan(radius + 1.5 * PX);
  });

  test('the rectangle applies when nothing in view is transparent, or nothing is opaque', () => {
    expect(traceShape(maskOf(50, 40, () => true), { w: 10, h: 8 })).toBeNull();
    expect(traceShape(maskOf(50, 40, () => false), { w: 10, h: 8, margin: 2 })).toBeNull();
    // Transparent only along the left border: a crop that leaves it out shows no transparency.
    const framed = maskOf(100, 100, (x) => x > 10);
    expect(traceShape(framed, { w: 10, h: 10 })).not.toBeNull();
    expect(traceShape(framed, { crop: { x: 0.2, y: 0, w: 0.8, h: 1 }, w: 8, h: 10 })).toBeNull();
  });

  test('a ring: only its outer edge is cut, never its hole', () => {
    const ring = maskOf(400, 400, (x, y) => disc(200, 200, 120)(x, y) && !disc(200, 200, 60)(x, y));
    const loops = traceShape(ring, { w: 100, h: 100, margin: 2 });
    expect(loops).toHaveLength(1);
    expect(radii(loops, 50, 50)[0]).toBeGreaterThan(32 - 1.5 * PX);
  });

  test('separate blobs get a loop each; closer than twice the margin, one loop goes around both', () => {
    // Two discs of radius 10 mm whose edges are 6 mm apart.
    const two = maskOf(400, 400, (x, y) => disc(100, 200, 40)(x, y) || disc(204, 200, 40)(x, y));
    expect(traceShape(two, { w: 100, h: 100, margin: 0 })).toHaveLength(2);
    expect(traceShape(two, { w: 100, h: 100, margin: 2 })).toHaveLength(2);
    const joined = traceShape(two, { w: 100, h: 100, margin: 3.5 });
    expect(joined).toHaveLength(1);
    expect(insideLoop(joined[0], 38, 50)).toBe(true);
  });

  test('a blob inside a hole that the margin closes is not cut out', () => {
    // A ring open by a 2 mm slot, with a dot in the middle: the margin closes the slot.
    const open = (x, y) => disc(200, 200, 120)(x, y) && !disc(200, 200, 80)(x, y) && !(y > 196 && y < 204 && x > 250);
    const mask = maskOf(400, 400, (x, y) => open(x, y) || disc(200, 200, 20)(x, y));
    expect(traceShape(mask, { w: 100, h: 100, margin: 0 })).toHaveLength(2);
    expect(traceShape(mask, { w: 100, h: 100, margin: 1.5 })).toHaveLength(1);
  });

  test('a speck next to the shape is ignored; a lone speck still gets its loop', () => {
    const speck = (x, y) => x > 380 && x < 382 && y > 20 && y < 22;
    expect(traceShape(maskOf(400, 400, (x, y) => disc(200, 200, 120)(x, y) || speck(x, y)), { w: 100, h: 100, margin: 1 })).toHaveLength(1);
    expect(traceShape(maskOf(400, 400, speck), { w: 100, h: 100, margin: 1 })).toHaveLength(1);
  });

  test('a stroke one pixel wide stays inside the line, even far coarser than the grid', () => {
    // 4000 px wide: the grid has a cell for every 6 or 7 pixels.
    const width = 4000;
    const mask = maskOf(width, 400, (x, y) => (Math.floor(x) === 2001 && y > 100 && y < 300) || disc(1000, 200, 150)(x, y));
    const loops = traceShape(mask, { w: 400, h: 40, margin: 0 });
    expect(loops).toHaveLength(2);
    const stroke = loops.find((loop) => insideLoop(loop, 200.15, 20));
    expect(stroke).toBeDefined();
    for (const y of [12, 20, 28]) expect(insideLoop(stroke, 200.15, y)).toBe(true);
  });

  test(`a pixel counts as opaque from alpha ${ALPHA_THRESHOLD}: a soft shadow under it is not cut around`, () => {
    const shadow = (x, y) => disc(200, 200, 160)(x, y);
    const soft = maskOf(400, 400, shadow, ALPHA_THRESHOLD - 1);
    soft.alpha.forEach((_, i) => {
      if (disc(200, 200, 120)(i % 400 + 0.5, Math.floor(i / 400) + 0.5)) soft.alpha[i] = 255;
    });
    expect(radii(traceShape(soft, { w: 100, h: 100 }), 50, 50)[1]).toBeLessThan(30 + 1.5 * PX);
    const firm = maskOf(400, 400, shadow, ALPHA_THRESHOLD);
    expect(radii(traceShape(firm, { w: 100, h: 100 }), 50, 50)[0]).toBeGreaterThan(40 - 1.5 * PX);
  });

  test('a crop: the visible part only, from its top left corner; where the crop cuts the shape, the line follows the crop’s edge', () => {
    // The right half of the disc, shown 50 × 100 mm: its straight side lies on the crop's left edge.
    const loops = traceShape(round, { crop: { x: 0.5, y: 0, w: 0.5, h: 1 }, w: 50, h: 100, margin: 2 });
    expect(loops).toHaveLength(1);
    const xs = loops[0].filter((_, i) => i % 2 === 0);
    const ys = loops[0].filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeCloseTo(-2, 0);
    expect(Math.max(...xs)).toBeCloseTo(32, 0);
    expect(Math.min(...ys)).toBeCloseTo(18, 0);
    expect(Math.max(...ys)).toBeCloseTo(82, 0);
    // Half way down, the line runs 2 mm to the left of the crop's edge.
    expect(distanceToLoops(loops, -2, 50)).toBeLessThan(PX);
  });

  test('a negative margin wider than the shape leaves no line', () => {
    expect(traceShape(round, { w: 100, h: 100, margin: -35 })).toEqual([]);
  });

  test.each([
    { angle: 20, points: 40 },
    { angle: 35, points: 60 },
    // Nearly level, the pixels' steps are long: what is left of them is a ripple of under 3/4 of a pixel.
    { angle: 6, points: 200 },
  ])('a square turned $angle°: its sides stay within 3/4 of a pixel of straight, in under $points points', ({ angle, points }) => {
    const cos = Math.cos((angle * Math.PI) / 180);
    const sin = Math.sin((angle * Math.PI) / 180);
    const square = maskOf(400, 400, (x, y) => Math.abs((x - 200) * cos + (y - 200) * sin) < 100 && Math.abs(-(x - 200) * sin + (y - 200) * cos) < 100);
    const [loop] = traceShape(square, { w: 100, h: 100 });
    expect(loop.length / 2).toBeLessThan(points);
    for (let i = 0; i < loop.length; i += 2) {
      const u = (loop[i] - 50) * cos + (loop[i + 1] - 50) * sin;
      const v = -(loop[i] - 50) * sin + (loop[i + 1] - 50) * cos;
      expect(Math.abs(Math.max(Math.abs(u), Math.abs(v)) - 25)).toBeLessThan(0.75 * PX);
    }
  });
});

describe('placeLoops', () => {
  // The visible part's corners, 30 × 20 mm unrotated, in units of 10 mm (k = 10).
  const corners = [Float64Array.from([0, 0, 3, 0, 3, 2, 0, 2])];
  test.each([0, 90, 180, 270])('turned %i° clockwise, each point lands where it lands on the rotated image', (r) => {
    const [placed] = placeLoops(corners, { x: 100, y: 50, r, uw: 30, uh: 20, k: 10 });
    const [w, h] = r % 180 ? [20, 30] : [30, 20];
    for (let i = 0; i < 8; i += 2) {
      // The same point as a zero-size crop of the unrotated image, turned by crop.js.
      const turned = rotateCrop({ x: corners[0][i] / 3, y: corners[0][i + 1] / 2, w: 0, h: 0 }, r);
      expect(placed[i]).toBeCloseTo(100 + turned.x * w, 9);
      expect(placed[i + 1]).toBeCloseTo(50 + turned.y * h, 9);
    }
  });
});

describe('clipLoop', () => {
  const square = Float64Array.from([10, 10, 50, 10, 50, 50, 10, 50]);

  test('a loop clear of everything comes back whole and closed', () => {
    expect(clipLoop(square, { hide: [{ x: 60, y: 0, w: 10, h: 10 }], bounds: { x: 0, y: 0, w: 100, h: 100 } })).toEqual([{ points: [...square], closed: true }]);
  });

  test('what runs inside a rectangle above is left out: the rest is one open run, from edge to edge of it', () => {
    const runs = clipLoop(square, { hide: [{ x: 40, y: 0, w: 20, h: 20 }] });
    expect(runs).toEqual([{ points: [50, 20, 50, 50, 10, 50, 10, 10, 40, 10], closed: false }]);
  });

  test('a loop along an edge of a rectangle above stays: it is a shared cut', () => {
    expect(clipLoop(square, { hide: [{ x: 50, y: 0, w: 20, h: 100 }] })).toEqual([{ points: [...square], closed: true }]);
  });

  test('off the sheet is left out, and a loop wholly off it draws nothing', () => {
    expect(clipLoop(square, { bounds: { x: 0, y: 0, w: 30, h: 100 } })).toEqual([{ points: [30, 50, 10, 50, 10, 10, 30, 10], closed: false }]);
    expect(clipLoop(square, { bounds: { x: 60, y: 0, w: 30, h: 100 } })).toEqual([]);
  });
});

describe('contourCuts', () => {
  const sheet = { x: 0, y: 0, w: 200, h: 200 };
  const photo = { x: 10, y: 10, w: 40, h: 30 };
  const pdfPage = { x: 50, y: 10, w: 40, h: 30 };
  const sticker = { x: 120, y: 20, w: 40, h: 40 };
  const shape = [Float64Array.from([125, 25, 155, 25, 155, 55, 125, 55])];

  test('rectangles get the outline as cutLines draws it (shared edges as one line); shapes get their loops; a shape not traced yet, nothing', () => {
    const { lines, paths } = contourCuts(
      [
        { box: photo, shape: null },
        { box: pdfPage, shape: null },
        { box: sticker, shape },
      ],
      { bounds: sheet }
    );
    expect(lines).toEqual(cutLines([photo, pdfPage], { mode: 'outline', bounds: sheet }));
    expect(paths).toEqual([{ points: [...shape[0]], closed: true }]);
    const pending = contourCuts([{ box: photo, shape: null }, { box: sticker, shape: undefined }], { bounds: sheet });
    expect(pending.lines).toEqual(cutLines([photo], { mode: 'outline', bounds: sheet }));
    expect(pending.paths).toEqual([]);
  });

  test('with overlaps: a shape loses what runs under the image or cut box of a piece above, and hides a rectangle’s outline under its own', () => {
    const above = { x: 140, y: 0, w: 40, h: 40 };
    const { paths } = contourCuts(
      [
        { box: sticker, shape },
        { box: above, shape: null },
      ],
      { margin: 2, bounds: sheet }
    );
    // The cut box above starts at x = 138, y = 42: the loop's top right is under it.
    expect(paths).toEqual([{ points: [155, 42, 155, 55, 125, 55, 125, 25, 138, 25], closed: false }]);
    const below = contourCuts(
      [
        { box: above, shape: null },
        { box: sticker, shape },
      ],
      { margin: 2, bounds: sheet }
    );
    expect(below.lines).toEqual(cutLines([above, sticker], { mode: 'contour', margin: 2, bounds: sheet, shaped: new Set([sticker]) }));
    expect(below.lines.some((l) => l.x1 === 182 && l.y1 < 30)).toBe(true);
    expect(below.lines.every((l) => !(l.y1 === l.y2 && l.y1 === 42 && l.x1 < 158 && l.x2 > 120))).toBe(true);
  });
});

test('pathData: M, L and Z, to 0.001 mm', () => {
  expect(
    pathData([
      { points: [1, 2.00049, 3.25, 4], closed: true },
      { points: [5, 6, 7.1234, 8], closed: false },
    ])
  ).toBe('M1 2L3.25 4ZM5 6L7.123 8');
});
